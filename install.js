/*
 * DJ Sync Server - install.js
 * Instalační skript pro závislosti
 * v.0.2 - 2025-04-22
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dgram = require('dgram');
const net = require('net');

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

// Funkce pro zjištění, zda je potřeba přeskočit některé závislosti
function shouldSkipDependency(dependency) {
  // Na určitých platformách mohou některé závislosti způsobovat problémy
  const skipOnWindows = ['speaker']; // Závislosti, které mohou způsobovat problémy na Windows
  const skipOnLinux = []; // Závislosti, které mohou způsobovat problémy na Linux
  const skipOnMac = []; // Závislosti, které mohou způsobovat problémy na Mac
  
  const platform = os.platform();
  
  if (platform === 'win32' && skipOnWindows.includes(dependency)) {
    return true;
  }
  
  if (platform === 'linux' && skipOnLinux.includes(dependency)) {
    return true;
  }
  
  if (platform === 'darwin' && skipOnMac.includes(dependency)) {
    return true;
  }
  
  return false;
}

// Funkce pro kontrolu portů
async function checkRequiredPorts() {
  log('Kontrola požadovaných portů...', 'info');
  
  const ports = [
    { port: 5004, protocol: 'UDP', description: 'RTP MIDI komunikace' },
    { port: 5004, protocol: 'TCP', description: 'RTP MIDI komunikace' },
    { port: 5353, protocol: 'UDP', description: 'mDNS/Bonjour discovery' }
  ];
  
  for (const portInfo of ports) {
    try {
      const socket = portInfo.protocol === 'UDP' 
        ? dgram.createSocket('udp4')
        : net.createServer();
      
      await new Promise((resolve, reject) => {
        socket.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            log(`Port ${portInfo.port} (${portInfo.protocol}) je používán jiným procesem!`, 'warning');
            log(`Tento port je potřebný pro: ${portInfo.description}`, 'info');
            log('Může to způsobit problémy s detekací zařízení.', 'warning');
          } else {
            log(`Chyba při kontrole portu ${portInfo.port}: ${err.message}`, 'error');
          }
          socket.close ? socket.close() : socket.close();
          resolve();
        });
        
        if (portInfo.protocol === 'UDP') {
          socket.bind(portInfo.port, () => {
            log(`Port ${portInfo.port} (${portInfo.protocol}) je dostupný ✓`, 'success');
            socket.close();
            resolve();
          });
        } else {
          socket.listen(portInfo.port, () => {
            log(`Port ${portInfo.port} (${portInfo.protocol}) je dostupný ✓`, 'success');
            socket.close();
            resolve();
          });
        }
        
        // Timeout
        setTimeout(() => {
          try {
            socket.close ? socket.close() : socket.close();
          } catch (e) {}
          resolve();
        }, 3000);
      });
      
    } catch (error) {
      log(`Chyba při kontrole portu ${portInfo.port}: ${error.message}`, 'error');
    }
  }
}

// Hlavní instalační funkce
async function install() {
  log('Instalace závislostí DJ Sync Server...', 'info');
  
  try {
    // Zkontrolujeme, zda je nainstalován npm
    try {
      execSync('npm --version', { stdio: 'ignore' });
      log('npm je nainstalován', 'success');
    } catch (error) {
      log('npm není nainstalován. Pro instalaci DJ Sync Serveru je potřeba mít nainstalovaný Node.js a npm.', 'error');
      process.exit(1);
    }
    
    // Instalace základních závislostí
    log('Instalace základních závislostí...', 'info');
    execSync('npm install --no-fund', { stdio: 'inherit' });
    log('Základní závislosti byly nainstalovány', 'success');
    
    // Instalace speciálních balíčků - instalujeme je odděleně pro lepší kontrolu nad chybami
    const specialPackages = [
      // Síťové balíčky
      'bonjour@3.3.0',
      
      // MIDI balíčky
      'jzz@1.7.6',
      'jzz-midi-smf@1.6.7',
      'jzz-synth-tiny@1.3.2',
      'jzz-input-kbd@1.1.7',
      'rtpmidi@1.0.0',
      
      // Audio balíčky
      'speaker@0.5.5',
      'pcm-util@3.0.0',
      'smpte-timecode@1.3.4',
      'wav-decoder@1.3.0',
      'wav-encoder@1.3.0',
      'microphone-stream@6.0.1'
    ];
    
    // Instalace jednotlivých speciálních balíčků
    for (const pkg of specialPackages) {
      const pkgName = pkg.split('@')[0];
      
      if (shouldSkipDependency(pkgName)) {
        log(`Přeskakuji instalaci ${pkg}, protože může způsobovat problémy na této platformě`, 'warning');
        continue;
      }
      
      try {
        log(`Instalace ${pkg}...`, 'info');
        execSync(`npm install ${pkg} --no-fund`, { stdio: 'inherit' });
        log(`Balíček ${pkg} byl úspěšně nainstalován`, 'success');
      } catch (error) {
        log(`Chyba při instalaci ${pkg}: ${error.message}`, 'warning');
        log('Pokračuji v instalaci dalších balíčků...', 'info');
      }
    }
    
    // Instalace vývojových závislostí
    log('Instalace vývojových závislostí...', 'info');
    execSync('npm install --save-dev @types/node @types/express @types/fs-extra @types/socket.io typescript ts-node', { stdio: 'inherit' });
    log('Vývojové závislosti byly nainstalovány', 'success');
    
    // Vytvoření potřebných adresářů
    const dirs = ['logs', 'dist'];
    for (const dir of dirs) {
      const dirPath = path.join(__dirname, dir);
      if (!fs.existsSync(dirPath)) {
        log(`Vytvářím složku ${dir}...`, 'info');
        fs.mkdirSync(dirPath);
        log(`Složka ${dir} byla vytvořena`, 'success');
      }
    }

    // Kontrola požadovaných portů
    await checkRequiredPorts();
    
    log('Instalace dokončena!', 'success');
    log('Pro kompilaci a spuštění aplikace použijte příkaz: npm run build-and-run', 'info');
    log('Pro kompilaci bez spuštění použijte: npm run build', 'info');
    log('Pro spuštění v vývojovém režimu použijte: npm run dev', 'info');
    
  } catch (error) {
    log(`Došlo k chybě při instalaci: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Spuštění instalace
install().catch(error => {
  log(`Nepodařilo se dokončit instalaci: ${error.message}`, 'error');
  process.exit(1);
});