// Offline-Test des Motor-Klangmodells: Stabilität, Pegel, Grundfrequenz; schreibt WAV-Proben.
//   node tests/audio/test_engine.js [Ausgabeordner]
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../src/58_engine_model.js'), 'utf8');
const { EngineModel, ENGINE_V6 } = new Function(src + '\nreturn { EngineModel, ENGINE_V6 };')();
const SR = 48000, OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
function wav(file, L, R) {
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  fs.writeFileSync(file, b);
}
function render(sec, fn) {
  const m = new EngineModel(SR, ENGINE_V6), N = Math.round(sec * SR), B = 128;
  const a = new Float32Array(N), b = new Float32Array(N);
  let [r0, g0] = fn(0);
  for (let i = 0; i < N; i += B) { const [r, g] = fn(i / SR); m.render(a.subarray(i, i + B), b.subarray(i, i + B), Math.min(B, N - i), r0, r, g0, g); r0 = r; g0 = g; }
  return { a, b, damp: m.dampened };
}
const stats = (x, from = 0.3) => { let pk = 0, s = 0, n = 0, bad = 0; for (let i = Math.floor(from * SR); i < x.length; i++) { const v = x[i]; if (!isFinite(v)) bad++; pk = Math.max(pk, Math.abs(v)); s += v * v; n++; } return { pk, rms: Math.sqrt(s / n), bad }; };
// Anteil der Zündordnungen (6., 12., 18. Ordnung des Arbeitsspiels) gegenüber den übrigen Ordnungen
function orders(x, rpm) {
  const st = Math.floor(0.5 * SR), L = 24000, fc = rpm / 120;
  const mag = (f) => { let re = 0, im = 0; for (let i = 0; i < L; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / L), v = x[st + i] * w, ph = 2 * Math.PI * f * i / SR; re += v * Math.cos(ph); im += v * Math.sin(ph); } return re * re + im * im; };
  let fire = 0, other = 0; for (let k = 1; k <= 18; k++) { const e = mag(fc * k); if (k % 6 === 0) fire += e; else other += e; }
  return 10 * Math.log10(fire / Math.max(1e-12, other));
}
let fail = 0;
for (const rpm of [4000, 8000, 11000, 13000, 15000]) {
  for (const [lbl, ign] of [['Vollgas', 1], ['Schiebebetrieb', 0.08]]) {
    const r = render(1.5, () => [rpm, ign]);
    const e = stats(r.a), i = stats(r.b);
    const ord = orders(r.a, rpm);
    const ok = e.bad === 0 && i.bad === 0 && e.pk < 0.98 && i.pk < 0.98 && e.rms > 0.04 && i.rms > 0.02 && (ign < 0.5 || ord > 8);
    if (!ok) fail++;
    console.log(`${ok ? 'OK  ' : 'FEHL'} ${String(rpm).padStart(5)} U/min ${lbl.padEnd(14)} außen rms ${e.rms.toFixed(3)} pk ${e.pk.toFixed(2)} · innen rms ${i.rms.toFixed(3)} pk ${i.pk.toFixed(2)} · Zündordnungen +${ord.toFixed(0)} dB (${(rpm / 20).toFixed(0)} Hz) · gedämpft ${r.damp}`);
    if (ign === 1 && (rpm === 8000 || rpm === 13000)) wav(path.join(OUT, `motor_${rpm}_vollgas.wav`), r.a, r.b);
  }
}
// Hochdrehen 5000→15000 in 4 s, Schaltung, Begrenzer, Gas weg
const run = render(9, (t) => {
  if (t < 4) return [5000 + 10000 * t / 4, 1];
  if (t < 4.08) return [15000 - (t - 4) / 0.08 * 2600, 0.05];             // Hochschalten
  if (t < 6.5) return [12400 + (t - 4.08) / 2.42 * 2600, 1];
  if (t < 7.5) return [15000 + (Math.floor(t * 30) % 2 ? -150 : 0), Math.floor(t * 30) % 2 ? 0 : 1];   // Begrenzer
  return [15000 - (t - 7.5) / 1.5 * 8000, 0.06];                        // Gas weg
});
const rs = stats(run.a);
console.log(`Hochdrehen/Schalten/Begrenzer: rms ${rs.rms.toFixed(3)} pk ${rs.pk.toFixed(2)} nicht endlich ${rs.bad} gedämpft ${run.damp}`);
if (rs.bad || rs.pk > 0.98) fail++;
wav(path.join(OUT, 'motor_hochdrehen.wav'), run.a, run.b);
// Leistung
const t0 = process.hrtime.bigint(); render(5, () => [12000, 1]); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`Rechenzeit: ${(ms / 5000 * 100).toFixed(1)} % Echtzeit (Node, ein Kern)`);
console.log(fail ? `${fail} Fehler` : 'alles OK', '· WAV-Proben in', OUT);
process.exit(fail ? 1 : 0);
