#!/usr/bin/env node

/*
 * Timecode Validator - Utilita pro analýzu a validaci vstupního timecode signálu
 * v.0.1 - 2025-04-18
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Kontrola zda jsou dostupné potřebné knihovny
let Speaker = null;
let MicrophoneStream = null;

try {
  Speaker = require('speaker');
} catch (error) {
  console.error('Chyba: Knihovna "speaker" není nainstalována. Použijte: npm install speaker');
  console.error('Pro některé systémy může být potřeba nainstalovat audio závislosti:');
  console.error('  - Ubuntu/Debian: sudo apt-get install libasound2-dev');
  console.error('  - Windows: Ujistěte se, že máte nainstalované potřebné ovladače pro zvukovou kartu');
}

try {
  MicrophoneStream = require('microphone-stream');
} catch (error) {
  console.error('Chyba: Knihovna "microphone-stream" není nainstalována. Použijte: npm install microphone-stream');
}

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

// Nastavení audio
const SAMPLE_RATE = 48000;
const BIT_DEPTH = 16;
const CHANNELS = 1;

// Konstanta pro detekci timecode
const LTC_SYNC_WORD = [1, 1, 1, 1, 1, 1, 1, 1]; // Posledních 8 bitů LTC rámce
const MIN_DETECTION_COUNT = 3; // Kolik rámců musíme detekovat pro potvrzení signálu

// Funkce pro výpis barevného textu
function colorText(text, color) {
  return `${color}${text}${colors.reset}`;
}

// Funkce pro výpis nápovědy
function showHelp() {
  console.log(colorText('\nTimecode Validator - Utilita pro analýzu a validaci vstupního timecode signálu', colors.cyan));
  console.log('\nPoužití:');
  console.log('  node timecode-validator.js [příkaz] [možnosti]');
  console.log('\nPříkazy:');
  console.log('  listen            Naslouchání a analýza vstupního audio signálu');
  console.log('  analyze [file]    Analýza WAV souboru s timecode signálem');
  console.log('  devices           Seznam dostupných audio vstupních zařízení');
  console.log('  help              Zobrazení této nápovědy');
  console.log('\nPříklady:');
  console.log('  node timecode-validator.js listen        Poslouchá vstupní signál');
  console.log('  node timecode-validator.js analyze input.wav    Analýza WAV souboru');
  console.log('  node timecode-validator.js devices       Seznam audio zařízení');
  console.log('');
}

// Funkce pro analýzu audio bufferu a detekci LTC signálu
function analyzeAudioBuffer(buffer, sampleRate) {
  console.log(colorText('Analyzuji audio buffer...', colors.cyan));
  
  // Příprava dat - převod na pole hodnot mezi -1 a 1
  const samples = [];
  for (let i = 0; i < buffer.length; i += 2) {
    samples.push(buffer.readInt16LE(i) / 32768.0);
  }
  
  // Detekce LTC signálu - hledáme přechody signálu (zero-crossing) a měříme vzdálenosti
  const crossings = [];
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i-1] < 0 && samples[i] >= 0) || (samples[i-1] >= 0 && samples[i] < 0)) {
      crossings.push(i);
    }
  }
  
  // Pokud máme málo přechodů, pravděpodobně nemáme LTC signál
  if (crossings.length < 100) {
    console.log(colorText('Nedostatek přechodů signálu - žádný LTC timecode nebyl detekován.', colors.red));
    return null;
  }
  
  // Měření vzdáleností mezi přechody pro zjištění frekvence
  const intervals = [];
  for (let i = 1; i < crossings.length; i++) {
    intervals.push(crossings[i] - crossings[i-1]);
  }
  
  // Výpočet průměrné vzdálenosti a odhad frekvence
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const estimatedFrequency = sampleRate / (avgInterval * 2); // *2 protože každá vlna má dva přechody
  
  console.log(`Průměrná vzdálenost mezi přechody: ${avgInterval.toFixed(2)} vzorků`);
  console.log(`Odhadovaná základní frekvence: ${estimatedFrequency.toFixed(2)} Hz`);
  
  // Kontrola zda frekvence odpovídá očekávanému rozsahu pro LTC
  // LTC pro 30fps by měla mít základní frekvence kolem 2400Hz (80 bitů * 30fps)
  if (estimatedFrequency < 1200 || estimatedFrequency > 4000) {
    console.log(colorText(`Detekovaná frekvence (${estimatedFrequency.toFixed(2)} Hz) je mimo očekávaný rozsah pro LTC`, colors.yellow));
    console.log('Očekávaný rozsah pro LTC: 1200-4000 Hz');
  } else {
    console.log(colorText('Frekvence odpovídá očekávanému rozsahu pro LTC', colors.green));
  }
  
  // Pokus o detekci sync vzoru v signálu
  let syncDetectionCount = 0;
  let frameBitCount = Math.round(sampleRate / estimatedFrequency * 80); // Předpokládáme 80 bitů na frame
  
  for (let i = 0; i < samples.length - frameBitCount; i += frameBitCount) {
    // Zkušebně zkontrolujeme, zda na konci předpokládaného frame jsou bity odpovídající sync wordu
    let matchesSync = true;
    
    // Kontrola posledních 8 bitů framu
    for (let j = 0; j < 8; j++) {
      const bitIndex = i + frameBitCount - 8 + j;
      const bitValue = samples[bitIndex] > 0 ? 1 : 0;
      
      if (bitValue !== LTC_SYNC_WORD[j]) {
        matchesSync = false;
        break;
      }
    }
    
    if (matchesSync) {
      syncDetectionCount++;
    }
  }
  
  if (syncDetectionCount >= MIN_DETECTION_COUNT) {
    console.log(colorText(`LTC sync word detekován ${syncDetectionCount}x!`, colors.green));
    console.log('LTC signál je pravděpodobně platný.');
    
    // Nyní zkusíme odhadnout framerate
    const estimatedFrameRate = estimatedFrequency / 80; // 80 bitů na frame
    console.log(`Odhadovaný framerate: ${estimatedFrameRate.toFixed(2)} fps`);
    
    // Kontrola zda framerate odpovídá některému standardnímu
    const standardFrameRates = [24, 25, 29.97, 30];
    let closestFrameRate = standardFrameRates.reduce((prev, curr) => 
      Math.abs(curr - estimatedFrameRate) < Math.abs(prev - estimatedFrameRate) ? curr : prev
    );
    
    console.log(colorText(`Nejbližší standardní framerate: ${closestFrameRate} fps`, colors.green));
    
    return {
      detected: true,
      frequency: estimatedFrequency,
      frameRate: estimatedFrameRate,
      standardFrameRate: closestFrameRate,
      syncDetectionCount
    };
  } else {
    console.log(colorText(`LTC sync word detekován pouze ${syncDetectionCount}x`, colors.yellow));
    console.log('LTC signál nemusel být správně detekován, nebo je poškozený.');
    
    return {
      detected: false,
      frequency: estimatedFrequency,
      syncDetectionCount
    };
  }
}

// Funkce pro poslech vstupního audio a detekci LTC
function listenForTimecode() {
  if (!MicrophoneStream) {
    console.error(colorText('Chyba: Pro poslech je vyžadována knihovna "microphone-stream"', colors.red));
    console.error('Použijte: npm install microphone-stream');
    process.exit(1);
  }
  
  console.log(colorText('Naslouchám vstupnímu audio signálu pro detekci timecode...', colors.cyan));
  console.log('(Stiskněte Ctrl+C pro ukončení)');
  
  // Získáme přístup k mikrofonu
  navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then(stream => {
      // Vytvoříme microphone stream
      const micStream = new MicrophoneStream();
      micStream.setStream(stream);
      
      // Buffer pro analýzu
      let analyzeBuffer = Buffer.alloc(0);
      const ANALYZE_INTERVAL = 2000; // ms - jak často analyzovat signál
      
      // Nasloucháme audio datům
      micStream.on('data', chunk => {
        // Přidáme data do bufferu
        analyzeBuffer = Buffer.concat([analyzeBuffer, chunk]);
        
        // Omezíme velikost bufferu na posledních 5 sekund (48000 * 5 * 2) bajtů
        const maxSize = SAMPLE_RATE * 5 * 2; // 5 sekund * 2 bajty na vzorek
        if (analyzeBuffer.length > maxSize) {
          analyzeBuffer = analyzeBuffer.slice(analyzeBuffer.length - maxSize);
        }
      });
      
      // Pravidelná analýza
      const intervalId = setInterval(() => {
        if (analyzeBuffer.length > SAMPLE_RATE * 1 * 2) { // Alespoň 1 sekunda dat
          const result = analyzeAudioBuffer(analyzeBuffer, SAMPLE_RATE);
          
          if (result && result.detected) {
            console.log(colorText('\nDetekován platný LTC timecode!', colors.green));
            console.log(`Framerate: ${result.standardFrameRate} fps`);
            
            // Resetujeme buffer po úspěšné detekci
            analyzeBuffer = Buffer.alloc(0);
          }
        }
      }, ANALYZE_INTERVAL);
      
      // Zpracujeme ukončení
      process.on('SIGINT', () => {
        clearInterval(intervalId);
        micStream.stop();
        console.log(colorText('\nNaslouchání ukončeno.', colors.yellow));
        process.exit(0);
      });
    })
    .catch(err => {
      console.error(colorText(`Chyba při přístupu k mikrofonu: ${err}`, colors.red));
      process.exit(1);
    });
}

// Funkce pro analýzu WAV souboru
function analyzeWavFile(filePath) {
  try {
    // Kontrola existence souboru
    if (!fs.existsSync(filePath)) {
      console.error(colorText(`Soubor '${filePath}' neexistuje.`, colors.red));
      process.exit(1);
    }
    
    console.log(colorText(`Analyzuji WAV soubor: ${filePath}`, colors.cyan));
    
    // Použijeme wav-decoder pokud je k dispozici
    try {
      const WavDecoder = require('wav-decoder');
      
      // Načtení WAV souboru
      const fileBuffer = fs.readFileSync(filePath);
      
      WavDecoder.decode(fileBuffer).then(audioData => {
        console.log(`Sample rate: ${audioData.sampleRate} Hz`);
        console.log(`Počet kanálů: ${audioData.channelData.length}`);
        console.log(`Délka: ${(audioData.channelData[0].length / audioData.sampleRate).toFixed(2)} sekund`);
        
        // Převod Float32Array na Buffer pro analýzu
        const analyzeBuffer = Buffer.alloc(audioData.channelData[0].length * 2);
        for (let i = 0; i < audioData.channelData[0].length; i++) {
          const sample = Math.max(-1, Math.min(1, audioData.channelData[0][i])) * 32767;
          analyzeBuffer.writeInt16LE(Math.round(sample), i * 2);
        }
        
        // Analýza
        const result = analyzeAudioBuffer(analyzeBuffer, audioData.sampleRate);
        
        if (result && result.detected) {
          console.log(colorText('\nSoubor obsahuje platný LTC timecode!', colors.green));
        } else {
          console.log(colorText('\nSoubor pravděpodobně neobsahuje platný LTC timecode.', colors.yellow));
        }
      }).catch(err => {
        console.error(colorText(`Chyba při dekódování WAV souboru: ${err}`, colors.red));
      });
    } catch (error) {
      console.error(colorText('Chyba: Knihovna "wav-decoder" není nainstalována.', colors.red));
      console.error('Pro analýzu WAV souborů nainstalujte wav-decoder: npm install wav-decoder');
      process.exit(1);
    }
  } catch (error) {
    console.error(colorText(`Chyba při analýze WAV souboru: ${error}`, colors.red));
  }
}

// Funkce pro zobrazení seznamu audio vstupních zařízení
function listAudioInputDevices() {
  console.log(colorText('\nDostupná audio vstupní zařízení:', colors.cyan));
  
  try {
    let detected = false;
    
    // V závislosti na operačním systému zkusíme různé příkazy
    if (process.platform === 'win32') {
      // Windows
      try {
        console.log(colorText('\nWindows audio vstupní zařízení:', colors.yellow));
        const output = execSync('powershell -Command "Get-WmiObject Win32_SoundDevice | Where-Object {$_.StatusInfo -eq 3} | Select-Object Name, Status"').toString();
        console.log(output);
        detected = true;
      } catch (error) {
        console.log('Nepodařilo se získat seznam Windows audio vstupních zařízení.');
      }
    } else if (process.platform === 'darwin') {
      // macOS
      try {
        console.log(colorText('\nmacOS audio vstupní zařízení:', colors.yellow));
        const output = execSync('system_profiler SPAudioDataType | grep -A 10 "Input"').toString();
        console.log(output);
        detected = true;
      } catch (error) {
        console.log('Nepodařilo se získat seznam macOS audio vstupních zařízení.');
      }
    } else if (process.platform === 'linux') {
      // Linux
      try {
        console.log(colorText('\nLinux audio vstupní zařízení (ALSA):', colors.yellow));
        const output = execSync('arecord -l').toString();
        console.log(output);
        detected = true;
      } catch (error) {
        console.log('Nepodařilo se získat seznam ALSA audio vstupních zařízení.');
      }
      
      try {
        console.log(colorText('\nLinux audio vstupní zařízení (PulseAudio):', colors.yellow));
        const output = execSync('pactl list sources short').toString();
        console.log(output);
        detected = true;
      } catch (error) {
        console.log('Nepodařilo se získat seznam PulseAudio vstupních zařízení.');
      }
    }
    
    if (!detected) {
      console.log(colorText('Nepodařilo se detekovat audio vstupní zařízení pomocí systémových nástrojů.', colors.yellow));
    }
    
    console.log(colorText('\nPoznámka: Pro správnou funkci je potřeba nakonfigurovat propojení výstupu aplikace se vstupem této testovací utility.', colors.magenta));
    console.log(colorText('Na Windows můžete použít nástroj "Stereo Mix" nebo virtuální audio kabel.', colors.magenta));
    console.log(colorText('Na macOS můžete použít nástroj jako Soundflower nebo BlackHole.', colors.magenta));
    console.log(colorText('Na Linux můžete použít JACK nebo PulseAudio loopback.', colors.magenta));
    
  } catch (error) {
    console.error(colorText(`Chyba při získávání seznamu audio vstupních zařízení: ${error}`, colors.red));
  }
}

// Hlavní funkce
function main() {
  const command = process.argv[2] || 'help';
  
  switch (command) {
    case 'listen':
      listenForTimecode();
      break;
      
    case 'analyze':
      const filePath = process.argv[3];
      if (!filePath) {
        console.error(colorText('Chyba: Nebyl zadán soubor k analýze.', colors.red));
        console.error('Použití: node timecode-validator.js analyze cesta/k/souboru.wav');
        process.exit(1);
      }
      analyzeWavFile(filePath);
      break;
      
    case 'devices':
      listAudioInputDevices();
      break;
      
    case 'help':
    default:
      showHelp();
      break;
  }
}

// Spuštění hlavní funkce
main();
