// Lizenzrennen in Node: Spielerauto wird von einer (schwächeren) KI gefahren → Vorfälle zählen, Wertung
const h = PHYS_DT, ok = (c, m) => { if (!c) { console.log('FEHLER: ' + m); process.exitCode = 1; } else console.log('ok  ' + m); };
const p = License.create('Test'), sid = process.env.SERIES || 'f4cup', s = License.series(sid);
applyEra(License.eraFor(s, 0)); const ev = License.makeEvent(p, sid); ev.laps = +(process.env.LAPS || 3);
const T = new TrackModel(TRACKS[ev.track]), line = new RacingLine(T);
const rows = ev.opp.map(o => ({ driver: o, team: o.team, number: o.num, ir: o.ir, compound: 'soft' }));
rows.push({ driver: { name: 'Test', num: 77, team: 'aurora', rating: 1 }, team: 'aurora', number: 77, player: true, ir: ev.myIR, compound: 'soft' });
rows.sort((a, b) => b.ir - a.ir);
const race = new RaceSession({ track: T, line, laps: ev.laps, entries: rows, damage: 'full', aiStrength: ev.strength });
const me = race.player; me.ai = new AIDriver(me.vehicle, line, { skill: 0.94, aggression: 0.7, consistency: 0.55, reaction: 0.25 }, 11);
const incs = []; Events.on('race:incident', (e, add, kind, n) => incs.push(`${race.time.toFixed(0)}s ${add}x ${kind} (=${n})`));
while (!race.over && race.time < 60 + ev.laps * 160) race.step(h);
const I = me.inc || { n: 0, list: [] };
console.log(`Start P${rows.findIndex(r => r.player) + 1}, SOF ${ev.sof}, Stärke ${ev.strength}, Vorfälle ${I.n}x: ${incs.slice(0, 12).join(' | ')}`);
const sum = License.afterRace(p, ev, race.classification(), I.n, me.timing.laps.length, License.cornersOf(T), T.name);
console.log(JSON.stringify(sum));
ok(race.over, 'Rennen beendet');
ok(I.list.every(x => x.pts >= 0), 'Vorfallliste plausibel (' + I.list.length + ' Einträge)');
ok(sum.ir !== ev.myIR && Math.abs(sum.dSR) <= 0.9, `Wertung: P${sum.pos} iR ${sum.ir} (${sum.dIR}) SR ${sum.sr} (${sum.dSR})`);
