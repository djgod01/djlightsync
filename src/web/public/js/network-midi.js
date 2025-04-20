/*
 * DJ Sync Server - network-midi.js
 * Klientský JavaScript pro správu síťových MIDI zařízení
 * v.0.1 - 2025-04-20
 */

document.addEventListener('DOMContentLoaded', () => {
    // Inicializace Socket.IO - musíme použít existující Socket.IO spojení
    const socket = io();
    
    // Elementy UI pro síťová MIDI zařízení
    const networkMidiDevices = document.getElementById('network-midi-devices');
    const refreshNetworkMidi = document.getElementById('refresh-network-midi');
    
    // Event listener pro refresh tlačítko
    if (refreshNetworkMidi) {
        refreshNetworkMidi.addEventListener('click', () => {
            fetchNetworkMidiDevices();
            
            // Začít nové vyhledávání
            socket.emit('startNetworkMidiDiscovery');
        });
    }
    
    // Socket.IO události pro síťová MIDI zařízení
    socket.on('networkMidiDevicesUpdated', (devices) => {
        updateNetworkMidiDevicesList(devices);
    });
    
    socket.on('networkMidiDiscoveryStatus', (status) => {
        if (status.active) {
            console.log('Vyhledávání síťových MIDI zařízení je aktivní');
        } else {
            console.log('Vyhledávání síťových MIDI zařízení je neaktivní');
            if (status.error) {
                console.error('Chyba při vyhledávání:', status.error);
            }
        }
    });
    
    // Funkce pro načtení síťových MIDI zařízení z API
    function fetchNetworkMidiDevices() {
        fetch('/api/network-midi-devices')
            .then(response => response.json())
            .then(devices => {
                updateNetworkMidiDevicesList(devices);
            })
            .catch(error => {
                console.error('Chyba při načítání síťových MIDI zařízení:', error);
            });
    }
    
    // Funkce pro aktualizaci seznamu síťových MIDI zařízení
    function updateNetworkMidiDevicesList(devices) {
        if (!networkMidiDevices) return;
        
        // Vyčištění seznamu
        networkMidiDevices.innerHTML = '';
        
        // Přidání prázdné volby
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- Vyberte zařízení --';
        networkMidiDevices.appendChild(emptyOption);
        
        if (devices.length === 0) {
            const noDevicesOption = document.createElement('option');
            noDevicesOption.value = '';
            noDevicesOption.textContent = 'Žádná zařízení nebyla nalezena';
            noDevicesOption.disabled = true;
            networkMidiDevices.appendChild(noDevicesOption);
            return;
        }
        
        // Přidání nalezených zařízení
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = `${device.name} (${device.host}:${device.port})`;
            networkMidiDevices.appendChild(option);
        });
        
        // Výběr zařízení z konfigurace, pokud existuje
        fetch('/api/config')
            .then(response => response.json())
            .then(config => {
                const networkDeviceId = config.outputs.midi.settings.networkDeviceId;
                if (networkDeviceId) {
                    networkMidiDevices.value = networkDeviceId;
                }
            })
            .catch(error => {
                console.error('Chyba při načítání konfigurace:', error);
            });
    }
    
    // Inicializace - načtení síťových MIDI zařízení
    fetchNetworkMidiDevices();
    
    // Export funkcí pro použití v hlavním app.js
    window.networkMidiManager = {
        fetchNetworkMidiDevices,
        updateNetworkMidiDevicesList
    };
});
