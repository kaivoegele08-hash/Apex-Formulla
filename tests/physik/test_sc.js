// Safety Car und VSC: Feld schließt auf, keine Überholmanöver, Neustart, Unfallfolgen
const h = PHYS_DT, T = new TrackModel(TRACKS[process.env.TRACK || 'falkenried']), line = new RacingLine(T);
let seed = +(process.env.SEED || 7); const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const field = buildField({ playerTeam: 'aurora', size: 20, rng }).filter(e => !e.player);
const race = new RaceSession({ track: T, line, laps: 7, entries: field, damage: 'full', rng, mandatory: false });
const log = []; Events.on('race:msg', (t) => log.push(`${(race.time - (race.greenAt || 0)).toFixed(0)}s ${t}`));
let scDone = false, vscDone = false, spreadAtSC = null, spreadAtRestart = null, passesUnderSC = 0, prevOrder = null, hard = 0;
const orig = CarContacts.resolve.bind(CarContacts);
const det = [];
CarContacts.resolve = (en, L, cb) => orig(en, L, (a, b, sp, x, z) => { if (sp > 4 && race.sc) { hard++; if (det.length < 14) { let ds = b.vehicle.trackS - a.vehicle.trackS; if (ds < -L/2) ds += L; if (ds > L/2) ds -= L; const back = ds > 0 ? a : b, front = ds > 0 ? b : a; det.push(`${race.sc.phase} ${sp.toFixed(1)}m/s s=${a.vehicle.trackS.toFixed(0)} hinten ${back.name} ${back.vehicle.speedKmh.toFixed(0)}km/h cap ${back.ai.flagCap} lead=${back.ai.leader ? back.ai.leader.name : '-'} lds=${back.ai.leadDs.toFixed(0)} fV=${(back.ai.followV*3.6).toFixed(0)} | vorne ${front.name} ${front.vehicle.speedKmh.toFixed(0)}km/h wreck=${!!front.wreck} dl=${(front.vehicle.lateral-back.vehicle.lateral).toFixed(1)} ds=${Math.abs(ds).toFixed(1)}`); } } cb(a, b, sp, x, z); });
const spread = () => { const o = race.order.filter(e => !e.retired); const gaps = []; for (let i = 1; i < o.length; i++) gaps.push(Math.round(o[i - 1].distance - o[i].distance)); return (o[0].distance - o[o.length - 1].distance).toFixed(0) + ' (Abstände: ' + gaps.join(' ') + ')'; };
while (!race.over && race.time < 1400) {
  race.step(h);
  const lead = race.order && race.order[0];
  if (lead && !scDone && lead.timing.laps.length >= 2) { scDone = true; spreadAtSC = spread(); race._startSC('sc'); }
  if (lead && scDone && !vscDone && !race.sc && lead.timing.laps.length >= 5) { vscDone = true; race._startSC('vsc'); }
  if (race.sc && race.sc.phase === 'restart' && !spreadAtRestart) spreadAtRestart = spread();
  if (race.sc && race.sc.phase !== 'ending' && race.order && Math.round(race.time * 20) % 20 === 0) {
    const o = race.order.filter(e => !e.retired && !e.pitting && !e.vehicle.inPitLane).map(e => e.idx);
    if (prevOrder) for (let i = 0; i < o.length; i++) { const p = prevOrder.indexOf(o[i]); if (p > i) passesUnderSC += p - i; }
    prevOrder = o;
  } else prevOrder = null;
}
console.log(`Feldabstand Spitze–Ende: bei SC-Beginn ${spreadAtSC} m, beim Neustart ${spreadAtRestart} m`);
console.log(`Positionswechsel unter SC/VSC: ${passesUnderSC} · harte Kontakte unter SC/VSC: ${hard} · Rennende ${race.over}`);
console.log(det.join('\n'));
console.log(log.filter(m => /SAFETY|VSC|GRÜN|herein|Strafe|ausgeschieden/.test(m)).join('\n'));
