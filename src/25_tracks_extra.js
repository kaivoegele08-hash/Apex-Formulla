// ============================================================================
//  WEITERE STRECKEN (1.0) – aus Eckpunkten erzeugt wie Mod-Strecken, aber fest eingebaut.
//  Alle Namen und Orte frei erfunden.
// ============================================================================

const EXTRA_TRACKS = [
  {
    id: 'sandmeer',
    name: 'Sandmeer-Ring',
    location: 'Oase Qerim',
    character: 'Nachtrennen unter Flutlicht in der Wüste: die längste Gerade im Kalender, eine harte Bremszone in Kurve 1, schnelle Wüstenbögen und eine Schikane vor der Oase.',
    timeOfDay: 'night',
    layout: {
      corners: [[0, 0, 60], [1200, 0, 25], [1260, 300, 90], [1000, 520, 40], [1150, 800, 120], [900, 1050, 30], [700, 1010, 20], [640, 1060, 20], [500, 950, 70], [350, 650, 25], [80, 700, 55], [-150, 400, 80]],
      width: 14,
      elevation: [[0, 0], [0.3, 3], [0.55, 6], [0.8, 2]],
    },
    corners: [{ name: 'Dünentor', at: 0.3 }, { name: 'Karawane', at: 0.5 }, { name: 'Oasen-Schikane', at: 0.66 }, { name: 'Sternwarte', at: 0.86 }],
    defaults: { runoff: 'runoff', runoffWidth: 18, barrier: 'tyres' },
    autoKerbs: { minRadius: 300 },
    scenery: { trees: 120, sand: true, grandstands: [{ at: 0.985, len: 260, side: 'L', rows: 14 }, { at: 0.3, len: 120, side: 'L', rows: 10 }] },
  },
  {
    id: 'kesselberg',
    name: 'Kesselberg-Ring',
    location: 'Kesselberg',
    character: 'Schneller Waldkurs mit über 30 m Höhenunterschied: weite Bögen bergauf, eine blinde Kuppe und die Kesselkurve bergab – Mut wird belohnt, Fehler enden im Kies.',
    timeOfDay: 'morning',
    layout: {
      corners: [[0, 0, 80], [900, -50, 200], [1500, 200, 60], [1600, 600, 150], [1300, 900, 35], [950, 750, 90], [700, 1050, 45], [300, 1000, 160], [-100, 700, 40], [-250, 350, 120]],
      width: 13,
      elevation: [[0, 0], [0.2, 9], [0.4, 20], [0.55, 13], [0.75, 5], [0.9, 1]],
    },
    corners: [{ name: 'Waldbogen', at: 0.18 }, { name: 'Kuppe', at: 0.4 }, { name: 'Kesselkurve', at: 0.55 }, { name: 'Försterei', at: 0.8 }],
    defaults: { runoff: 'gravel', runoffWidth: 14, barrier: 'guardrail' },
    autoKerbs: { minRadius: 320 },
    sections: [{ from: 0, to: 1, side: 'B', astro: 1.6 }],   // Kunstrasen vor dem Kies (Kurvenausgänge nutzen die volle Breite)
    scenery: { trees: 1600, grandstands: [{ at: 0.985, len: 200, side: 'L', rows: 12 }, { at: 0.55, len: 90, side: 'L', rows: 8 }] },
  },
  {
    id: 'seenland',
    name: 'Seenland-Parcours',
    location: 'Seenland',
    character: 'Kurzer, verwinkelter Kurs am See: enge Ecken, eine Schlängelpassage und kaum Zeit zum Durchatmen. Präzision vor Mut – hier entscheidet das Qualifying.',
    timeOfDay: 'dusk',
    layout: {
      corners: [[0, 0, 40], [700, 0, 30], [800, 250, 20], [600, 400, 60], [750, 650, 25], [450, 800, 35], [200, 650, 18], [250, 400, 70], [120, 330, 25], [40, 380, 25], [-50, 300, 30], [-100, 120, 45]],
      width: 12,
      elevation: [[0, 0], [0.4, 4], [0.7, 1]],
    },
    corners: [{ name: 'Bootshaus', at: 0.25 }, { name: 'Steg', at: 0.45 }, { name: 'Schlängel', at: 0.78 }],
    defaults: { runoff: 'grass', runoffWidth: 10, barrier: 'guardrail' },
    autoKerbs: { minRadius: 260 },
    scenery: { trees: 900, lake: { at: 0.5, side: 'R', dist: 70, rx: 140, rz: 220 } },
  },
];
for (const t of EXTRA_TRACKS) {
  const def = completeTrackDef(t); def.mod = false;
  TRACKS[def.id] = def; if (!TRACK_ORDER.includes(def.id)) TRACK_ORDER.push(def.id);
}
