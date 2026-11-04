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
    beispiel_auto.js      ← Beispiel: Auto/Epoche mit eigenem Modell (in mods.js auskommentiert)
    beispiel_oldtimer.js  ← Beispiel: komplett eigenes Modell „Zigarre“ (in mods.js auskommentiert)
    beispiel_gt.js        ← Beispiel: GT-Sportwagen mit geschlossener Karosserie (in mods.js auskommentiert)
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
    ai: null,             // optional: KI-Grenzen; ohne Angabe schätzt das Spiel sie
    aiScale: 0.9 }        // optional: geschätzte KI-Grenzen skalieren (0.3–1.5), z. B. wenn die KI abfliegt;
                          //   auch getrennt: aiScale: { lat: 0.85, brk: 0.8 } (Kurven / Bremsen)

  spec.setup (optional): Grund-Setup des Autos, z. B.
    setup: { brakeBias: 63, springF: 230, springR: 210, arbF: 80, arbR: 70, rideF: 40, rideR: 60 }
    Bereiche: brakeBias 50–65 (% vorne), springF 140–300, springR 120–260 (kN/m),
    arbF 40–200, arbR 20–160, rideF 20–50, rideR 50–100 (mm). Der Spieler kann es im
    Setup-Menü weiter ändern (Setups werden je Strecke und Epoche gespeichert).

Leistung = Drehmoment × Drehzahl: 300 Nm bei 18.000 U/min ≈ 565 kW ≈ 770 PS.
Höchstgeschwindigkeit ergibt sich aus Leistung, Luftwiderstand und dem
höchsten Gang (Übersetzung × 4,0 Achse).
Eigene Fahrer für die Epoche: im Fahrer-Eintrag era: 'meineepoche' setzen,
oder in der Epoche drivers: [ ... ] (ersetzt das automatische Fahrerfeld).

Das Aussehen (Bauform je Baujahr) richtet sich nach year. Ein komplett
eigenes Modell beschreibst du mit model: { ... } – siehe Abschnitt 6b.


6b. EIGENE FAHRZEUGMODELLE (model)
----------------------------------
Das Auto wird genauso gebaut wie das eingebaute Modell: aus Querschnitten
entlang der Fahrzeuglänge (wie Spanten bei einem Boot), Flügelprofilen und
einfachen Formen. Alles sind Zahlen in der Mod-Datei – kein 3D-Programm,
keine Zusatzdateien, funktioniert in jedem Browser (auch Firefox).
Beispiele: beispiel_auto.js (eigene Nase + Teile) und beispiel_oldtimer.js
(komplett eigene „Zigarre“ ohne Flügel).

Koordinaten (Meter, vom Schwerpunkt aus):
  z = Länge:  vorne NEGATIV, hinten positiv   (Nasenspitze ≈ -2.7, Heck ≈ +2.0)
  x = Breite: rechts positiv
  y = Höhe:   oben positiv (Fahrzeugboden ≈ -0.25, Helm ≈ +0.5)
Das Modell ist für 3,40 m Radstand gezeichnet (Vorderachse z ≈ -1.9,
Hinterachse ≈ +1.5) und wird automatisch auf spec.wheelbase und width
gestreckt. Die Räder setzt immer das Spiel – genau dorthin, wo die Physik sie hat.

Querschnitt (Superellipse): { z, w, h, y, n, x }
  w = Breite, h = Höhe, y = Höhe der Mitte, x = seitlicher Versatz (Standard 0)
  n = Eckigkeit: 2 = rund/oval, 3 = abgerundet eckig, 4–6 = kastig
  Die Querschnitte einer Liste müssen von vorne nach hinten sortiert sein
  (z aufsteigend); dazwischen wird weich interpoliert.

