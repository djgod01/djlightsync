/*
 * DJ Sync Server - tc-output.ts
 * Timecode výstupní protokol s knihovnou speaker (opravená verze)
 * v.0.3 - 2025-04-18
 */

import { Logger } from '../logger/logger';
import { BeatInfo } from '../djlink/djlink-manager';
import { Writable } from 'stream';

// Import SMPTE Timecode knihovny
let SMPTE: any = null;
try {
  SMPTE = require('smpte-timecode');
} catch (error) {
  console.warn('smpte-timecode není dostupný. TC výstup bude částečně omezen.');
}

// Import speaker a audio knihoven
let Speaker: any = null;
let pcmUtils: any = null;
try {
  Speaker = require('speaker');
  pcmUtils = require('pcm-util');
} catch (error) {
  console.warn('Speaker nebo pcm-util nejsou dostupné. Audio výstup bude deaktivován.');
}

export class TCOutput {
  private logger: Logger;
  private settings: Record<string, any>;
  private format: string;
  private frameRate: number;
  private frameRateData: number | [number, number]; // číselná hodnota nebo pole [numerator, denominator]
  private startTime: number = 0;
  private tcOutput: Writable | null = null; // Speaker stream
  private timecode: any = null;
  private lastUpdatedFrame: number = -1;
  private frameFraction: number = 0; // Zlomek rámce pro plynulejší aktualizace
  private isDropFrame: boolean = false;
  
  // Pro vlastní implementaci timecode formátování
  private hours: number = 0;
  private minutes: number = 0;
  private seconds: number = 0;
  private frames: number = 0;
  
  // Audio parametry
  private sampleRate: number = 48000;
  private audioBuffer: Buffer | null = null;
  private audioFormat: any = null;
  private ltcBitRate: number = 0; // Bity za sekundu pro LTC
  private ltcSamplesPerFrame: number = 0;
  private ltcCurrentSample: number = 0;
  private isGenerating: boolean = false;
  
  // Dodatečné parametry pro ladění zvuku
  private volume: number = 0.95; // Hlasitost (0.0 - 1.0)
  private carrierFrequency: number = 3000; // Nosná frekvence pro lepší zvuk
  private debugMode: boolean = true; // Režim ladění pro více logovacích informací
  private audioGenerationActive: boolean = false; // Flag pro aktivní generování zvuku
  private continuousGeneration: NodeJS.Timeout | null = null; // Interval pro kontinuální generování
  
  constructor(logger: Logger, settings: Record<string, any>) {
    this.logger = logger;
    this.settings = settings;
    this.format = settings.format || 'smpte';
    
    // Nastavení hodnot framerate
    const formatInfo = this.getFrameRateFromFormat();
    this.frameRate = formatInfo.frameRate;
    this.frameRateData = formatInfo.frameRateData;
    this.isDropFrame = formatInfo.isDropFrame;
    
    this.logger.debug(`TC výstup inicializován s formátem: ${this.format}, framerate: ${this.frameRate}`);
    
    // Výpočet LTC bitrate
    this.ltcBitRate = this.frameRate * 80; // 80 bitů na frame pro LTC
    this.ltcSamplesPerFrame = Math.floor(this.sampleRate / this.frameRate);
    
    // Pokus o inicializaci SMPTE Timecode
    if (SMPTE) {
      try {
        // Vytvoření počátečního timecode objektu podle parametrů z API
        this.timecode = new SMPTE({
          frameRate: this.frameRateData,
          dropFrame: this.isDropFrame,
          hours: 0,
          minutes: 0,
          seconds: 0,
          frames: 0
        });
        
        this.logger.info(`TC Timecode inicializován s framerate ${this.frameRate}${this.isDropFrame ? ' (drop-frame)' : ''}`);
      } catch (error) {
        this.logger.warn(`Inicializace SMPTE Timecode selhala, použití vlastní implementace: ${error}`);
        this.timecode = null;
      }
    } else {
      this.logger.warn('SMPTE Timecode není dostupný, použití vlastní implementace.');
    }
    
    // Inicializace Audio
    this.initAudio();
    
    // Nastartujeme kontinuální generování audio signálu pro zajištění stability
    this.startContinuousAudioGeneration();
  }

