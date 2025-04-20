#!/usr/bin/env node

/*
 * Timecode Tester - Testovací utilita pro generování a validaci timecode signálů
 * v.0.2 - 2025-04-18
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Kontrola zda jsou dostupné potřebné knihovny
let Speaker = null;
try {
  Speaker = require('speaker');
} catch (error) {
  console.error('Chyba: Knihovna "speaker" není nainstalována. Použijte: npm install speaker');
  console.error('Pro některé systémy může být potřeba nainstalovat audio závislosti:');
  console.error('  - Ubuntu/Debian: sudo apt-get install libasound2-dev');
  console.error('  - Windows: Ujistěte se, že máte nainstalované potřebné ovladače pro zvukovou kartu');
  process.exit(1);
}

// Definice parametrů pro generování timecode
const TC_FORMATS = {
  'ltc': { frameRate: 30, description: 'Linear Timecode (30 fps)' },
  'smpte-24': { frameRate: 24, description: 'SMPTE Timecode (24 fps, film standard)' },
  'smpte-25': { frameRate: 25, description: 'SMPTE Timecode (25 fps, evropský PAL standard)' },
  'smpte-30': { frameRate: 30, description: 'SMPTE Timecode (30 fps, non-drop frame)' },
  'smpte-drop': { frameRate: 30, dropFrame: true, description: 'SMPTE Drop-Frame Timecode (29.97 fps, NTSC standard)' }
};

// ANSI barvy pro výpisy
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Nastavení audio výstupu
const SAMPLE_RATE = 48000;
const BIT_DEPTH = 16;
const CHANNELS = 1;
const TEST_DURATION = 10; // sekundy

// Funkce pro výpis barevného textu
function colorText(text, color) {
  return `${color}${text}${colors.reset}`;
}

// Funkce pro výpis nápovědy
function showHelp() {
  console.log(colorText('\nTimecode Tester - Testovací utilita pro generování a validaci timecode signálů', colors.cyan));
  console.log('\nPoužití:');
  console.log('  node timecode-tester.js [příkaz] [možnosti]');
  console.log('\nPříkazy:');
  console.log('  generate [format]    Generování testovacího timecode audio signálu');
  console.log('  test                 Test audio výstupu generováním LTC/SMPTE timecode a zobrazením detailů');
  console.log('  devices              Seznam dostupných audio zařízení');
  console.log('  save [format] [file] Uložení testovacího timecode signálu do WAV souboru');
  console.log('  help                 Zobrazení této nápovědy');
  console.log('\nFormáty timecode:');
  Object.keys(TC_FORMATS).forEach(format => {
    console.log(`  ${colorText(format.padEnd(12), colors.yellow)} ${TC_FORMATS[format].description}`);
  });
  console.log('\nPříklady:');
  console.log('  node timecode-tester.js generate ltc         Generování LTC timecode');
  console.log('  node timecode-tester.js generate smpte-30    Generování SMPTE 30fps timecode');
  console.log('  node timecode-tester.js test                 Test audio výstupu');
  console.log('  node timecode-tester.js save ltc output.wav  Uložení LTC signálu do WAV souboru');
  console.log('  node timecode-tester.js devices              Seznam audio zařízení');
  console.log('');
}

// Funkce pro generování LTC (Linear Timecode) bitu podle SMPTE standardu
function generateLTCBits(hours, minutes, seconds, frames, frameRate, dropFrame = false) {
  // 80-bit LTC frame
  const ltcBits = new Array(80).fill(0);
  
  // Převod číslic na jednotky a desítky
  const frameUnits = frames % 10;
  const frameTens = Math.floor(frames / 10);
  const secondsUnits = seconds % 10;
  const secondsTens = Math.floor(seconds / 10);
  const minutesUnits = minutes % 10;
  const minutesTens = Math.floor(minutes / 10);
  const hoursUnits = hours % 10;
  const hoursTens = Math.floor(hours / 10);
  
  // Bity framu podle SMPTE standardu:
  
  // Frame units (0-9) - 4 bity
  ltcBits[0] = (frameUnits & 1) !== 0 ? 1 : 0;
  ltcBits[1] = (frameUnits & 2) !== 0 ? 1 : 0;
  ltcBits[2] = (frameUnits & 4) !== 0 ? 1 : 0;
  ltcBits[3] = (frameUnits & 8) !== 0 ? 1 : 0;
  
  // Uživatelské bity 1
  ltcBits[4] = 0;
  ltcBits[5] = 0; 
  ltcBits[6] = 0;
  ltcBits[7] = 0;
  
  // Frame tens (0-5) - 2 bity
  ltcBits[8] = (frameTens & 1) !== 0 ? 1 : 0;
  ltcBits[9] = (frameTens & 2) !== 0 ? 1 : 0;
  
  // Drop frame flag a color frame flag
  ltcBits[10] = dropFrame ? 1 : 0;    // Drop frame flag
  ltcBits[11] = 0;                     // Color frame flag
  
  // Uživatelské bity 2
  ltcBits[12] = 0;
  ltcBits[13] = 0;
  ltcBits[14] = 0;
  ltcBits[15] = 0;
  
  // Seconds units (0-9) - 4 bity
  ltcBits[16] = (secondsUnits & 1) !== 0 ? 1 : 0;
  ltcBits[17] = (secondsUnits & 2) !== 0 ? 1 : 0;
  ltcBits[18] = (secondsUnits & 4) !== 0 ? 1 : 0;
  ltcBits[19] = (secondsUnits & 8) !== 0 ? 1 : 0;
  
  // Uživatelské bity 3
  ltcBits[20] = 0;
  ltcBits[21] = 0;
  ltcBits[22] = 0;
  ltcBits[23] = 0;
  
  // Seconds tens (0-5) - 3 bity
  ltcBits[24] = (secondsTens & 1) !== 0 ? 1 : 0;
  ltcBits[25] = (secondsTens & 2) !== 0 ? 1 : 0;
  ltcBits[26] = (secondsTens & 4) !== 0 ? 1 : 0;
  
  // Flag bit
  ltcBits[27] = 0;  // User bit field flag
  
  // Uživatelské bity 4
  ltcBits[28] = 0;
  ltcBits[29] = 0;
  ltcBits[30] = 0;
  ltcBits[31] = 0;
  
  // Minutes units (0-9) - 4 bity
  ltcBits[32] = (minutesUnits & 1) !== 0 ? 1 : 0;
  ltcBits[33] = (minutesUnits & 2) !== 0 ? 1 : 0;
  ltcBits[34] = (minutesUnits & 4) !== 0 ? 1 : 0;
  ltcBits[35] = (minutesUnits & 8) !== 0 ? 1 : 0;
  
  // Uživatelské bity 5
  ltcBits[36] = 0;
  ltcBits[37] = 0;
  ltcBits[38] = 0;
  ltcBits[39] = 0;
  
  // Minutes tens (0-5) - 3 bity
  ltcBits[40] = (minutesTens & 1) !== 0 ? 1 : 0;
  ltcBits[41] = (minutesTens & 2) !== 0 ? 1 : 0;
  ltcBits[42] = (minutesTens & 4) !== 0 ? 1 : 0;
  
  // Binary Group Flag
  ltcBits[43] = 0;  // Binary group flag BGF0
  
  // Uživatelské bity 6
  ltcBits[44] = 0;
  ltcBits[45] = 0;
  ltcBits[46] = 0;
  ltcBits[47] = 0;
  
  // Hours units (0-9) - 4 bity
  ltcBits[48] = (hoursUnits & 1) !== 0 ? 1 : 0;
  ltcBits[49] = (hoursUnits & 2) !== 0 ? 1 : 0;
  ltcBits[50] = (hoursUnits & 4) !== 0 ? 1 : 0;
  ltcBits[51] = (hoursUnits & 8) !== 0 ? 1 : 0;
  
  // Uživatelské bity 7
  ltcBits[52] = 0;
  ltcBits[53] = 0;
  ltcBits[54] = 0;
  ltcBits[55] = 0;
  
  // Hours tens (0-2) - 2 bity
  ltcBits[56] = (hoursTens & 1) !== 0 ? 1 : 0;
  ltcBits[57] = (hoursTens & 2) !== 0 ? 1 : 0;
  
  // Flag bits
  ltcBits[58] = 0;  // Binary group flag BGF1
  ltcBits[59] = 0;  // Binary group flag BGF2
  
  // Uživatelské bity 8
  ltcBits[60] = 0;
  ltcBits[61] = 0;
  ltcBits[62] = 0;
  ltcBits[63] = 0;
  
  // Sync word - přesně podle standardu SMPTE
  ltcBits[64] = 0; ltcBits[65] = 0; ltcBits[66] = 0; ltcBits[67] = 1;
  ltcBits[68] = 0; ltcBits[69] = 1; ltcBits[70] = 0; ltcBits[71] = 1;
  ltcBits[72] = 1; ltcBits[73] = 1; ltcBits[74] = 1; ltcBits[75] = 1;
  ltcBits[76] = 1; ltcBits[77] = 1; ltcBits[78] = 1; ltcBits[79] = 1;
  
  return ltcBits;
}

// Funkce pro generování timecode audio bufferu
function generateTimecodeBuffer(format, duration) {
  if (!TC_FORMATS[format]) {
    console.error(colorText(`Chyba: Neznámý formát timecode "${format}"`, colors.red));
    console.error(`Dostupné formáty: ${Object.keys(TC_FORMATS).join(', ')}`);
    process.exit(1);
  }

  const { frameRate, dropFrame = false } = TC_FORMATS[format];
  
  // Výpočet velikosti bufferu
  const bytesPerSample = BIT_DEPTH / 8;
  const totalSamples = Math.ceil(SAMPLE_RATE * duration);
  const totalBytes = totalSamples * bytesPerSample * CHANNELS;
  
  // Vytvoření bufferu
  const audioBuffer = Buffer.alloc(totalBytes);
  
  // Parametry pro generování
  const samplesPerFrame = Math.floor(SAMPLE_RATE / frameRate);
  let currentSample = 0;
  let frameCount = 0;
  let seconds = 0;
  let minutes = 0;
  let hours = 0;
  
  // Proměnná pro sledování předchozí polarity signálu (důležité pro správné kódování)
  let lastSignalValue = 1; // Začínáme s pozitivní polaritou
  
  console.log(colorText(`Generuji ${duration} sekund ${format} timecode (${frameRate} fps${dropFrame ? ', drop-frame' : ''})...`, colors.cyan));
  
  // Postupně generujeme jednotlivé framy
  while (currentSample < totalSamples) {
    // Výpočet aktuálního času
    if (frameCount >= frameRate) {
      frameCount = 0;
      seconds++;
      if (seconds >= 60) {
        seconds = 0;
        minutes++;
        if (minutes >= 60) {
          minutes = 0;
          hours = (hours + 1) % 24;
        }
      }
    }
    
    // Drop frame úprava pro NTSC
    if (dropFrame) {
      // Přeskočíme framy 0 a 1 na začátku každé minuty, kromě každé desáté minuty
      if (seconds === 0 && frameCount === 0 && (minutes % 10 !== 0)) {
        frameCount = 2; // Přeskočíme framy 0 a 1
      }
    }
    
    // Generování LTC bitů pro aktuální frame
    const ltcBits = generateLTCBits(hours, minutes, seconds, frameCount, frameRate, dropFrame);
    
    // Počet vzorků na bit, zaokrouhleno na celé číslo pro přesnost
    const samplesPerBit = Math.floor(samplesPerFrame / 80);
    
    // Generování audio vzorků pro celý LTC frame pomocí přesného biphase mark kódování
    for (let bitIndex = 0; bitIndex < 80; bitIndex++) {
      const bit = ltcBits[bitIndex];
      
      // Generování vzorků pro první polovinu bitu
      for (let i = 0; i < samplesPerBit / 2 && currentSample < totalSamples; i++) {
        // Pro bit 0: první polovina zůstává ve stejném stavu
        // Pro bit 1: první polovina mění stav
        if (bit === 1) {
          lastSignalValue = -lastSignalValue;
        }
        
        // Zápis hodnoty do bufferu podle bitové hloubky
        if (BIT_DEPTH === 16) {
          const sampleValue = Math.floor(lastSignalValue * 32767); // Pro 16-bit signed PCM
          const sampleOffset = currentSample * bytesPerSample;
          audioBuffer.writeInt16LE(sampleValue, sampleOffset);
        } else if (BIT_DEPTH === 8) {
          const sampleValue = Math.floor((lastSignalValue + 1) * 127.5); // Pro 8-bit unsigned PCM
          audioBuffer.writeUInt8(sampleValue, currentSample);
        }
        
        currentSample++;
      }
      
      // Na konci první poloviny bitu vždy změníme stav pro druhou polovinu
      lastSignalValue = -lastSignalValue;
      
      // Generování vzorků pro druhou polovinu bitu
      for (let i = 0; i < samplesPerBit / 2 && currentSample < totalSamples; i++) {
        // Zápis hodnoty do bufferu podle bitové hloubky
        if (BIT_DEPTH === 16) {
          const sampleValue = Math.floor(lastSignalValue * 32767); // Pro 16-bit signed PCM
          const sampleOffset = currentSample * bytesPerSample;
          audioBuffer.writeInt16LE(sampleValue, sampleOffset);
        } else if (BIT_DEPTH === 8) {
          const sampleValue = Math.floor((lastSignalValue + 1) * 127.5); // Pro 8-bit unsigned PCM
          audioBuffer.writeUInt8(sampleValue, currentSample);
        }
        
        currentSample++;
      }
    }
    
    // Aktualizace frame counteru
    frameCount++;
    
    // Progres bar (každých 10%)
    const progress = Math.floor((currentSample / totalSamples) * 100);
    if (progress % 10 === 0 && progress > 0) {
      process.stdout.clearLine ? process.stdout.clearLine(0) : null;
      process.stdout.cursorTo ? process.stdout.cursorTo(0) : null;
      process.stdout.write(`Progres: ${progress}% [${format}] ${formatTimecode(hours, minutes, seconds, frameCount, dropFrame)}`);
    }
  }
  
  // Dokončení progres baru
  process.stdout.clearLine ? process.stdout.clearLine(0) : null;
  process.stdout.cursorTo ? process.stdout.cursorTo(0) : null;
  console.log(`Progres: 100% [${format}] ${formatTimecode(hours, minutes, seconds, frameCount, dropFrame)}`);
  
  return audioBuffer;
}

// Pomocná funkce pro formátování timecode
function formatTimecode(hours, minutes, seconds, frames, dropFrame = false) {
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}${dropFrame ? ';' : ':'}${frames.toString().padStart(2, '0')}`;
}

// Funkce pro přehrání timecode bufferu
function playTimecodeBuffer(buffer, format) {
  const { frameRate, dropFrame = false } = TC_FORMATS[format];
  
  console.log(colorText('\nPřehrávám testovací timecode...', colors.green));
  console.log(`Formát: ${format} (${TC_FORMATS[format].description})`);
  console.log(`Sample rate: ${SAMPLE_RATE} Hz`);
  console.log(`Bit depth: ${BIT_DEPTH} bit`);
  console.log(`Kanály: ${CHANNELS} (mono)`);
  console.log(colorText('\nTimecode by měl nyní hrát z vašeho audio výstupu...', colors.yellow));
  console.log(colorText('Stiskněte Ctrl+C pro ukončení', colors.magenta));
  
  try {
    // Vytvoříme Speaker instanci
    const speaker = new Speaker({
      channels: CHANNELS,
      bitDepth: BIT_DEPTH,
      sampleRate: SAMPLE_RATE,
      signed: (BIT_DEPTH === 16) // 16-bit je signed, 8-bit je unsigned
    });
    
    // Přihlásíme se k událostem pro detekci problémů
    speaker.on('error', (err) => {
      console.error(colorText(`Chyba audio výstupu: ${err}`, colors.red));
    });
    
    // Vytvoříme readable stream z bufferu a přehrajeme ho
    const bufferStream = require('stream').Readable.from(buffer);
    bufferStream.pipe(speaker);
    
    // Zobrazíme informaci o aktuálním timecode
    let frameCount = 0;
    let seconds = 0;
    let minutes = 0;
    let hours = 0;
    
    const tcInterval = setInterval(() => {
      process.stdout.clearLine ? process.stdout.clearLine(0) : null;
      process.stdout.cursorTo ? process.stdout.cursorTo(0) : null;
      process.stdout.write(`Aktuální TC: ${formatTimecode(hours, minutes, seconds, frameCount, dropFrame)}`);
      
      // Aktualizace časových hodnot
      frameCount++;
      if (frameCount >= frameRate) {
        frameCount = 0;
        seconds++;
        if (seconds >= 60) {
          seconds = 0;
          minutes++;
          if (minutes >= 60) {
            minutes = 0;
            hours = (hours + 1) % 24;
          }
        }
      }
      
      // Drop frame úprava pro NTSC
      if (dropFrame && seconds === 0 && (minutes % 10 !== 0) && frameCount === 0) {
        frameCount = 2; // Přeskočíme framy 0 a 1
      }
    }, 1000 / frameRate);
    
    // Ukončení po přehrání celého bufferu
    bufferStream.on('end', () => {
      clearInterval(tcInterval);
      process.stdout.write('\n');
      console.log(colorText('Přehrávání dokončeno.', colors.green));
      process.exit(0);
    });
  } catch (error) {
    console.error(colorText(`Chyba při přehrávání audio: ${error}`, colors.red));
    if (error.message.includes('no such file or directory')) {
      console.error('Ujistěte se, že máte správně nainstalované audio ovladače a knihovnu speaker.');
    }
    process.exit(1);
  }
}

// Funkce pro uložení timecode bufferu do WAV souboru
function saveTimecodeToWav(buffer, format, outputFile) {
  try {
    // Dynamický import wav-encoder pokud ho máme
    let WavEncoder;
    try {
      WavEncoder = require('wav-encoder');
    } catch (error) {
      console.error(colorText('Chyba: Knihovna "wav-encoder" není nainstalována.', colors.red));
      console.error('Pro ukládání WAV souborů nainstalujte wav-encoder: npm install wav-encoder');
      process.exit(1);
    }
    
    // Převod Node.js Buffer na Float32Array pro wav-encoder
    const samples = new Float32Array(buffer.length / 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = buffer.readInt16LE(i * 2) / 32768.0; // Převod z Int16 na Float32 (-1.0 až 1.0)
    }
    
    // Vytvoření WAV dat
    const wavData = {
      sampleRate: SAMPLE_RATE,
      channelData: [samples] // Mono
    };
    
    // Zakódování a uložení WAV souboru
    WavEncoder.encode(wavData).then((encodedBuffer) => {
      fs.writeFileSync(outputFile, Buffer.from(encodedBuffer));
      console.log(colorText(`Timecode uložen do souboru: ${outputFile}`, colors.green));
      
      // Zobrazení informací o souboru
      const stats = fs.statSync(outputFile);
      console.log(`Velikost souboru: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Formát: ${format} (${TC_FORMATS[format].description})`);
      console.log(`Délka: ${TEST_DURATION} sekund`);
      console.log(`Sample rate: ${SAMPLE_RATE} Hz`);
      console.log(`Bit depth: ${BIT_DEPTH} bit`);
      console.log(`Kanály: ${CHANNELS} (mono)`);
      
    }).catch((error) => {
      console.error(colorText(`Chyba při kódování WAV souboru: ${error}`, colors.red));
    });
  } catch (error) {
    console.error(colorText(`Chyba při ukládání WAV souboru: ${error}`, colors.red));
  }
}

// Funkce pro zobrazení seznamu audio zařízení
function listAudioDevices() {
  console.log(colorText('\nDostupná audio zařízení:', colors.cyan));
  
  try {
    let detected = false;
    
    // V závislosti na operačním systému zkusíme různé příkazy
    if (process.platform === 'win32') {
      // Windows
      try {
        console.log(colorText('\nWindows audio zařízení:', colors.yellow));
        const output = execSync('powershell -Command "Get-WmiObject Win32_SoundDevice | Select-Object Name, Status"').toString();
        console.log(output);
        detected = true;
      } catch (error) {
        console.log('Nepodařilo se získat seznam Windows audio zařízení.');
      }
    } else if (process.platform === 'darwin') {
      // macOS
      try {
        console.log(colorText('\nmacOS audio zařízení:', colors.yellow));
        const output = execSync('system_profiler SPAudioDataType').toString();
        console.log(output);
        detected = true;
      } catch (error) {
        console.log('Nepodařilo se získat seznam macOS audio zařízení.');
      }
    } else if (process.platform === 'linux') {
      // Linux
      try {
        console.log(colorText('\nLinux audio zařízení (ALSA):', colors.yellow));
        const output = execSync('aplay -l').toString();
        console.log(output);
        detected = true;
      } catch (error) {
        console.log('Nepodařilo se získat seznam ALSA audio zařízení.');
      }
      
      try {
        console.log(colorText('\nLinux audio zařízení (PulseAudio):', colors.yellow));
        const output = execSync('pactl list sinks short').toString();
        console.log(output);
        detected = true;
      } catch (error) {
        console.log('Nepodařilo se získat seznam PulseAudio zařízení.');
      }
    }
    
    if (!detected) {
      console.log(colorText('Nepodařilo se detekovat audio zařízení pomocí systémových nástrojů.', colors.yellow));
      console.log('Node.js speaker knihovna by měla automaticky použít výchozí systémové zařízení.');
    }
    
    console.log(colorText('\nPoznámka: Pro specifikaci konkrétního zařízení můžete upravit speaker konfiguraci v kódu.', colors.magenta));
    
  } catch (error) {
    console.error(colorText(`Chyba při získávání seznamu audio zařízení: ${error}`, colors.red));
  }
}

// Hlavní funkce
function main() {
  const command = process.argv[2] || 'help';
  
  switch (command) {
    case 'generate':
      const generateFormat = process.argv[3] || 'ltc';
      if (!TC_FORMATS[generateFormat]) {
        console.error(colorText(`Chyba: Neznámý formát timecode "${generateFormat}"`, colors.red));
        console.error(`Dostupné formáty: ${Object.keys(TC_FORMATS).join(', ')}`);
        process.exit(1);
      }
      
      const buffer = generateTimecodeBuffer(generateFormat, TEST_DURATION);
      playTimecodeBuffer(buffer, generateFormat);
      break;
      
    case 'test':
      console.log(colorText('Spouštím test audio výstupu timecode...', colors.cyan));
      const testBuffer = generateTimecodeBuffer('ltc', TEST_DURATION);
      playTimecodeBuffer(testBuffer, 'ltc');
      break;
      
    case 'save':
      const saveFormat = process.argv[3] || 'ltc';
      const outputFile = process.argv[4] || 'timecode_output.wav';
      
      if (!TC_FORMATS[saveFormat]) {
        console.error(colorText(`Chyba: Neznámý formát timecode "${saveFormat}"`, colors.red));
        console.error(`Dostupné formáty: ${Object.keys(TC_FORMATS).join(', ')}`);
        process.exit(1);
      }
      
      console.log(colorText(`Generuji ${saveFormat} timecode a ukládám do ${outputFile}...`, colors.cyan));
      const saveBuffer = generateTimecodeBuffer(saveFormat, TEST_DURATION);
      saveTimecodeToWav(saveBuffer, saveFormat, outputFile);
      break;
      
    case 'devices':
      listAudioDevices();
      break;
      
    case 'help':
    default:
      showHelp();
      break;
  }
}

// Spuštění hlavní funkce
main();
