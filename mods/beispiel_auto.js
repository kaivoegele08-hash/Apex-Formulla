// Beispiel-Mod: eine eigene Epoche (Fahrzeugkonzept). Alle nicht angegebenen Werte kommen
// vom Standardauto 2026. Fehlen KI-Grenzen (ai), schätzt das Spiel sie aus Grip, Abtrieb und Masse.
ApexMods.register({
  id: 'beispiel-auto',
  name: 'Beispiel: Nachwuchsformel',
  author: 'Apex Formula',
  version: '1.0',
  eras: [{
    id: 'nachwuchs', name: 'Junior', title: 'Nachwuchsformel', year: 2024,
    engineName: '3,4-l-V6 (Saugmotor)', desc: 'Leichter Einsteigerwagen: wenig Leistung, wenig Abtrieb, kein ERS – ideal zum Üben.',
    halo: true, width: 0.92, cylinders: 6,
    spec: {
      name: 'NJ-24', mass: 690, wheelbase: 3.0,
      engine: { idleRpm: 3000, limitRpm: 9000, curve: [[0, 200], [3000, 320], [5000, 390], [7000, 420], [8500, 400], [9000, 370], [9500, 300]], turboTau: [0.02, 0.01] },
      ers: { maxKW: 0 },
      gearbox: { ratios: [3.4, 2.6, 2.1, 1.75, 1.5, 1.32], shiftTime: 0.06 },
      aero: { mode: 'drs', clFW: 0.8, clRW: 0.9, clFloor: 0.9, straightFW: 1, straightRW: 0.5, cdStraightFW: 1, cdStraightRW: 0.45 },
      tyre: { muScale: 0.95 },
    },
    // Eigenes Aussehen – gebaut wie das Originalmodell: Querschnitte entlang der Länge (z, vorne negativ)
    // und Zusatzteile. Was fehlt, kommt vom Standardauto. Anleitung: README.txt, Abschnitt „Eigene Fahrzeugmodelle“.
    model: {
      // breite, flache „Schaufelnase“
      nose: [
        { z: -2.70, w: 0.34, h: 0.06, y: -0.10, n: 4 }, { z: -2.30, w: 0.36, h: 0.12, y: -0.07, n: 4 },
        { z: -1.70, w: 0.42, h: 0.26, y: 0.01, n: 3.6 }, { z: -1.10, w: 0.52, h: 0.38, y: 0.07, n: 3.4 }, { z: -0.82, w: 0.60, h: 0.47, y: 0.085, n: 3.6 },
      ],
      rearWing: { span: 0.92, chord: 0.30, y: 0.56 },
      look: { fin: false, beam: false, barge: false },
      parts: [
        // Überrollbügel hinter dem Kopf (Teamfarbe 2)
        { type: 'box', size: [0.08, 0.26, 0.10], pos: [0, 0.60, 0.10], rot: [-12, 0, 0], r: 0.02, mat: 'team2' },
        // seitliche Lufteinlässe (beidseitig durch mirror)
        { type: 'cyl', r: 0.07, len: 0.05, pos: [0.52, 0.06, -0.55], rot: [90, 0, 0], mat: 'dark', mirror: true },
        // Endrohr
        { type: 'cyl', r: 0.045, len: 0.18, pos: [0, 0.10, 2.0], rot: [90, 0, 0], mat: 'chrome' },
      ],
    },
  }],
});