  // Metoda pro nastavení hlasitosti TC výstupu (0.0 - 1.0)
  public setVolume(volume: number): void {
    // Zajistíme, že hodnota je v rozsahu 0-1
    this.volume = Math.min(1.0, Math.max(0.0, volume));
    this.logger.info(`TC výstup - hlasitost nastavena na: ${this.volume.toFixed(2)} (${Math.round(this.volume * 100)}%)`);
  }

  // Metoda pro získání aktuální hlasitosti TC výstupu
  public getVolume(): number {
    return this.volume;
  }

  private initAudio(): void {
    if (!Speaker || !pcmUtils) {
      this.logger.warn('Speaker nebo pcm-util nejsou dostupné. Audio výstup bude pouze simulovaný.');
      // Pro kompatibilitu nastavíme, že výstup je dostupný
      this.tcOutput = {
        write: (buffer: Buffer) => {},
        end: () => {},
        on: (event: string, callback: () => void) => {}
      } as any;
      return;
    }
    
    try {
      // Nastavení audio formátu
      this.audioFormat = {
        channels: 1,         // Mono
        bitDepth: 16,        // 16-bit
        sampleRate: this.sampleRate,
        interleaved: true,
        float: false,
        signed: true
      };
      
      // Vytvoření speaker instance
      this.tcOutput = new Speaker({
        channels: this.audioFormat.channels,
        bitDepth: this.audioFormat.bitDepth,
        sampleRate: this.audioFormat.sampleRate,
        device: this.settings.device || null // Použití výchozího zařízení, pokud není specifikováno
      });
      
      // Nastavíme event handlery pro detekci chyb, pokud je tcOutput dostupný
      if (this.tcOutput) {
        // Tyto handley jsou dostupné jen pokud není tcOutput null
        this.tcOutput.on('error', (err: any) => {
          this.logger.error(`Chyba speaker výstupu: ${err}`);
        });
        
        this.tcOutput.on('open', () => {
          this.logger.info('Speaker audio výstup je otevřen a připraven.');
        });
        
        this.tcOutput.on('close', () => {
          this.logger.info('Speaker audio výstup byl uzavřen.');
        });
      }
      
      this.logger.info(`TC audio výstup inicializován pomocí Speaker s nastavením: ${JSON.stringify({
        sampleRate: this.sampleRate,
        channels: this.audioFormat.channels,
        bitDepth: this.audioFormat.bitDepth,
        device: this.settings.device || 'výchozí',
        volume: this.volume
      })}`);
      
      // Vytvoření audio bufferu pro LTC signál
      const bufferSize = Math.floor(this.sampleRate * 0.1); // 100ms buffer
      this.audioBuffer = Buffer.alloc(bufferSize * this.audioFormat.channels * (this.audioFormat.bitDepth / 8));
      
      this.isGenerating = false;
      this.audioGenerationActive = true;
      
      // Vygenerujeme testovací signál pro ověření funkčnosti audio výstupu
      this.generateTestSignal();
      
    } catch (error) {
      this.logger.error(`Chyba při inicializaci audio výstupu: ${error}`);
      this.tcOutput = null;
    }
  }
  
  private generateTestSignal(): void {
    if (!this.audioBuffer || !this.tcOutput) {
      this.logger.warn('Nelze generovat testovací signál - audio není inicializováno.');
      return;
    }
    
    try {
      this.logger.info('Generuji testovací audio signál...');
      
      // Vyplníme buffer sinusovým signálem s frekvencí 1000Hz
      const bytesPerSample = this.audioFormat.bitDepth / 8;
      const numSamples = this.audioBuffer.length / bytesPerSample;
      
      for (let i = 0; i < numSamples; i++) {
        // Generujeme sinusový signál s frekvencí 1000Hz
        const signalValue = Math.sin(2 * Math.PI * 1000 * (i / this.sampleRate)) * this.volume;
        
        // Zápis hodnoty do bufferu podle bitové hloubky
        if (this.audioFormat.bitDepth === 16) {
          const sampleValue = Math.floor(signalValue * 32767); // Pro 16-bit signed PCM
          this.audioBuffer.writeInt16LE(sampleValue, i * bytesPerSample);
        } else if (this.audioFormat.bitDepth === 8) {
          const sampleValue = Math.floor((signalValue + 1) * 127.5); // Pro 8-bit unsigned PCM
          this.audioBuffer.writeUInt8(sampleValue, i);
        }
      }
      
      // Odeslání testovacího signálu na výstup
      this.tcOutput.write(this.audioBuffer);
      this.logger.info('Testovací audio signál odeslán.');
      
    } catch (error) {
      this.logger.error(`Chyba při generování testovacího signálu: ${error}`);
    }
  }
  
