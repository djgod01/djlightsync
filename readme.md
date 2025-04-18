# DJ Sync Server

Synchronizační server pro DJ techniku využívající protokol Pioneer Pro DJ Link s webovým konfiguračním rozhraním.

## Funkce

- Detekce a sledování DJ zařízení na síti
- Extrakce informací o BPM, beatu a synchronizaci
- Výstupní protokoly: MIDI, LTC (Linear Timecode), Ableton Link, TC (Timecode)
- Webové konfigurační rozhraní
- Logování událostí a aktivit

## Požadavky

- Node.js 14.x nebo novější
- npm 6.x nebo novější
- Síťové připojení k DJ technice podporující protokol Pro DJ Link (Pioneer CDJ, DJM, XDJ)

## Instalace

1. Naklonujte tento repozitář:
git clone https://github.com/username/dj-sync-server.git
cd dj-sync-server

2. Nainstalujte závislosti:
npm install

3. Zkompilujte TypeScript zdrojové kódy:
npm run build

## Spuštění

Pro spuštění serveru v produkčním režimu:

npm start

Pro vývoj s automatickým restartem při změnách zdrojových souborů:

npm run dev

Webové rozhraní je dostupné na adrese `http://localhost:8080` (nebo na jiném portu, který jste nakonfigurovali).

## Konfigurace

Základní konfigurace se nachází v souboru `config.json` v kořenovém adresáři projektu. Můžete ji upravit buď přímo, nebo přes webové rozhraní.

### Síťová nastavení

- **Interface**: IP adresa síťového rozhraní, které bude použito pro komunikaci
- **Player Number**: Číslo virtuálního přehrávače (1-6)
- **Device Name**: Název, který se zobrazí ostatním zařízením

### Výstupní protokoly

#### MIDI

- Odesílání MIDI clocku a beat zpráv
- Konfigurovatelný MIDI kanál

#### LTC (Linear Timecode)

- Generování LTC timecodu synchronizovaného s beatem
- Nastavitelný framerate

#### Ableton Link

- Synchronizace s Ableton Live a dalšími aplikacemi podporujícími Ableton Link
- Nastavitelný quantum

#### TC (Timecode)

- Generování SMPTE/MTC timecodu
- Výběr formátu (SMPTE/MTC)

## Struktura projektu

- `src/` - Zdrojové soubory
  - `config/` - Správa konfigurace
  - `network/` - Práce se síťovými rozhraními
  - `djlink/` - Implementace Pro DJ Link protokolu
  - `outputs/` - Výstupní protokoly
  - `web/` - Webové rozhraní a API
  - `logger/` - Systém pro logování

## Logování

Logy jsou ukládány ve složce `logs/` v kořenovém adresáři projektu. Pro každý den se vytváří nový log soubor ve formátu `dj-sync-YYYY-MM-DD.log`.

## Licence

MIT