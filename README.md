# Apex Formula

3D-Formel-Rennsimulation im Browser – eine einzige HTML-Datei, Three.js r160, alles prozedural.
Fiktive Teams, Fahrer und Strecken. Lenkradunterstützung mit Kalibrierungsassistent und
echtem Force Feedback (Logitech G920/G923 über WebHID).

**Neu: Mehrspieler (Peer-to-Peer)** – bis 8 Spieler + KI, der PC des Hosts ist der Server. Lobby-Code (APEX-XXXXX) über
den kostenlosen öffentlichen PeerJS-Vermittler, ohne Internet/LAN per kopierbarem Einladungs-/Antwort-Code (direktes
WebRTC). Benutzername, Freundescode, Freundesliste mit Online-Status, Einladungen, Freundschaftsanfragen, Lobby-Chat,
Host-Einstellungen (Strecke, Epoche, Runden, KI, Wetter, Tageszeit, Schaden, Safety Car). Jeder fährt sein Auto mit
voller Physik lokal (30 Hz an den Host), der Host verteilt alle Autos (20 Hz) und die Rennübersicht (4 Hz).
Boxenstopps (Autopilot auf dem PC des Gasts), Qualifying (alle gleichzeitig gegen die Uhr), Track Limits/Frühstart für Gäste,
Wiederverbinden nach Verbindungsabbruch (90 s), optional eigener TURN-Server.

**Neu: Karriere** – eigener Fahrer (Name, Nummer, Nation), mehrere Saisons über alle Strecken, Teams mit wechselnder
Autostärke, Verträge mit Bedingungen, Fahrermarkt (KI wechselt, tritt zurück, Neulinge, Fahrerwechsel während der
Saison), Beziehung zu jedem KI-Fahrer (wirkt auf Angriff/Verteidigung gegen dich), Social-Media-Feed mit Beiträgen von
Fahrern, Team, Fans und Presse, eigene Beiträge und Antworten.

**Neu: Mods** – Ordner `mods/` neben der HTML-Datei: Strecken (aus Eckpunkten + Kurvenradien, Rest automatisch),
Teams, Fahrer und eigene Autos/Epochen. Laden über `mods/mods.js` oder (Chrome/Edge) Ordnerauswahl im Menü „Mods“.
Anleitung `mods/README.txt`, KI-Prompt-Vorlagen in `mods/vorlagen/`.

**Neu: Hauptmenü & Siegerehrung** – Kachel-Hub mit Fahrerprofil; Podest mit Fahrerfiguren in Teamfarben,
Pokalen, Konfetti und Sektdusche nach dem Rennen (abschaltbar).

**Neu: Epochen** – acht Fahrzeug-Generationen (1990, 2000, 2010, 2014, 2017, 2020, 2022, 2026) mit eigener Physik
(Motor/Drehzahl, Getriebe, Masse, Radstand, Aero, Reifen, ERS, DRS bzw. aktive Aero), gemessenen KI-Grenzen,
eigenem Motorklang (V12/V10/V8/V6), Optik (Halo, Radstand, Breite) und frei erfundenem Fahrerfeld je Epoche.
Bestzeiten und Ghosts werden je Epoche getrennt gespeichert. Die Qualifying-Schätzung kalibriert sich je Epoche/Strecke selbst.

**Stand: Phase 6**
- Wiederholung: alle Autos + Safety Car mit 15 Hz aufgezeichnet (≈ 0,8 MB je Minute, Ringpuffer 40 min), Wiedergabe mit Zeitleiste, Ereignismarken (Überholen, Kontakt, Ausfall), Tempo ¼×–4×, alle Kameras + Helikopter, automatische Regie, Positionsliste zum Anklicken
- Grafik: Reifenspuren beim Blockieren/Rutschen, Nachbearbeitung (dezentes Bloom, Vignette, Farbkorrektur, MSAA im Renderziel), abschaltbar
- Performance: dreistufige Detailstufen für Gegner, Schatten nur von großen Teilen → Draw Calls in der Startaufstellung 2084 → 686 (−67 %), TV-Kamera 960 → 314; automatische Anpassung schaltet zuerst die Nachbearbeitung ab

