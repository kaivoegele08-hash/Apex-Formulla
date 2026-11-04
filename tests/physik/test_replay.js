// Wiederholung: Aufzeichnung eines Rennens, Genauigkeit der Interpolation, Speicherbedarf, Ringpuffer, Regie
const T = new TrackModel(TRACKS.ringpark), line = new RacingLine(T);
const field = buildField({ playerTeam: 'aurora', size: 12 }).filter(e => !e.player);
const race = new RaceSession({ track: T, line, laps: 2, entries: field, damage: 'full' });
const rec = new ReplayRecorder(race.entries.map(e => ({ vehicle: e.vehicle, dist: () => e.distance, visible: () => e.active })), { maxSec: 120 });
let maxErr = 0, n = 0; const truth = [];
for (let i = 0; i < 360 * 150; i++) {
  race.step(PHYS_DT); rec.step(PHYS_DT);
  if (i % 97 === 0 && rec.t > 20) { const v = race.entries[3].vehicle; truth.push([rec.t, v.pos.x, v.pos.z, v.speed]); }
}
for (const [t, x, z, sp] of truth) {
  if (t < rec.start + 0.2) continue;
  const p = rec.sample(t, 3); n++;
  maxErr = Math.max(maxErr, Math.hypot(p.x - x, p.z - z));
}
console.log(`Bilder ${rec.frames}, gespeichert ${rec._kept()} (Ringpuffer 120 s), Zeitraum ${rec.start.toFixed(1)}–${rec.end.toFixed(1)} s, Speicher ${(rec.bytes / 1e6).toFixed(2)} MB`);
console.log(`Interpolation: ${n} Proben, max. Abweichung ${maxErr.toFixed(3)} m`);
const perMin = rec.n * REPLAY_HZ * 60 * (RF * 4 + RI * 2) / 1e6;
console.log(`Speicher je Minute mit 21 Autos: ${(perMin / rec.n * 21).toFixed(2)} MB`);
const dir = new ReplayDirector(rec, { playerIdx: 5 });
const picks = new Set(); for (let t = rec.start; t < rec.end; t += 0.5) picks.add(dir.pick(t));
console.log(`Regie wählt ${picks.size} verschiedene Autos`);
const ok = maxErr < 0.35 && rec.length >= 119 && rec.length <= 181 && picks.size >= 2;
console.log(ok ? 'OK' : 'FEHLER');
