const h = PHYS_DT;
const v = new Vehicle(CAR_SPEC, {}); v.aids.tc = 1; v.placeAt(0, 0, 0, 0);
for (let i = 0; i < 360 * 12; i++) { v.input.throttle = 1; v.step(h); v.events.length = 0; }
console.log(`Nach 12 s im 1. Gang: ${v.speedKmh.toFixed(1)} km/h, ${v.rpm.toFixed(0)} U/min, Begrenzer ${v.limiterCut}, kTorque ${v.kTorque.toFixed(0)} Nm, Kupplung ${v.clutchLocked ? 'fest' : 'schleift'}`);
const ok = v.requestShift(1);
for (let i = 0; i < 36; i++) { v.step(h); }
console.log(`Hochschalten angenommen: ${ok} → Gang ${v.gear}, ${v.rpm.toFixed(0)} U/min`);
