# Apex Formula

3D-Formel-Rennsimulation im Browser – eine einzige HTML-Datei, Three.js r160, alles prozedural.
Fiktive Teams, Fahrer und Strecken. Lenkradunterstützung mit Kalibrierungsassistent und
echtem Force Feedback (Logitech G920/G923 über WebHID).

## Bauen

```bash
node tools/build.mjs          # → dist/apex-formula.html
node tools/build.mjs --zip    # zusätzlich dist/apex-formula.zip (Spiel + LIESMICH + Linux-Extras)
```

Die Quellteile in `src/` werden nach Dateinamen sortiert aneinandergehängt:

| Teil | Inhalt |
|---|---|
| `00_head.html` | HTML, CSS, Importmap |
| `10_core.js` | Mathe, Ereignisse, Speichern |
| `20_data.js` | Teams, Fahrzeugdaten, Strecken (fiktiv) |
| `30_track.js` | Streckenmodell (Spline, Höhen, Oberflächen) |
| `40_physics.js` | Fahrzeugphysik, 360 Hz, Reifen, Antrieb, Aero, FFB-Moment |
| `50_input.js` | Tastatur, Gamepad, Lenkrad, Kalibrierung, Profile |
| `55_ffb.js` | Force Feedback über WebHID (HID++ 2.0, Feature 0x8123) |
| `60_audio.js` | Klangsynthese |
| `70`–`76` | Rendering, Strecke, Auto, Garage |
| `80_ui.js` | Menüs, HUD, Einstellungen |
| `90_game.js` | Ablaufsteuerung |

## Tests

```bash
tools/run-pure.sh tests/physik/test_phys.js      # Physik ohne Browser (Node)
npm i --no-save three@0.160.0 playwright         # einmalig für Browsertests
node tests/browser/ffb_test.js                   # FFB-Attrappe G920 + Menü-Fehler
node tests/browser/audio_test.js                 # Motorklang-Worklet
node tests/audio/test_engine.js                  # Motorklang offline + WAV-Proben
node tests/browser/ui_test.js
node tests/browser/smoke_test.js
```

Umgebungsvariablen: `APEX_THREE_DIR` (Ordner von three@0.160.0), `APEX_SHOTS` (Bildschirmfotos).

## Drittanbieter

- **Three.js** r160 (MIT), per CDN geladen.
- **Motorklang:** Modell portiert nach [enginesound](https://github.com/DasEtwas/enginesound) von DasEtwas
  (MIT, © 2020 DasEtwas; Lizenztext in `src/58_engine_model.js` und `extras/LIZENZ-enginesound.txt`),
  basierend auf dem Paper „Physically informed car engine sound synthesis for virtual and augmented
  environments“ (Baldan, Lachambre, Delle Monache, Boussard).
- **Force Feedback:** HID++-Protokoll nach dem Linux-Treiber `hid-logitech-hidpp` als Dokumentation
  nachgebaut (keine Code-Übernahme).
