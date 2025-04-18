/*
 * DJ Sync Server - midi-output.ts
 * MIDI výstupní protokol s podporou RTP MIDI a Jazz-MIDI
 * v.0.1 - 2025-04-18
 */

import { Logger } from '../logger/logger';
import { BeatInfo } from '../djlink/djlink-manager';

// Import potřebných knihoven
let JazzMidi: any = null;
let RtpMidi: any = null;

try {
  JazzMidi = require('jazz-midi');
} catch (error) {
  console.warn('jazz-midi není dostupný. Lokální MIDI výstup bude deaktivován.');
}

try {
  RtpMidi = require('rtpmidi');
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
    if (settings.useRtpMidi && RtpMidi) {
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
      // Zjistíme dostupné výstupy přímo z jazz-midi API
      const outputs = JazzMidi.MidiOutList() || [];
      this.logger.debug(`Dostupné MIDI výstupy: ${outputs.join(', ')}`);
      
      if (outputs.length === 0) {
        this.logger.warn('Žádné MIDI výstupy nejsou dostupné');
        return;
      }
      
      // Vytvoříme instanci MIDI objektu
      try {
        this.midiOutput = JazzMidi.MIDI();
        
        if (!this.midiOutput || typeof this.midiOutput.MidiOutOpen !== 'function') {
          this.logger.error('Nelze vytvořit MIDI instanci, nebo MidiOutOpen není funkce');
          this.midiOutput = null;
          return;
        }
      } catch (error) {
        this.logger.error(`Chyba při vytváření MIDI instance: ${error}`);
        this.midiOutput = null;
        return;
      }
      
      // Určíme, který port otevřít
      let deviceIndex = 0;
      
      // Pokud je specifikováno konkrétní zařízení, hledáme ho podle názvu
      if (this.settings.device) {
        for (let i = 0; i < outputs.length; i++) {
          if (outputs[i].includes(this.settings.device)) {
            deviceIndex = i;
            break;
          }
        }
        
        if (!outputs[deviceIndex].includes(this.settings.device)) {
          this.logger.warn(`MIDI zařízení "${this.settings.device}" nebylo nalezeno. Otevírám výchozí port.`);
        }
      }
      
      // Otevřeme MIDI port
      try {
        this.midiOutput.MidiOutOpen(deviceIndex);
        this.logger.info(`MIDI výstup otevřen na zařízení: ${outputs[deviceIndex]}`);
      } catch (error) {
        this.logger.error(`Chyba při otevírání MIDI portu: ${error}`);
        this.midiOutput = null;
      }
    } catch (error) {
      this.logger.error(`Chyba při inicializaci MIDI výstupu s Jazz-MIDI: ${error}`);
      this.midiOutput = null;
    }
  }

  private initRtpMidi(): void {
    const sessionName = this.settings.rtpSessionName || 'DJ Sync Server';
    const port = this.settings.rtpPort || 5004;

    try {
      // Metoda 1: Přes RtpMidi.manager.createSession (preferovaná metoda podle testu)
      this.rtpMidiSession = RtpMidi.manager.createSession({
        name: sessionName,
        bonjourName: sessionName,
        port: port
      });
      
      this.logger.info(`RTP MIDI session "${sessionName}" připravena na portu ${port}`);
      this.usesRtpMidi = true;
      
      // Nastavení event handlerů
      this.rtpMidiSession.on('error', (err: any) => {
        this.logger.error(`Chyba RTP MIDI session: ${err}`);
      });
      
      // Logování připojení
      this.rtpMidiSession.on('connection', (conn: any) => {
        this.logger.info(`Nové RTP MIDI připojení: ${conn.name || 'neznámé'}`);
      });
    } catch (error) {
      this.logger.error(`Chyba při inicializaci RTP MIDI výstupu: ${error}`);
      
      // Záložní metoda: Pokud manager.createSession selže, zkusíme přímý konstruktor
      try {
        this.logger.info('Zkouším alternativní způsob vytvoření RTP MIDI session...');
        this.rtpMidiSession = new RtpMidi.Session({
          name: sessionName,
          bonjourName: sessionName,
          port: port
        });
        
        this.logger.info(`RTP MIDI session "${sessionName}" připravena na portu ${port} (alternativní způsob)`);
        this.usesRtpMidi = true;
        
        // Nastavení event handlerů
        this.rtpMidiSession.on('error', (err: any) => {
          this.logger.error(`Chyba RTP MIDI session: ${err}`);
        });
      } catch (backupError) {
        this.logger.error(`Záložní metoda také selhala: ${backupError}`);
        this.rtpMidiSession = null;
      }
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
      try {
        // Jazz-MIDI používá MidiOut metodu
        this.midiOutput.MidiOut(0xF8);
      } catch (error) {
        this.logger.error(`Chyba při odesílání MIDI clock: ${error}`);
      }
    }
    
    if (this.rtpMidiSession && this.usesRtpMidi) {
      try {
        // rtpmidi používá metodu send pro odesílání MIDI zpráv
        this.rtpMidiSession.send([0xF8]);
      } catch (error) {
        this.logger.error(`Chyba při odesílání MIDI clock: ${error}`);
        
        // Pokud dojde k chybě, pokusíme se o použití jiného API (SessionOutput)
        try {
          if (this.rtpMidiSession.output && typeof this.rtpMidiSession.output.send === 'function') {
            this.rtpMidiSession.output.send([0xF8]);
          }
        } catch (backupError) {
          // Ignorujeme chybu záložní metody, nechceme zahlcovat log
        }
      }
    }
  }

  private sendMidiBeat(beatInMeasure: number): void {
    // MIDI Note On pro označení beatu
    // Používáme různé noty pro různé pozice v taktu
    const note = 36 + (beatInMeasure - 1); // C1, C#1, D1, D#1
    const velocity = beatInMeasure === 1 ? 127 : 100; // První doba v taktu má vyšší velocity
    
    if (this.midiOutput) {
      try {
        // Note On s Jazz-MIDI
        this.midiOutput.MidiOut(0x90 | this.channel, note, velocity);
        
        // Note Off (ihned) - krátký impulz
        this.midiOutput.MidiOut(0x80 | this.channel, note, 0);
      } catch (error) {
        this.logger.error(`Chyba při odesílání MIDI noty: ${error}`);
      }
    }
    
    if (this.rtpMidiSession && this.usesRtpMidi) {
      try {
        // Note On s rtpmidi
        this.rtpMidiSession.send([0x90 | this.channel, note, velocity]);
        
        // Note Off (ihned) - krátký impulz
        this.rtpMidiSession.send([0x80 | this.channel, note, 0]);
      } catch (error) {
        this.logger.error(`Chyba při odesílání MIDI noty: ${error}`);
        
        // Pokud dojde k chybě, pokusíme se o použití jiného API (SessionOutput)
        try {
          if (this.rtpMidiSession.output && typeof this.rtpMidiSession.output.send === 'function') {
            this.rtpMidiSession.output.send([0x90 | this.channel, note, velocity]);
            this.rtpMidiSession.output.send([0x80 | this.channel, note, 0]);
          }
        } catch (backupError) {
          // Ignorujeme chybu záložní metody, nechceme zahlcovat log
        }
      }
    }
  }

  public isAvailable(): boolean {
    return this.midiOutput !== null || (this.rtpMidiSession !== null && this.usesRtpMidi);
  }

  public close(): void {
    if (this.midiOutput) {
      try {
        // Uzavření Jazz-MIDI
        if (typeof this.midiOutput.MidiOutClose === 'function') {
          this.midiOutput.MidiOutClose();
        }
        this.midiOutput = null;
        this.logger.info('Lokální MIDI výstup uzavřen');
      } catch (error) {
        this.logger.error(`Chyba při uzavírání lokálního MIDI výstupu: ${error}`);
      }
    }
    
    if (this.rtpMidiSession) {
      try {
        // U rtpmidi zkusíme různé metody uzavření session
        if (typeof this.rtpMidiSession.stop === 'function') {
          this.rtpMidiSession.stop();
        } else if (typeof this.rtpMidiSession.close === 'function') {
          this.rtpMidiSession.close();
        } else if (RtpMidi && RtpMidi.manager && typeof RtpMidi.manager.removeSession === 'function') {
          RtpMidi.manager.removeSession(this.rtpMidiSession);
        }
        
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
      if (!JazzMidi || !JazzMidi.MidiOutList) {
        return [];
      }

      // Přímo použijeme globální metodu MidiOutList
      const outputs = JazzMidi.MidiOutList() || [];
      
      return outputs.map((name: string, id: number) => ({ id, name }));
    } catch (error) {
      console.error('Chyba při získávání seznamu MIDI zařízení:', error);
      return [];
    }
  }
}