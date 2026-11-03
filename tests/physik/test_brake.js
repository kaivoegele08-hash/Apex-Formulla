const h = PHYS_DT;
function mk(setup) { const v = new Vehicle(CAR_SPEC, setup || {}); v.placeAt(0, 0, 0, 0); return v; }
function run(v, sec, fn) { const n = Math.round(sec / h); for (let i = 0; i < n; i++) { if (fn) { if (fn(v, i * h) === false) return i * h; } v.step(h); v.events.length = 0; } return sec; }
const kmh = v => v.vLong * 3.6;
for (const bp of [1.0, 0.85]) {
  const v = mk(); v.aids.autoShift = true; v.aids.tc = 1;
  run(v, 60, (v) => { v.input.throttle = 1; if (kmh(v) >= 300) return false; });
  const tr = []; let next = 300;
  run(v, 8, (v, t) => { v.input.throttle = 0; v.input.brake = bp; const s = kmh(v);
    if (s <= next) { const W = v.wheels; tr.push(`${s.toFixed(0)}: ${(-v.accelLong / 9.81).toFixed(2)}g FzF ${W[0].Fz.toFixed(0)} FzR ${W[2].Fz.toFixed(0)} kF ${W[0].kappa.toFixed(2)} kR ${W[2].kappa.toFixed(2)} muF ${W[0].mu.toFixed(2)} TbF ${W[0].Tb.toFixed(0)} TbR ${W[2].Tb.toFixed(0)} DF ${(v.downforce/1000).toFixed(1)} flap ${v.aeroFlap.toFixed(2)} rF ${(v.rideF*1000).toFixed(0)} G${v.gear} regen ${(v.kTorque).toFixed(0)}`); next -= 25; }
    if (s < 30) return false; });
  console.log('Pedal', bp); console.log(tr.join('\n'));
}
