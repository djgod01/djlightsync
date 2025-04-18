/*
 * DJ Sync Server - network-scanner.ts
 * Skenování síťových rozhraní
 * v.0.1 - 2025-04-17
 */

import * as os from 'os';
import { Logger } from '../logger/logger';

export interface NetworkInterface {
  name: string;
  address: string;
  netmask: string;
  family: string;
  internal: boolean;
}

export class NetworkScanner {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public scanInterfaces(): NetworkInterface[] {
    const interfaces: NetworkInterface[] = [];
    const networkInterfaces = os.networkInterfaces();

    this.logger.debug('Skenuji dostupná síťová rozhraní...');

    for (const [name, ifaceInfos] of Object.entries(networkInterfaces)) {
      if (ifaceInfos) {
        for (const info of ifaceInfos as os.NetworkInterfaceInfo[]) {
          // Zajímají nás pouze IPv4 adresy a ne interní (loopback) rozhraní
          if (info.family === 'IPv4' && !info.internal) {
            interfaces.push({
              name,
              address: info.address,
              netmask: info.netmask || '',
              family: info.family,
              internal: info.internal
            });
            this.logger.debug(`Nalezeno rozhraní: ${name} - ${info.address}`);
          }
        }
      }
    }

    return interfaces;
  }

  public findBroadcastAddress(iface: NetworkInterface): string {
    // Výpočet broadcast adresy z IP adresy a masky sítě
    const ipParts = iface.address.split('.').map(part => parseInt(part, 10));
    const maskParts = iface.netmask.split('.').map(part => parseInt(part, 10));
    
    const broadcastParts = ipParts.map((part, i) => {
      return (part & maskParts[i]) | (~maskParts[i] & 255);
    });
    
    return broadcastParts.join('.');
  }
}