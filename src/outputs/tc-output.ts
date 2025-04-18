/*
 * DJ Sync Server - tc-output.ts
 * Timecode výstupní protokol
 * v.0.1 - 2025-04-18
 */

import { Logger } from '../logger/logger';
import { BeatInfo } from '../djlink/djlink-manager';

// Import SMPTE Timecode knihovny
let SMPTE: any = null;
try {
  SMPTE = require('smpte-timecode');
} catch (error) {
  console.warn('smpte-timecode není dostupný. TC výstup bude deaktivován.');
}

export class TCOutput {
  private logger: Logger;
  private settings: Record<string, any>;
  private format: string;
  private frameRate: number;
  private frameRateData: number | [number, number]; // číselná hodnota nebo pole [numerator, denominator]
  private startTime: number = 0;
  private tcOutput: any = null; // Zde by byl skutečný TC objekt
  private timecode: any = null;
  private lastUpdatedFrame: number = -1;
  private frameFraction: number = 0; // Zlomek rámce pro plynulejší aktualizace
  private isDropFrame: boolean = false;
  
  // Pro vlastní implementaci timecode formátování
  private hours: number = 0;
  private minutes: number = 0;
  private seconds: number = 0;
  private frames: number = 0;

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
        // Budeme používat vlastní implementaci, takže nastavíme jako dostupné
        this.tcOutput = {
          custom: true
        };
      }
    } else {
      this.logger.warn('SMPTE Timecode není dostupný, použití vlastní implementace.');
      // Budeme používat vlastní implementaci, takže nastavíme jako dostupné
      this.tcOutput = {
        custom: true
      };
    }
    
    // Zde by byla inicializace TC zařízení
    try {
      // Implementace inicializace TC zařízení
      if (settings.device) {
        this.logger.info(`TC výstup by měl být nakonfigurován na zařízení: ${settings.device}`);
      } else {
        this.logger.info('TC výstup by měl používat výchozí zařízení');
      }
    } catch (error) {
      this.logger.error(`Chyba při inicializaci TC výstupu: ${error}`);
    }
    
    this.logger.info('TC výstup inicializován');
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
        
        if (this.timecode) {
          // Používáme knihovnu SMPTE
          try {
            // Aktualizace SMPTE timecode objektu
            this.timecode.setHours(this.hours);
            this.timecode.setMinutes(this.minutes);
            this.timecode.setSeconds(this.seconds);
            this.timecode.setFrames(this.frames);
            
            const timecodeString = this.timecode.toString();
            this.logger.debug(`TC (${this.format}): ${timecodeString} (BPM: ${beatInfo.bpm.toFixed(1)})`);
          } catch (error) {
            this.logger.error(`Chyba při aktualizaci SMPTE timecode: ${error}`);
            // Pokud selže aktualizace knihovny, použijeme vlastní implementaci
            const timecodeString = this.formatTimecode();
            this.logger.debug(`TC (${this.format}, vlastní implementace po chybě): ${timecodeString} (BPM: ${beatInfo.bpm.toFixed(1)})`);
          }
        } else {
          // Vlastní implementace
          const timecodeString = this.formatTimecode();
          this.logger.debug(`TC (${this.format}, vlastní implementace): ${timecodeString} (BPM: ${beatInfo.bpm.toFixed(1)})`);
        }
        
        // Zde by byl skutečný kód pro generování a odesílání TC signálu
        // Na základě aktuálního timecode a zvoleného formátu
      }
    } catch (error) {
      this.logger.error(`Chyba při odesílání TC: ${error}`);
    }
  }

  public isAvailable(): boolean {
    return this.timecode !== null || this.tcOutput !== null;
  }

  public close(): void {
    try {
      // Implementace uzavření TC zařízení
      this.tcOutput = null;
      this.logger.info('TC výstup uzavřen');
    } catch (error) {
      this.logger.error(`Chyba při uzavírání TC výstupu: ${error}`);
    }
  }
}