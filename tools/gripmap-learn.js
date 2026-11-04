// Kurvenfaktoren lernen: die KI fährt Testrunden, je Kurve wird die Querhaftung im Tempoprofil
// angepasst (Abflug → weniger, viel Reserve → mehr). Ausgabe: eine JSON-Zeile je Strecke/Epoche.
//   TRACK=ringpark ERA=e2026 ITERS=8 tools/run-pure.sh tools/gripmap-learn.js
const TR = process.env.TRACK || 'ringpark', ERA = process.env.ERA || 'e2026', ITERS = +(process.env.ITERS || 8), h = PHYS_DT;
applyEra(ERA);
globalThis.GRIP_MAPS_OVERRIDE = {};
const key = TR + '|' + ERA, T = new TrackModel(TRACKS[TR]), line = new RacingLine(T), N = T.N, L = T.length;
const base = line.profile(1);
// Kurven: lokale Minima des Tempoprofils, Bereich bis das Tempo 25 % über dem Minimum liegt
const corners = [];
const inRange = (c, j) => c.a <= c.b ? (j >= c.a && j <= c.b) : (j >= c.a || j <= c.b);
for (let j = 0; j < N; j++) {
  let isMin = base[j] < 88; for (let q = -12; q <= 12 && isMin; q++) if (q && base[(j + q + N) % N] < base[j]) isMin = false;
  const near = (c) => { const d = Math.abs(c.j - j); return Math.min(d, N - d) < 25 || (inRange(c, j)); };
  if (!isMin || corners.some(near)) continue;
  let a = j, b = j; const lim = base[j] * 1.25, maxS = Math.round(160 / T.ds);
  for (let q = 1; q < maxS && base[(j - q + N) % N] < lim; q++) a = (j - q + N) % N;
  for (let q = 1; q < maxS && base[(j + q) % N] < lim; q++) b = (j + q) % N;
  corners.push({ j, a, b, sa: a * T.ds, sb: b * T.ds, vmin: base[j] });
}
const inC = new Int16Array(N).fill(-1);
corners.forEach((c, i) => { for (let k = c.a; k !== (c.b + 1) % N; k = (k + 1) % N) inC[k] = i; });
// Bewertung: eine fehlerfreie Runde (Rundenzeit) + zwei Runden mit Fahrfehlern (Konstanz 85 %) – Abflüge zählen aus allen
function evaluate(f) {
  GRIP_MAPS_OVERRIDE[key] = corners.map((c, i) => [+c.sa.toFixed(1), +c.sb.toFixed(1), +f[i].toFixed(3)]);
  line.profiles.clear(); line._gm = null;
  const st = corners.map(() => ({ slip: 0, off: 0, reset: 0 }));
  const a = drive(st, 1, 1, 3), b = drive(st, 0.85, 2, 7);
  return { lap: a.lap, st, resets: a.resets + b.resets, offT: st.reduce((x, s) => x + s.off, 0) };
}
function drive(st, consistency, nLaps, seed) {
  const v = new Vehicle(CAR_SPEC, {}); v.setCompound('medium', 85); v.placeOnTrack(T, L - 150, line.offsetAt(L - 150));
  const ai = new AIDriver(v, line, { skill: 1, aggression: 0.5, consistency, reaction: 0.2 }, seed), me = { vehicle: v, ai };
  let laps = 0, ls = null, lap = null, done = 0, last = v.trackS, t = 0, resets = 0;
  for (let i = 0; i < 360 * 130 * (nLaps + 1) && done < nLaps; i++) {
    ai.control(h, { cars: [me], me, state: 'free', time: t }); v.step(h); t += h; v.events.length = 0;
    if (last > L - 60 && v.trackS < 60) { if (ls !== null) { lap = lap === null ? t - ls : Math.min(lap, t - ls); done++; } ls = t; laps++; } last = v.trackS;
    if (ls === null) continue;
    const c = inC[v.trackIdx];
    if (c >= 0) { const S = st[c]; S.slip = Math.max(S.slip, ...v.wheels.map(w => w.sComb)); if (v.offTrackWheels >= 3) S.off += h; }
    if (ai.needsReset) { resets++; if (c >= 0) st[c].reset++; else { let best = 0, bd = 1e9; corners.forEach((cc, k) => { const d = ((v.trackIdx - cc.b) % N + N) % N; if (d < bd) { bd = d; best = k; } }); st[best].reset++; } v.placeOnTrack(T, v.trackS, line.offsetAt(v.trackS)); ai.resetAfterRecovery(); }
  }
  return { lap: lap ?? 999, resets };
}
let f = corners.map(() => 1), bestF = f.slice(), first = evaluate(f), best = first, hist = [first.lap.toFixed(2) + (first.resets ? 'R' + first.resets : '')];
const cap = corners.map(() => 1.35), lastClean = corners.map(() => 1);
const clean = (r) => r.resets === 0 && r.offT < 0.5;
for (let it = 0; it < ITERS; it++) {
  const r = it === 0 ? first : evaluate(f);
  if (it > 0) hist.push(r.lap.toFixed(2) + (r.resets ? 'R' + r.resets : '') + (r.offT > 0.5 ? 'O' : ''));
  if (clean(r) && (!clean(best) || r.lap < best.lap)) { best = r; bestF = f.slice(); }
  else if (!clean(best) && r.resets + r.offT < best.resets + best.offT) { best = r; bestF = f.slice(); }
  // Kurve mit Abflug: Obergrenze knapp unter dem letzten sauberen Wert; sonst mit Reserve vorsichtig steigern
  f = f.map((x, i) => {
    const S = r.st[i];
    if (S.reset || S.off > 0.2) { cap[i] = Math.min(cap[i], Math.max(0.7, Math.min(x * 0.97, lastClean[i] * 0.995))); return Math.min(cap[i], Math.max(0.7, Math.min(x * 0.94, lastClean[i]))); }
    lastClean[i] = x;
    if (S.slip > 1.7) return Math.max(0.7, x * 0.98);
    if (S.slip < 1.0) return Math.min(cap[i], x * 1.04);
    if (S.slip < 1.3) return Math.min(cap[i], x * 1.015);
    return x;
  });
}
// alle Kurven ausgeben (auch Faktor 1): überlappende Bereiche werden in dieser Reihenfolge überblendet
const list = corners.map((c, i) => [+c.sa.toFixed(1), +c.sb.toFixed(1), +bestF[i].toFixed(3)]);
console.log(JSON.stringify({ key, base: +first.lap.toFixed(3), baseResets: first.resets, best: +best.lap.toFixed(3), resets: best.resets, offT: +best.offT.toFixed(2), hist, list }));
