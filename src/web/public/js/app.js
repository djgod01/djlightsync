/*
 * DJ Sync Server - app.js
 * Klientský JavaScript pro webové rozhraní
 * v.0.1 - 2025-04-17
 */

document.addEventListener('DOMContentLoaded', () => {
    // Inicializace Socket.IO
    const socket = io();
    
    // Elementy UI
    const serverStatus = document.getElementById('server-status');
    const deviceList = document.getElementById('device-list');
    const masterDevice = document.getElementById('master-device');
    const currentBpm = document.getElementById('current-bpm');
    const currentBeat = document.getElementById('current-beat');
    const networkInterface = document.getElementById('network-interface');
    const playerNumber = document.getElementById('player-number');
    const deviceName = document.getElementById('device-name');
    const serverPort = document.getElementById('server-port');
    const logContent = document.getElementById('log-content');
    
    // Výstupní přepínače
    const midiEnabled = document.getElementById('midi-enabled');
    const ltcEnabled = document.getElementById('ltc-enabled');
    const abletonEnabled = document.getElementById('ableton-enabled');
    const tcEnabled = document.getElementById('tc-enabled');
    
    // MIDI RTP přepínač
    const midiUseRtp = document.getElementById('midi-use-rtp');
    const localMidiSettings = document.querySelector('.local-midi-settings');
    const rtpMidiSettings = document.querySelector('.rtp-midi-settings');
    
    // Tlačítka pro uložení nastavení
    const networkSave = document.getElementById('network-save');
    const outputsSave = document.getElementById('outputs-save');
    const settingsSave = document.getElementById('settings-save');
    
    // Tlačítka pro správu logů
    const refreshLogs = document.getElementById('refresh-logs');
    const clearLogs = document.getElementById('clear-logs');
	// TC volume slider
const tcVolumeSlider = document.getElementById('tc-volume');
const tcVolumeValue = document.getElementById('tc-volume-value');

if (tcVolumeSlider && tcVolumeValue) {
  // Inicializace hodnoty
  tcVolumeSlider.addEventListener('input', () => {
    const value = tcVolumeSlider.value;
    tcVolumeValue.textContent = value + '%';
  });
  
  // Odeslání hodnoty na server při uvolnění
  tcVolumeSlider.addEventListener('change', () => {
    const volume = parseInt(tcVolumeSlider.value, 10) / 100; // Převod na 0-1
    socket.emit('setTcVolume', volume);
  });
}
    
    // Zobrazení/skrytí detailních nastavení pro výstupy
    midiEnabled.addEventListener('change', () => {
        document.querySelector('.midi-settings').style.display = midiEnabled.checked ? 'block' : 'none';
    });
    
    ltcEnabled.addEventListener('change', () => {
        document.querySelector('.ltc-settings').style.display = ltcEnabled.checked ? 'block' : 'none';
    });
    
    abletonEnabled.addEventListener('change', () => {
        document.querySelector('.ableton-settings').style.display = abletonEnabled.checked ? 'block' : 'none';
    });
    
    tcEnabled.addEventListener('change', () => {
        document.querySelector('.tc-settings').style.display = tcEnabled.checked ? 'block' : 'none';
    });
    
    // Přepínání mezi lokálním a RTP MIDI
    midiUseRtp.addEventListener('change', () => {
        localMidiSettings.style.display = midiUseRtp.checked ? 'none' : 'block';
        rtpMidiSettings.style.display = midiUseRtp.checked ? 'block' : 'none';
    });
    
    // Přepínání mezi záložkami
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            const tabName = button.getAttribute('data-tab');
            document.getElementById(tabName).classList.add('active');
        });
    });
    
    // Socket.IO události
    socket.on('connect', () => {
        serverStatus.textContent = 'Připojeno';
        serverStatus.classList.add('connected');
        serverStatus.classList.remove('disconnected');
    });
    
    socket.on('disconnect', () => {
        serverStatus.textContent = 'Odpojeno';
        serverStatus.classList.add('disconnected');
        serverStatus.classList.remove('connected');
    });
    
    // Inicializační data od serveru
 // A následně přidejte zpracování této hodnoty v app.js:
