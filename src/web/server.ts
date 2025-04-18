/*
 * DJ Sync Server - server.ts
 * Webový server pro konfigurační rozhraní
 * v.0.1 - 2025-04-18
 */

import express, { Request, Response } from 'express';
import * as http from 'http';
import * as path from 'path';
import * as socketIo from 'socket.io';
import * as fs from 'fs-extra';
import { Logger } from '../logger/logger';
import { Config } from '../config/config';
import { NetworkScanner } from '../network/network-scanner';
import { DJLinkManager, DJDevice, BeatInfo } from '../djlink/djlink-manager';
import { OutputManager } from '../outputs/output-manager';

export class WebServer {
  private logger: Logger;
  private config: Config;
  private networkScanner: NetworkScanner;
  private djLinkManager: DJLinkManager;
  private outputManager: OutputManager;
  private app: express.Application;
  private server: http.Server;
  private io: socketIo.Server;
  private port: number;

  constructor(
    logger: Logger,
    config: Config,
    networkScanner: NetworkScanner,
    djLinkManager: DJLinkManager,
    outputManager: OutputManager
  ) {
    this.logger = logger;
    this.config = config;
    this.networkScanner = networkScanner;
    this.djLinkManager = djLinkManager;
    this.outputManager = outputManager;

    this.port = this.config.getConfig().server.port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new socketIo.Server(this.server);

    this.setupExpress();
    this.setupSocketIO();
    this.setupLogAPI();
    this.setupMidiAPI();
    this.setupAudioAPI();
  }