Bauteile (alle optional – was fehlt, kommt vom Standardauto 2026):
  nose:        Nase bis zur Cockpit-Vorderkante (Lackierung)
  cockpit:     Cockpitwanne, oben offen (Lackierung)
  engineCover: Motorabdeckung bis zum Heck (Lackierung)
  airbox:      Lufteinlass über dem Kopf          – airbox: [] entfernt ihn
  sidepod:     RECHTER Seitenkasten (x > 0), links wird gespiegelt – sidepod: [] entfernt
  floor:       Unterboden-Umriss [[x, z], ...]
  frontWing:   { span, chord, thick, camber, y, z, flaps }   (flaps 0–2)
  rearWing:    { span, chord, thick, camber, y, z, flaps }   (flaps 0–1)
     span = Spannweite, chord = Profiltiefe, thick = Dicke (Anteil), camber = Wölbung
  look:        Schalter, die sonst das Baujahr bestimmt:
     { nose: 'low'|'mid'|'high', fin, beam, barge, grooves, diffuser,
       frontWing: false, rearWing: false, fw: 0.8, rwX: 0.76, rwY: 0.1 }
     fin = Haifischflosse, beam = Beam-Wing, barge = Bargeboards,
     grooves = Rillenreifen, fw = Frontflügelbreite, rwX/rwY = Heckflügel schmaler/höher
     (bei eigener nose gilt immer deine Form, ohne Höhenvarianten)
  parts:       Zusatzteile (bis 80), jedes mit mat und optional mirror: true
               (dann zusätzlich spiegelbildlich auf der linken Seite):
     { type: 'loft',  sections: [Querschnitte], cap: true }   (Querschnitte dürfen x enthalten → seitlich versetzt, z. B. Kotflügel)
     { type: 'box',   size: [Breite, Höhe, Länge], pos: [x, y, z], rot: [Grad x, y, z], r: Rundung }
     { type: 'wing',  span, chord, thick, camber, pos: [x, y, z], rotX: Grad }
     { type: 'cyl',   r (oder r1 vorne/oben, r2), len, pos, rot }   – Zylinder steht senkrecht;
                      rot: [90, 0, 0] legt ihn längs, [0, 0, 90] quer
     { type: 'sphere', r, pos, scale: [x, y, z] }
     mat: 'paint' (Lackierung mit Startnummer), 'team' / 'team2' (Teamfarbe 1/2),
          'carbon', 'dark', 'chrome', 'glass' (getönt, durchsichtig),
          'light' (Scheinwerfer, leuchtet), 'taillight' (Rückleuchte, hell beim Bremsen)

Tipp: Erst nur eine Kleinigkeit ändern (z. B. nose), im Hauptmenü auf die
Garage schauen, dann weitermachen. Fehler (z. B. falsch sortierte z-Werte)
zeigt das Menü „Mods“ mit genauer Stelle an. Abgefallene Flügel bei Schaden
und die Physik funktionieren auch mit eigenem Modell.


6c. SPORTWAGEN / GESCHLOSSENE AUTOS (GT, Prototypen, Tourenwagen)
-----------------------------------------------------------------
Mit model.body: 'closed' baut das Spiel kein Formel-Cockpit: keine offene
Cockpitwanne, kein Halo, keine Formel-Spiegel und keine sichtbaren Querlenker.
Stattdessen gibt es ein einfaches GT-Cockpit (Armaturenbrett, Mittelkonsole,
Sitzschale, Überrollkäfig), das Lenkrad steht aufrechter.
  driver: { x, y, z }   Sitzposition (Helmmitte). Links sitzen: x ≈ -0.37.
                        Fahrer, Lenkrad und Cockpitkamera folgen automatisch.
Karosserie bauen (Beispiel: beispiel_gt.js):
  - nose = Vorderwagen bis zur Windschutzscheibe, engineCover = Hinterwagen,
    das Mittelstück (Türen) als parts-loft – alle mit hohem n (4–5, kastig).
  - Kabine als loft mit mat: 'glass', das Dach als flacher loft in 'paint'.
  - Kotflügel als eigene loft-Teile mit x-Versatz und mirror: true, damit die
    Räder darunter sichtbar bleiben (der Rumpf selbst schmaler als die Spur).
  - Scheinwerfer: sphere mit scale [1.3, 0.45, 0.45] und mat: 'light';
    Rückleuchten: flache box mit mat: 'taillight'.
  - look: { frontWing: false, fin: false, beam: false, barge: false } und
    rearWing für den Heckflügel (span ≈ 1.7, y ≈ 0.65).
Physik für schwere Autos (≈ 1200–1400 kg): Schwerpunkt cgHeight ≈ 0.38–0.42,
floorY ≈ -0.36 bis -0.40, Spur ≈ 1.65–1.70 m, Bremsbalance nach vorne
(spec.setup.brakeBias ≈ 62–64), weniger Abtrieb (cl gesamt ≈ 1–1.5 m²) und
aiScale ≈ 0.85. Eine fertige KI-Vorlage: vorlagen/PROMPT_GT_Auto.txt


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
  PROMPT_Auto_Epoche.txt    eigenes Fahrzeugkonzept mit Modell (z. B. „Formel 2008“)
  PROMPT_GT_Auto.txt        GT-Sportwagen / geschlossenes Auto (Fahrer links, Lichter)
  PROMPT_Saison_Paket.txt   komplette Mod: mehrere Strecken + Teams + Fahrer
  PROMPT_Fehler_beheben.txt  wenn das Spiel eine Mod mit Fehler meldet

Die Antwort der KI als .js-Datei in diesen Ordner speichern, in mods.js
eintragen, Spiel neu laden.
