const h = PHYS_DT;
function mk(setup) { const v = new Vehicle(CAR_SPEC, setup || {}); v.placeAt(0, 0, 0, 0); return v; }
function run(v, sec, fn) { const n = Math.round(sec / h); for (let i = 0; i < n; i++) { if (fn) { if (fn(v, i * h) === false) return i * h; } v.step(h); v.events.length = 0; if (!isFinite(v.pos.x) || !isFinite(v.vel.x)) throw new Error('NaN bei t=' + (i * h).toFixed(3)); } return sec; }
const kmh = v => v.vLong * 3.6;
// 1) Ruhelage
{
  const v = mk(); run(v, 3);
  const W = v.wheels;
  console.log('RUHE: y=%s rideF=%s rideR=%s Fz=%s pitch=%s° v=%s', v.pos.y.toFixed(4), (v.rideF * 1000).toFixed(1), (v.rideR * 1000).toFixed(1), W.map(w => w.Fz.toFixed(0)).join('/'), (Math.asin(v._fwd.y) * 180 / Math.PI).toFixed(2), v.speed.toFixed(4));
}
// 2) Beschleunigung mit Auto-Schalten, TC mittel
{
  const v = mk(); v.aids.autoShift = true; v.aids.tc = 1;
  const marks = [100, 200, 300]; const res = {}; let vmax = 0, tmax = 0; const trace = [];
  run(v, 60, (v, t) => { v.input.throttle = 1; if (Math.abs(t * 4 - Math.round(t * 4)) < h * 2 && t <= 2.6) trace.push(t.toFixed(2) + 's:' + kmh(v).toFixed(0) + 'km/h/G' + v.gear + '/' + v.rpm.toFixed(0) + 'rpm/k' + v.wheels[2].kappa.toFixed(2) + '/c' + v.clutchCmd.toFixed(2) + (v.clutchLocked ? 'L' : '') + '/tc' + v.tcCut.toFixed(2)); const s = kmh(v); for (const m of marks) if (!res[m] && s >= m) res[m] = t; if (s > vmax) { vmax = s; tmax = t; } });
  console.log('BESCHL: 0-100 %ss 0-200 %ss 0-300 %ss Vmax %s km/h (bei %ss) Gang %d rpm %d aeroFlap %s SoC %s%% DF %s kN Drag %s kN',
    res[100] && res[100].toFixed(2), res[200] && res[200].toFixed(2), res[300] && res[300].toFixed(2), vmax.toFixed(1), tmax.toFixed(1), v.gear, v.rpm.toFixed(0), v.aeroFlap.toFixed(2), (v.socFrac * 100).toFixed(0), (v.downforce / 1000).toFixed(1), (v.drag / 1000).toFixed(1));
  console.log('   ' + trace.join('  '));
  console.log('   rideF %s mm rideR %s mm plank %s N, Reifen T %s', (v.rideF * 1000).toFixed(1), (v.rideR * 1000).toFixed(1), v.plankForce.toFixed(0), v.wheels.map(w => w.tyre.tEff.toFixed(0)).join('/'));
}
// 2b) ohne TC, Vollgas aus dem Stand – Durchdrehen
{
  const v = mk(); v.aids.autoShift = true; v.aids.tc = 0; let maxK = 0;
  run(v, 3, (v) => { v.input.throttle = 1; maxK = Math.max(maxK, v.wheels[2].kappa); });
  console.log('OHNE TC: v nach 3s %s km/h, max Schlupf hinten %s, Gang %d', kmh(v).toFixed(0), maxK.toFixed(2), v.gear);
}
// 3) Bremsen aus 300 km/h
{
  const v = mk(); v.aids.autoShift = true; v.aids.tc = 1;
  run(v, 60, (v) => { v.input.throttle = 1; if (kmh(v) >= 300) return false; });
  const x0 = v.pos.z; let locked = 0, t0 = v.time, maxDecel = 0;
  run(v, 10, (v) => { v.input.throttle = 0; v.input.brake = 1; maxDecel = Math.max(maxDecel, -v.accelLong / 9.81); if (v.wheels.some(w => w.locked)) locked++; if (kmh(v) <= 80) return false; });
  console.log('BREMSEN 300→80: Weg %s m, Zeit %ss, max %s g, blockiert %d Schritte, Bremstemp %s°C, Gang %d', (x0 - v.pos.z).toFixed(1), (v.time - t0).toFixed(2), maxDecel.toFixed(2), locked, v.wheels[0].brakeTemp.toFixed(0), v.gear);
  // weiter bis Stillstand: blockiert die Bremse bei niedriger Geschwindigkeit?
  let lockLow = 0;
  run(v, 6, (v) => { v.input.brake = 1; if (v.wheels.some(w => w.locked)) lockLow++; if (Math.abs(v.vLong) < 0.3) return false; });
  console.log('   80→0: blockiert %d Schritte, Flatspot VL %s, Stillstand v=%s, rpm %d, Gang %d', lockLow, v.wheels[0].tyre.flat.toFixed(3), v.speed.toFixed(2), v.rpm.toFixed(0), v.gear);
  run(v, 2, (v) => { v.input.brake = 1; });
  console.log('   im Stand gebremst: v=%s', v.speed.toFixed(4));
}
// 4) Skidpad: Kreisfahrt mit Regler
function skidpad(R, vTarget) {
  const v = mk(); v.aids.autoShift = true; v.aids.tc = 1;
  // Kreis um (R, 0) bzw. (−R, 0): Start bei (0,0) Richtung −Z, Linkskreis um (−R,0)
  const cx = -R, cz = 0; let stI = 0, latG = 0, n = 0, yawErr = 0, steerAvg = 0;
  run(v, 40, (v, t) => {
    const dx = v.pos.x - cx, dz = v.pos.z - cz; const r = Math.hypot(dx, dz);
    // Tangente (Linkskreis, Gegenuhrzeigersinn von oben: Bewegung −Z bei (0,0))
    const tx = dz / r, tz = -dx / r;
    const hd = Math.atan2(-v._fwd.x, -v._fwd.z), want = Math.atan2(-tx, -tz);
    const eHead = wrapAngle(want - hd), eR = r - R;
    let steer = -(Math.atan(3.4 / R) * 180 / Math.PI / 21) - eHead * 2.4 - eR * 0.06;
    stI += eR * 0.002;
    v.input.steer = clamp(steer - stI * 0, -1, 1);
    const vt = Math.min(vTarget, 5 + t * 6);
    v.input.throttle = clamp((vt - v.vLong) * 0.6, 0, 1); v.input.brake = clamp((v.vLong - vt - 2) * 0.2, 0, 1);
    if (t > 25) { latG += Math.abs(v.accelLat) / 9.81; n++; yawErr += Math.abs(eR); steerAvg += v.input.steer; }
  });
  return { latG: latG / n, rErr: yawErr / n, v: kmh(v), steer: steerAvg / n, temps: v.wheels.map(w => w.tyre.tEff.toFixed(0)).join('/'), slip: v.wheels.map(w => w.sComb.toFixed(2)).join('/') };
}
for (const [R, vt] of [[50, 22], [50, 26], [50, 30], [150, 50], [150, 56], [400, 75], [400, 85]]) {
  try { const r = skidpad(R, vt); console.log('SKIDPAD R=%d Ziel %s km/h: v=%s latG=%s Spurfehler %s m Lenkung %s Temps %s Schlupf %s', R, (vt * 3.6).toFixed(0), r.v.toFixed(0), r.latG.toFixed(2), r.rErr.toFixed(1), r.steer.toFixed(2), r.temps, r.slip); }
  catch (e) { console.log('SKIDPAD R=%d FEHLER %s', R, e.message); }
}
// 5) Lenkimpuls bei 200 km/h
{
  const v = mk(); v.aids.autoShift = true;
  run(v, 30, (v) => { v.input.throttle = 1; if (kmh(v) >= 200) return false; });
  const yaw = []; 
  run(v, 3, (v, t) => { v.input.throttle = clamp((200 / 3.6 - v.vLong) * 0.5, 0, 1); v.input.steer = t > 0.2 ? 0.08 : 0; yaw.push(v.yawRate); });
  const ss = yaw[yaw.length - 1]; let peak = 0; for (const y of yaw) peak = Math.max(peak, Math.abs(y));
  console.log('LENKIMPULS 200 km/h, 14,4° Lenkrad: Gierrate stationär %s °/s, Spitze %s °/s, Querbeschl %s g', (ss * 57.3).toFixed(2), (peak * 57.3).toFixed(2), (v.accelLat / 9.81).toFixed(2));
}
