/*
 * DJ Sync Server - rtp-midi-test.js
 * Diagnostický nástroj pro testování RTP MIDI konektivity
 * v.0.1 - 2025-04-22
 */

const { execSync } = require('child_process');
const os = require('os');
const dgram = require('dgram');

// Barvy pro výstup
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Funkce pro výpis barevného textu
function colorText(text, color) {
  return `${color}${text}${colors.reset}`;
}

console.log(colorText("=== RTP MIDI Diagnostika ===", colors.cyan));

// Kontrola nainstalovaných modulů
console.log(colorText("\n[1] Kontrola knihoven", colors.yellow));

let rtpmidi = null;
let bonjour = null;

try {
  rtpmidi = require('rtpmidi');
  console.log(colorText("✓ rtpmidi je nainstalován", colors.green));
  console.log(`   verze: ${rtpmidi.version || 'neznámá'}`);
} catch (error) {
  console.log(colorText("✗ rtpmidi není nainstalován nebo je poškozený", colors.red));
  console.log(`   chyba: ${error.message}`);
}

try {
  bonjour = require('bonjour')();
  console.log(colorText("✓ bonjour je nainstalován", colors.green));
} catch (error) {
  console.log(colorText("✗ bonjour není nainstalován nebo je poškozený", colors.red));
  console.log(`   chyba: ${error.message}`);
}

// Kontrola síťových rozhraní
console.log(colorText("\n[2] Kontrola síťových rozhraní", colors.yellow));

const interfaces = os.networkInterfaces();
console.log("Dostupná síťová rozhraní:");

Object.keys(interfaces).forEach((ifaceName) => {
  const iface = interfaces[ifaceName];
  iface.forEach((details) => {
    if (details.family === 'IPv4' && !details.internal) {
      console.log(`   - ${ifaceName}: ${details.address} (maska: ${details.netmask})`);
      
      // Výpočet broadcast adresy
      const ip = details.address.split('.');
      const mask = details.netmask.split('.');
      const broadcast = ip.map((octet, i) => {
        return (parseInt(octet) | (~parseInt(mask[i]) & 255));
      }).join('.');
      
      console.log(`     Broadcast: ${broadcast}`);
    }
  });
});

// Test multicast/broadcast
console.log(colorText("\n[3] Test multicast komunikace", colors.yellow));

function testMulticast() {
  return new Promise((resolve) => {
    try {
      // Vytvoříme socket pro poslech multicast
      const receiver = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      
      receiver.on('error', (err) => {
        console.log(colorText(`✗ Chyba při naslouchání multicast: ${err.message}`, colors.red));
        receiver.close();
        resolve(false);
      });
      
      receiver.on('message', (msg, rinfo) => {
        console.log(colorText(`✓ Multicast test úspěšný! Přijata data z ${rinfo.address}:${rinfo.port}`, colors.green));
        receiver.close();
        resolve(true);
      });
      
      receiver.on('listening', () => {
        try {
          // Nastavení multicast
          receiver.setBroadcast(true);
          receiver.addMembership('224.0.0.251');
          
          console.log("Multicast socket naslouchá...");
          
          // Vytvoříme socket pro odeslání multicast
          const sender = dgram.createSocket({ type: 'udp4' });
          
          // Připravíme testovací data
          const message = Buffer.from('RTP-MIDI-TEST-PACKET');
          
          // Odešleme multicast data
          sender.send(message, 0, message.length, 5353, '224.0.0.251', (err) => {
            if (err) {
              console.log(colorText(`✗ Chyba při odesílání multicast: ${err.message}`, colors.red));
            } else {
              console.log("Multicast data odeslána, čekám na příjem...");
            }
            sender.close();
          });
          
          // Nastavíme timeout
          setTimeout(() => {
            console.log(colorText("✗ Multicast test selhal - čas vypršel (žádná data nebyla přijata)", colors.red));
            receiver.close();
            resolve(false);
          }, 3000);
        } catch (err) {
          console.log(colorText(`✗ Chyba při nastavení multicast: ${err.message}`, colors.red));
          receiver.close();
          resolve(false);
        }
      });
      
      // Nasloucháme na multicast portu
      receiver.bind(5353);
      
    } catch (error) {
      console.log(colorText(`✗ Multicast test selhal: ${error.message}`, colors.red));
      resolve(false);
    }
  });
}

// Test mDNS/Bonjour
console.log(colorText("\n[4] Test mDNS/Bonjour discovery", colors.yellow));

function testBonjour() {
  return new Promise((resolve) => {
    if (!bonjour) {
      console.log(colorText("✗ Nelze testovat Bonjour - knihovna není k dispozici", colors.red));
      resolve(false);
      return;
    }
    
    try {
      console.log("Publikuji testovací RTP MIDI službu...");
      
      // Publikujeme testovací službu
      const service = bonjour.publish({
        name: 'RTP-MIDI-Test-Service',
        type: 'apple-midi',
        port: 5004
      });
      
      console.log("Hledám RTP MIDI služby...");
      
      // Hledáme RTP MIDI služby
      const browser = bonjour.find({ type: 'apple-midi' });
      
      browser.on('up', (service) => {
        console.log(colorText(`✓ Nalezena služba: ${service.name} na ${service.host}:${service.port}`, colors.green));
      });
      
      // Nastavíme timeout
      setTimeout(() => {
        service.stop();
        browser.stop();
        console.log("Test Bonjour dokončen.");
        resolve(true);
      }, 5000);
      
    } catch (error) {
      console.log(colorText(`✗ Bonjour test selhal: ${error.message}`, colors.red));
      resolve(false);
    }
  });
}

