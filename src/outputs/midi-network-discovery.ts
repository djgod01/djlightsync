/*
 * DJ Sync Server - midi-network-discovery.ts
 * Modul pro objevování a správu síťových MIDI zařízení
 * v.0.1 - 2025-04-20
 */

import { Logger } from '../logger/logger';
import { MDNSDiscovery } from '../network/mdns-discovery';

export interface NetworkMidiDevice {
  id: string;
  name: string;
  host: string;
  port: number;
  type: 'rtp-midi' | 'network-midi' | 'unknown';
  isAvailable: boolean;
}

export class MidiNetworkDiscovery {
  private logger: Logger;
  private mdnsDiscovery: MDNSDiscovery;
  private networkDevices: NetworkMidiDevice[] = [];
  private listeners: Array<(devices: NetworkMidiDevice[]) => void> = [];
  private isDiscoveryActive: boolean = false;

  constructor(logger: Logger) {
    this.logger = logger;
    this.mdnsDiscovery = new MDNSDiscovery(logger);
    
    // Přidáme listener na změny v mDNS
    this.mdnsDiscovery.addListener((services) => {
      this.processDiscoveredServices(services);
    });
    
    this.logger.info('MIDI Network Discovery inicializován');
  }

  /**
   * Spustí vyhledávání síťových MIDI zařízení
   */
  public startDiscovery(): void {
    if (this.isDiscoveryActive) return;
    
    try {
      // Spustíme mDNS discovery
      this.mdnsDiscovery.startDiscovery();
      this.isDiscoveryActive = true;
      this.logger.info('Spuštěno vyhledávání síťových MIDI zařízení');
    } catch (error) {
      this.logger.error(`Chyba při spouštění vyhledávání síťových MIDI zařízení: ${error}`);
    }
  }

  /**
   * Zastaví vyhledávání
   */
  public stopDiscovery(): void {
    if (!this.isDiscoveryActive) return;
    
    try {
      this.mdnsDiscovery.stopDiscovery();
      this.isDiscoveryActive = false;
      this.networkDevices = [];
      this.logger.info('Vyhledávání síťových MIDI zařízení zastaveno');
    } catch (error) {
      this.logger.error(`Chyba při zastavování vyhledávání síťových MIDI zařízení: ${error}`);
    }
  }

  /**
   * Vrátí seznam nalezených síťových MIDI zařízení
   */
  public getNetworkMidiDevices(): NetworkMidiDevice[] {
    return [...this.networkDevices];
  }

  /**
   * Přidá posluchače změn v seznamu zařízení
   */
  public addListener(listener: (devices: NetworkMidiDevice[]) => void): void {
    this.listeners.push(listener);
    
    // Okamžitě pošleme aktuální seznam
    try {
      listener(this.networkDevices);
    } catch (error) {
      this.logger.error(`Chyba při notifikaci nového posluchače: ${error}`);
    }
  }

  /**
   * Odstraní posluchače
   */
  public removeListener(listener: (devices: NetworkMidiDevice[]) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Připojí se k síťovému MIDI zařízení
   * Tato metoda vrací informace potřebné pro vytvoření připojení,
   * ale samotné připojení musí být implementováno v MIDI modulu
   */
  public getConnectionInfo(deviceId: string): NetworkMidiDevice | null {
    const device = this.networkDevices.find(d => d.id === deviceId);
    return device || null;
  }

  /**
   * Zpracuje seznam objevených služeb z mDNS discovery
   */
  private processDiscoveredServices(services: any[]): void {
    const newDevices: NetworkMidiDevice[] = [];
    
    // Zpracování RTP MIDI služeb
    for (const service of services) {
      if (service.type.includes('apple-midi')) {
        const device: NetworkMidiDevice = {
          id: `${service.name}@${service.host}:${service.port}`,
          name: service.name,
          host: service.host,
          port: service.port,
          type: 'rtp-midi',
          isAvailable: true
        };
        newDevices.push(device);
      }
    }
    
    // Kontrola, zda se seznam změnil
    if (this.haveDevicesChanged(newDevices)) {
      this.networkDevices = newDevices;
      this.notifyListeners();
    }
  }

  /**
   * Zkontroluje, zda se seznam zařízení změnil
   */
  private haveDevicesChanged(newDevices: NetworkMidiDevice[]): boolean {
    if (this.networkDevices.length !== newDevices.length) {
      return true;
    }
    
    // Kontrola, zda všechna stará zařízení jsou v novém seznamu
    for (const oldDevice of this.networkDevices) {
      const found = newDevices.some(newDevice => newDevice.id === oldDevice.id);
      if (!found) {
        return true;
      }
    }
    
    // Kontrola, zda všechna nová zařízení jsou ve starém seznamu
    for (const newDevice of newDevices) {
      const found = this.networkDevices.some(oldDevice => oldDevice.id === newDevice.id);
      if (!found) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Informuje všechny posluchače o změně v seznamu zařízení
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.networkDevices);
      } catch (error) {
        this.logger.error(`Chyba při notifikaci posluchače: ${error}`);
      }
    }
  }
}
