APEX FORMULA – MODS
===================

Dieser Ordner („mods“) muss neben der Datei apex-formula.html liegen.
Hier kommen eigene Strecken, Teams, Fahrer und Autos (Epochen) hinein.

  apex-formula.html
  mods/
    mods.js               ← Liste der Mods, die beim Start geladen werden
    README.txt            ← diese Anleitung
    beispiel_strecke.js   ← Beispiel: Strecke (aktiv)
    beispiel_team.js      ← Beispiel: Team + Fahrer (in mods.js auskommentiert)
    beispiel_auto.js      ← Beispiel: Auto/Epoche (in mods.js auskommentiert)
    vorlagen/             ← fertige KI-Prompts zum Erstellen neuer Mods


1. MOD EINBAUEN
---------------
a) Mod-Datei (z. B. meine_strecke.js) in diesen Ordner legen.
b) In mods.js eine Zeile ergänzen:   ApexMods.load('meine_strecke.js');
c) Spiel neu laden (F5). Im Hauptmenü unter „Mods“ siehst du, ob sie geladen
   wurde oder welcher Fehler auftrat.

Alternative in Chrome/Edge: Hauptmenü → „Mods“ → „Mod-Ordner wählen“ und diesen
Ordner auswählen. Dann werden ALLE .js- und .json-Dateien darin geladen
(mods.js wird dafür nicht gebraucht). Der Ordner wird gemerkt; nach einem
Browser-Neustart einmal „erneut verbinden“ klicken.

Hinweis: Mods sind JavaScript-Code. Nur Dateien aus vertrauenswürdigen
Quellen verwenden.


2. AUFBAU EINER MOD-DATEI
-------------------------
Jede Datei ruft genau einmal ApexMods.register({...}) auf:

  ApexMods.register({
    id: 'meine-mod',            // eindeutig, nur Buchstaben/Ziffern/-/_
    name: 'Meine Mod',          // Anzeigename im Menü „Mods“
    author: 'Dein Name',        // optional
    version: '1.0',             // optional
    tracks:  [ ... ],           // optional: Strecken
    teams:   [ ... ],           // optional: Teams
    drivers: [ ... ],           // optional: Fahrer
    eras:    [ ... ],           // optional: Autos / Epochen
  });

Eine Mod darf beliebig viele Einträge jeder Art enthalten (z. B. eine ganze
Saison mit 6 Strecken, 2 Teams und einer Epoche). Statt .js geht auch eine
.json-Datei mit demselben Objekt (nur über „Mod-Ordner wählen“).


3. STRECKE (tracks)
-------------------
Pflicht: id, name und entweder layout (einfach) oder points (fortgeschritten).

  {
    id: 'meinring',                  // eindeutig, klein, ohne Leerzeichen
    name: 'Mein Ring',
    location: 'Musterstadt',         // optional
    character: 'Kurzbeschreibung',   // optional, erscheint im Menü
    timeOfDay: 'afternoon',          // morning | afternoon | evening | dusk
    raceLaps: 55,                    // optional (sonst ≈ 305 km)
    layout: {
      corners: [ [x, z, radius], [x, z, radius, breite], ... ],
      width: 13,                     // Standardbreite in m (8–22)
      start: [x, z],                 // optional: Start/Ziel-Punkt (sonst Mitte der längsten Geraden)
      elevation: [[0, 0], [0.4, 12], [0.7, 3]],   // optional: [Anteil der Runde 0..1, Höhe m]
    },
    corners: [{ name: 'Erste Kurve', at: 0.08 }],  // optional: Kurvennamen (Anteil der Runde)
    scenery: { trees: 800, lake: { at: 0.5, side: 'L', dist: 60, rx: 120, rz: 200 } },  // optional
  }

So funktioniert layout.corners:
  • Die Punkte sind die ECKEN der Strecke in Fahrtrichtung, als geschlossener
    Rundkurs (der letzte Punkt verbindet sich mit dem ersten).
  • x = Osten (m), z = Süden (m). Zwischen den Ecken entstehen Geraden, an jeder
    Ecke ein Kreisbogen mit dem angegebenen Radius (in Metern).
  • Radius-Richtwerte: Haarnadel 12–20, enge Kurve 20–35, mittel 40–80,
    schnell 90–200, Vollgasbogen 250+.
  • Der Radius darf nicht zu groß für die Geraden davor/danach sein – das
    Spiel meldet sonst, welche Ecke zu groß ist und welcher Radius maximal geht.
  • Länge: 1,2 bis 9 km (typisch 3,5–6 km). Die Strecke darf sich nicht selbst
    kreuzen.
  • Die Boxengasse liegt am Start/Ziel – die Gerade dort sollte mindestens
    ≈ 700 m lang sein. Ohne Boxengasse: scenery: { pit: false }.
  • DRS-/Aero-Zonen und Erkennungspunkte setzt das Spiel automatisch auf die
    langen Geraden (eigene Werte: aeroZones: [[von, bis]], overtakeDetection: [..]).

Fortgeschritten (optional):
  sectors: [0, 0.33, 0.67]                       Sektorgrenzen
  defaults: { runoff: 'grass', runoffWidth: 12, barrier: 'guardrail' }
            runoff:  grass | gravel | runoff (Asphalt)
            barrier: guardrail | tyres | wall
  sections: [{ from: 0.2, to: 0.25, side: 'L', runoff: 'gravel', runoffWidth: 20, barrier: 'tyres' }]
            Abschnittsweise andere Auslaufzonen (side: L | R | B = beide)
  scenery: { pit: { from: 0.955, to: 0.045, side: 'R' }, grandstands: [{ at: 0.98, len: 220, side: 'L', rows: 12 }],
             buildings: [{ at: 0.4, side: 'R', dist: 40, kind: 'kurhaus' }], city: true }
  points: [[x, z, höhe, breite, querneigungGrad], ...]   statt layout: Mittellinie alle ~12 m


