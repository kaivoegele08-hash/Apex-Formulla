const T = new TrackModel(TRACKS.ringpark);
const v = new Vehicle(CAR_SPEC, {}); v.aids.autoShift = true; v.placeOnTrack(T, 100, 0);
v.input.throttle = 1;
for (let i = 0; i < 2000; i++) { v.step(PHYS_DT); v.events.length = 0; }
const N = 36000;
const t0 = performance.now();
for (let i = 0; i < N; i++) { v.input.steer = Math.sin(i * 0.001) * 0.05; v.step(PHYS_DT); v.events.length = 0; }
const dt = performance.now() - t0;
console.log(`Physik: ${(dt / N * 1000).toFixed(2)} µs je Schritt · ${(dt / N * 360).toFixed(3)} ms je Sekunde Simulation (1 Auto) · 20 Autos ≈ ${(dt / N * 360 * 20 / 10).toFixed(2)} % einer CPU-Sekunde`);
console.log('Zustand', v.speedKmh.toFixed(0), 'km/h', 'Gang', v.gear, 'NaN?', isNaN(v.pos.x));
