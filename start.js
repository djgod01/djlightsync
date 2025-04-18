/*
 * DJ Sync Server - start.js
 * Spouštěcí skript pro zkompilovanou aplikaci
 * v.0.1 - 2025-04-17
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Kontrola, zda existuje složka dist
const distPath = path.join(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
  console.error('Chyba: Složka "dist" nebyla nalezena. Spusťte nejprve kompilaci pomocí "npm run build".');
  process.exit(1);
}

// Kontrola, zda existuje hlavní soubor
const mainFile = path.join(distPath, 'index.js');
if (!fs.existsSync(mainFile)) {
  console.error('Chyba: Hlavní soubor "index.js" nebyl nalezen ve složce "dist".');
  process.exit(1);
}

console.log('Spouštím DJ Sync Server...');

// Spuštění serveru jako dětský proces
const server = spawn('node', [mainFile], {
  stdio: 'inherit',
  windowsHide: true
});

// Obsluha signálů pro správné ukončení
process.on('SIGINT', () => {
  console.log('Ukončuji server...');
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Ukončuji server...');
  server.kill('SIGTERM');
});

// Obsluha ukončení dětského procesu
server.on('close', (code) => {
  console.log(`Server ukončen s kódem: ${code}`);
  process.exit(code);
});