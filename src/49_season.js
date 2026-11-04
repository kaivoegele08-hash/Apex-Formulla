// ============================================================================
//  QUALIFYING & MEISTERSCHAFT (Phase 5) – ohne Grafik, in Node testbar
//  KI-Qualifikationszeiten werden nicht gefahren, sondern aus dem Tempoprofil
//  der Ideallinie geschätzt: Profil-Rundenzeit(Fähigkeit · Griff) × gemessener
//  Streckenfaktor (aiLapFactor) – dadurch passen sie zu den echten KI-Runden.
// ============================================================================

const QUALI_DURATIONS = [5, 10, 15];        // Minuten
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SEASON_DISTANCES = { short: { name: 'Kurz (5 Runden)', laps: () => 5 }, quarter: { name: '25 %', frac: 0.25 }, half: { name: '50 %', frac: 0.5 } };

/** Relativer Griff einer Mischung bei Nässe w (1 = Mittel auf trockener Strecke) */
function compoundGrip(id, w) {
  const c = COMPOUNDS[id], m = COMPOUNDS.medium;
  return (c.mu / m.mu) * (1 - c.wetLoss * w - c.dryPenalty * (1 - w)) * (1 - 0.06 * w);
}
/** Beste Qualifying-Mischung für die Nässe (Weich im Trockenen) */
function qualiCompound(w) { return Weather.bestFor(w) || 'soft'; }

/**
 * Geschätzte schnellste Runde eines KI-Fahrers.
 * prof = makeAIProfile(...); water = Streckennässe; trackGrip = Haftungsbonus (KI-Stärke > 100 %)
 */
function estimateAILap(track, line, prof, { water = 0, trackGrip = 1, rng = Math.random } = {}) {
  const grip = clamp(prof.skill * trackGrip * compoundGrip(qualiCompound(water), water), 0.5, 1.2);
  // Faktor sinkt mit geringerer Fähigkeit leicht (gemessen: −0,006 je −0,04 Fähigkeit)
  const base = line.profile(Math.round(grip * 1000) / 1000).lapTime * (lapFactor(track, line) - 0.15 * (1 - clamp(prof.skill, 0.8, 1)));
  // Streuung: unbeständige Fahrer treffen die Runde seltener perfekt (nur langsamer, nie schneller)
  const miss = Math.abs(gauss(rng)) * (0.0008 + (1 - prof.consistency) * 0.005) + water * 0.006 * rng();
  return base * (1 + miss);
}
function gauss(rng) { let u = 0; for (let i = 0; i < 6; i++) u += rng(); return (u - 3) / Math.sqrt(0.5); }

/** Schätzung der KI-Rundenzeit bei 100 % Stärke (für Anzeigen in den Menüs) */
function refLapTime(track, line, water = 0) {
  return line.profile(clamp(compoundGrip(Weather.bestFor(water) || 'medium', water), 0.5, 1.2)).lapTime * lapFactor(track, line);
}

/**
 * Verhältnis echte KI-Runde / Profil-Rundenzeit (weiche Reifen, Fähigkeit 1). Für das Standardauto
 * aus den Streckendaten, sonst (andere Epoche, Mod-Strecke) einmal simuliert (≈ 1 s) und gespeichert.
 */
const LAPCAL_V = 2;   // 2: neue Ideallinie (Krümmungsminimierung) → neu kalibrieren
function lapFactor(track, line) {
  const key = ACTIVE_ERA + '|' + track.id, all = Save.get('lapCal', {});
  if (all[key] && all[key].v === LAPCAL_V) return all[key].f;
  const f = calibrateLapFactor(track, line);
  all[key] = { v: LAPCAL_V, f }; Save.set('lapCal', all);
  return f;
}
function calibrateLapFactor(track, line) {
  const T = track, h = PHYS_DT, v = new Vehicle(CAR_SPEC, {}); v.setCompound('soft', 85);
  const s0 = T.length - 150; v.placeOnTrack(T, s0, line.offsetAt(s0));
  const ai = new AIDriver(v, line, { skill: 1, aggression: 0.5, consistency: 1, reaction: 0.2 }, 3), me = { vehicle: v, ai };
  let start = null, t = 0, lastS = v.trackS, lap = null;
  for (let i = 0; i < 360 * 260 && lap === null; i++) {
    ai.control(h, { cars: [me], me, state: 'free', time: t }); v.step(h); t += h; v.events.length = 0;
    if (ai.needsReset) { v.placeOnTrack(T, v.trackS, line.offsetAt(v.trackS)); ai.resetAfterRecovery(); start = null; }
    if (lastS > T.length - 60 && v.trackS < 60) { if (start !== null) lap = t - start; else start = t; }
    lastS = v.trackS;
  }
  const prof = line.profile(Math.round(compoundGrip('soft', 0) * 1000) / 1000).lapTime;
  return lap ? clamp(lap / prof, 0.9, 1.25) : 1.05;
}

