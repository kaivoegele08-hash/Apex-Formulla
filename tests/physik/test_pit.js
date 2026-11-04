// Boxenstopp: Phasen, Zeitverlust, keine Mauertreffer, Service (Reifen, Reparatur, Strafe)
const h = PHYS_DT;
for (const tid of (process.env.TRACK ? [process.env.TRACK] : ['ringpark', 'falkenried'])) {
  const T = new TrackModel(TRACKS[tid]), line = new RacingLine(T), D = DRIVERS[0];
  const race = new RaceSession({ track: T, line, laps: 4, entries: [{ driver: D, team: D.team, number: D.num, compound: 'soft', profile: { skill: 0.98, aggression: 0, consistency: 1, reaction: 0.2 } }], mandatory: false });
  const e = race.entries[0], v = e.vehicle;
  let walls = 0, phases = [], last = '', lapT = [], maxPitV = 0, inLaneT = 0, svc = null;
  const wl = []; v.onImpact = (sp) => { if (sp > 1) { walls++; wl.push(`${(e.ai.pit ? e.ai.pit.phase : 'Strecke')} s=${v.trackS.toFixed(0)} rel=${T.pitRel(v.trackS).toFixed(0)} lat=${v.lateral.toFixed(1)} BD=${T.BD[T.pit.s][v.trackIdx].toFixed(1)} ${sp.toFixed(1)}m/s`); } };
  Events.on('race:service', (en, t, info) => { const rep = info.repair; svc = { t, comp: v.compound, wear: v.wheels[0].tyre.wear, rep, fw: v.health.fw }; });
  e.timing.on((type, d) => { if (type === 'lap') lapT.push(d.time); });
  while (!race.over && race.time < 600) {
    if (e.timing.laps.length === 1 && !e.pitPlan && !e.pitting && e.pitStops === 0) { e.pitPlan = { compound: 'hard', repair: true, why: 'Test' }; v.health.fw = 0.8; e.penalty = 5; }
    race.step(h);
    const ph = e.ai.pit ? e.ai.pit.phase : 'Strecke';
    if (ph !== last) { phases.push(`${ph}@${v.trackS.toFixed(0)}`); last = ph; }
    if (v.inPitLane) { inLaneT += h; if (e.ai.pit && e.ai.pit.phase === 'lane' && T.pitRel(v.trackS) > T.pit.open * T.ds + 30) maxPitV = Math.max(maxPitV, v.speedKmh); }
  }
  console.log(`${T.name}: Phasen ${phases.join(' → ')}`);
  console.log(`   Runden ${lapT.map(fmtTime).join(' ')} · Zeit in der Gasse ${inLaneT.toFixed(1)} s · max ${maxPitV.toFixed(1)} km/h in der Gasse · Mauertreffer ${walls}`);
  if (wl.length) console.log('   Treffer: ' + wl.join(' | '));
  console.log(`   Service: ${svc ? `${svc.t.toFixed(1)} s, Mischung ${svc.comp}, Verschleiß ${svc.wear}, Reparatur ${svc.rep} (Frontflügel ${svc.fw})` : 'KEINER'} · Strafe abgesessen ${e.penaltyServed} s · Stopps ${e.pitStops}`);
}
