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
  }],
});
