# Apex Formula

3D-Formel-Rennsimulation im Browser – eine einzige HTML-Datei, Three.js r160, alles prozedural.
Fiktive Teams, Fahrer und Strecken. Lenkradunterstützung mit Kalibrierungsassistent und
echtem Force Feedback (Logitech G920/G923 über WebHID).

**Stand: Phase 3+**
- Zwei Strecken: Kurstadt Ringpark und Falkenried-Ring (nach einer Skizze des Spielers, Mittellinie aus der Zeichnung extrahiert)
- Fahrhilfe Ideallinie (grün/gelb/rot nach eigenem Tempo); KI verteidigt, greift an, hält im Zweikampf Abstand, Stärke bis 110 %
- Testfahrt/Training: Sektorzeiten (lila/grün/gelb), Track Limits, Live-Delta, Ghost der Bestrunde,
  Telemetrie (Runden vergleichen, CSV), Fahrzeug-Setup (19 Parameter, pro Strecke gespeichert)
- Schnelles Rennen: bis zu 19 KI-Gegner auf derselben Fahrphysik, Startampel mit Frühstart-Erkennung,
  Zeitenturm, Abstände, Windschatten/verwirbelte Luft, Überholmodus, Kollisionen, Schaden, Strafen, Ergebnis
- Kameras: Cockpit, T-Cam, Nase, Verfolger nah/fern, TV-Regie

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
| `45_ai.js` | KI: Ideallinie (minimale Krümmung), Tempoprofil, Fahrer-Regler, Verkehr |
| `47_race.js` | Zeitnahme, Track Limits, Kollisionen, Schaden, Rennablauf, Training, Ghost/Telemetrie-Aufzeichnung |
| `50_input.js` | Tastatur, Gamepad, Lenkrad, Kalibrierung, Profile |
| `55_ffb.js` | Force Feedback über WebHID (HID++ 2.0, Feature 0x8123) |
| `58_engine_model.js` | Physikalisches Motorklang-Modell (AudioWorklet) |
| `60_audio.js` | Klangsynthese |
| `70`–`78` | Rendering, Strecke, Auto, Garage, Ghost, TV-Kameras |
| `80_ui.js` | Menüs, HUD, Einstellungen |
| `82_ui_race.js` | Rennvorbereitung, Ergebnis, Setup, Telemetrie, Renn-HUD |
| `90_game.js` | Ablaufsteuerung |

## Tests

```bash
tools/run-pure.sh tests/physik/test_phys.js      # Physik ohne Browser (Node)
tools/run-pure.sh tests/physik/test_ai.js        # KI allein: Rundenzeit, Abflüge
tools/run-pure.sh tests/physik/test_race.js      # Rennen mit 19 KI-Autos (TRACK=…, SEED=…, LAPS=…, OFF=defend,door,…)
tools/run-pure.sh tests/physik/test_duel.js      # Zweikampf: KI verteidigt gegen schnelleren „Spieler“
npm i --no-save three@0.160.0 playwright         # einmalig für Browsertests
node tests/browser/ffb_test.js                   # FFB-Attrappe G920 + Menü-Fehler
node tests/browser/audio_test.js                 # Motorklang-Worklet
node tests/browser/race_test.js                  # Schnelles Rennen bis zum Ergebnis
node tests/browser/practice_test.js              # Phase 2: Setup, Sektoren, Ghost, Track Limits, Telemetrie
node tests/browser/track_test.js                 # Falkenried-Ring, Ideallinie, Rennstart
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
