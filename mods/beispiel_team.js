// Beispiel-Mod: ein neues Team mit zwei Fahrern (für das Standardauto 2026 und für 1990).
ApexMods.register({
  id: 'beispiel-team',
  name: 'Beispiel: Team Blitzlicht',
  author: 'Apex Formula',
  version: '1.0',
  teams: [{
    id: 'blitzlicht', name: 'Blitzlicht Racing', short: 'BLZ',
    colors: ['#ffd400', '#141414', '#ffffff'],     // Basis, Sekundär, Akzent
    pattern: 'chevron',                            // stripe | split | chevron
    sponsors: ['VOLTANO', 'KAMERA X'],
  }],
  drivers: [
    { name: 'Mira Falkner', nat: 'DEU', num: 51, team: 'blitzlicht', rating: 0.86, aggression: 0.55 },
    { name: 'Joel Sandvik', nat: 'NOR', num: 52, team: 'blitzlicht', rating: 0.74, aggression: 0.7 },
    { name: 'Enzo Rapallo', nat: 'ITA', num: 53, team: 'blitzlicht', rating: 0.8, aggression: 0.6, era: 'e1990' },
  ],
});