  private startContinuousAudioGeneration(): void {
    // Spustíme interval pro kontinuální generování audio signálu
    if (this.tcOutput) {
      this.continuousGeneration = setInterval(() => {
        if (this.audioGenerationActive && !this.isGenerating) {
          this.generateAndSendTimecodeSignal();
        }
      }, 50); // Generujeme každých 50ms pro plynulý zvuk
      
      this.logger.info('Spuštěno kontinuální generování audio signálu');
    } else {
      this.logger.warn('Audio výstup není dostupný, nelze spustit kontinuální generování');
    }
  }

  private getFrameRateFromFormat(): { frameRate: number, frameRateData: number | [number, number], isDropFrame: boolean } {
    // Nastavení framerate podle vybraného formátu
    switch (this.format) {
      case 'mtc': // MIDI Time Code
        return { 
          frameRate: 25, 
          frameRateData: 25,
          isDropFrame: false 
        };
        
      case 'ltc': // Linear Time Code
        return { 
          frameRate: 30, 
          frameRateData: 30,
          isDropFrame: false 
        };
        
      case 'smpte-30': // SMPTE 30fps
        return { 
          frameRate: 30, 
          frameRateData: 30,
          isDropFrame: false 
        };
        
      case 'smpte-25': // SMPTE 25fps (evropský standard)
        return { 
          frameRate: 25, 
          frameRateData: 25,
          isDropFrame: false 
        };
        
      case 'smpte-24': // SMPTE 24fps (filmový standard)
        return { 
          frameRate: 24, 
          frameRateData: 24,
          isDropFrame: false 
        };
        
      case 'smpte-drop': // SMPTE 29.97fps drop-frame (US NTSC)
        return { 
          frameRate: 30, // Pro výpočty používáme 30 fps
          frameRateData: [30000, 1001], // Pro knihovnu SMPTE používáme přesný zlomek
          isDropFrame: true 
        };
        
      default:
        return { 
          frameRate: 30, 
          frameRateData: 30,
          isDropFrame: false 
        };
    }
  }
  
  // Vlastní formátování timecode
  private formatTimecode(): string {
    const frames = this.frames.toString().padStart(2, '0');
    const seconds = this.seconds.toString().padStart(2, '0');
    const minutes = this.minutes.toString().padStart(2, '0');
    const hours = this.hours.toString().padStart(2, '0');
    
    // Pro drop-frame formát používáme ';' jako oddělovač před framy
    const frameSeparator = this.isDropFrame ? ';' : ':';
    
    return `${hours}:${minutes}:${seconds}${frameSeparator}${frames}`;
  }

