/*
 * DJ Sync Server - output-manager.ts
 * Správa výstupních protokolů
 * v.0.1 - 2025-04-18
 */

import { Logger } from '../logger/logger';
import { Config } from '../config/config';
import { DJLinkManager, BeatInfo } from '../djlink/djlink-manager';
import { MidiOutput } from './midi-output';
import { LTCOutput } from './ltc-output';
import { AbletonLinkOutput } from './ableton-link-output';
import { TCOutput } from './tc-output';

export class OutputManager {
  private logger: Logger;
  private config: Config;
  private djLinkManager: DJLinkManager;
  private midiOutput: MidiOutput | null = null;
  private ltcOutput: LTCOutput | null = null;
  private abletonLinkOutput: AbletonLinkOutput | null = null;
  private tcOutput: TCOutput | null = null;

  constructor(logger: Logger, config: Config, djLinkManager: DJLinkManager) {
    this.logger = logger;
    this.config = config;
    this.djLinkManager = djLinkManager;
  }
  
  /**
   * Vrátí instanci TC výstupu pro přímou manipulaci
   */
  public getTcOutput(): TCOutput | null {
    return this.tcOutput;
  }
  
  /**
   * Inicializuje všechny výstupy podle aktuální konfigurace
   */
  public initOutputs(): void {
    const appConfig = this.config.getConfig();

    // Inicializace jednotlivých výstupů podle konfigurace
    if (appConfig.outputs.midi.enabled) {
      try {
        this.midiOutput = new MidiOutput(this.logger, appConfig.outputs.midi.settings);
        if (this.midiOutput.isAvailable()) {
          this.logger.info('MIDI výstup inicializován');
        } else {
          this.logger.warn('MIDI výstup není k dispozici');
          this.midiOutput = null;
        }
      } catch (error) {
        this.logger.error(`Chyba při inicializaci MIDI výstupu: ${error}`);
        this.midiOutput = null;
      }
    }
    
    if (appConfig.outputs.ltc.enabled) {
      try {
        this.ltcOutput = new LTCOutput(this.logger, appConfig.outputs.ltc.settings);
        if (this.ltcOutput.isAvailable()) {
          this.logger.info('LTC výstup inicializován');
        } else {
          this.logger.warn('LTC výstup není k dispozici');
          this.ltcOutput = null;
        }
      } catch (error) {
        this.logger.error(`Chyba při inicializaci LTC výstupu: ${error}`);
        this.ltcOutput = null;
      }
    }

    if (appConfig.outputs.abletonLink.enabled) {
      try {
        this.abletonLinkOutput = new AbletonLinkOutput(this.logger, appConfig.outputs.abletonLink.settings);
        if (this.abletonLinkOutput.isAvailable()) {
          this.logger.info('Ableton Link výstup inicializován');
        } else {
          this.logger.warn('Ableton Link výstup není k dispozici');
          this.abletonLinkOutput = null;
        }
      } catch (error) {
        this.logger.error(`Chyba při inicializaci Ableton Link výstupu: ${error}`);
        this.abletonLinkOutput = null;
      }
    }
    
    if (appConfig.outputs.tc.enabled) {
      try {
        this.tcOutput = new TCOutput(this.logger, appConfig.outputs.tc.settings);
        if (this.tcOutput.isAvailable()) {
          this.logger.info('TC výstup inicializován');
        } else {
          this.logger.warn('TC výstup není k dispozici');
          this.tcOutput = null;
        }
      } catch (error) {
        this.logger.error(`Chyba při inicializaci TC výstupu: ${error}`);
        this.tcOutput = null;
      }
    }

    // Nastavení posluchačů na události z DJ Link Manageru
    this.djLinkManager.on('beat', (beatInfo: BeatInfo) => {
      this.handleBeat(beatInfo);
    });

    this.djLinkManager.on('masterChanged', (deviceId: number) => {
      this.logger.info(`Změna master zařízení na ID: ${deviceId}`);
    });
  }

  /**
   * Zavře všechny aktivní výstupy
   */
  public closeAll(): void {
    if (this.midiOutput) {
      this.midiOutput.close();
      this.midiOutput = null;
    }

    if (this.ltcOutput) {
      this.ltcOutput.close();
      this.ltcOutput = null;
    }

    if (this.abletonLinkOutput) {
      this.abletonLinkOutput.close();
      this.abletonLinkOutput = null;
    }

    if (this.tcOutput) {
      this.tcOutput.close();
      this.tcOutput = null;
    }

    this.logger.info('Všechny výstupy byly uzavřeny');
  }

  /**
   * Znovu načte a inicializuje všechny výstupy podle aktuální konfigurace
   */
  public reloadOutputs(): void {
    this.logger.info('Reloadování výstupů podle nové konfigurace...');
    
    // Zavření všech stávajících výstupů
    this.closeAll();
    
    // Nová inicializace výstupů
    this.initOutputs();
    
    this.logger.info('Výstupy byly úspěšně reinicializovány');
  }

  /**
   * Zpracuje událost beat a odešle ji na všechny aktivní výstupy
   */
  private handleBeat(beatInfo: BeatInfo): void {
    // Rozeslání informací o beatu na všechny aktivní výstupy
    if (this.midiOutput) {
      this.midiOutput.sendBeat(beatInfo);
    }

    if (this.ltcOutput) {
      this.ltcOutput.sendBeat(beatInfo);
    }

    if (this.abletonLinkOutput) {
      this.abletonLinkOutput.sendBeat(beatInfo);
    }

    if (this.tcOutput) {
      this.tcOutput.sendBeat(beatInfo);
    }
  }

  /**
   * Vrátí aktuální stav všech výstupů
   */
  public getOutputStatus(): {
    midi: boolean;
    ltc: boolean;
    abletonLink: boolean;
    tc: boolean;
  } {
    return {
      midi: this.midiOutput !== null,
      ltc: this.ltcOutput !== null,
      abletonLink: this.abletonLinkOutput !== null,
      tc: this.tcOutput !== null
    };
  }
}