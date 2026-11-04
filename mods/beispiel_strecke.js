// Beispiel-Mod: eine Strecke aus Eckpunkten. Kopieren, umbenennen, Werte ändern
// und den Dateinamen in mods.js eintragen. Format: siehe README.txt.
ApexMods.register({
  id: 'beispiel-seeblick',
  name: 'Beispiel: Seeblick-Ring',
  author: 'Apex Formula',
  version: '1.0',
  tracks: [{
    id: 'seeblick',
    name: 'Seeblick-Ring',
    location: 'Seeblick',
    character: 'Beispielstrecke aus der Mod-Vorlage: lange Start-Ziel-Gerade, schnelle Bögen am See, eine enge Spitzkehre.',
    timeOfDay: 'afternoon',
    layout: {
      // [x, z, Kurvenradius in m (, Breite in m)] in Fahrtrichtung; x = Osten, z = Süden
      corners: [[0, 0, 45], [950, 0, 32], [1050, 260, 70], [760, 470, 24], [820, 820, 90], [330, 930, 38], [120, 620, 18], [-160, 480, 50]],
      width: 13,
      // Höhenprofil: [Anteil der Runde 0…1, Höhe in m]
      elevation: [[0, 0], [0.3, 6], [0.55, 14], [0.8, 4]],
    },
    corners: [{ name: 'See-Eck', at: 0.25 }, { name: 'Spitzkehre', at: 0.78 }],
    scenery: { trees: 800, lake: { at: 0.45, side: 'R', dist: 70, rx: 160, rz: 260 } },
  }],
});
