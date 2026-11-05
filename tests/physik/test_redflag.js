// Rote Flagge: auslösen (Massenunfall), Langsamfahrt, Stillstand, Reparatur, Neustart hinter dem Safety Car
const h = PHYS_DT, ok = (c, m) => { if (!c) { console.log('FEHLER: ' + m); process.exitCode = 1; } else console.log('ok  ' + m); };
const T = new TrackModel(TRACKS.ringpark), line = new RacingLine(T);
const field = buildField({ playerTeam: 'aurora', size: 12 }).filter(e => !e.player);
for (const e of field) e.compound = 'medium';
const race = new RaceSession({ track: T, line, laps: 8, entries: field, damage: 'full' });
const ev = []; Events.on('race:red', (p, w) => ev.push(`${race.time.toFixed(0)}s ${p} ${w || ''}`));
while (race.time < 90) race.step(h);
const lapsBefore = race.entries.map(e => e.timing.laps.length);
race.entries[3].vehicle.health.fw = 0.2;
for (const e of race.entries.slice(-3)) race._retire(e, 'Test');
ok(race.red && race.red.phase === 'slow', 'rote Flagge nach 3 Wracks');
let maxStop = 0;
while (race.time < 90 + 40) { race.step(h); if (race.red && race.red.phase === 'stop' && race.red.t > 6) maxStop = Math.max(maxStop, ...race.entries.filter(e => e.active && !e.retired && !e.pitting && !e.vehicle.inPitLane).map(e => e.vehicle.speed)); }
ok(maxStop < 3, 'alle stehen in der Unterbrechung (max ' + maxStop.toFixed(1) + ' m/s)');
ok(!race.red && race.sc && race.sc.kind === 'sc', 'Neustart hinter dem Safety Car');
ok(race.entries[3].vehicle.health.fw === 1, 'Schaden repariert');
ok(race.entries.slice(-3).every(e => !e.active), 'Wracks geborgen');
ok(race.entries.every((e, i) => e.timing.laps.length >= lapsBefore[i]), 'Rundenzählung intakt');
while (!race.over && race.time < 900) race.step(h);
ok(race.over, 'Rennen beendet: ' + ev.join(' | '));