/**
 * Qualifying-Sitzung: der Spieler fährt frei (wie Testfahrt) gegen die Uhr, die KI-Zeiten
 * erscheinen nach und nach (erster Versuch, dann Verbesserung). Läuft die Uhr ab, darf eine
 * begonnene Runde noch zu Ende gefahren werden.
 */
class QualiSession extends PracticeSession {
  /** field = buildField(...)-Liste; opts: { line, minutes, strength, water, rng } */
  constructor(track, field, { line, minutes = 10, strength = 1, water = 0, rng = Math.random, remoteTime = null, standingsFn = null } = {}) {
    super(track);
    this.kind = 'quali';
    this.duration = minutes * 60; this.clock = 0; this.phase = 'running';   // running → last → done
    this.field = field;
    this.playerBest = Infinity; this.playerLaps = 0;
    const trackGrip = strength > 1 ? 1 + (strength - 1) * 0.6 : 1;
    this.remoteTime = remoteTime; this.standingsFn = standingsFn;   // Mehrspieler: Zeiten der Gäste (Host) bzw. Rangliste vom Host (Gast)
    this.ai = field.filter(e => !e.player && !e.remote).map(e => {
      const prof = makeAIProfile(e.driver, strength, rng);
      const best = estimateAILap(track, line, prof, { water, trackGrip: trackGrip * (e.trackGrip || 1), rng });
      const first = best * (1 + 0.004 + rng() * 0.012);
      // Zeitpunkte als Anteil der Sitzung: erster Versuch früh, Bestzeit gegen Ende
      return { e, prof, best, attempts: [{ at: 0.18 + rng() * 0.3, time: first }, { at: 0.62 + rng() * 0.34, time: best }], shown: Infinity };
    });
    this.timing.on((type, data) => this._quali(type, data));
  }
  get remaining() { return Math.max(0, this.duration - this.clock); }
  _quali(type, data) {
    if (type === 'lap') {
      this.playerLaps++;
      if (data.valid && data.time < this.playerBest) {
        this.playerBest = data.time;
        const pos = this.standings().findIndex(r => r.player) + 1;
        Events.emit('quali:best', data.time, pos);
      }
      if (this.phase === 'last') this._end();
    }
  }
  _end() { if (this.phase === 'done') return; this.phase = 'done'; this._revealAll(); Events.emit('quali:end', this.standings()); }
  _revealAll() { for (const a of this.ai) a.shown = a.best; }
  /** Spieler beendet die Sitzung vorzeitig (Pause-Menü) */
  finish() { this._end(); }
  step(h, v) {
    super.step(h, v);
    if (this.phase === 'done') return;
    this.clock += h;
    const f = this.clock / this.duration;
    for (const a of this.ai) for (const at of a.attempts) if (f >= at.at && at.time < a.shown) a.shown = at.time;
    if (this.phase === 'running' && this.clock >= this.duration) {
      // Uhr abgelaufen: eine laufende, gültige Runde darf noch beendet werden
      if (this.timing.started && this.timing.valid && this.timing.progress > 30) { this.phase = 'last'; Events.emit('quali:last'); }
      else this._end();
    } else if (this.phase === 'last' && !this.timing.valid) this._end();
  }
  /** Rangliste: [{ e, name, team, time, player }] – ohne Zeit hinten (Startreihenfolge des Feldes) */
  standings() {
    if (this.standingsFn) return this.standingsFn(this);
    const rows = this.ai.map(a => ({ e: a.e, name: a.e.driver.name, team: a.e.team, time: a.shown, player: false, prof: a.prof }));
    for (const e of this.field) if (e.remote) rows.push({ e, name: e.driver.name, team: e.team, time: this.remoteTime ? this.remoteTime(e.netId) : Infinity, player: false, remote: true });
    const pl = this.field.find(e => e.player);
    if (pl) rows.push({ e: pl, name: pl.driver.name, team: pl.team, time: this.playerBest, player: true });
    return rows.sort((a, b) => a.time - b.time);
  }
  /** Startaufstellung fürs Rennen: Feldeinträge in Qualifying-Reihenfolge, KI mit ihrem Profil */
  grid() { return this.standings().map(r => Object.assign({}, r.e, r.prof ? { profile: r.prof } : {})); }
}

