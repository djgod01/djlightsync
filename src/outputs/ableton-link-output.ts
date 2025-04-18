/*
 * DJ Sync Server - ableton-link-output.ts
 * Ableton Link výstupní protokol (simulovaná implementace)
 * v.0.1 - 2025-04-17
 */

import { Logger } from '../logger/logger';
import { BeatInfo } from '../djlink/djlink-manager';

// Simulovaná implementace Ableton Link
class LinkSimulator {
  private _tempo: number = 120;
  private _phase: number = 0;
  private _quantum: number = 4;
  private _callbacks: ((beat: number, phase: number, tempo: number) => void)[] = [];
  private _enabled: boolean = false;
  private _interval: NodeJS.Timeout | null = null;

  constructor() {
    // Nic není třeba inicializovat
  }

  set tempo(value: number) {
    this._tempo = value;
    this._notifyListeners();
  }

  get tempo(): number {
    return this._tempo;
  }

  set quantum(value: number) {
    this._quantum = value;
  }

  get quantum(): number {
    return this._quantum;
  }

  enable(): void {
    this._enabled = true;
    this._startUpdateTimer();
  }

  disable(): void {
    this._enabled = false;
    this._stopUpdateTimer();
  }

  startUpdate(): void {
    this._startUpdateTimer();
  }

  stopUpdate(): void {
    this._stopUpdateTimer();
  }

  requestBeatAtTime(beat: number, time: number, quantum: number): void {
    this._phase = beat / quantum;
    this._quantum = quantum;
    this._notifyListeners();
  }

  addTempoListener(callback: (beat: number, phase: number, tempo: number) => void): void {
    this._callbacks.push(callback);
  }

  private _startUpdateTimer(): void {
    if (this._interval) return;
    
    this._interval = setInterval(() => {
      if (!this._enabled) return;
      
      // Simulace postupu fáze podle tempa
      const beatDuration = 60 / this._tempo; // doba jednoho beatu v sekundách
      const phaseIncrement = 0.2 / beatDuration; // o kolik se posune fáze za 0.2s
      
      this._phase = (this._phase + phaseIncrement) % 1.0;
      
      this._notifyListeners();
    }, 200); // aktualizace každých 200ms
  }

  private _stopUpdateTimer(): void {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  private _notifyListeners(): void {
    const beat = Math.floor(this._phase * this._quantum);
    this._callbacks.forEach(callback => {
      try {
        callback(beat, this._phase, this._tempo);
      } catch (error) {
        console.error('Chyba v callback funkci Ableton Link:', error);
      }
    });
  }
}

export class AbletonLinkOutput {
  private logger: Logger;
  private settings: Record<string, any>;
  private quantum: number;
  private linkInstance: LinkSimulator;
  private lastBeatTime: number = 0;

  constructor(logger: Logger, settings: Record<string, any>) {
    this.logger = logger;
    this.settings = settings;
    this.quantum = settings.quantum || 4;
    this.logger.debug(`Ableton Link výstup inicializován s quantum: ${this.quantum}`);
    
    // Inicializace simulované verze Ableton Link
    this.linkInstance = new LinkSimulator();
    this.linkInstance.quantum = this.quantum;
    this.linkInstance.enable();
    this.linkInstance.startUpdate();
    
    // Přidání listeneru pro logování změn
    this.linkInstance.addTempoListener((beat, phase, tempo) => {
      this.logger.debug(`Ableton Link simulace: Beat=${beat}, Phase=${phase.toFixed(2)}, Tempo=${tempo.toFixed(1)}`);
    });
    
    this.logger.info(`Ableton Link (simulace) nakonfigurován s quantum ${this.quantum}`);
  }

  public sendBeat(beatInfo: BeatInfo): void {
    if (!this.linkInstance) return;
    
    try {
      // Aktualizace tempa
      this.linkInstance.tempo = beatInfo.bpm;
      
      // Synchronizace fáze beatu
      const now = Date.now() * 1000; // převod na mikrosekundy
      
      // Vypočteme fázi v rámci taktu
      const beatPhase = (beatInfo.beatInMeasure - 1) / 4.0; // 0.0 - 0.75 pro beaty 1-4
      
      // Pokud se změnil beat, provedeme synchronizaci fáze
      if (this.lastBeatTime === 0 || now - this.lastBeatTime > 100000) { // 100ms v mikrosekundách
        this.lastBeatTime = now;
        
        // Nastavení fáze
        this.linkInstance.requestBeatAtTime(beatInfo.beatInMeasure - 1, now, this.quantum);
      }
      
      this.logger.debug(`Ableton Link sync: BPM=${beatInfo.bpm}, Beat=${beatInfo.beatInMeasure}, Phase=${beatPhase.toFixed(2)}`);
    } catch (error) {
      this.logger.error(`Chyba při synchronizaci Ableton Link: ${error}`);
    }
  }

  public isAvailable(): boolean {
    return true; // Simulovaná verze je vždy dostupná
  }

  public close(): void {
    try {
      this.linkInstance.disable();
      this.linkInstance.stopUpdate();
      this.logger.info('Ableton Link výstup uzavřen');
    } catch (error) {
      this.logger.error(`Chyba při uzavírání Ableton Link: ${error}`);
    }
  }
}