/*
 * DJ Sync Server - logger.ts
 * System pro logování
 * v.0.1 - 2025-04-17
 */

import * as fs from 'fs-extra';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export class Logger {
  private logDir: string;
  private currentLogFile: string;
  private logStream: fs.WriteStream | null = null;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    fs.ensureDirSync(this.logDir);
    
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    this.currentLogFile = path.join(this.logDir, `dj-sync-${dateStr}.log`);
    
    this.openLogStream();
  }

  private openLogStream(): void {
    this.logStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' });
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  private writeLog(level: LogLevel, message: string): void {
    const formattedMessage = this.formatMessage(level, message);
    
    // Výpis do konzole
    console.log(formattedMessage);
    
    // Zápis do souboru
    if (this.logStream) {
      this.logStream.write(formattedMessage + '\n');
    }
  }

  public debug(message: string): void {
    this.writeLog(LogLevel.DEBUG, message);
  }

  public info(message: string): void {
    this.writeLog(LogLevel.INFO, message);
  }

  public warn(message: string): void {
    this.writeLog(LogLevel.WARN, message);
  }

  public error(message: string): void {
    this.writeLog(LogLevel.ERROR, message);
  }

  public close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}