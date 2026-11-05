// Lizenzmodus: SOF, iRating-Formel, Safety Rating, Auf-/Abstieg, Wochenplan, Ereignis
const ok = (c, m) => { if (!c) { console.log('FEHLER: ' + m); process.exitCode = 1; } else console.log('ok  ' + m); };
const p = License.create('Kai');
ok(License.sof([1350, 1350, 1350]) === 1350, 'SOF gleiches Feld = 1350');
const eq = Array(20).fill(1500);
const win = License.irDelta(1500, 0, eq), last = License.irDelta(1500, 19, eq), mid = License.irDelta(1500, 9, eq);
ok(win > 80 && win < 120 && last < -80 && Math.abs(mid) <= 6, `iRating gleiches Feld: Sieg ${win}, Letzter ${last}, Mitte ${mid}`);
const strong = Array(20).fill(3000); strong[0] = 1500;
ok(License.irDelta(1500, 19, strong) > -60, 'Letzter gegen viel Stärkere verliert weniger als 100: ' + License.irDelta(1500, 19, strong));
ok(License.srDelta(0, 60, 0) > 0.1 && License.srDelta(0, 60, 8) < -0.1, `SR: sauber ${License.srDelta(0, 60, 0)}, 8x ${License.srDelta(0, 60, 8)}`);
ok(License.strengthFor(1350) > 0.9 && License.strengthFor(1350) < 0.93 && License.strengthFor(5000) > 1.02, 'Stärke aus SOF ' + License.strengthFor(1350));
const s = License.series('f4cup');
ok(License.allowed(p, s) && !License.allowed(p, License.series('f3')), 'Rookie darf F4, nicht F3');
const sch = License.schedule(p, s);
ok(sch.length === 12 && sch[0].now && TRACKS[sch[0].track], 'Wochenplan 12 Wochen: ' + sch.slice(0, 4).map(x => x.track).join(','));
applyEra('f4');
let ev = License.makeEvent(p, 'f4cup', () => 0.37);
ok(ev.opp.length === 15 && ev.sof > 800 && ev.sof < 2200 && ev.era === 'f4', `Ereignis: ${ev.opp.length} Gegner, SOF ${ev.sof}, Stärke ${ev.strength}, Strecke ${ev.track}`);
// Saubere Siege → Aufstieg nach 4 Rennen (oder Fast-Track)
const T = new TrackModel(TRACKS[ev.track]), cpl = License.cornersOf(T);
ok(cpl >= 6 && cpl <= 25, 'Kurven je Runde ' + cpl);
let sum;
for (let k = 0; k < 6 && p.cats.formel.lvl === 0; k++) {
  ev = License.makeEvent(p, 'f4cup');
  const cls = [{ e: { player: true }, name: 'Kai' }].concat(ev.opp.map(o => ({ e: {}, name: o.name })));
  sum = License.afterRace(p, ev, cls, 0, 6, cpl, 'Test');
  console.log(`    Rennen ${k + 1}: iR ${sum.ir} (${sum.dIR > 0 ? '+' : ''}${sum.dIR}) SR ${sum.lic} ${sum.sr} (${sum.dSR}) ${sum.change}`);
}
ok(p.cats.formel.lvl === 1 && sum.change === 'up', 'Aufstieg zur D-Lizenz');
ok(p.ir.f4 > 1600, 'iRating gestiegen: ' + p.ir.f4);
// Viele Vorfälle → Abstieg
for (let k = 0; k < 12 && p.cats.formel.lvl === 1; k++) { ev = License.makeEvent(p, 'f4cup'); const cls = ev.opp.map(o => ({ e: {}, name: o.name })).concat([{ e: { player: true }, name: 'Kai', retired: true }]); sum = License.afterRace(p, ev, cls, 14, 3, cpl); }
ok(p.cats.formel.lvl === 0 && sum.change === 'down' && p.cats.formel.sr === 3, 'Abstieg nach vielen Vorfällen');
ok(License.week(p, s).week >= 1 && p.history.length > 5, 'Woche weiter: ' + JSON.stringify(License.week(p, s)));
ok(License.fix(JSON.parse(JSON.stringify(p))).ir.klassik === p.ir.klassik, 'Speichern/Laden');
