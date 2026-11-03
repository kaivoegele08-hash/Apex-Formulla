const h = PHYS_DT;
function mk(setup) { const v = new Vehicle(CAR_SPEC, setup || {}); v.placeAt(0, 0, 0, 0); return v; }
function run(v, sec, fn) { const n = Math.round(sec / h); for (let i = 0; i < n; i++) { if (fn) { if (fn(v, i * h) === false) return i * h; } v.step(h); v.events.length = 0; if (!isFinite(v.pos.x)) throw new Error('NaN'); } return sec; }
const kmh = v => v.vLong * 3.6;
// Skidpad mit langsam steigender Geschwindigkeit bis zum Verlust der Spur → maximale Querbeschleunigung
function sweep(R, v0, rate) {
  const v = mk(); v.aids.autoShift = true; v.aids.tc = 1; v.setCompound('medium', 95);
  const cx = -R, cz = 0; let best = 0, bestV = 0, lost = false, tr = '';
  run(v, 120, (v, t) => {
    const dx = v.pos.x - cx, dz = v.pos.z - cz; const r = Math.hypot(dx, dz);
    const tx = dz / r, tz = -dx / r;
    const hd = Math.atan2(-v._fwd.x, -v._fwd.z), want = Math.atan2(-tx, -tz);
    const eHead = wrapAngle(want - hd), eR = r - R;
    v.input.steer = clamp(-(Math.atan(3.4 / R) * 180 / Math.PI / 21) - eHead * 2.4 - eR * 0.06, -1, 1);
    const vt = v0 + Math.max(0, t - 6) * rate;
    v.input.throttle = clamp((vt - v.vLong) * 0.6, 0, 1); v.input.brake = clamp((v.vLong - vt - 2) * 0.2, 0, 1);
    if (Math.abs(eR) > 4 && t > 8) { lost = true; tr = `verloren bei ${kmh(v).toFixed(0)} km/h, eR ${eR.toFixed(1)}, slip ${v.wheels.map(w => w.sComb.toFixed(2)).join('/')}`; return false; }
    if (t > 6) { const g = Math.abs(v.vLong * v.vLong / R) / 9.81; if (g > best) { best = g; bestV = kmh(v); } }
  });
  return { best, bestV, tr, DF: v.downforce, temps: v.wheels.map(w => w.tyre.tEff.toFixed(0)).join('/') };
}
for (const [R, v0, rate] of [[30, 15, 0.25], [50, 20, 0.3], [100, 35, 0.35], [150, 45, 0.4], [250, 60, 0.4], [400, 70, 0.4]]) {
  const r = sweep(R, v0, rate);
  console.log('R=%d m: max %s g bei %s km/h | %s | Temps %s', R, r.best.toFixed(2), r.bestV.toFixed(0), r.tr, r.temps);
}
// Beschleunigung
{
  const v = mk(); v.aids.autoShift = true; v.aids.tc = 1;
  const marks = [100, 200, 300]; const res = {}; const trace = [];
  run(v, 30, (v, t) => { v.input.throttle = 1; const s = kmh(v); for (const m of marks) if (!res[m] && s >= m) res[m] = t;
    if (Math.abs(t * 4 - Math.round(t * 4)) < h * 0.6 && t <= 2.6) trace.push(t.toFixed(2) + ':' + s.toFixed(0) + '/G' + v.gear + '/' + v.rpm.toFixed(0) + '/k' + v.wheels[2].kappa.toFixed(2) + '/c' + v.clutchCmd.toFixed(2) + (v.clutchLocked ? 'L' : '') + '/tc' + v.tcCut.toFixed(2)); });
  console.log('0-100 %s 0-200 %s 0-300 %s', res[100].toFixed(2), res[200].toFixed(2), res[300].toFixed(2)); console.log(trace.join('  '));
}
// Bremsen aus 300 mit vollem Pedal: ab wann blockiert vorne?
{
  const v = mk(); v.aids.autoShift = true; v.aids.tc = 1;
  run(v, 60, (v) => { v.input.throttle = 1; if (kmh(v) >= 300) return false; });
  let lockAt = null, maxG = 0; const x0 = v.pos.z;
  run(v, 8, (v) => { v.input.throttle = 0; v.input.brake = 1; maxG = Math.max(maxG, -v.accelLong / 9.81); if (!lockAt && v.wheels.some(w => w.locked)) lockAt = kmh(v); if (kmh(v) < 100) return false; });
  console.log('Bremsen 300→100 Vollpedal: Weg %s m, max %s g, erstes Blockieren bei %s km/h, Bremstemp %s', (x0 - v.pos.z).toFixed(0), maxG.toFixed(2), lockAt && lockAt.toFixed(0), v.wheels[0].brakeTemp.toFixed(0));
}
