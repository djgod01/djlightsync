/*
 * DJ Sync Server - midi-output.ts
 * MIDI výstupní protokol s podporou RTP MIDI a Jazz-MIDI
 * v.0.1 - 2025-04-17
 */

import { Logger } from '../logger/logger';
import { BeatInfo } from '../djlink/djlink-manager';

// Import potřebných knihoven
let JazzMidi: any = null;
let rtpMidi: any = null;

try {
  JazzMidi = require('jazz-midi');
} catch (error) {
  console.warn('jazz-midi není dostupný. Lokální MIDI výstup bude deaktivován.');
}

try {
  rtpMidi = require('rtpmidi');
} catch (error) {
  console.warn('rtpmidi není dostupný. Síťový MIDI výstup bude deaktivován.');
}

export class MidiOutput {
  private logger: Logger;
  private settings: Record<string, any>;
  private midiOutput: any = null;
  private rtpMidiSession: any = null;
  private channel: number;
  private lastBeatTime: number = 0;
  private clockCounter: number = 0;
  private usesRtpMidi: boolean = false;

  constructor(logger: Logger, settings: Record<string, any>) {
    this.logger = logger;
    this.settings = settings;
    this.channel = (settings.channel || 1) - 1; // MIDI kanály jsou interně 0-15
    this.logger.debug(`MIDI výstup inicializován s nastavením: ${JSON.stringify(settings)}`);
    
    // Pokud je nastaveno RTP MIDI, použijeme ho
    if (settings.useRtpMidi && rtpMidi) {
      this.initRtpMidi();
    } 
    // Jinak zkusíme lokální MIDI s JazzMidi
    else if (JazzMidi) {
      this.initJazzMidi();
    } else {
      this.logger.warn('Žádná MIDI knihovna není dostupná. MIDI výstup je deaktivován.');
    }
  }

  private initJazzMidi(): void {
    try {
      // Inicializace Jazz-MIDI
      this.midiOutput = new JazzMidi.Output();
      
      // Získání seznamu dostupných výstupů
      const outputs = this.midiOutput.getPortList();
      this.logger.debug(`Dostupné MIDI výstupy: ${outputs.join(', ')}`);
      
      // Pokud je specifikováno konkrétní zařízení
      if (this.settings.device) {
        let deviceIndex = -1;
        
        // Najdeme odpovídající zařízení podle názvu
        for (let i = 0; i < outputs.length; i++) {
          if (outputs[i].includes(this.settings.device)) {
            deviceIndex = i;
            break;
          }
        }
        
        if (deviceIndex >= 0) {
          this.midiOutput.openPort(deviceIndex);
          this.logger.info(`MIDI výstup otevřen na zařízení: ${outputs[deviceIndex]}`);
        } else {
          this.logger.warn(`MIDI zařízení "${this.settings.device}" nebylo nalezeno. Otevírám výchozí port.`);
          if (outputs.length > 0) {
            this.midiOutput.openPort(0);
            this.logger.info(`MIDI výstup otevřen na zařízení: ${outputs[0]}`);
          } else {
            this.logger.warn('Žádné MIDI výstupy nejsou dostupné');
            this.midiOutput = null;
          }
        }
      } 
      // Pokud není specifikováno zařízení, otevřeme první dostupný
      else if (outputs.length > 0) {
        this.midiOutput.openPort(0);
        this.logger.info(`MIDI výstup otevřen na zařízení: ${outputs[0]}`);
      } else {
        this.logger.warn('Žádné MIDI výstupy nejsou dostupné');
        this.midiOutput = null;
      }
    } catch (error) {
      this.logger.error(`Chyba při inicializaci MIDI výstupu s Jazz-MIDI: ${error}`);
      this.midiOutput = null;
    }
  }

  private initRtpMidi(): void {
    try {
      // Vytvoření RTP MIDI session
      this.rtpMidiSession = rtpMidi.manager.createSession({
        name: this.settings.rtpSessionName || 'DJ Sync Server',
        bonjourName: this.settings.rtpBonjourName || 'DJ Sync Server',
        port: this.settings.rtpPort || 5004
      });
      
      this.rtpMidiSession.on('ready', () => {
        this.logger.info(`RTP MIDI session "${this.rtpMidiSession.bonjourName}" připravena na portu ${this.rtpMidiSession.port}`);
        this.usesRtpMidi = true;
      });
      
      this.rtpMidiSession.on('error', (err: any) => {
        this.logger.error(`Chyba RTP MIDI session: ${err}`);
      });
      
      this.rtpMidiSession.start();
    } catch (error) {
      this.logger.error(`Chyba při inicializaci RTP MIDI výstupu: ${error}`);
      this.rtpMidiSession = null;
    }
  }

