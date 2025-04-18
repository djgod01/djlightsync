/*
 * DJ Sync Server - build-and-run.js
 * Kompilace a spuštění aplikace v jednom kroku
 * v.0.1 - 2025-04-17
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  console.log('Spouštím kompilaci a server...');

  // Instalace závislostí pokud neexistují
  if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
    console.log('Instaluji závislosti...');
    execSync('npm install', { stdio: 'inherit' });
  }

  // Kompilace TypeScript
  console.log('Kompiluji TypeScript...');
  execSync('npx tsc', { stdio: 'inherit' });

  // Kontrola výstupu
  const distPath = path.join(__dirname, 'dist');
  if (!fs.existsSync(distPath)) {
    console.error('Chyba: Složka "dist" nebyla nalezena po kompilaci.');
    process.exit(1);
  }

  const mainFile = path.join(distPath, 'index.js');
  if (!fs.existsSync(mainFile)) {
    console.error('Chyba: Hlavní soubor "index.js" nebyl nalezen ve složce "dist".');
    process.exit(1);
  }

  // Spuštění aplikace
  console.log('Spouštím aplikaci...');
  execSync('node dist/index.js', { stdio: 'inherit' });
} catch (error) {
  console.error('Došlo k chybě:', error.message);
  process.exit(1);
}