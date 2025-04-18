/*
 * DJ Sync Server - tc-output.ts
 * Timecode výstupní protokol
 * v.0.1 - 2025-04-17
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
  private startTime: number = 0;
  private tcOutput: any = null; // Zde by byl skutečný TC objekt
  private timecode: any = null;
  private lastUpdatedFrame: number = -1;
  private frameFraction: number = 0; // Zlomek rámce pro plynulejší aktualizace

  constructor(logger: Logger, settings: Record<string, any>) {
    this.logger = logger;
    this.settings = settings;
    this.format = settings.format || 'smpte';
    this.frameRate = this.getFrameRateFromFormat();
    this.logger.debug(`TC výstup inicializován s formátem: ${this.format}, framerate: ${this.frameRate}`);
    
    // Inicializace SMPTE Timecode
    if (SMPTE) {
      try {
        // Vytvoření počátečního timecode objektu
        this.timecode = new SMPTE({
          frameRate: this.frameRate,
          hours: 0,
          minutes: 0,
          seconds: 0,
          frames: 0
        });
        
        this.logger.info(`TC Timecode inicializován s framerate ${this.frameRate}`);
      } catch (error) {
        this.logger.error(`Chyba při inicializaci TC Timecode: ${error}`);
        this.timecode = null;
      }
    } else {
      this.logger.warn('SMPTE Timecode není dostupný. TC výstup je deaktivován.');
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
  }

  private getFrameRateFromFormat(): number {
    // Nastavení framerate podle vybraného formátu
    switch (this.format) {
      case 'mtc': // MIDI Time Code
        return 25; // Standardní framerate pro MTC
      case 'ltc': // Linear Time Code (duplicitní s LTC výstupem, ale pro úplnost)
        return 30; // Standardní framerate pro LTC
      case 'smpte-30': // SMPTE 30fps
        return 30;
      case 'smpte-25': // SMPTE 25fps (evropský standard)
        return 25;
      case 'smpte-24': // SMPTE 24fps (filmový standard)
        return 24;
      case 'smpte-drop': // SMPTE 29.97fps drop-frame (US NTSC)
        return 29.97;
      default:
        return 30; // Výchozí hodnota
    }
  }

  public sendBeat(beatInfo: BeatInfo): void {
    if (!this.timecode) return;
    
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
        const hours = Math.floor(totalFrames / (this.frameRate * 3600)) % 24;
        const minutes = Math.floor(totalFrames / (this.frameRate * 60)) % 60;
        const seconds = Math.floor(totalFrames / this.frameRate) % 60;
        const frames = totalFrames % Math.floor(this.frameRate);
        
        // Aktualizace SMPTE timecode objektu
        this.timecode.setHours(hours);
        this.timecode.setMinutes(minutes);
        this.timecode.setSeconds(seconds);
        this.timecode.setFrames(frames);
        
        const timecodeString = this.timecode.toString();
        
        // Speciální zpracování pro různé formáty
        let formattedTimecode = timecodeString;
        if (this.format === 'mtc') {
          // MTC používá speciální formát MIDI zpráv
          // Zde by byla implementace generování MTC
        }
        
        this.logger.debug(`TC (${this.format}): ${formattedTimecode} (BPM: ${beatInfo.bpm.toFixed(1)})`);
        
        // Zde by byl skutečný kód pro generování a odesílání TC signálu
        // Na základě aktuálního timecode a zvoleného formátu
      }
    } catch (error) {
      this.logger.error(`Chyba při odesílání TC: ${error}`);
    }
  }

  public isAvailable(): boolean {
    return this.timecode !== null;
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