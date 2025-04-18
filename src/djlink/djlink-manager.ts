/*
 * DJ Sync Server - djlink-manager.ts
 * Správa komunikace s DJ Link zařízeními
 * v.0.1 - 2025-04-17
 */
import dgram from 'dgram';
import { Logger } from '../logger/logger';
import { Config } from '../config/config';
import { NetworkInterface, NetworkScanner } from '../network/network-scanner';
import { EventEmitter } from 'events';

export interface DJDevice {
  name: string;
  id: number;
  address: string;
  lastSeen: number;
}

export interface BeatInfo {
  deviceId: number;
  bpm: number;
  beat: number;
  beatInMeasure: number;
  timestamp: number;
}

export class DJLinkManager extends EventEmitter {
  private logger: Logger;
  private config: Config;
  private interface: NetworkInterface;
  private announceSocket: dgram.Socket | null = null;
  private statusSocket: dgram.Socket | null = null;
  private beatSocket: dgram.Socket | null = null;
  private devices: Map<string, DJDevice> = new Map();
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private deviceCleanupInterval: NodeJS.Timeout | null = null;
  private currentMaster: number | null = null;
  private lastBeatInfo: BeatInfo | null = null;

  // Porty používané pro DJ Link komunikaci
  private static ANNOUNCE_PORT = 50000;
  private static STATUS_PORT = 50002;
  private static BEAT_PORT = 50001;
  
  // Standardní hlavička DJ Link paketů
  private static PACKET_HEADER = Buffer.from([
    0x51, 0x73, 0x70, 0x74, 0x31, 0x57, 0x6d, 0x4a, 0x4f, 0x4c
  ]);

  constructor(networkInterface: NetworkInterface, logger: Logger, config: Config) {
    super();
    this.logger = logger;
    this.config = config;
    this.interface = networkInterface;
  }

  public start(): void {
    try {
      this.setupAnnounceSocket();
      this.setupStatusSocket();
      this.setupBeatSocket();
      this.startKeepalive();
      this.startDeviceCleanup();
      
      this.logger.info(`DJ Link Manager spuštěn na rozhraní ${this.interface.name} (${this.interface.address})`);
    } catch (error) {
      this.logger.error(`Chyba při spouštění DJ Link Manageru: ${error}`);
    }
  }

  public stop(): void {
    if (this.announceSocket) {
      this.announceSocket.close();
      this.announceSocket = null;
    }
    
    if (this.statusSocket) {
      this.statusSocket.close();
      this.statusSocket = null;
    }
    
    if (this.beatSocket) {
      this.beatSocket.close();
      this.beatSocket = null;
    }
    
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    
    if (this.deviceCleanupInterval) {
      clearInterval(this.deviceCleanupInterval);
      this.deviceCleanupInterval = null;
    }
    
    this.logger.info('DJ Link Manager zastaven');
  }

  public getDevices(): DJDevice[] {
    return Array.from(this.devices.values());
  }

  public getCurrentMaster(): number | null {
    return this.currentMaster;
  }

  public getLastBeatInfo(): BeatInfo | null {
    return this.lastBeatInfo;
  }

