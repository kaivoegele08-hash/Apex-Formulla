// Beispiel-Mod: GT-Sportwagen (Klasse wie GT3) mit geschlossener Karosserie.
// Zeigt: body: 'closed' (ohne Formel-Cockpit, Halo, Querlenker; mit GT-Cockpit), Fahrer links (driver),
// Karosserie aus Querschnitten, Glas-Kabine, Scheinwerfer (light) und Rückleuchten (taillight).
// Name und Optik frei erfunden. Anleitung: README.txt, Abschnitt 6b/6c.
ApexMods.register({
  id: 'beispiel-gt',
  name: 'Beispiel: GT-Sportwagen',
  author: 'Apex Formula',
  version: '1.0',
  eras: [{
    id: 'gtsport', name: 'GT', title: 'GT-Sportwagen (Mod)', year: 2024,
    engineName: '5,2-l-V8 (Saugmotor)', desc: 'Schwerer Sportwagen mit wenig Abtrieb: lange Bremswege, viel mechanischer Grip, ABS und Traktionskontrolle empfohlen.',
    halo: false, width: 1.0, cylinders: 8,
    aiScale: 0.85,      // KI etwas vorsichtiger als geschätzt (schweres Auto, hoher Schwerpunkt)
    spec: {
      name: 'AF-GT', mass: 1300, cgHeight: 0.40, wheelbase: 2.70, frontWeight: 0.46,
      trackF: 1.68, trackR: 1.66, inertiaBox: [1.9, 1.2, 4.4],
      rF: 0.345, rR: 0.355, tyreWidthF: 0.30, tyreWidthR: 0.33,
      floorY: -0.40, plankZ: [-1.1, 1.2], steerLockDeg: 270, maxWheelAngleDeg: 24,
      engine: { idleRpm: 1400, limitRpm: 8800, inertia: 0.20, turboTau: [0.02, 0.01], dragBase: 20, dragK: 40,
                curve: [[0, 300], [2000, 420], [4000, 520], [6000, 560], [7000, 550], [8000, 500], [8800, 440], [9200, 380]] },
      ers: { maxKW: 0 },
      gearbox: { ratios: [3.0, 2.15, 1.7, 1.4, 1.2, 1.05], shiftTime: 0.06, clutchMaxNm: 1200 },
      brakes: { maxTorque: 9000 },
      aero: { mode: 'none', clFW: 0.25, clRW: 0.55, clFloor: 0.5, floorFront: 0.45, cdBody: 0.85, cdRW: 0.12, cdFW: 0.03 },
      tyre: { muScale: 0.9 },
      ffb: { assist: 0.35, maxNm: 20 },
      // Grund-Setup (Spieler kann es im Setup-Menü ändern): Bremsbalance nach vorne, vorne steifer – stabil beim Anbremsen
      setup: { brakeBias: 63, springF: 230, springR: 210, arbF: 80, arbR: 70, rideF: 40, rideR: 60, rearWing: 8 },
    },
    model: {
      body: 'closed',
      driver: { x: -0.37, y: 0.40, z: -0.10 },          // links sitzen
      // Vorderwagen: Stoßfänger → Motorhaube (bis zur Windschutzscheibe); Radhäuser kommen als Kotflügel (parts)
      nose: [
        { z: -2.95, w: 1.60, h: 0.26, y: -0.25, n: 3.2 }, { z: -2.75, w: 1.72, h: 0.40, y: -0.18, n: 3.6 },
        { z: -2.30, w: 1.66, h: 0.48, y: -0.14, n: 4.5 }, { z: -1.60, w: 1.62, h: 0.52, y: -0.12, n: 5 },
        { z: -1.10, w: 1.64, h: 0.58, y: -0.10, n: 5 }, { z: -0.82, w: 1.66, h: 0.62, y: -0.08, n: 5 },
      ],
      // Hinterwagen: Türen → Heck
      engineCover: [
        { z: 0.10, w: 1.68, h: 0.64, y: -0.07, n: 5 }, { z: 0.90, w: 1.66, h: 0.64, y: -0.06, n: 5 },
        { z: 1.60, w: 1.64, h: 0.62, y: -0.05, n: 5 }, { z: 2.20, w: 1.66, h: 0.58, y: -0.04, n: 4.5 },
        { z: 2.55, w: 1.62, h: 0.50, y: -0.02, n: 4 },
      ],
      airbox: [], sidepod: [],
      frontWing: { span: 1.8, chord: 0.3 },
      rearWing: { span: 1.75, chord: 0.32, y: 0.66, z: 2.30, flaps: 1 },
      look: { frontWing: false, fin: false, beam: false, barge: false, grooves: false, diffuser: true },
      parts: [
        // Mittelteil (Türen) zwischen Vorder- und Hinterwagen
        { type: 'loft', mat: 'paint', sections: [{ z: -0.90, w: 1.66, h: 0.62, y: -0.08, n: 5 }, { z: 0.15, w: 1.68, h: 0.64, y: -0.07, n: 5 }] },
        // Kotflügel über den Rädern (rechts, mirror = links): breite Backen, darunter bleiben die Räder sichtbar
        { type: 'loft', mat: 'paint', mirror: true, sections: [
          { z: -2.55, w: 0.20, h: 0.18, y: 0.02, n: 3, x: 0.80 }, { z: -2.25, w: 0.34, h: 0.36, y: 0.08, n: 3, x: 0.86 },
          { z: -1.90, w: 0.36, h: 0.40, y: 0.10, n: 3, x: 0.88 }, { z: -1.50, w: 0.32, h: 0.34, y: 0.08, n: 3, x: 0.85 }, { z: -1.15, w: 0.16, h: 0.18, y: 0.04, n: 3, x: 0.80 }] },
        { type: 'loft', mat: 'paint', mirror: true, sections: [
          { z: 1.00, w: 0.18, h: 0.20, y: 0.04, n: 3, x: 0.80 }, { z: 1.25, w: 0.36, h: 0.40, y: 0.10, n: 3, x: 0.88 },
          { z: 1.55, w: 0.40, h: 0.44, y: 0.12, n: 3, x: 0.90 }, { z: 1.90, w: 0.36, h: 0.38, y: 0.10, n: 3, x: 0.88 }, { z: 2.25, w: 0.20, h: 0.20, y: 0.04, n: 3, x: 0.82 }] },
        // Kabine aus getöntem Glas, darauf das Dach in Wagenfarbe
        { type: 'loft', mat: 'glass', sections: [
          { z: -1.25, w: 1.55, h: 0.06, y: 0.27, n: 3 }, { z: -0.70, w: 1.42, h: 0.40, y: 0.45, n: 3.2 }, { z: -0.20, w: 1.34, h: 0.50, y: 0.50, n: 3.4 },
          { z: 0.40, w: 1.32, h: 0.48, y: 0.49, n: 3.4 }, { z: 1.20, w: 1.40, h: 0.20, y: 0.36, n: 3 }, { z: 1.90, w: 1.55, h: 0.06, y: 0.27, n: 3 }] },
        { type: 'loft', mat: 'paint', sections: [{ z: -0.55, w: 1.18, h: 0.04, y: 0.735, n: 4 }, { z: 0.10, w: 1.26, h: 0.06, y: 0.755, n: 4 }, { z: 0.75, w: 1.20, h: 0.04, y: 0.72, n: 4 }] },
        // Frontsplitter, Seitenschweller, Heckdiffusor-Kante
        { type: 'box', size: [1.9, 0.02, 0.35], pos: [0, -0.37, -2.86], mat: 'carbon' },
        { type: 'box', size: [0.08, 0.07, 2.2], pos: [0.84, -0.36, -0.20], mat: 'carbon', mirror: true },
        // Scheinwerfer und Rückleuchten (leuchten; Rückleuchten hell beim Bremsen)
        { type: 'sphere', r: 0.16, scale: [1.3, 0.45, 0.45], pos: [0.62, -0.04, -2.74], mat: 'light', mirror: true },
        { type: 'box', size: [0.50, 0.06, 0.03], pos: [0.62, 0.10, 2.555], mat: 'taillight', mirror: true },
        // Außenspiegel, Kühlergrill, Motorhauben-Schlitze, Abschlepphaken
        { type: 'box', size: [0.18, 0.08, 0.10], pos: [0.86, 0.32, -0.95], r: 0.03, mat: 'team2', mirror: true },
        { type: 'box', size: [0.9, 0.14, 0.02], pos: [0, -0.18, -2.97], r: 0.03, mat: 'dark' },
        { type: 'box', size: [0.22, 0.01, 0.45], pos: [0.30, 0.265, -1.75], rot: [4, 0, 0], mat: 'dark', mirror: true },
        { type: 'cyl', r: 0.02, len: 0.12, pos: [0.55, -0.20, -3.0], rot: [90, 0, 0], mat: 'team' },
      ],
    },
  }],
});
