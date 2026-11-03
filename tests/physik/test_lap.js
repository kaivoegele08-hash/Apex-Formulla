const h = PHYS_DT;
const T = new TrackModel(TRACKS.ringpark);
/** Einfacher Testfahrer: Pure Pursuit auf der Mittellinie + Geschwindigkeitsprofil */
function botControl(v, T, k) {
  const spd = Math.max(5, v.vLong);
  const La = 9 + 0.32 * spd;
  const tgt = T.poseAt(v.trackS + La, 0);
  const dx = tgt.x - v.pos.x, dz = tgt.z - v.pos.z;
  const lx = dx * v._right.x + dz * v._right.z, lz = dx * v._fwd.x + dz * v._fwd.z;
  const alpha = Math.atan2(lx, lz);
  const delta = Math.atan(2 * 3.4 * Math.sin(alpha) / La);
  v.input.steer = clamp(delta / (21 * DEG), -1, 1);
  const j = (v.trackIdx + Math.round((6 + spd * 0.25) / T.ds)) % T.N;
  const vt = T.VP[j] * k;
  // feinfühliges Gas: begrenzt durch Hinterachsschlupf, Rampe
  const rs = Math.max(v.wheels[2].sComb, v.wheels[3].sComb);
  let thrT = clamp((vt - v.vLong) * 0.5 + 0.2, 0, 1) * (vt > v.vLong ? 1 : 0);
  thrT = Math.min(thrT, clamp(1.6 - rs, 0, 1));
  v._botThr = (v._botThr || 0); v._botThr += clamp(thrT - v._botThr, -0.08, 0.025);
  v.input.throttle = v._botThr;
  v.input.brake = clamp((v.vLong - vt) * 0.25, 0, 1);
}
for (const k of [1.0, 1.08]) {
  const v = new Vehicle(CAR_SPEC, {}); v.aids.autoShift = true; v.aids.tc = 1; v.setCompound('medium', 80);
  v.placeOnTrack(T, T.length - 120, 0);
  let lap = 0, lapStart = null, lastS = v.trackS, t = 0, maxOff = 0, offT = 0, impacts = 0, laps = [];
  let maxT = 0, minSoc = 1, wear0;
  for (let i = 0; i < 360 * 260; i++) {
    botControl(v, T, k);
    v.step(h); t += h;
    for (const e of v.events) if (e.type === 'impact') impacts++;
    v.events.length = 0;
    if (!isFinite(v.pos.x)) { console.log('NaN!'); break; }
    if (lastS > T.length - 50 && v.trackS < 50) { if (lapStart !== null) laps.push(t - lapStart); lapStart = t; lap++; if (lap === 2) wear0 = v.wheels.map(w => w.tyre.wear); }
    lastS = v.trackS;
    maxOff = Math.max(maxOff, Math.abs(v.lateral)); if (v.offTrackWheels >= 4) offT += h;
    if (lap >= 2) { maxT = Math.max(maxT, ...v.wheels.map(w => w.tyre.tEff)); minSoc = Math.min(minSoc, v.socFrac); }
    if (laps.length >= 3) break;
  }
  const W = v.wheels;
  console.log(`Faktor ${k}: Runden ${laps.map(x => fmtTime(x)).join(' ')} | max Querablage ${maxOff.toFixed(1)} m, neben Strecke ${offT.toFixed(1)} s, Einschläge ${impacts}`);
  console.log(`   Reifen Teff ${W.map(w => w.tyre.tEff.toFixed(0)).join('/')} max ${maxT.toFixed(0)} Zonen VL ${W[0].tyre.tS.map(x => x.toFixed(0)).join('/')} Kern ${W.map(w => w.tyre.tC.toFixed(0)).join('/')}`);
  if (wear0) console.log(`   Verschleiß/Runde ${W.map((w, i) => ((w.tyre.wear - wear0[i]) / Math.max(1, laps.length - 1) * 100).toFixed(2) + '%').join(' ')} Bremsen ${W.map(w => w.brakeTemp.toFixed(0)).join('/')} SoC min ${(minSoc * 100).toFixed(0)}% jetzt ${(v.socFrac * 100).toFixed(0)}%`);
}
