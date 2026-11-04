// Beispiel-Mod: Oldtimer-Formelwagen („Zigarre“) mit komplett eigenem Modell und ohne Flügel.
// Zeigt alle Bausteine: Querschnitte (nose, cockpit, engineCover), leere Listen zum Entfernen
// (airbox: [], sidepod: []), look-Schalter und Zusatzteile (parts).
ApexMods.register({
  id: 'beispiel-oldtimer',
  name: 'Beispiel: Zigarre 1960',
  author: 'Apex Formula',
  version: '1.0',
  eras: [{
    id: 'zigarre60', name: '1960', title: 'Zigarre 1960 (Mod)', year: 1990,
    engineName: '2,5-l-Reihenvierzylinder', desc: 'Schmale Reifen, kein Abtrieb, wenig Grip – das Auto rutscht, man lenkt mit dem Gas.',
    halo: false, width: 0.8, cylinders: 6,
    spec: {
      name: 'Z-60', mass: 560, wheelbase: 2.4, cgHeight: 0.36, trackF: 1.35, trackR: 1.35,
      rF: 0.30, rR: 0.31, tyreWidthF: 0.22, tyreWidthR: 0.27,
      engine: { idleRpm: 1500, limitRpm: 8500, curve: [[0, 140], [3000, 200], [5000, 245], [7000, 255], [8000, 235], [8800, 200]], turboTau: [0.02, 0.01] },
      ers: { maxKW: 0 },
      gearbox: { ratios: [2.9, 2.1, 1.65, 1.35, 1.12], shiftTime: 0.12 },
      aero: { mode: 'none', clFW: 0.02, clRW: 0.02, clFloor: 0.05, cdBody: 0.42, cdRW: 0.0, cdFW: 0.0 },
      tyre: { muScale: 0.9 },
    },
    model: {
      // spitze, runde Zigarrenform von der Nase bis zum Heck
      nose: [
        { z: -2.55, w: 0.05, h: 0.05, y: 0.05, n: 2 }, { z: -2.35, w: 0.34, h: 0.30, y: 0.08, n: 2.2 },
        { z: -1.80, w: 0.50, h: 0.46, y: 0.12, n: 2.2 }, { z: -1.20, w: 0.58, h: 0.54, y: 0.14, n: 2.2 }, { z: -0.82, w: 0.62, h: 0.56, y: 0.14, n: 2.2 },
      ],
      cockpit: [
        { z: -0.82, w: 0.62, h: 0.56, y: 0.14, n: 2.2 }, { z: -0.30, w: 0.64, h: 0.56, y: 0.14, n: 2.2 }, { z: 0.16, w: 0.62, h: 0.54, y: 0.14, n: 2.2 },
      ],
      engineCover: [
        { z: 0.12, w: 0.62, h: 0.54, y: 0.14, n: 2.2 }, { z: 0.80, w: 0.56, h: 0.48, y: 0.13, n: 2.2 },
        { z: 1.40, w: 0.38, h: 0.34, y: 0.11, n: 2.1 }, { z: 1.85, w: 0.10, h: 0.10, y: 0.09, n: 2 },
      ],
      airbox: [], sidepod: [],
      floor: [[-0.30, -1.6], [-0.32, 1.5], [0.32, 1.5], [0.30, -1.6]],
      look: { frontWing: false, rearWing: false, diffuser: false, fin: false, beam: false, barge: false, grooves: false },
      parts: [
        // Windschutzscheibe
        { type: 'box', size: [0.42, 0.14, 0.01], pos: [0, 0.48, -0.62], rot: [-35, 0, 0], mat: 'glass' },
        // Kühlergrill vorne
        { type: 'cyl', r: 0.13, len: 0.02, pos: [0, 0.08, -2.36], rot: [90, 0, 0], mat: 'dark' },
        // Auspuffrohre (beidseitig)
        { type: 'cyl', r1: 0.035, r2: 0.05, len: 0.9, pos: [0.27, 0.12, 1.30], rot: [96, 0, 0], mat: 'chrome', mirror: true },
        // Kopfstütze
        { type: 'loft', mat: 'paint', sections: [{ z: 0.12, w: 0.22, h: 0.05, y: 0.44 }, { z: 0.45, w: 0.20, h: 0.20, y: 0.50 }, { z: 1.1, w: 0.06, h: 0.06, y: 0.42 }] },
        // runde Rückspiegel
        { type: 'sphere', r: 0.04, scale: [1, 1, 0.4], pos: [0.30, 0.46, -0.55], mat: 'chrome', mirror: true },
      ],
    },
  }],
});