/** Ohne gefahrenes Qualifying (Meisterschaft mit Qualifying aus): geschätzte Zeiten + Spieler nach Einstellung */
function simulatedGrid(track, line, field, { strength = 1, water = 0, rng = Math.random, playerGrid = 'middle' } = {}) {
  const trackGrip = strength > 1 ? 1 + (strength - 1) * 0.6 : 1;
  const ai = field.filter(e => !e.player).map(e => { const prof = makeAIProfile(e.driver, strength, rng); return Object.assign({}, e, { profile: prof, qTime: estimateAILap(track, line, prof, { water, trackGrip: trackGrip * (e.trackGrip || 1), rng }) }); });
  ai.sort((a, b) => a.qTime - b.qTime);
  const pl = field.find(e => e.player);
  if (pl) { const at = playerGrid === 'pole' ? 0 : playerGrid === 'back' ? ai.length : Math.floor(ai.length / 2); ai.splice(at, 0, Object.assign({}, pl)); }
  return ai;
}

// ---------------------------------------------------------------------------
//  Meisterschaft: Kalender über alle Strecken, Punkte, Fahrer- und Teamwertung
// ---------------------------------------------------------------------------
const Season = {
  /** Neue Saison anlegen (wird über Save gespeichert) */
  create({ tracks = TRACK_ORDER.slice(), distance = 'short', quali = true, qualiMin = 10, weather = 'random', strength = 1, team, playerName, number, era = 'e2026' }) {
    return {
      v: 1, created: Date.now(), tracks, distance, quali, qualiMin, weather, strength, team, playerName, number, era,
      round: 0, results: [], drivers: {}, teams: {},
    };
  },
  isPlayer(row) { return !!(row.player || (row.e && row.e.player)); },
  key(row) { return this.isPlayer(row) ? '#player' : row.name; },
  lapsFor(s, track) {
    const d = SEASON_DISTANCES[s.distance] || SEASON_DISTANCES.short;
    return d.laps ? d.laps() : Math.max(3, Math.round((track.def.raceLaps || 50) * d.frac));
  },
  done(s) { return s.round >= s.tracks.length; },
  /**
   * Rennergebnis werten. cls = race.classification(); fastest = race.fastest (Entry).
   * Punkte: 25-18-15-12-10-8-6-4-2-1 für Gewertete (nicht ausgeschieden), +1 für die schnellste Runde in den Top 10.
   */
  award(s, trackId, cls, fastest) {
    const order = [];
    cls.forEach((r, i) => {
      const scored = !r.retired && i < POINTS.length;
      let pts = scored ? POINTS[i] : 0;
      const fl = fastest && fastest.entry && fastest.entry === r.e;
      if (fl && scored) pts += 1;
      const k = this.key(r), isP = this.isPlayer(r);
      const d = s.drivers[k] || (s.drivers[k] = { name: isP ? (s.playerName || 'Du') : r.name, team: r.team, pts: 0, wins: 0, podiums: 0, best: 99, player: isP });
      d.pts += pts; d.team = r.team;
      if (!r.retired) { if (i === 0) d.wins++; if (i < 3) d.podiums++; d.best = Math.min(d.best, i + 1); }
      s.teams[r.team] = (s.teams[r.team] || 0) + pts;
      order.push({ name: d.name, team: r.team, player: isP, pos: i + 1, pts, retired: !!r.retired, fl: !!fl });
    });
    s.results.push({ track: trackId, order });
    s.round++;
    return order;
  },
  /** Fahrerwertung sortiert (Punkte, dann Siege, dann bestes Ergebnis) */
  driverTable(s) { return Object.values(s.drivers).sort((a, b) => b.pts - a.pts || b.wins - a.wins || b.podiums - a.podiums || a.best - b.best); },
  teamTable(s) { return Object.entries(s.teams).map(([id, pts]) => ({ id, pts })).sort((a, b) => b.pts - a.pts); },
};
