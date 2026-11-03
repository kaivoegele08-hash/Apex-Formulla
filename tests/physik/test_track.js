const T = new TrackModel(TRACKS.ringpark);
console.log('Länge', T.length.toFixed(1), 'N', T.N, 'ds', T.ds.toFixed(3));
console.log('Bounds', JSON.stringify(T.bounds));
console.log('Kurven:', T.corners.length);
for (const c of T.corners) console.log('  ', (c.a / T.N).toFixed(3), '-', (c.b / T.N).toFixed(3), c.sign > 0 ? 'rechts' : 'links', 'R=' + c.radius.toFixed(0), 'vmin', (Math.min(...Array.from({length: ((c.b - c.a + T.N) % T.N) + 1}, (_, k) => T.VP[(c.a + k) % T.N])) * 3.6).toFixed(0), 'km/h');
console.log('Referenzrunde', fmtTime(T.refLapTime), 'Vmax', (Math.max(...T.VP) * 3.6).toFixed(0));
console.log('Bremsschilder', T.brakeBoards.length);
// Lokalisierung prüfen
const hit = new GroundHit(); let maxErr = 0, worst = null;
const rng = makeRng(5);
for (let k = 0; k < 20000; k++) {
  const j = Math.floor(rng() * T.N), lat = (rng() * 2 - 1) * 20;
  const x = T.X[j] + T.RX[j] * lat, z = T.Z[j] + T.RZ[j] * lat;
  T.query(x, z, (j + 3) % T.N, hit);
  const err = Math.abs(hit.d - lat) + Math.abs(((hit.i - j + T.N + T.N / 2) % T.N) - T.N / 2) * 0.01;
  if (err > maxErr) { maxErr = err; worst = { j, lat, got: hit.d, gi: hit.i }; }
}
console.log('max Lokalisierungsfehler', maxErr.toFixed(3), JSON.stringify(worst));
// Barriereabstände
let minBD = 1e9, maxBD = 0; for (let s = 0; s < 2; s++) for (let j = 0; j < T.N; j++) { minBD = Math.min(minBD, T.BD[s][j] - T.HW[j]); maxBD = Math.max(maxBD, T.BD[s][j] - T.HW[j]); }
console.log('Barriere ab Fahrbahnrand min/max', minBD.toFixed(1), maxBD.toFixed(1));
// Untergrund-Statistik entlang eines Querschnitts
const j = T.idxOf(0.874); const kinds = [];
for (let d = -30; d <= 30; d += 0.5) { const x = T.X[j] + T.RX[j] * d, z = T.Z[j] + T.RZ[j] * d; T.query(x, z, j, hit); kinds.push(d + ':' + SURFACES[hit.surf].key + '@' + hit.h.toFixed(3)); }
console.log('Schikane-Querschnitt:', kinds.filter((_, i) => i % 3 === 0).join(' '));
const t0 = performance.now(); for (let k = 0; k < 200000; k++) { const jj = k % T.N; T.query(T.X[jj] + 3, T.Z[jj] - 2, jj, hit); } console.log('200k Abfragen in', (performance.now() - t0).toFixed(1), 'ms');