  private setupExpress(): void {
    // Nastavení statických souborů
    // __dirname v TypeScriptu není přímo dostupný, takže používáme path.resolve
    const publicPath = path.resolve(__dirname, '../../src/web/public');
    this.app.use(express.static(publicPath));
    this.app.use(express.json());

    // API endpoints
    this.app.get('/api/config', (req: Request, res: Response) => {
      res.json(this.config.getConfig());
    });

    this.app.post('/api/config', (req: Request, res: Response) => {
      try {
        this.config.updateConfig(req.body);
        
        // Po aktualizaci konfigurace provedeme reload výstupů
        this.outputManager.reloadOutputs();
        
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Chyba při aktualizaci konfigurace: ${error}`);
        res.status(500).json({ success: false, error: 'Chyba při aktualizaci konfigurace' });
      }
    });

    this.app.get('/api/interfaces', (req: Request, res: Response) => {
      const interfaces = this.networkScanner.scanInterfaces();
      res.json(interfaces);
    });

    this.app.get('/api/devices', (req: Request, res: Response) => {
      const devices = this.djLinkManager.getDevices();
      res.json(devices);
    });

    this.app.get('/api/status', (req: Request, res: Response) => {
      const status = {
        devices: this.djLinkManager.getDevices(),
        master: this.djLinkManager.getCurrentMaster(),
        lastBeat: this.djLinkManager.getLastBeatInfo(),
        outputs: this.outputManager.getOutputStatus()
      };
      res.json(status);
    });
  }

  private setupSocketIO(): void {
    // Socket.IO pro realtime aktualizace
    this.io.on('connection', (socket: socketIo.Socket) => {
      this.logger.info(`Nové webové připojení: ${socket.id}`);

      // Poslat inicializační data klientovi
      // Získáme aktuální hlasitost TC výstupu, pokud je k dispozici
      const tcOutput = this.outputManager.getTcOutput();
      const tcVolume = tcOutput && typeof tcOutput.getVolume === 'function' ? tcOutput.getVolume() : 0.5;
      
      socket.emit('init', {
        config: this.config.getConfig(),
        devices: this.djLinkManager.getDevices(),
        master: this.djLinkManager.getCurrentMaster(),
        lastBeat: this.djLinkManager.getLastBeatInfo(),
        outputs: this.outputManager.getOutputStatus(),
        tcVolume: tcVolume
      });

      // Zpracování požadavků na aktualizaci konfigurace
      socket.on('updateConfig', (newConfig: any) => {
        try {
          this.config.updateConfig(newConfig);
          
          // Reload výstupů po aktualizaci konfigurace
          this.outputManager.reloadOutputs();
          
          socket.emit('configUpdated', { success: true });
          this.io.emit('config', this.config.getConfig());
        } catch (error) {
          this.logger.error(`Chyba při aktualizaci konfigurace: ${error}`);
          socket.emit('configUpdated', { success: false, error: 'Chyba při aktualizaci konfigurace' });
        }
      });
      
      // Zpracování požadavků na změnu hlasitosti TC výstupu
      socket.on('setTcVolume', (volume: number) => {
        try {
          // Získáme referenci na TC výstup z OutputManageru
          const tcOutput = this.outputManager.getTcOutput();
          if (tcOutput && typeof tcOutput.setVolume === 'function') {
            tcOutput.setVolume(volume);
            socket.emit('tcVolumeUpdated', { success: true, volume });
          } else {
            socket.emit('tcVolumeUpdated', { success: false, error: 'TC výstup není k dispozici' });
          }
        } catch (error) {
          this.logger.error(`Chyba při nastavení hlasitosti TC výstupu: ${error}`);
          socket.emit('tcVolumeUpdated', { success: false, error: 'Chyba při nastavení hlasitosti' });
        }
      });

      // Zpracování odpojení klienta
      socket.on('disconnect', () => {
        this.logger.info(`Webové připojení odpojeno: ${socket.id}`);
      });
    });

    // Přesměrování událostí z DJ Link Manageru na Socket.IO
    this.djLinkManager.on('deviceConnected', (device: DJDevice) => {
      this.io.emit('deviceConnected', device);
    });

    this.djLinkManager.on('deviceDisconnected', (device: DJDevice) => {
      this.io.emit('deviceDisconnected', device);
    });

    this.djLinkManager.on('masterChanged', (deviceId: number) => {
      this.io.emit('masterChanged', deviceId);
    });

    this.djLinkManager.on('beat', (beatInfo: BeatInfo) => {
      this.io.emit('beat', beatInfo);
    });
  }

  private setupLogAPI(): void {
    const logDir = path.join(process.cwd(), 'logs');
    const currentDate = new Date();
    const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`;
    const currentLogFile = path.join(logDir, `dj-sync-${dateStr}.log`);

    // API endpoint pro získání obsahu aktuálního logu
    this.app.get('/api/logs', (req: Request, res: Response) => {
      try {
        if (fs.existsSync(currentLogFile)) {
          const logContent = fs.readFileSync(currentLogFile, 'utf8');
          res.send(logContent);
        } else {
          res.send('Žádné logy pro dnešní den nebyly nalezeny.');
        }
      } catch (error) {
        this.logger.error(`Chyba při čtení logu: ${error}`);
        res.status(500).send('Chyba při čtení logu');
      }
    });

    // API endpoint pro vymazání obsahu aktuálního logu
    this.app.post('/api/logs/clear', (req: Request, res: Response) => {
      try {
        if (fs.existsSync(currentLogFile)) {
          fs.writeFileSync(currentLogFile, `Log vyčištěn v ${new Date().toISOString()}\n`);
          this.logger.info('Log byl vyčištěn uživatelem');
          res.sendStatus(200);
        } else {
          res.status(404).send('Log soubor nebyl nalezen');
        }
      } catch (error) {
        this.logger.error(`Chyba při mazání logu: ${error}`);
        res.status(500).send('Chyba při mazání logu');
      }
    });
  }

  private setupMidiAPI(): void {
    // API endpoint pro získání dostupných MIDI zařízení
    this.app.get('/api/midi-devices', (req: Request, res: Response) => {
      try {
        // Importujeme MIDI output třídu pomocí require
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const MidiOutput = require('../outputs/midi-output').MidiOutput;
        
        // Získáme seznam zařízení
        const devices = MidiOutput.getMidiDevices();
        res.json(devices);
      } catch (error) {
        this.logger.error(`Chyba při získávání MIDI zařízení: ${error}`);
        res.status(500).json({ error: 'Chyba při získávání MIDI zařízení' });
      }
    });
  }

  private setupAudioAPI(): void {
    // API endpoint pro získání dostupných audio zařízení
    this.app.get('/api/audio-devices', (req: Request, res: Response) => {
      try {
        // Zde by měl být kód pro získání dostupných audio zařízení
        // Pro zjednodušení vracíme jen několik příkladů
        const devices = [
          { id: 0, name: 'Výchozí audio výstup' },
          { id: 1, name: 'Zvuková karta' },
          { id: 2, name: 'HDMI Audio' }
        ];
        res.json(devices);
      } catch (error) {
        this.logger.error(`Chyba při získávání audio zařízení: ${error}`);
        res.status(500).json({ error: 'Chyba při získávání audio zařízení' });
      }
    });
  }

  public start(): void {
    this.server.listen(this.port, () => {
      this.logger.info(`Webový server spuštěn na portu ${this.port}`);
    });
  }

  public stop(): void {
    this.server.close(() => {
      this.logger.info('Webový server zastaven');
    });
  }
}