4. TEAM (teams)
---------------
  { id: 'meinteam', name: 'Mein Team', short: 'MTM',
    colors: ['#c4122f', '#ffffff', '#111111'],   // Basis, Sekundär, Akzent (Lackierung)
    pattern: 'stripe',                            // stripe | split | chevron
    sponsors: ['SPONSOR EINS', 'SPONSOR ZWEI'] }  // frei erfundene Namen!

Ein Team sollte zwei Fahrer haben (siehe drivers), sonst fährt es mit weniger Autos.


5. FAHRER (drivers)
-------------------
  { name: 'Vorname Nachname', nat: 'DEU', num: 44, team: 'meinteam',
    rating: 0.85,        // Stärke 0.3–1.0 (1.0 = Spitzenfahrer)
    aggression: 0.6,     // 0 = vorsichtig, 1 = sehr angriffslustig
    era: 'e2026' }       // optional: Epoche(n), z. B. 'e1990' oder ['e2017','e2020']

Ohne era gilt der Fahrer für das Standardauto (2026). Epochen-IDs:
  e1990 e2000 e2010 e2014 e2017 e2020 e2022 e2026 (und IDs aus Mods)
Das Team muss existieren (eingebautes Team oder eines aus einer Mod).
Eingebaute Teams: aurora, nordlicht, kestrel, atlas, solaris, brennhagen,
monteverde, halcyon, ironvale, tempest


6. AUTO / EPOCHE (eras)
-----------------------
Eine Epoche ist ein Fahrzeugkonzept mit eigener Physik. Nur Werte angeben,
die vom Standardauto (2026) abweichen.

  { id: 'meineepoche', name: '2008', title: 'Meine Formel 2008', year: 2008,
    engineName: '2,4-l-V8', desc: 'Beschreibung im Menü',
    halo: false,          // Halo sichtbar?
    width: 0.95,          // Karosseriebreite (1 = 2026)
    cylinders: 8,         // Motorklang: 6, 8, 10 oder 12
    spec: {
      name: 'MX-08', mass: 690, wheelbase: 3.2, frontWeight: 0.46,
      trackF: 1.48, trackR: 1.42, rF: 0.33, rR: 0.335, tyreWidthF: 0.27, tyreWidthR: 0.34,
      engine: { idleRpm: 5000, limitRpm: 19000,
                curve: [[0,110],[4000,150],[8000,230],[12000,280],[16000,300],[19000,280],[20000,240]] }, // [U/min, Nm]
      ers: { maxKW: 0 },   // 0 = kein Hybrid; sonst z. B. { maxKW: 120, battMJ: 4, lapDeployMJ: 4, maxCrankNm: 200 }
      gearbox: { ratios: [3.2, 2.5, 2.05, 1.72, 1.48, 1.3, 1.16], shiftTime: 0.03 },   // final: 4.0
      brakes: { maxTorque: 9500 },
      aero: { mode: 'none',           // none | drs | active
              clFW: 1.2, clRW: 1.1, clFloor: 1.0,       // Abtrieb (m²)  – 2026: 1.25 / 1.15 / 1.6
              cdBody: 0.56, cdRW: 0.3, cdFW: 0.1 },      // Widerstand (m²) – 2026: 0.55 / 0.36 / 0.10
      tyre: { muScale: 0.95 },        // Reifengrip (1 = 2026, Rillenreifen ≈ 0.87)
    },
    ai: null }            // optional: KI-Grenzen; ohne Angabe schätzt das Spiel sie

Leistung = Drehmoment × Drehzahl: 300 Nm bei 18.000 U/min ≈ 565 kW ≈ 770 PS.
Höchstgeschwindigkeit ergibt sich aus Leistung, Luftwiderstand und dem
höchsten Gang (Übersetzung × 4,0 Achse).
Eigene Fahrer für die Epoche: im Fahrer-Eintrag era: 'meineepoche' setzen,
oder in der Epoche drivers: [ ... ] (ersetzt das automatische Fahrerfeld).


7. RECHTLICHES
--------------
Bitte keine echten Marken, Teams, Fahrer oder Sponsoren verwenden – das Spiel
und seine Inhalte sind frei erfunden. Eigene Mods darfst du frei weitergeben.


8. KI-PROMPTS (Ordner „vorlagen“)
---------------------------------
Im Ordner vorlagen liegen fertige Texte, die du in einen KI-Chat (z. B.
Claude) kopieren kannst. Fülle die Felder in [eckigen Klammern] aus, die KI
antwortet mit einer fertigen Mod-Datei:

  PROMPT_Strecke.txt        neue Strecke (aus Beschreibung oder Skizze)
  PROMPT_Fahrer.txt         Fahrerfeld / einzelne Fahrer
  PROMPT_Team.txt           neues Team mit Lackierung und Fahrern
  PROMPT_Auto_Epoche.txt    eigenes Fahrzeugkonzept (z. B. „Formel 2008“)
  PROMPT_Saison_Paket.txt   komplette Mod: mehrere Strecken + Teams + Fahrer
  PROMPT_Fehler_beheben.txt  wenn das Spiel eine Mod mit Fehler meldet

Die Antwort der KI als .js-Datei in diesen Ordner speichern, in mods.js
eintragen, Spiel neu laden.
