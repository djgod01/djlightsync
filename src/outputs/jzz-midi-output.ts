/*
 * DJ Sync Server - jzz-midi-output.ts
 * MIDI výstupní protokol s podporou RTP MIDI a JZZ
 * v.0.2 - 2025-04-22
 */

import { Logger } from '../logger/logger';
import { BeatInfo } from '../djlink/djlink-manager';

// Import potřebných knihoven
let JZZ: any = null;
let RtpMidi: any = null;

try {
  JZZ = require('jzz');
  // Pokusit se načíst rozšiřující moduly pro JZZ
  try { require('jzz-midi-smf'); } catch (e) { /* ignorujeme při chybějícím modulu */ }
  try { require('jzz-synth-tiny'); } catch (e) { /* ignorujeme při chybějícím modulu */ }
  try { require('jzz-input-kbd'); } catch (e) { /* ignorujeme při chybějícím modulu */ }
} catch (error) {
  console.warn('jzz není dostupný. Lokální MIDI výstup bude deaktivován.');
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
  private deviceInfo: any = null;

  constructor(logger: Logger, settings: Record<string, any>) {
    this.logger = logger;
    this.settings = settings;
    this.channel = (settings.channel || 1) - 1; // MIDI kanály jsou interně 0-15
    this.logger.debug(`MIDI výstup inicializován s nastavením: ${JSON.stringify(settings)}`);
    
    // Pokud je nastaveno RTP MIDI, použijeme ho
    if (settings.useRtpMidi && RtpMidi) {
      this.initRtpMidi();
    } 
    // Jinak zkusíme lokální MIDI s JZZ
    else if (JZZ) {
      this.initJzzMidi();
    } else {
      this.logger.warn('Žádná MIDI knihovna není dostupná. MIDI výstup je deaktivován.');
    }
  }

  private initJzzMidi(): void {
    try {
      // Zjistíme dostupné výstupy
      const outputs = this.getMidiDevicesSync();
      this.logger.debug(`Dostupné MIDI výstupy: ${outputs.map(d => d.name).join(', ')}`);
      
      if (outputs.length === 0) {
        this.logger.warn('Žádné MIDI výstupy nejsou dostupné');
        return;
      }
      
      // Určíme, který port otevřít
      let selectedDevice = null;
      
      // Pokud je specifikováno konkrétní zařízení, hledáme ho podle názvu
      if (this.settings.device) {
        selectedDevice = outputs.find(d => d.name.includes(this.settings.device));
        
        if (!selectedDevice) {
          this.logger.warn(`MIDI zařízení "${this.settings.device}" nebylo nalezeno. Otevírám výchozí port.`);
        }
      }
      
      // Pokud nebylo nalezeno konkrétní zařízení, použijeme první dostupné
      if (!selectedDevice && outputs.length > 0) {
        selectedDevice = outputs[0];
      }
      
      // Otevřeme MIDI port
      try {
        if (selectedDevice) {
          this.midiOutput = JZZ().openMidiOut(selectedDevice.name);
          this.deviceInfo = selectedDevice;
          this.logger.info(`MIDI výstup otevřen na zařízení: ${selectedDevice.name}`);
        } else {
          // Otevřeme výchozí MIDI výstup
          this.midiOutput = JZZ().openMidiOut();
          this.deviceInfo = { name: 'Výchozí MIDI zařízení', id: -1 };
          this.logger.info('MIDI výstup otevřen na výchozím zařízení');
        }
      } catch (error) {
        this.logger.error(`Chyba při otevírání MIDI portu: ${error}`);
        this.midiOutput = null;
      }
    } catch (error) {
      this.logger.error(`Chyba při inicializaci MIDI výstupu s JZZ: ${error}`);
      this.midiOutput = null;
    }
  }

  private initRtpMidi(): void {
    const sessionName = this.settings.rtpSessionName || 'DJ Sync Server';
    const port = this.settings.rtpPort || 5004;
    const networkDeviceId = this.settings.networkDeviceId || '';

    try {
        // Upravený způsob inicializace - explicitně povolíme Bonjour discovery
        this.rtpMidiSession = RtpMidi.manager.createSession({
            name: sessionName,
            bonjourName: sessionName,
            port: port,
            enableBroadcast: true,
            localName: sessionName,
            // Přidáme IP adresu serveru, pokud je k dispozici
            localNets: this.settings.interface ? [this.settings.interface] : undefined
        });
        
        this.logger.info(`RTP MIDI session "${sessionName}" připravena na portu ${port}`);
        this.usesRtpMidi = true;
        
        // Explicitně spustíme discovery
        if (RtpMidi.manager.startDiscovery) {
            RtpMidi.manager.startDiscovery();
            this.logger.info('RTP MIDI discovery explicitně spuštěno');
        }
        
        // Přidáme event listener pro sledování nalezených zařízení
        if (RtpMidi.manager.on) {
            RtpMidi.manager.on('deviceFound', (device: any) => {
                this.logger.info(`RTP MIDI zařízení nalezeno: ${device.name || 'neznámé'} (${device.address || 'neznámá adresa'})`);
            });
        }
        
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
          port: port,
          enableBroadcast: true,
          localName: sessionName
        });
        
        this.logger.info(`RTP MIDI session "${sessionName}" připravena na portu ${port} (alternativní způsob)`);
        this.usesRtpMidi = true;
        
        // Nastavení event handlerů
        this.rtpMidiSession.on('error', (err: any) => {
          this.logger.error(`Chyba RTP MIDI session: ${err}`);
        });
        
        // Logování připojení
        this.rtpMidiSession.on('connection', (conn: any) => {
          this.logger.info(`Nové RTP MIDI připojení: ${conn.name || 'neznámé'}`);
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
        // JZZ používá send metodu s MIDI zprávou
        this.midiOutput.send([0xF8]);
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
        // Note On s JZZ
        this.midiOutput.send([0x90 | this.channel, note, velocity]);
        
        // Note Off (ihned) - krátký impulz
        // Posíláme s malým zpožděním, aby byla nota slyšitelná
        setTimeout(() => {
          if (this.midiOutput) {
            this.midiOutput.send([0x80 | this.channel, note, 0]);
          }
        }, 10);
      } catch (error) {
        this.logger.error(`Chyba při odesílání MIDI noty: ${error}`);
      }
    }
    
    if (this.rtpMidiSession && this.usesRtpMidi) {
      try {
        // Note On s rtpmidi
        this.rtpMidiSession.send([0x90 | this.channel, note, velocity]);
        
        // Note Off (ihned) - krátký impulz
        setTimeout(() => {
          if (this.rtpMidiSession) {
            try {
              this.rtpMidiSession.send([0x80 | this.channel, note, 0]);
            } catch (error) {
              // Ignorujeme chybu
            }
          }
        }, 10);
      } catch (error) {
        this.logger.error(`Chyba při odesílání MIDI noty: ${error}`);
        
        // Pokud dojde k chybě, pokusíme se o použití jiného API (SessionOutput)
        try {
          if (this.rtpMidiSession.output && typeof this.rtpMidiSession.output.send === 'function') {
            this.rtpMidiSession.output.send([0x90 | this.channel, note, velocity]);
            
            setTimeout(() => {
              if (this.rtpMidiSession && this.rtpMidiSession.output) {
                this.rtpMidiSession.output.send([0x80 | this.channel, note, 0]);
              }
            }, 10);
          }
        } catch (backupError) {
          // Ignorujeme chybu záložní metody
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
        // Uzavření JZZ
        this.midiOutput.close();
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

  /**
   * Synchronně získá seznam dostupných MIDI zařízení
   */
  private getMidiDevicesSync(): {id: number, name: string}[] {
    try {
      if (!JZZ) {
        return [];
      }

      // Použijeme JZZ.info() pro získání informací o dostupných MIDI zařízeních
      const info = JZZ.info();
      const outputs = info.outputs || [];
      
      return outputs.map((device: any, index: number) => ({
        id: index,
        name: device.name || `MIDI zařízení ${index + 1}`
      }));
    } catch (error) {
      this.logger.error(`Chyba při získávání seznamu MIDI zařízení: ${error}`);
      return [];
    }
  }

  /**
   * Statická metoda pro získání seznamu dostupných MIDI zařízení
   */
  public static getMidiDevices(): {id: number, name: string}[] {
    try {
      if (!JZZ) {
        // Dynamický import JZZ, pokud není již importován
        try {
          JZZ = require('jzz');
        } catch (error) {
          console.warn('jzz není dostupný. Seznam MIDI zařízení nelze získat.');
          return [];
        }
      }

      // Použijeme JZZ.info() pro získání informací o dostupných MIDI zařízeních
      const info = JZZ.info();
      const outputs = info.outputs || [];
      
      return outputs.map((device: any, index: number) => ({
        id: index,
        name: device.name || `MIDI zařízení ${index + 1}`
      }));
    } catch (error) {
      console.error('Chyba při získávání seznamu MIDI zařízení:', error);
      return [];
    }
  }
}