  public sendBeat(beatInfo: BeatInfo): void {
    if (!this.midiOutput && !this.rtpMidiSession) return;
    
    try {
      const now = Date.now();
      const msBetweenClocks = 60000 / (beatInfo.bpm * 24); // MIDI clock je 24 pulsů na dobu
      
      // Vyšleme MIDI Beat Clock (0xF8) v pravidelných intervalech
      if (this.lastBeatTime === 0 || now - this.lastBeatTime >= msBetweenClocks) {
        this.lastBeatTime = now;
        this.sendMidiClock();
        this.clockCounter++;
        
        // Každých 24 clocků je jeden beat
        if (this.clockCounter >= 24) {
          this.clockCounter = 0;
          this.sendMidiBeat(beatInfo.beatInMeasure);
        }
      }
      
      this.logger.debug(`MIDI sync: BPM=${beatInfo.bpm}, Beat=${beatInfo.beatInMeasure}`);
    } catch (error) {
      this.logger.error(`Chyba při odesílání MIDI beatu: ${error}`);
    }
  }

  private sendMidiClock(): void {
    // MIDI Timing Clock (0xF8)
    if (this.midiOutput) {
      // Jazz-MIDI používá jiné API pro odesílání MIDI zpráv
      this.midiOutput.MidiOut(0xF8);
    }
    
    if (this.rtpMidiSession && this.usesRtpMidi) {
      this.rtpMidiSession.sendMessage([0xF8]);
    }
  }

  private sendMidiBeat(beatInMeasure: number): void {
    // MIDI Note On pro označení beatu
    // Používáme různé noty pro různé pozice v taktu
    const note = 36 + (beatInMeasure - 1); // C1, C#1, D1, D#1
    const velocity = beatInMeasure === 1 ? 127 : 100; // První doba v taktu má vyšší velocity
    
    if (this.midiOutput) {
      // Note On s Jazz-MIDI
      this.midiOutput.MidiOut(0x90 | this.channel, note, velocity);
      
      // Note Off (ihned) - krátký impulz
      this.midiOutput.MidiOut(0x80 | this.channel, note, 0);
    }
    
    if (this.rtpMidiSession && this.usesRtpMidi) {
      // Note On
      this.rtpMidiSession.sendMessage([0x90 | this.channel, note, velocity]);
      
      // Note Off (ihned) - krátký impulz
      this.rtpMidiSession.sendMessage([0x80 | this.channel, note, 0]);
    }
  }

  public isAvailable(): boolean {
    return this.midiOutput !== null || (this.rtpMidiSession !== null && this.usesRtpMidi);
  }

  public close(): void {
    if (this.midiOutput) {
      try {
        // Uzavření Jazz-MIDI
        this.midiOutput.close();
        this.midiOutput = null;
        this.logger.info('Lokální MIDI výstup uzavřen');
      } catch (error) {
        this.logger.error(`Chyba při uzavírání lokálního MIDI výstupu: ${error}`);
      }
    }
    
    if (this.rtpMidiSession) {
      try {
        this.rtpMidiSession.stop();
        this.rtpMidiSession = null;
        this.logger.info('RTP MIDI výstup uzavřen');
      } catch (error) {
        this.logger.error(`Chyba při uzavírání RTP MIDI výstupu: ${error}`);
      }
    }
  }

  // Metoda pro získání seznamu dostupných MIDI zařízení
  public static getMidiDevices(): {id: number, name: string}[] {
    try {
      if (!JazzMidi) {
        return [];
      }

      const midi = new JazzMidi.Output();
      const outputs = midi.getPortList();
      midi.close();

      return outputs.map((name: string, id: number) => ({ id, name }));
    } catch (error) {
      console.error('Chyba při získávání seznamu MIDI zařízení:', error);
      return [];
    }
  }
}