  public sendBeat(beatInfo: BeatInfo): void {
    try {
      if (this.startTime === 0) {
        this.startTime = Date.now();
      }
      
      // Výpočet aktuálního času od začátku v sekundách
      const elapsedSeconds = (Date.now() - this.startTime) / 1000;
      
      // Výpočet aktuálního framu včetně zlomku pro plynulejší aktualizace
      const totalFramesExact = elapsedSeconds * this.frameRate;
      const totalFrames = Math.floor(totalFramesExact);
      this.frameFraction = totalFramesExact - totalFrames;
      
      // Aktualizovat timecode pouze pokud se změnil frame
      if (totalFrames > this.lastUpdatedFrame) {
        this.lastUpdatedFrame = totalFrames;
        
        // Výpočet hodin, minut, sekund a framu
        this.frames = totalFrames % this.frameRate;
        this.seconds = Math.floor(totalFrames / this.frameRate) % 60;
        this.minutes = Math.floor(totalFrames / (this.frameRate * 60)) % 60;
        this.hours = Math.floor(totalFrames / (this.frameRate * 3600)) % 24;
        
        let timecodeString = "";
        
        if (this.timecode) {
          // Používáme knihovnu SMPTE
          try {
            // Aktualizace SMPTE timecode objektu
            this.timecode.setHours(this.hours);
            this.timecode.setMinutes(this.minutes);
            this.timecode.setSeconds(this.seconds);
            this.timecode.setFrames(this.frames);
            
            timecodeString = this.timecode.toString();
          } catch (error) {
            this.logger.error(`Chyba při aktualizaci SMPTE timecode: ${error}`);
            // Pokud selže aktualizace knihovny, použijeme vlastní implementaci
            timecodeString = this.formatTimecode();
          }
        } else {
          // Vlastní implementace
          timecodeString = this.formatTimecode();
        }
        
        // Logování jen každých 10 framů v režimu ladění
        if (this.debugMode && totalFrames % 10 === 0) {
          this.logger.debug(`TC (${this.format}): ${timecodeString} (BPM: ${beatInfo.bpm.toFixed(1)})`);
        }
      }
    } catch (error) {
      this.logger.error(`Chyba při odesílání TC: ${error}`);
    }
  }
  
  private generateAndSendTimecodeSignal(): void {
    // Pokud nemáme audio výstup nebo buffer, nic negenerujeme
    if (!this.tcOutput || !this.audioBuffer) {
      return;
    }
    
    // Pokud již generujeme signál, nepřerušujeme ho
    if (this.isGenerating) {
      return;
    }
    
    try {
      this.isGenerating = true;
      
      // Vybereme metodu generování podle formátu
      switch (this.format) {
        case 'ltc':
        case 'smpte-30':
        case 'smpte-25':
        case 'smpte-24':
        case 'smpte-drop':
          this.generateLTC();
          break;
          
        case 'mtc':
          this.generateMTC();
          break;
          
        default:
          this.generateLTC(); // Výchozí formát
      }
      
      this.isGenerating = false;
    } catch (error) {
      this.logger.error(`Chyba při generování TC signálu: ${error}`);
      this.isGenerating = false;
    }
  }
  
  private generateLTC(): void {
    if (!this.audioBuffer || !this.tcOutput) return;
    
    try {
      // Převod timecode na 80-bitový LTC frame
      const ltcBits = this.timecodeToLTCBits();
      
      // Vyplnění audio bufferu LTC signálem
      const bytesPerSample = this.audioFormat.bitDepth / 8;
      const numSamples = this.audioBuffer.length / bytesPerSample;
      
      for (let i = 0; i < numSamples; i++) {
        // Výpočet pozice bitu v LTC rámci
        const bitPosition = Math.floor((this.ltcCurrentSample * 80) / this.ltcSamplesPerFrame);
        
        // Získání hodnoty bitu (0 nebo 1)
        const bitValue = (bitPosition < 80) ? ltcBits[bitPosition % 80] : 0;
        
        // Vytvoření více slyšitelného signálu - kombinace nosné frekvence a bipolárního kódování
        
        // Nosná frekvence zajišťuje, že signál bude více slyšitelný
        const carrierSignal = Math.sin(2 * Math.PI * this.carrierFrequency * (i / this.sampleRate));
        
        // Základní LTC signál - bipolární NRZ-I kódování
        const baseSignal = bitValue ? 1.0 : -1.0;
        
        // Přidání malého množství šumu pro realističtější zvuk
        const noiseSignal = Math.sin((this.ltcCurrentSample % 8) * Math.PI) * 0.03; 
        
        // Kombinace signálů s nosnou frekvencí
        const finalSignal = (baseSignal * carrierSignal * 0.9 + noiseSignal) * this.volume;
        
        // Zápis hodnoty do bufferu podle bitové hloubky
        if (this.audioFormat.bitDepth === 16) {
          const sampleValue = Math.floor(finalSignal * 32767); // Pro 16-bit signed PCM
          this.audioBuffer.writeInt16LE(sampleValue, i * bytesPerSample);
        } else if (this.audioFormat.bitDepth === 8) {
          const sampleValue = Math.floor((finalSignal + 1) * 127.5); // Pro 8-bit unsigned PCM
          this.audioBuffer.writeUInt8(sampleValue, i);
        }
        
        // Posun v rámci
        this.ltcCurrentSample = (this.ltcCurrentSample + 1) % this.ltcSamplesPerFrame;
      }
      
      // Odeslání bufferu na výstup
      this.tcOutput.write(this.audioBuffer);
      
      // Periodické logování pro ladění
      if (this.debugMode && Math.random() < 0.01) { // Jen cca 1% času
        this.logger.debug(`LTC audio data odeslána, velikost: ${this.audioBuffer.length} bajtů`);
      }
      
    } catch (error) {
      this.logger.error(`Chyba při generování LTC signálu: ${error}`);
    }
  }
  