**Davor (Phase 5)**
- Wetter: sonnig, bewölkt, leichter/starker Regen, wechselhaft (Regen setzt im Rennen ein), zufällig – Streckennässe trocknet ab bzw. steigt, Intermediate-/Regenreifen, Gischt, nasse Optik, KI wechselt passend die Reifen
- Tageszeiten: Vormittag, Nachmittag, Abend, Dämmerung (oder Strecken-Standard)
- Zwei neue Strecken: Hafenstadt-Kurs (3,45 km Stadtkurs mit Mauern) und Alpental-Ring (5,25 km, 37 m Höhenunterschied)
- Qualifying (5/10/15 min) gegen die Uhr; KI-Zeiten aus dem Tempoprofil geschätzt, Ergebnis = Startaufstellung
- Meisterschaft über alle vier Strecken: Punkte 25-18-15-12-10-8-6-4-2-1 (+1 schnellste Runde), Fahrer- und Teamwertung, automatisch gespeichert

**Davor (Phase 4)**
- Boxengasse (Ein-/Ausfahrt als Öffnung in der Boxenmauer, 80 km/h), Boxenstopp-Autopilot, Teamboxen, Service (Reifen, Reparatur, Strafen absitzen)
- Reifenstrategie: KI plant Stopps nach Verschleiß, Schaden und Safety Car; Pflichtstopp mit zwei Mischungen
- Flaggen (gelb, blau, grün, Zielflagge), Safety Car mit Kolonne und Neustart, virtuelles Safety Car, Unfallwracks
- Strafen: Überholen unter Gelb/SC/VSC, zu schnell unter VSC, Pflichtstopp; Energie-Einsatzgrenze 4 MJ je Runde

**Davor (Phase 3+)**
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
| `22_eras.js` | Epochen: Fahrzeugdaten, KI-Grenzen, Fahrerfelder, applyEra() |
| `24_mods.js` | Mods: Strecke aus Eckpunkten, Standardwerte, Prüfung, Übernahme |
| `30_track.js` | Streckenmodell (Spline, Höhen, Oberflächen) |
| `40_physics.js` | Fahrzeugphysik, 360 Hz, Reifen, Antrieb, Aero, FFB-Moment |
| `45_ai.js` | KI: Ideallinie (minimale Krümmung), Tempoprofil, Fahrer-Regler, Verkehr |
| `46_replay.js` | Wiederholung: Aufzeichnung (Ringpuffer), Interpolation, Regie |
| `47_race.js` | Zeitnahme, Track Limits, Kollisionen, Schaden, Rennablauf, Training, Ghost/Telemetrie-Aufzeichnung |
| `48_weather.js` | Wetter: Bewölkung, Regen, Streckennässe |
| `49_season.js` | Qualifying (KI-Zeitschätzung) und Meisterschaft (Punkte, Wertungen) |
| `50_input.js` | Tastatur, Gamepad, Lenkrad, Kalibrierung, Profile |
| `55_ffb.js` | Force Feedback über WebHID (HID++ 2.0, Feature 0x8123) |
| `58_engine_model.js` | Physikalisches Motorklang-Modell (AudioWorklet) |
| `60_audio.js` | Klangsynthese |
| `70`–`78` | Rendering, Strecke, Auto, Garage, Ghost, TV-Kameras |
| `79_podium.js` | Fahrerfiguren, Siegerehrung |
| `84_mods_ui.js` | Mod-Ordnerauswahl, Menü „Mods“ |
| `51_career.js` | Karriere: Daten, Fahrermarkt, Beziehungen, Social Media (ohne DOM) |
| `86_career_ui.js` | Karriere-Menüs |
| `87_net_ui.js` | Mehrspieler-Menüs (Profil, Freunde, Lobby) |
| `88_net.js` | Mehrspieler: WebRTC/PeerJS-Verbindungen, Codes, Binärformat, Freunde |
| `89_net_session.js` | Mehrspieler: Host/Client-Lobby, Rennsynchronisation, Client-Rennansicht |
| `80_ui.js` | Menüs, HUD, Einstellungen |
| `82_ui_race.js` | Rennvorbereitung, Ergebnis, Setup, Telemetrie, Renn-HUD |
| `90_game.js` | Ablaufsteuerung |

