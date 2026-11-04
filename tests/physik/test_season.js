// Qualifying-Schätzung und Meisterschaftswertung
const T = new TrackModel(TRACKS[(typeof process !== 'undefined' && process.env.TRACK) || 'ringpark']);
const line = new RacingLine(T);
let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const field = buildField({ playerTeam: 'aurora', size: 20, rng });
for (const w of [0, 0.5, 0.85]) {
  const g = simulatedGrid(T, line, field, { water: w, rng });
  const ts = g.filter(e => e.qTime).map(e => e.qTime);
  console.log(`Nässe ${w}: Pole ${fmtTime(ts[0])} (${g[0].driver.name}), Letzter ${fmtTime(ts[ts.length - 1])}, Spanne ${(ts[ts.length - 1] - ts[0]).toFixed(2)} s · Referenz 100 % ${fmtTime(refLapTime(T, line, w))}`);
}
// Quali-Sitzung ohne Fahrt: Uhr läuft ab → Ende
const q = new QualiSession(T, field, { line, minutes: 5, rng });
const fake = { trackS: 100, speed: 0, limitWheels: 0, inPitLane: false };
let ended = null; Events.on('quali:end', (st) => { ended = st; });
for (let t = 0; t < 301; t += 0.1) q.step(0.1, fake);
console.log(`Quali-Ende: ${q.phase}, Pole ${ended[0].name} ${fmtTime(ended[0].time)}, Spieler Platz ${ended.findIndex(r => r.player) + 1} (keine Zeit)`);
const grid = q.grid();
console.log('Startplatz 1-3:', grid.slice(0, 3).map(e => e.driver.name + (e.profile ? ` (skill ${e.profile.skill.toFixed(3)})` : '')).join(', '));
// Wertung
const s = Season.create({ playerName: 'Kai' });
const cls = grid.map((e, i) => ({ e: { player: !!e.player }, name: e.driver.name, team: e.team, retired: i === 19 }));
const fastest = { entry: cls[2].e };
Season.award(s, 'ringpark', cls, fastest);
Season.award(s, 'falkenried', cls.slice().reverse(), null);
const tbl = Season.driverTable(s);
console.log('Fahrer:', tbl.slice(0, 4).map(d => `${d.name} ${d.pts}`).join(' · '), '| Teams:', Season.teamTable(s).slice(0, 3).map(t => `${t.id} ${t.pts}`).join(' · '), '| Runde', s.round);
const tot = tbl.reduce((a, d) => a + d.pts, 0);
console.log(tot === 102 + 76 ? 'Punktsumme OK' : 'Punktsumme FALSCH ' + tot);