  private timecodeToLTCBits(): number[] {
    // 80-bit LTC frame
    const ltcBits = new Array(80).fill(0);
    
    // Převod jednotlivých částí timecode na BCD (Binary-Coded Decimal)
    const framesBCD = this.decimalToBCD(this.frames, 6);  // 6 bitů pro frame count
    const secondsBCD = this.decimalToBCD(this.seconds, 7); // 7 bitů pro sekundy (0-59)
    const minutesBCD = this.decimalToBCD(this.minutes, 7); // 7 bitů pro minuty (0-59)
    const hoursBCD = this.decimalToBCD(this.hours, 6);    // 6 bitů pro hodiny (0-23)
    
    // Vytvoření LTC bitového vzoru
    // Bity jsou uspořádány 0-3, 4-7, 8-11, ... 76-79
    // Každý grupet obsahuje 4 datové bity následované 4 adresními bity
    
    // Framy v grupetu 0 a 1
    ltcBits[0] = framesBCD & 1 ? 1 : 0;
    ltcBits[1] = (framesBCD >> 1) & 1 ? 1 : 0;
    ltcBits[2] = (framesBCD >> 2) & 1 ? 1 : 0;
    ltcBits[3] = (framesBCD >> 3) & 1 ? 1 : 0;
    
    // Adresní bity
    ltcBits[4] = 0; // Frame LSB
    ltcBits[5] = 0;
    ltcBits[6] = 0;
    ltcBits[7] = this.isDropFrame ? 1 : 0; // Drop frame flag
    
    // Framy (bity navíc) a sekundy
    ltcBits[8] = (framesBCD >> 4) & 1 ? 1 : 0;
    ltcBits[9] = (framesBCD >> 5) & 1 ? 1 : 0;
    ltcBits[10] = secondsBCD & 1 ? 1 : 0;
    ltcBits[11] = (secondsBCD >> 1) & 1 ? 1 : 0;
    
    // Adresní bity
    ltcBits[12] = 0; // Second LSB
    ltcBits[13] = 0;
    ltcBits[14] = 0;
    ltcBits[15] = 0; // Biphase mark polarity correction bit
    
    // Sekundy v grupetech 2 a 3
    ltcBits[16] = (secondsBCD >> 2) & 1 ? 1 : 0;
    ltcBits[17] = (secondsBCD >> 3) & 1 ? 1 : 0;
    ltcBits[18] = (secondsBCD >> 4) & 1 ? 1 : 0;
    ltcBits[19] = (secondsBCD >> 5) & 1 ? 1 : 0;
    
    // Adresní bity
    ltcBits[20] = 0; // Second MSB
    ltcBits[21] = 0;
    ltcBits[22] = 0;
    ltcBits[23] = 0; // Biphase mark polarity correction bit
    
    // Minuty v grupetech 4 a 5
    ltcBits[24] = minutesBCD & 1 ? 1 : 0;
    ltcBits[25] = (minutesBCD >> 1) & 1 ? 1 : 0;
    ltcBits[26] = (minutesBCD >> 2) & 1 ? 1 : 0;
    ltcBits[27] = (minutesBCD >> 3) & 1 ? 1 : 0;
    
    // Adresní bity
    ltcBits[28] = 0; // Minute LSB
    ltcBits[29] = 0;
    ltcBits[30] = 0;
    ltcBits[31] = 0; // Biphase mark polarity correction bit
    
    // Minuty (pokračování) a hodiny v grupetech 6 a 7
    ltcBits[32] = (minutesBCD >> 4) & 1 ? 1 : 0;
    ltcBits[33] = (minutesBCD >> 5) & 1 ? 1 : 0;
    ltcBits[34] = (minutesBCD >> 6) & 1 ? 1 : 0;
    ltcBits[35] = hoursBCD & 1 ? 1 : 0;
    
    // Adresní bity
    ltcBits[36] = 0; // Minute MSB & Hour LSB
    ltcBits[37] = 0;
    ltcBits[38] = 0;
    ltcBits[39] = 0; // Biphase mark polarity correction bit
    
    // Hodiny v grupetu 8
    ltcBits[40] = (hoursBCD >> 1) & 1 ? 1 : 0;
    ltcBits[41] = (hoursBCD >> 2) & 1 ? 1 : 0;
    ltcBits[42] = (hoursBCD >> 3) & 1 ? 1 : 0;
    ltcBits[43] = (hoursBCD >> 4) & 1 ? 1 : 0;
    
    // Adresní bity
    ltcBits[44] = 0; // Hour MSB
    ltcBits[45] = 0;
    ltcBits[46] = 0;
    ltcBits[47] = 0; // Biphase mark polarity correction bit
    
    // Uživatelské bity v grupetech 9-18 (pro jednoduchost je necháme prázdné)
    for (let i = 48; i < 80; i++) {
      // Každý 8. bit je biphase mark polarity correction bit
      if ((i + 1) % 8 === 0) {
        ltcBits[i] = 0;
      } else {
        ltcBits[i] = 0; // Uživatelský bit
      }
    }
    
    // Sync word na konci framu (posledních 16 bitů)
    ltcBits[64] = 0;
    ltcBits[65] = 0;
    ltcBits[66] = 0;
    ltcBits[67] = 0;
    
    ltcBits[68] = 0;
    ltcBits[69] = 0;
    ltcBits[70] = 0;
    ltcBits[71] = 0;
    
    ltcBits[72] = 1;
    ltcBits[73] = 1;
    ltcBits[74] = 1;
    ltcBits[75] = 1;
    
    ltcBits[76] = 1;
    ltcBits[77] = 1;
    ltcBits[78] = 1;
    ltcBits[79] = 1;
    
    return ltcBits;
  }
  