// Test RTP MIDI
console.log(colorText("\n[5] Test RTP MIDI", colors.yellow));

function testRtpMidi() {
  return new Promise((resolve) => {
    if (!rtpmidi) {
      console.log(colorText("✗ Nelze testovat RTP MIDI - knihovna není k dispozici", colors.red));
      resolve(false);
      return;
    }
    
    try {
      console.log("Inicializuji RTP MIDI session...");
      
      // Vytvoříme session
      let session;
      try {
        session = rtpmidi.manager.createSession({
          name: 'RTP-MIDI-Test-Session',
          bonjourName: 'RTP-MIDI-Test-Session',
          port: 5004,
          enableBroadcast: true
        });
        
        console.log(colorText("✓ Session vytvořena úspěšně", colors.green));
      } catch (error) {
        console.log(colorText(`✗ Chyba při vytváření session: ${error.message}`, colors.red));
        
        // Zkusíme alternativní způsob
        try {
          console.log("Zkouším alternativní způsob...");
          session = new rtpmidi.Session({
            name: 'RTP-MIDI-Test-Session',
            bonjourName: 'RTP-MIDI-Test-Session',
            port: 5004
          });
          
          console.log(colorText("✓ Session vytvořena úspěšně (alternativní způsob)", colors.green));
        } catch (backupError) {
          console.log(colorText(`✗ Chyba při alternativním vytváření session: ${backupError.message}`, colors.red));
          resolve(false);
          return;
        }
      }
      
      // Nastavíme event handlery
      session.on('error', (err) => {
        console.log(colorText(`✗ Chyba RTP MIDI session: ${err}`, colors.red));
      });
      
      session.on('connection', (conn) => {
        console.log(colorText(`✓ Nové RTP MIDI připojení: ${conn.name || 'neznámé'}`, colors.green));
      });
      
      // Explicitně spustíme discovery
      if (rtpmidi.manager.startDiscovery) {
        rtpmidi.manager.startDiscovery();
        console.log(colorText("✓ Discovery spuštěno explicitně", colors.green));
      }
      
      // Nastavíme timeout
      setTimeout(() => {
        try {
          if (session) {
            if (typeof session.stop === 'function') {
              session.stop();
            } else if (typeof session.close === 'function') {
              session.close();
            }
          }
          
          console.log("Test RTP MIDI dokončen.");
          resolve(true);
        } catch (error) {
          console.log(colorText(`✗ Chyba při uzavírání session: ${error.message}`, colors.red));
          resolve(false);
        }
      }, 10000);
      
    } catch (error) {
      console.log(colorText(`✗ RTP MIDI test selhal: ${error.message}`, colors.red));
      resolve(false);
    }
  });
}

// Kontrola firewallu
console.log(colorText("\n[6] Kontrola firewallu", colors.yellow));

function checkFirewall() {
  try {
    if (process.platform === 'win32') {
      // Windows
      console.log("Kontroluji Windows Firewall...");
      try {
        const output = execSync('netsh advfirewall show allprofiles state').toString();
        console.log(output);
      } catch (error) {
        console.log("Nepodařilo se získat informace o Windows Firewall.");
      }
      
      // Kontrolujeme, zda jsou porty otevřené
      console.log("Kontroluji otevřené porty pro RTP MIDI...");
      try {
        const portCheck = execSync('netsh advfirewall firewall show rule name=all | findstr "5004"').toString();
        console.log(portCheck || "Žádná pravidla pro port 5004 nebyla nalezena.");
      } catch (error) {
        console.log("Žádná pravidla pro port 5004 nebyla nalezena.");
      }
      
    } else if (process.platform === 'darwin') {
      // macOS
      console.log("Na macOS je firewall obvykle nakonfigurován tak, aby neblokoval RTP MIDI.");
      console.log("Pokud máte problémy, zkontrolujte nastavení v Předvolby systému > Zabezpečení a soukromí > Firewall.");
      
    } else if (process.platform === 'linux') {
      // Linux
      console.log("Kontroluji iptables...");
      try {
        const output = execSync('sudo iptables -L').toString();
        console.log(output);
      } catch (error) {
        console.log("Nelze získat informace o iptables. Možná je potřeba sudo oprávnění.");
      }
    }
  } catch (error) {
    console.log(colorText(`Chyba při kontrole firewallu: ${error.message}`, colors.red));
  }
  
  console.log(colorText("\nDoporučení pro firewall:", colors.cyan));
  console.log(" - Ujistěte se, že port 5004 (TCP i UDP) je otevřený pro příchozí i odchozí spojení");
  console.log(" - Povolte mDNS komunikaci na portu 5353 UDP");
  console.log(" - Povolte komunikaci pro multicast adresu 224.0.0.251");
}

// Spuštění testů
async function runAllTests() {
  await testMulticast();
  console.log();
  await testBonjour();
  console.log();
  await testRtpMidi();
  console.log();
  checkFirewall();
  
  console.log(colorText("\n=== Diagnostika dokončena ===", colors.cyan));
  console.log(colorText("\nPokud máte stále problémy s RTP MIDI:", colors.yellow));
  console.log(" 1. Zkontrolujte, zda jsou povoleny mDNS a multicast v síti");
  console.log(" 2. Ujistěte se, že používáte správné síťové rozhraní v konfiguraci");
  console.log(" 3. Zkontrolujte, zda nejsou blokované UDP porty 5004 a 5353");
  console.log(" 4. Pokud používáte virtuální síťové adaptéry, zkuste fyzické připojení");
  console.log(" 5. Na Windows může být nutné vytvořit explicitní pravidla ve firewallu");
}

runAllTests();