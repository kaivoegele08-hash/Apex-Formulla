// Koop-Karriere: Sitze, KI-Feld, Wertung, Zusammenfassung, Saisonwechsel
const ok = (c, m) => { if (!c) { console.log('FEHLER: ' + m); process.exitCode = 1; } else console.log('ok  ' + m); };
const c = Coop.create({ name: 'Host', number: 7, era: 'e2026', seed: 42 });
Career.sign(c, c.offers[0]);
ok(c.phase === 'season' && c.team, 'Host unterschreibt, Saison läuft');
const a = Coop.seat(c, 'AAAA', 'Anna', 7), b = Coop.seat(c, 'BBBB', 'Ben', 12), d = Coop.seat(c, 'CCCC', 'Cem', 0);
ok(a.team === c.team && a.number !== 7, 'Gast 1 im Host-Team, eigene Nummer ' + a.number);
ok(b.team !== c.team && d.team !== c.team, 'weitere Gäste in andere Teams: ' + b.team + ', ' + d.team);
ok(Coop.seat(c, 'AAAA', 'Anna').team === a.team, 'bekannter Gast behält Sitz');
const teams = [c.team, a.team, b.team, d.team], ai = Coop.aiDrivers(c, teams);
ok(ai.length + 4 === 2 * TEAMS.length, 'Feld: ' + ai.length + ' KI + 4 Menschen');
// Rennen werten: Ben gewinnt, Host Zweiter
const guests = { 1: 'BBBB', 2: 'AAAA', 3: 'CCCC' };
const mk = (name, team, extra) => ({ name, team, e: Object.assign({ driver: { name }, team }, extra) });
const cls = [mk('Ben', b.team, { remote: true, netId: 1 }), mk('Host', c.team, { player: true }), mk('Anna', a.team, { remote: true, netId: 2 })].concat(ai.map(x => mk(x.name, x.team, { driver: x }))).concat([mk('Cem', d.team, { remote: true, netId: 3 })]);
cls.forEach(r => { r.player = !!r.e.player; });
Coop.afterRace(c, cls, null, 'Test', id => guests[id]);
ok(b.stats.wins === 1 && b.stats.points === POINTS[0], 'Ben: Sieg und Punkte');
ok(c.stats.races === 1, 'Host-Statistik gezählt');
const s = Coop.summary(c);
ok(s.round === 1 && s.humans.length === 4, 'Zusammenfassung: Runde ' + s.round + ', ' + s.humans.length + ' Menschen');
ok(s.table[0].name === 'Ben' && s.table[0].human, 'WM-Führender Ben (Mensch): ' + JSON.stringify(s.table.slice(0, 3)));
// Rest der Saison simulieren
while (c.phase === 'season') Coop.afterRace(c, cls, null, 'Test', id => guests[id]);
ok(c.phase === 'offseason' && b.stats.titles === 1, 'Saisonende, Ben Weltmeister');
const yr = c.year; Coop.nextSeason(c);
ok(c.phase === 'season' && c.year === yr + 1 && c.coop.humans.BBBB.team === b.team, 'neue Saison, Gäste behalten Sitz');
console.log(JSON.stringify(c).length + ' Bytes Spielstand');
