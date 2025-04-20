/*
 * DJ Sync Server - config.ts
 * Správa konfigurace
 * v.0.1 - 2025-04-17
 */

import * as fs from 'fs-extra';
import * as path from 'path';

export interface OutputConfig {
  enabled: boolean;
  settings: Record<string, any>;
}

export interface DJLinkConfig {
  interface: string;
  playerNumber: number;
  deviceName: string;
}

export interface ServerConfig {
  port: number;
}

export interface AppConfig {
  djlink: DJLinkConfig;
  server: ServerConfig;
  outputs: {
    midi: OutputConfig;
    ltc: OutputConfig;
    abletonLink: OutputConfig;
    tc: OutputConfig;
  };
}

export class Config {
  private configPath: string;
  private config: AppConfig;
  
  constructor() {
    this.configPath = path.join(process.cwd(), 'config.json');
    
    // Výchozí konfigurace
    this.config = {
      djlink: {
        interface: '',
        playerNumber: 5,
        deviceName: 'DJ Sync Server'
      },
      server: {
        port: 80
      },
      outputs: {
        midi: {
          enabled: false,
          settings: {
            device: '',
            channel: 1,
            useRtpMidi: false,
            rtpSessionName: 'DJ Sync Server',
            rtpPort: 5004,
            networkDeviceId: ''
          }
        },
        ltc: {
          enabled: false,
          settings: {
            device: '',
            framerate: 30
          }
        },
        abletonLink: {
          enabled: false,
          settings: {
            quantum: 4
          }
        },
        tc: {
          enabled: false,
          settings: {
            device: '',
            format: 'smpte'
          }
        }
      }
    };
  }

  public load(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const loadedConfig = fs.readJsonSync(this.configPath);
        this.config = { ...this.config, ...loadedConfig };
      } else {
        this.save(); // Vytvoř výchozí konfigurační soubor, pokud neexistuje
      }
    } catch (error) {
      console.error('Chyba při načítání konfigurace:', error);
    }
  }

  public save(): void {
    try {
      fs.writeJsonSync(this.configPath, this.config, { spaces: 2 });
    } catch (error) {
      console.error('Chyba při ukládání konfigurace:', error);
    }
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public updateConfig(newConfig: Partial<AppConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.save();
  }
}