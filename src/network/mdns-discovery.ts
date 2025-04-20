/*
 * DJ Sync Server - mdns-discovery.ts
 * mDNS discovery služba pro nalezení síťových zařízení
 * v.0.1 - 2025-04-20
 */

import { Logger } from '../logger/logger';

interface ServiceInfo {
  name: string;
  type: string;
  host: string;
  port: number;
  addresses: string[];
  txt?: Record<string, string>;
}

export class MDNSDiscovery {
  private logger: Logger;
  private bonjour: any;
  private browser: any;
  private rtpMidiBrowser: any;
  private discoveredServices: Map<string, ServiceInfo> = new Map();
  private listeners: Array<(services: ServiceInfo[]) => void> = [];

  constructor(logger: Logger) {
    this.logger = logger;
    try {
      // Dynamicky importujeme bonjour, abychom se vyhnuli problémům, pokud není nainstalován
      this.bonjour = require('bonjour')();
      this.logger.info('mDNS discovery služba byla inicializována');
    } catch (error) {
      this.logger.warn(`Nepodařilo se inicializovat mDNS discovery: ${error}`);
      this.bonjour = null;
    }
  }

  /**
   * Zahájí vyhledávání RTP MIDI služeb
   */
  public startDiscovery(): void {
    if (!this.bonjour) {
      this.logger.warn('mDNS discovery není k dispozici - chybí knihovna bonjour');
      return;
    }

    try {
      // Hledání RTP MIDI služeb
      this.rtpMidiBrowser = this.bonjour.find({ type: 'apple-midi' });

      // Zpracování nalezených služeb
      this.rtpMidiBrowser.on('up', (service: any) => {
        this.logger.info(`Nalezena RTP MIDI služba: ${service.name} na ${service.host}:${service.port}`);
        
        const serviceInfo: ServiceInfo = {
          name: service.name,
          type: service.type,
          host: service.host,
          port: service.port,
          addresses: service.addresses || [],
          txt: service.txt || {}
        };
        
        // Uložení služby do mapy (použití kombinace jména a hostitele jako klíč)
        const key = `${service.name}@${service.host}`;
        this.discoveredServices.set(key, serviceInfo);
        
        // Notifikace posluchačů
        this.notifyListeners();
      });

      // Zpracování zmizení služeb
      this.rtpMidiBrowser.on('down', (service: any) => {
        this.logger.info(`RTP MIDI služba byla odpojena: ${service.name} na ${service.host}`);
        
        // Odstranění služby z mapy
        const key = `${service.name}@${service.host}`;
        this.discoveredServices.delete(key);
        
        // Notifikace posluchačů
        this.notifyListeners();
      });

      this.logger.info('Spuštěno vyhledávání RTP MIDI služeb');
    } catch (error) {
      this.logger.error(`Chyba při spuštění mDNS discovery: ${error}`);
    }
  }

  /**
   * Zastaví vyhledávání služeb
   */
  public stopDiscovery(): void {
    if (this.rtpMidiBrowser) {
      try {
        this.rtpMidiBrowser.stop();
        this.logger.info('Vyhledávání RTP MIDI služeb zastaveno');
      } catch (error) {
        this.logger.error(`Chyba při zastavování mDNS discovery: ${error}`);
      }
      this.rtpMidiBrowser = null;
    }

    // Vyčištění seznamu objevených služeb
    this.discoveredServices.clear();
  }

  /**
   * Vrátí seznam aktuálně objevených služeb
   */
  public getDiscoveredServices(): ServiceInfo[] {
    return Array.from(this.discoveredServices.values());
  }

  /**
   * Přidá posluchače, který bude informován o změnách v seznamu služeb
   */
  public addListener(listener: (services: ServiceInfo[]) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Odstraní posluchače
   */
  public removeListener(listener: (services: ServiceInfo[]) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Informuje všechny zaregistrované posluchače o změně v seznamu služeb
   */
  private notifyListeners(): void {
    const services = this.getDiscoveredServices();
    for (const listener of this.listeners) {
      try {
        listener(services);
      } catch (error) {
        this.logger.error(`Chyba při notifikaci posluchače mDNS discovery: ${error}`);
      }
    }
  }
}
