/*
 * DJ Sync Server - index.ts
 * Hlavní vstupní bod aplikace
 * v.0.1 - 2025-04-17
 */

import { Logger } from './logger/logger';
import { Config } from './config/config';
import { NetworkScanner } from './network/network-scanner';
import { MDNSDiscovery } from './network/mdns-discovery';
import { DJLinkManager } from './djlink/djlink-manager';
import { OutputManager } from './outputs/output-manager';
import { MidiNetworkDiscovery } from './outputs/midi-network-discovery';
import { WebServer } from './web/server';

// Inicializace loggeru
const logger = new Logger();
logger.info('DJ Sync Server se spouští...');

// Načtení konfigurace
const config = new Config();
config.load();
logger.info('Konfigurace načtena');

// Inicializace manageru síťových rozhraní
const networkScanner = new NetworkScanner(logger);
const interfaces = networkScanner.scanInterfaces();
logger.info(`Nalezeno ${interfaces.length} síťových rozhraní`);

// Inicializace mDNS discovery
const mdnsDiscovery = new MDNSDiscovery(logger);
logger.info('mDNS discovery služba inicializována');

// Inicializace MIDI network discovery
const midiNetworkDiscovery = new MidiNetworkDiscovery(logger);
midiNetworkDiscovery.startDiscovery();
logger.info('MIDI network discovery služba spuštěna');

// Inicializace DJ Link manageru
const djLinkManager = new DJLinkManager(interfaces[0], logger, config);
djLinkManager.start();

// Inicializace manageru výstupů
const outputManager = new OutputManager(logger, config, djLinkManager);
outputManager.initOutputs();

// Spuštění webového serveru
const webServer = new WebServer(logger, config, networkScanner, djLinkManager, outputManager, midiNetworkDiscovery);
webServer.start();

// Zachycení ukončovacích signálů
process.on('SIGINT', () => {
  logger.info('Aplikace se ukončuje...');
  djLinkManager.stop();
  outputManager.closeAll();
  webServer.stop();
  process.exit(0);
});

logger.info('DJ Sync Server je připraven');

// Zachycení neošetřených výjimek
process.on('uncaughtException', (error) => {
  logger.error(`Neošetřená výjimka: ${error.message}`);
  logger.error(error.stack || 'Bez stack trace');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Neošetřené odmítnutí Promise: ${reason}`);
});