socket.on('init', (data) => {
  updateConfig(data.config);
  updateDeviceList(data.devices, data.master);
  updateBeatInfo(data.lastBeat);
  updateOutputStatus(data.outputs);
  
  // Nastavení hodnoty TC volume slideru
  if (data.tcVolume !== undefined && tcVolumeSlider && tcVolumeValue) {
    const volumePercent = Math.round(data.tcVolume * 100);
    tcVolumeSlider.value = volumePercent.toString();
    tcVolumeValue.textContent = volumePercent + '%';
  }
});   
    // Aktualizace konfigurace
    function updateConfig(config) {
        // Síťová nastavení
        const networkConfig = config.djlink;
        playerNumber.value = networkConfig.playerNumber;
        deviceName.value = networkConfig.deviceName;
        
        // Server nastavení
        serverPort.value = config.server.port;
        
        // Výstupní nastavení
        const outputs = config.outputs;
        
        // MIDI
        midiEnabled.checked = outputs.midi.enabled;
        document.querySelector('.midi-settings').style.display = outputs.midi.enabled ? 'block' : 'none';
        
        // RTP MIDI
        midiUseRtp.checked = outputs.midi.settings.useRtpMidi || false;
        localMidiSettings.style.display = midiUseRtp.checked ? 'none' : 'block';
        rtpMidiSettings.style.display = midiUseRtp.checked ? 'block' : 'none';
        
        if (outputs.midi.settings.rtpSessionName) {
            document.getElementById('rtp-session-name').value = outputs.midi.settings.rtpSessionName;
        }
        
        if (outputs.midi.settings.rtpPort) {
            document.getElementById('rtp-port').value = outputs.midi.settings.rtpPort;
        }
        
        if (outputs.midi.settings.device) {
            const midiDevice = document.getElementById('midi-device');
            if (midiDevice) {
                // Nastavení zařízení
            }
        }
        document.getElementById('midi-channel').value = outputs.midi.settings.channel;
        
        // LTC
        ltcEnabled.checked = outputs.ltc.enabled;
        document.querySelector('.ltc-settings').style.display = outputs.ltc.enabled ? 'block' : 'none';
        document.getElementById('ltc-framerate').value = outputs.ltc.settings.framerate;
        
        // Ableton Link
        abletonEnabled.checked = outputs.abletonLink.enabled;
        document.querySelector('.ableton-settings').style.display = outputs.abletonLink.enabled ? 'block' : 'none';
        document.getElementById('ableton-quantum').value = outputs.abletonLink.settings.quantum;
        
        // TC
        tcEnabled.checked = outputs.tc.enabled;
        document.querySelector('.tc-settings').style.display = outputs.tc.enabled ? 'block' : 'none';
        document.getElementById('tc-format').value = outputs.tc.settings.format;
    }
    
    // Aktualizace seznamu zařízení
    function updateDeviceList(devices, masterId) {
        if (!devices || devices.length === 0) {
            deviceList.innerHTML = '<p>Žádná zařízení nebyla nalezena.</p>';
            return;
        }
        
        deviceList.innerHTML = '';
        
        devices.forEach(device => {
            const deviceEl = document.createElement('div');
            deviceEl.className = `device-item ${device.id === masterId ? 'master' : ''}`;
            deviceEl.innerHTML = `
                <div><strong>${device.name}</strong> (ID: ${device.id})</div>
                <div>IP: ${device.address}</div>
            `;
            deviceList.appendChild(deviceEl);
        });
        
        updateMasterDevice(devices, masterId);
    }
    
    // Aktualizace master zařízení
    function updateMasterDevice(devices, masterId) {
        if (!masterId) {
            masterDevice.innerHTML = '<p>Žádné master zařízení</p>';
            return;
        }
        
        const master = devices.find(d => d.id === masterId);
        if (master) {
            masterDevice.innerHTML = `
                <div><strong>${master.name}</strong> (ID: ${master.id})</div>
                <div>IP: ${master.address}</div>
            `;
        } else {
            masterDevice.innerHTML = `<p>Master ID: ${masterId} (nenalezeno)</p>`;
        }
    }
    
    // Aktualizace informací o beatu
    function updateBeatInfo(beatInfo) {
        if (!beatInfo) {
            currentBpm.textContent = '---';
            currentBeat.textContent = '-';
            return;
        }
        
        currentBpm.textContent = beatInfo.bpm.toFixed(1);
        currentBeat.textContent = beatInfo.beatInMeasure;
        
        // Přidat vizuální indikátor beatu
        currentBeat.classList.add('beat-active');
        setTimeout(() => {
            currentBeat.classList.remove('beat-active');
        }, 100);
    }
    
    // Aktualizace stavu výstupů
    function updateOutputStatus(outputs) {
        // Pro budoucí použití - indikátory aktivních výstupů
    }
    
    // Načtení dostupných síťových rozhraní
    function loadInterfaces() {
        fetch('/api/interfaces')
            .then(response => response.json())
            .then(interfaces => {
                networkInterface.innerHTML = '';
                interfaces.forEach(iface => {
                    const option = document.createElement('option');
                    option.value = iface.address;
                    option.textContent = `${iface.name} (${iface.address})`;
                    networkInterface.appendChild(option);
                });
                
                // Vybrat aktuální rozhraní z konfigurace
                fetch('/api/config')
                    .then(response => response.json())
                    .then(config => {
                        if (config.djlink.interface) {
                            networkInterface.value = config.djlink.interface;
                        }
                    });
            })
            .catch(error => {
                console.error('Chyba při načítání rozhraní:', error);
            });
    }
    
    // Načtení MIDI zařízení
    function loadMidiDevices() {
        fetch('/api/midi-devices')
            .then(response => response.json())
            .then(devices => {
                const midiDevice = document.getElementById('midi-device');
                midiDevice.innerHTML = '';
                
                // Přidání prázdné volby
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = '-- Vyberte zařízení --';
                midiDevice.appendChild(emptyOption);
                
                // Přidání dostupných zařízení
                devices.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.name;
                    option.textContent = device.name;
                    midiDevice.appendChild(option);
                });
                
                // Vybrat aktuální zařízení z konfigurace
                fetch('/api/config')
                    .then(response => response.json())
                    .then(config => {
                        if (config.outputs.midi.settings.device) {
                            midiDevice.value = config.outputs.midi.settings.device;
                        }
                    });
            })
            .catch(error => {
                console.error('Chyba při načítání MIDI zařízení:', error);
            });
    }
    
    // Načtení audio zařízení
    function loadAudioDevices() {
        fetch('/api/audio-devices')
            .then(response => response.json())
            .then(devices => {
                const ltcDevice = document.getElementById('ltc-device');
                const tcDevice = document.getElementById('tc-device');
                
                ltcDevice.innerHTML = '';
                tcDevice.innerHTML = '';
                
                // Přidání prázdné volby
                const emptyOption1 = document.createElement('option');
                emptyOption1.value = '';
                emptyOption1.textContent = '-- Vyberte zařízení --';
                ltcDevice.appendChild(emptyOption1);
                
                const emptyOption2 = document.createElement('option');
                emptyOption2.value = '';
                emptyOption2.textContent = '-- Vyberte zařízení --';
                tcDevice.appendChild(emptyOption2);
                
                // Přidání dostupných zařízení
                devices.forEach(device => {
                    const option1 = document.createElement('option');
                    option1.value = device.name;
                    option1.textContent = device.name;
                    ltcDevice.appendChild(option1);
                    
                    const option2 = document.createElement('option');
                    option2.value = device.name;
                    option2.textContent = device.name;
                    tcDevice.appendChild(option2);
                });
                
                // Vybrat aktuální zařízení z konfigurace
                fetch('/api/config')
                    .then(response => response.json())
                    .then(config => {
                        if (config.outputs.ltc.settings.device) {
                            ltcDevice.value = config.outputs.ltc.settings.device;
                        }
                        if (config.outputs.tc.settings.device) {
                            tcDevice.value = config.outputs.tc.settings.device;
                        }
                    });
            })
            .catch(error => {
                console.error('Chyba při načítání audio zařízení:', error);
            });
    }
    
    // Načtení logů
    function loadLogs() {
        fetch('/api/logs')
            .then(response => response.text())
            .then(logs => {
                logContent.textContent = logs;
                // Automaticky scroll na konec logů
                logContent.scrollTop = logContent.scrollHeight;
            })
            .catch(error => {
                console.error('Chyba při načítání logů:', error);
                logContent.textContent = 'Chyba při načítání logů.';
            });
    }
    
    // Události pro formuláře
    networkSave.addEventListener('click', () => {
        const config = {
            djlink: {
                interface: networkInterface.value,
                playerNumber: parseInt(playerNumber.value, 10),
                deviceName: deviceName.value
            }
        };
        
        socket.emit('updateConfig', config);
    });
    
    outputsSave.addEventListener('click', () => {
        const config = {
            outputs: {
                midi: {
                    enabled: midiEnabled.checked,
                    settings: {
                        useRtpMidi: midiUseRtp.checked,
                        device: document.getElementById('midi-device').value,
                        channel: parseInt(document.getElementById('midi-channel').value, 10),
                        rtpSessionName: document.getElementById('rtp-session-name').value,
                        rtpPort: parseInt(document.getElementById('rtp-port').value, 10)
                    }
                },
                ltc: {
                    enabled: ltcEnabled.checked,
                    settings: {
                        device: document.getElementById('ltc-device').value,
                        framerate: parseInt(document.getElementById('ltc-framerate').value, 10)
                    }
                },
                abletonLink: {
                    enabled: abletonEnabled.checked,
                    settings: {
                        quantum: parseInt(document.getElementById('ableton-quantum').value, 10)
                    }
                },
                tc: {
                    enabled: tcEnabled.checked,
                    settings: {
                        device: document.getElementById('tc-device').value,
                        format: document.getElementById('tc-format').value
                    }
                }
            }
        };
        
        socket.emit('updateConfig', config);
    });
    
    settingsSave.addEventListener('click', () => {
        const config = {
            server: {
                port: parseInt(serverPort.value, 10)
            }
        };
        
        socket.emit('updateConfig', config);
    });
    
    // Události pro správu logů
    refreshLogs.addEventListener('click', loadLogs);
    
    clearLogs.addEventListener('click', () => {
        fetch('/api/logs/clear', { method: 'POST' })
            .then(response => {
                if (response.ok) {
                    logContent.textContent = 'Logy byly vyčištěny.';
                }
            })
            .catch(error => {
                console.error('Chyba při mazání logů:', error);
            });
    });
    
    // Socket.IO události pro aktualizace v reálném čase
    socket.on('deviceConnected', (device) => {
        // Aktualizujeme seznam zařízení
        fetch('/api/devices')
            .then(response => response.json())
            .then(devices => {
                updateDeviceList(devices, socket.masterDeviceId);
            });
    });
    
    socket.on('deviceDisconnected', (device) => {
        // Aktualizujeme seznam zařízení
        fetch('/api/devices')
            .then(response => response.json())
            .then(devices => {
                updateDeviceList(devices, socket.masterDeviceId);
            });
    });
    
    socket.on('masterChanged', (deviceId) => {
        // Uložíme ID master zařízení
        socket.masterDeviceId = deviceId;
        
        // Aktualizujeme zobrazení master zařízení
        fetch('/api/devices')
            .then(response => response.json())
            .then(devices => {
                updateDeviceList(devices, deviceId);
            });
    });
    
    socket.on('beat', (beatInfo) => {
        updateBeatInfo(beatInfo);
    });
    
    socket.on('configUpdated', (result) => {
        if (result.success) {
            alert('Nastavení bylo uloženo.');
        } else {
            alert('Chyba při ukládání nastavení: ' + (result.error || 'Neznámá chyba'));
        }
    });
    
    // Inicializace stránky
    loadInterfaces();
    loadMidiDevices();
    loadAudioDevices();
    loadLogs();
});