  private setupAnnounceSocket(): void {
    this.announceSocket = dgram.createSocket('udp4');
    
    this.announceSocket.on('error', (err: Error) => {
      this.logger.error(`Chyba announce socketu: ${err}`);
      this.announceSocket?.close();
    });
    
    this.announceSocket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
      this.handleAnnouncePacket(msg, rinfo);
    });
    
    this.announceSocket.bind(DJLinkManager.ANNOUNCE_PORT, this.interface.address, () => {
      this.announceSocket?.setBroadcast(true);
      this.logger.info(`Announce socket je připraven na portu ${DJLinkManager.ANNOUNCE_PORT}`);
    });
  }

  private setupStatusSocket(): void {
    this.statusSocket = dgram.createSocket('udp4');
    
    this.statusSocket.on('error', (err: Error) => {
      this.logger.error(`Chyba status socketu: ${err}`);
      this.statusSocket?.close();
    });
    
    this.statusSocket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
      this.handleStatusPacket(msg, rinfo);
    });
    
    this.statusSocket.bind(DJLinkManager.STATUS_PORT, this.interface.address, () => {
      this.logger.info(`Status socket je připraven na portu ${DJLinkManager.STATUS_PORT}`);
    });
  }

  private setupBeatSocket(): void {
    this.beatSocket = dgram.createSocket('udp4');
    
    this.beatSocket.on('error', (err: Error) => {
      this.logger.error(`Chyba beat socketu: ${err}`);
      this.beatSocket?.close();
    });
    
    this.beatSocket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
      this.handleBeatPacket(msg, rinfo);
    });
    
    this.beatSocket.bind(DJLinkManager.BEAT_PORT, this.interface.address, () => {
      this.logger.info(`Beat socket je připraven na portu ${DJLinkManager.BEAT_PORT}`);
    });
  }

  private startKeepalive(): void {
    this.keepAliveInterval = setInterval(() => {
      this.sendKeepalivePacket();
    }, 1500); // Každých 1.5 sekundy
  }

  private startDeviceCleanup(): void {
    this.deviceCleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleDevices: string[] = [];
      
      // Identifikace zařízení, která jsme dlouho neviděli
      for (const [key, device] of this.devices.entries()) {
        if (now - device.lastSeen > 5000) { // 5 sekund timeout
          staleDevices.push(key);
        }
      }
      
      // Odstranění starých zařízení
      for (const key of staleDevices) {
        const device = this.devices.get(key);
        if (device) {
          this.logger.info(`Zařízení odpojeno: ${device.name} (ID: ${device.id})`);
          this.devices.delete(key);
          this.emit('deviceDisconnected', device);
        }
      }
    }, 2000); // Každé 2 sekundy
  }

  private sendKeepalivePacket(): void {
    if (!this.announceSocket) return;
    
    const networkScanner = new NetworkScanner(this.logger);
    const broadcastAddress = networkScanner.findBroadcastAddress(this.interface);
    
    const appConfig = this.config.getConfig();
    const playerNumber = appConfig.djlink.playerNumber;
    const deviceName = appConfig.djlink.deviceName;
    
    // Formát keepalive paketu
    const packet = Buffer.alloc(0x36); // Velikost paketu
    
    // Kopírování standardní hlavičky
    DJLinkManager.PACKET_HEADER.copy(packet, 0);
    
    // Typ paketu (keepalive = 0x06)
    packet[10] = 0x06;
    
    // Název zařízení (20 bajtů)
    const nameBuffer = Buffer.alloc(20);
    Buffer.from(deviceName).copy(nameBuffer, 0, 0, 20);
    nameBuffer.copy(packet, 11);
    
    // Další parametry paketu
    packet[0x1F] = 0x01; // Neznámý parametr, ale musí být 0x01
    packet[0x20] = 0x02; // Typ zařízení (0x01 = DJM, 0x02 = CDJ)
    packet[0x21] = 0x00; // Neznámý parametr
    packet[0x22] = 0x36; // Velikost paketu
    packet[0x23] = playerNumber; // Číslo zařízení
    packet[0x24] = 0x01; // Neznámý parametr
    
    // MAC adresa a další parametry by měly být vyplněny, ale pro zjednodušení je přeskakujeme
    
    this.announceSocket.send(
      packet, 
      0, 
      packet.length, 
      DJLinkManager.ANNOUNCE_PORT, 
      broadcastAddress
    );
  }

  private handleAnnouncePacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // Kontrola, že paket má správnou hlavičku a minimální délku
    if (msg.length < 32 || !this.hasValidHeader(msg)) {
      return;
    }
    
    // Extrakce informací o zařízení
    const deviceName = msg.toString('utf8', 11, 31).replace(/\0/g, '').trim();
    const deviceId = msg[0x24];
    const deviceKey = `${rinfo.address}:${deviceId}`;
    
    // Aktualizace nebo přidání zařízení do mapy
    if (!this.devices.has(deviceKey)) {
      const device: DJDevice = {
        name: deviceName,
        id: deviceId,
        address: rinfo.address,
        lastSeen: Date.now()
      };
      
      this.devices.set(deviceKey, device);
      this.logger.info(`Nové DJ zařízení: ${deviceName} (ID: ${deviceId}, IP: ${rinfo.address})`);
      this.emit('deviceConnected', device);
    } else {
      // Aktualizace času posledního vidění
      const device = this.devices.get(deviceKey);
      if (device) {
        device.lastSeen = Date.now();
        this.devices.set(deviceKey, device);
      }
    }
  }

  private handleStatusPacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // Kontrola, že paket má správnou hlavičku a typ status (0x0a)
    if (msg.length < 100 || !this.hasValidHeader(msg) || msg[10] !== 0x0a) {
      return;
    }
    
    // Aktualizace času posledního vidění zařízení
    const deviceId = msg[0x21];
    const deviceKey = `${rinfo.address}:${deviceId}`;
    const device = this.devices.get(deviceKey);
    
    if (device) {
      device.lastSeen = Date.now();
      this.devices.set(deviceKey, device);
      
      // Extrakce informací o stavu zařízení
      // V tomto příkladu jen detekujeme, jestli je zařízení master
      const statusFlags = msg[0x89]; // Byte s příznaky stavu
      const isMaster = (statusFlags & 0x20) !== 0; // Bit 5 (0x20) indikuje master stav
      
      if (isMaster) {
        if (this.currentMaster !== deviceId) {
          this.currentMaster = deviceId;
          this.logger.info(`Nový tempo master: ${device.name} (ID: ${deviceId})`);
          this.emit('masterChanged', deviceId);
        }
      }
    }
  }

  private handleBeatPacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // Kontrola, že paket má správnou hlavičku a typ beat (0x28)
    if (msg.length < 96 || !this.hasValidHeader(msg) || msg[10] !== 0x28) {
      return;
    }
    
    const deviceId = msg[0x21];
    
    // Extrakce BPM informace (pozice 0x5A a 0x5B)
    const bpm = (msg[0x5A] << 8 | msg[0x5B]) / 100;
    
    // Extrakce aktuálního beatu v taktu (pozice 0x5C)
    const beatInMeasure = msg[0x5C];
    
    // Vypočet absolutního čísla beatu pomocí čítače paketů
    // Pro zjednodušení použijeme pouze aktuální beat v taktu
    const beat = beatInMeasure;
    
    const beatInfo: BeatInfo = {
      deviceId,
      bpm,
      beat,
      beatInMeasure,
      timestamp: Date.now()
    };
    
    this.lastBeatInfo = beatInfo;
    this.emit('beat', beatInfo);
    
    this.logger.debug(`Beat z ${deviceId}: BPM=${bpm}, Beat=${beatInMeasure}`);
  }

  private hasValidHeader(msg: Buffer): boolean {
    // Kontrola, že prvních 10 bajtů odpovídá standardní hlavičce
    for (let i = 0; i < DJLinkManager.PACKET_HEADER.length; i++) {
      if (msg[i] !== DJLinkManager.PACKET_HEADER[i]) {
        return false;
      }
    }
    return true;
  }
}