## Tests

```bash
tools/run-pure.sh tests/physik/test_phys.js      # Physik ohne Browser (Node)
tools/run-pure.sh tests/physik/test_ai.js        # KI allein: Rundenzeit, Abflüge
tools/run-pure.sh tests/physik/test_race.js      # Rennen mit 19 KI-Autos (TRACK=…, SEED=…, LAPS=…, OFF=defend,door,…)
tools/run-pure.sh tests/physik/test_duel.js      # Zweikampf: KI verteidigt gegen schnelleren „Spieler“
tools/run-pure.sh tests/physik/test_pit.js       # Boxenstopp: Phasen, Zeitverlust, Service
tools/run-pure.sh tests/physik/test_sc.js        # Safety Car und VSC: Kolonne, keine Überholmanöver, Neustart
tools/run-pure.sh tests/physik/test_weather.js   # Regenrennen: Nässe, Reifenwechsel der KI
tools/run-pure.sh tests/physik/test_season.js    # Qualifying-Schätzung, Meisterschaftswertung
tools/run-pure.sh tests/physik/test_replay.js    # Wiederholung: Genauigkeit, Speicher, Ringpuffer, Regie
tools/run-pure.sh tests/physik/test_career.js    # Karriere: 3 Saisons simuliert (Cockpits, Verträge, Beiträge)
tools/run-pure.sh tests/physik/test_mods.js      # Mods: Strecke aus Eckpunkten, Teams/Fahrer, Auto-Epoche, KI-Runde
npm i --no-save three@0.160.0 playwright         # einmalig für Browsertests
node tests/browser/ffb_test.js                   # FFB-Attrappe G920 + Menü-Fehler
node tests/browser/audio_test.js                 # Motorklang-Worklet
node tests/browser/race_test.js                  # Schnelles Rennen bis zum Ergebnis
node tests/browser/practice_test.js              # Phase 2: Setup, Sektoren, Ghost, Track Limits, Telemetrie
node tests/browser/track_test.js                 # Falkenried-Ring, Ideallinie, Rennstart
node tests/browser/phase4_test.js                # Box anfordern, Boxengasse, Service, Safety Car, Pausemenü
node tests/browser/phase5_test.js                # Qualifying → Startaufstellung, Meisterschaft, Wertung
node tests/browser/phase6_test.js                # Wiederholung, Reifenspuren, Nachbearbeitung, Detailstufen
node tests/browser/multi2_test.js                # Mehrspieler: Qualifying, Startaufstellung, Box des Gasts, Strafe, Wiederverbinden
node tests/browser/offline_test.js               # Start ohne Internet (alle Netzanfragen blockiert)
node tests/browser/multi_test.js                 # Mehrspieler: 2 Fenster, LAN-Code, Lobby-Code (lokaler Vermittler), Freunde, Rennen
node tests/browser/career_test.js                # Karriere: Start, Teamwahl, Rennen werten, Social Media, Saisonwechsel
node tests/browser/mods_test.js                  # Mods: Laden, Menü, Fehler, Mod-Strecke fahren
node tests/browser/era_test.js                   # Epochen: Auswahl, Fahrzeugdaten, Optik, HUD, Rennen
ERA=e1990 tools/run-pure.sh tests/physik/test_ai.js   # KI-Runde mit einer bestimmten Epoche
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
