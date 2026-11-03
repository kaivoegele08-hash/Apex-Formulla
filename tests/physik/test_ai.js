// KI allein auf der Strecke: Rundenzeit, Abflüge, Einschläge je Fähigkeitsstufe
const h = PHYS_DT;
const T = new TrackModel(TRACKS.ringpark);
const t0 = performance.now();
const line = new RacingLine(T);
console.log(`Ideallinie: ${(performance.now() - t0).toFixed(0)} ms, max |Ablage| ${Math.max(...line.off.map(Math.abs)).toFixed(1)} m, Profil-Rundenzeit ${fmtTime(line.profile(1).lapTime)} (Mittellinie-Referenz ${fmtTime(T.refLapTime)})`);
const skills = (typeof process !== 'undefined' && process.env.SKILLS ? process.env.SKILLS.split(',').map(Number) : [0.92, 0.96, 1.0]);
for (const skill of skills) {
  const v = new Vehicle(CAR_SPEC, {}); v.setCompound('medium', 85);
  v.placeOnTrack(T, T.length - 150, line.offsetAt(T.length - 150));
  const ai = new AIDriver(v, line, { skill, aggression: 0.5, consistency: 0.9, reaction: 0.2 }, 3);
  const me = { vehicle: v, ai };
  let laps = [], lapStart = null, lastS = v.trackS, t = 0, off4 = 0, impacts = 0, maxImp = 0, resets = 0, worstLat = 0;
  for (let i = 0; i < 360 * 300 && laps.length < 3; i++) {
    ai.control(h, { cars: [me], me, state: 'free', time: t });
    v.step(h); t += h;
    for (const e of v.events) if (e.type === 'impact') { impacts++; maxImp = Math.max(maxImp, e.value); }
    v.events.length = 0;
    if (!isFinite(v.pos.x)) { console.log('NaN!'); break; }
    if (lastS > T.length - 60 && v.trackS < 60) { if (lapStart !== null) laps.push(t - lapStart); lapStart = t; }
    lastS = v.trackS;
    if (v.offTrackWheels >= 4) off4 += h;
    if (lapStart !== null) worstLat = Math.max(worstLat, Math.abs(v.lateral) - T.HW[v.trackIdx]);
    if (ai.needsReset) { resets++; v.placeOnTrack(T, v.trackS, line.offsetAt(v.trackS)); ai.resetAfterRecovery(); }
  }
  console.log(`Stufe ${skill}: Runden ${laps.map(fmtTime).join(' ')} (Profil ${fmtTime(line.profile(skill).lapTime)}) | 4 Räder neben der Strecke ${off4.toFixed(1)} s, Einschläge ${impacts} (max ${maxImp.toFixed(1)} m/s), Rücksetzungen ${resets}, max über Linie ${worstLat.toFixed(1)} m`);
}
