// Rennklassen: KI-Runde je Klasse (Rundenzeit, Abflüge, Höchsttempo) auf mehreren Strecken
const h = PHYS_DT, ok = (c, m) => { if (!c) { console.log('FEHLER: ' + m); process.exitCode = 1; } else console.log('ok  ' + m); };
const tracks = (process.env.TRACKS || 'ringpark,falkenried,alpental').split(',');
for (const id of (process.env.CLASSES || 'f4,f3,f2,gt3,e2026').split(',')) {
  applyEra(id);
  const out = [];
  for (const tr of tracks) {
    const T = new TrackModel(TRACKS[tr]), line = new RacingLine(T), L = T.length;
    const v = new Vehicle(CAR_SPEC, {}); v.setCompound('medium', 85); v.placeOnTrack(T, L - 150, line.offsetAt(L - 150));
    const ai = new AIDriver(v, line, { skill: 1, aggression: 0.5, consistency: 1, reaction: 0.2 }, 3), me = { vehicle: v, ai };
    let ls = null, lap = null, last = v.trackS, t = 0, resets = 0, vmax = 0, off = 0;
    for (let i = 0; i < 360 * 260 && lap === null; i++) {
      ai.control(h, { cars: [me], me, state: 'free', time: t }); v.step(h); t += h; v.events.length = 0;
      if (last > L - 60 && v.trackS < 60) { if (ls !== null) lap = t - ls; ls = t; } last = v.trackS;
      vmax = Math.max(vmax, v.vLong * 3.6); if (v.offTrackWheels >= 3) off += h;
      if (ai.needsReset) { resets++; v.placeOnTrack(T, v.trackS, line.offsetAt(v.trackS)); ai.resetAfterRecovery(); }
    }
    out.push(`${tr} ${lap ? lap.toFixed(2) : '—'}s R${resets} off${off.toFixed(1)} ${vmax.toFixed(0)}km/h`);
    ok(lap && resets === 0, `${id.padEnd(6)} ${out[out.length - 1]}`);
  }
}
