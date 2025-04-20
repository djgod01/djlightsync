/*
 * DJ Sync Server - stop.js
 * Skript pro zastavení běžícího serveru
 * v.0.1 - 2025-04-20
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

// Funkce pro detekci běžícího procesu podle názvu
function findProcessByName(name) {
  return new Promise((resolve, reject) => {
    const isWindows = os.platform() === 'win32';
    const command = isWindows 
      ? `tasklist /FI "IMAGENAME eq ${name}.exe" /FO CSV /NH`
      : `pgrep -f "${name}"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error && error.code !== 1) {
        return reject(error);
      }
      
      if (stderr) {
        console.error('Chyba při hledání procesu:', stderr);
      }
      
      if (isWindows) {
        // Na Windows parsujeme výstup tasklist ve formátu CSV
        if (stdout.includes(name)) {
          const lines = stdout.trim().split('\n');
          const pids = [];
          for (const line of lines) {
            const parts = line.replace(/"/g, '').split(',');
            if (parts.length > 1 && parts[0].includes(name)) {
              pids.push(parts[1]);
            }
          }
          resolve(pids);
        } else {
          resolve([]);
        }
      } else {
        // Na Unix-like systémech pgrep vrací jeden PID na řádek
        const pids = stdout.trim().split('\n').filter(Boolean);
        resolve(pids);
      }
    });
  });
}

// Funkce pro ukončení procesu podle PID
function killProcess(pid) {
  return new Promise((resolve, reject) => {
    const isWindows = os.platform() === 'win32';
    const command = isWindows ? `taskkill /PID ${pid} /F` : `kill -15 ${pid}`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      
      if (stderr) {
        console.error('Chyba při ukončování procesu:', stderr);
      }
      
      resolve(stdout);
    });
  });
}

// Hlavní funkce pro zastavení serveru
async function stopServer() {
  console.log('Hledám běžící DJ Sync Server...');
  
  try {
    const nodePids = await findProcessByName('node');
    
    if (nodePids.length === 0) {
      console.log('Žádný node.js proces nebyl nalezen.');
      return;
    }
    
    // Kontrola, jestli nějaký z procesů je náš server
    let serverFound = false;
    let serverPidsToKill = [];
    
    for (const pid of nodePids) {
      try {
        // Kontrola příkazové řádky procesu
        const command = os.platform() === 'win32'
          ? `wmic process where ProcessId=${pid} get CommandLine`
          : `ps -p ${pid} -o command`;
        
        const { stdout } = await new Promise((resolve, reject) => {
          exec(command, (error, stdout, stderr) => {
            resolve({ stdout, stderr });
          });
        });
        
        // Kontrola, jestli jde o náš server
        if (stdout.includes('dist/index.js') || stdout.includes('dj-sync-server')) {
          serverFound = true;
          serverPidsToKill.push(pid);
          console.log(`Nalezen běžící DJ Sync Server s PID ${pid}`);
        }
      } catch (error) {
        console.error(`Chyba při kontrole procesu ${pid}:`, error);
      }
    }
    
    if (!serverFound) {
      console.log('DJ Sync Server není spuštěn.');
      return;
    }
    
    // Ukončení nalezených procesů
    for (const pid of serverPidsToKill) {
      try {
        await killProcess(pid);
        console.log(`Server s PID ${pid} byl ukončen.`);
      } catch (error) {
        console.error(`Chyba při ukončování serveru s PID ${pid}:`, error);
      }
    }
    
  } catch (error) {
    console.error('Chyba při hledání nebo ukončování procesů:', error);
  }
}

// Spuštění zastavení serveru
stopServer().catch(error => {
  console.error('Nepodařilo se zastavit server:', error);
  process.exit(1);
});