  private decimalToBCD(decimal: number, bits: number): number {
    // Převod dekadického čísla na BCD (Binary-Coded Decimal)
    const tens = Math.floor(decimal / 10);
    const ones = decimal % 10;
    return (tens << 4) | ones;
  }
  
  private generateMTC(): void {
    // MTC se typicky posílá přes MIDI, ale můžeme generovat jeho audio verzi
    // To je složitější a vyžaduje jinou implementaci
    this.logger.debug('MTC audio generování není implementováno. Použití LTC jako alternativy.');
    this.generateLTC();
  }

  public isAvailable(): boolean {
    return this.timecode !== null || this.tcOutput !== null;
  }

  public close(): void {
    try {
      // Deaktivace audio generování
      this.audioGenerationActive = false;
      
      // Zastavení intervalu kontinuálního generování
      if (this.continuousGeneration) {
        clearInterval(this.continuousGeneration);
        this.continuousGeneration = null;
      }
      
      // Uzavření audio streamu
      if (this.tcOutput && typeof this.tcOutput.end === 'function') {
        this.tcOutput.end();
      }
      
      this.tcOutput = null;
      this.logger.info('TC výstup uzavřen');
    } catch (error) {
      this.logger.error(`Chyba při uzavírání TC výstupu: ${error}`);
    }
  }
}