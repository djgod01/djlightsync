/*
 * DJ Sync Server - build-and-run.js
 * Kompilace a spuštění aplikace v jednom kroku
 * v.0.2 - 2025-04-18
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Funkce pro zobrazení barevného textu v konzoli
function colorText(text, colorCode) {
  return `\x1b[${colorCode}m${text}\x1b[0m`;
}

// Definice barev
const colors = {
  green: 32,
  yellow: 33,
  red: 31,
  blue: 34
};

// Funkce pro zobrazení zpráv
function log(message, type = 'info') {
  const date = new Date().toLocaleTimeString();
  
  switch (type) {
    case 'success':
      console.log(`[${date}] ${colorText('✓ ' + message, colors.green)}`);
      break;
    case 'warning':
      console.log(`[${date}] ${colorText('⚠ ' + message, colors.yellow)}`);
      break;
    case 'error':
      console.log(`[${date}] ${colorText('✗ ' + message, colors.red)}`);
      break;
    case 'info':
    default:
      console.log(`[${date}] ${colorText('ℹ ' + message, colors.blue)}`);
      break;
  }
}

try {
  log('Spouštím kompilaci a server...', 'info');

  // Instalace závislostí pokud neexistují
  if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
    log('Instaluji závislosti...', 'info');
    execSync('npm install', { stdio: 'inherit' });
    
    // Instalace typových definic
    log('Instaluji typové definice...', 'info');
    execSync('npm install --save-dev @types/node @types/express @types/fs-extra @types/socket.io', { stdio: 'inherit' });
  }

  // Kompilace TypeScript
  log('Kompiluji TypeScript...', 'info');
  execSync('npx tsc', { stdio: 'inherit' });

  // Kontrola výstupu
  const distPath = path.join(__dirname, 'dist');
  if (!fs.existsSync(distPath)) {
    throw new Error('Složka "dist" nebyla nalezena po kompilaci.');
  }

  const mainFile = path.join(distPath, 'index.js');
  if (!fs.existsSync(mainFile)) {
    throw new Error('Hlavní soubor "index.js" nebyl nalezen ve složce "dist".');
  }
  
  // Zajištění existence složky pro logy
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) {
    log('Vytvářím složku pro logy...', 'info');
    fs.mkdirSync(logDir);
  }

  // Spuštění aplikace
  log('Spouštím aplikaci...', 'success');
  
  // Nastavení aktuálního procesu jako rodiče procesu serveru, aby se signály
  // pro ukončení správně propagovaly
  const server = execSync('node dist/index.js', { 
    stdio: 'inherit',
    windowsHide: true 
  });
  
} catch (error) {
  log(`Došlo k chybě: ${error.message}`, 'error');
  if (error.stdout) {
    console.error('Standardní výstup:', error.stdout.toString());
  }
  if (error.stderr) {
    console.error('Chybový výstup:', error.stderr.toString());
  }
  process.exit(1);
}