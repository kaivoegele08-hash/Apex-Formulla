// ============================================================================
//  RENNEN – Zeitnahme (Runden, Sektoren, Track Limits), Kollisionen zwischen
//  Fahrzeugen, Schaden, Rennablauf (Startaufstellung, Ampel, Positionen,
//  Abstände, Windschatten, Strafen, Zielflagge). Ohne DOM/Grafik → Node-testbar.
// ============================================================================

const DAMAGE_SCALE = { off: 0, reduced: 0.45, full: 1 };
const SECTOR_COL = { best: 'purple', pb: 'green', slow: 'yellow' };

// ---------------------------------------------------------------------------
//  Schaden
// ---------------------------------------------------------------------------
const Damage = {
  /**
   * Treffer verarbeiten. lx/lz = Trefferrichtung im Fahrzeugsystem (rechts / hinten),
   * speed = Aufprallgeschwindigkeit normal zur Fläche (m/s). Rückgabe: Beschreibung oder null.
   */
  apply(v, speed, lx, lz, mode, rng = Math.random) {
    const k = DAMAGE_SCALE[mode] ?? 1;
    if (!k || speed < 3) return null;
    const H = v.health;
    const amt = k * Math.min(1.2, (speed - 3) / 14);
    const parts = [];
    const hurtSusp = (i, a) => {
      const before = H.susp[i];
      H.susp[i] = Math.max(0, H.susp[i] - a);
      if (H.susp[i] < 0.75 && H.toe[i] === 0) H.toe[i] = (rng() < 0.5 ? -1 : 1) * 0.003;
      if (H.susp[i] < 0.75) H.toe[i] = Math.sign(H.toe[i] || 1) * (0.003 + (0.75 - H.susp[i]) * 0.016);
      parts.push('Aufhängung ' + ['vorne links', 'vorne rechts', 'hinten links', 'hinten rechts'][i]);
    };
    const front = lz < -0.55, rear = lz > 0.55, left = lx < 0;
    if (front) {
      H.fw = Math.max(0.3, H.fw - amt * 0.7); parts.push('Frontflügel');
      if (Math.abs(lx) > 0.35 && amt > 0.25) hurtSusp(left ? 0 : 1, amt * 0.5);
    } else if (rear) {
      H.rw = Math.max(0.4, H.rw - amt * 0.55); parts.push('Heckflügel');
      if (Math.abs(lx) > 0.35 && amt > 0.25) hurtSusp(left ? 2 : 3, amt * 0.45);
    } else {
      H.floor = Math.max(0.7, H.floor - amt * 0.2); parts.push('Unterboden');
      if (amt > 0.2) hurtSusp((lz < 0 ? 0 : 2) + (left ? 0 : 1), amt * 0.55);
    }
    // Schwerer Einschlag: Motor/Getriebe
    if (speed > 24 && k >= 1) { H.engine = Math.max(0, H.engine - (speed - 24) / 12); parts.push('Antrieb'); }
    return { amt, parts: [...new Set(parts)] };
  },
  /** Fahrzeug nicht mehr fahrbereit? */
  terminal(v) { const H = v.health; return H.engine <= 0.05 || H.susp.some(x => x < 0.12); },
  /** Zustand als Text (MFD/Boxenfunk) */
  summary(v) {
    const H = v.health, p = [];
    if (H.fw < 0.97) p.push(`Frontflügel ${Math.round(H.fw * 100)} %`);
    if (H.rw < 0.97) p.push(`Heckflügel ${Math.round(H.rw * 100)} %`);
    if (H.floor < 0.97) p.push(`Unterboden ${Math.round(H.floor * 100)} %`);
    H.susp.forEach((s, i) => { if (s < 0.97) p.push(`Aufh. ${['VL', 'VR', 'HL', 'HR'][i]} ${Math.round(s * 100)} %`); });
    if (H.engine < 0.97) p.push(`Antrieb ${Math.round(H.engine * 100)} %`);
    return p.length ? p.join(' · ') : 'keiner';
  },
  repair(v) { v.health = { fw: 1, rw: 1, floor: 1, susp: [1, 1, 1, 1], toe: [0, 0, 0, 0], engine: 1 }; },
};

// ---------------------------------------------------------------------------
//  Kollisionen Fahrzeug ↔ Fahrzeug: 2D-Kapseln (Länge ≈ 5,5 m, Breite ≈ 1,9 m)
// ---------------------------------------------------------------------------
const CarContacts = {
  Z1: -1.9, Z2: 1.65, R: 0.95, E: 0.25, MU: 0.35,
  _seg(v, out) {
    const f = v._fwd, fl = Math.hypot(f.x, f.z) || 1, fx = f.x / fl, fz = f.z / fl;
    // lokales z (vorne negativ) → Welt: p − fwd·z
    out.ax = v.pos.x - fx * this.Z1; out.az = v.pos.z - fz * this.Z1;
    out.bx = v.pos.x - fx * this.Z2; out.bz = v.pos.z - fz * this.Z2;
    out.fx = fx; out.fz = fz;
    return out;
  },
  /** Nächste Punkte zweier Strecken (2D) */
  _closest(A, B, o) {
    const d1x = A.bx - A.ax, d1z = A.bz - A.az, d2x = B.bx - B.ax, d2z = B.bz - B.az;
    const rx = A.ax - B.ax, rz = A.az - B.az;
    const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
    const c = d1x * rx + d1z * rz, b = d1x * d2x + d1z * d2z, den = a * e - b * b;
    let s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
    let t = (b * s + f) / e;
    if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    o.px = A.ax + d1x * s; o.pz = A.az + d1z * s; o.qx = B.ax + d2x * t; o.qz = B.az + d2z * t;
    return o;
  },
  _sa: {}, _sb: {}, _c: {}, _t1: null,
  /** Alle nahen Paare prüfen und Impulse anwenden. onHit(entryA, entryB, speed, contactX, contactZ) */
  resolve(entries, L, onHit) {
    const n = entries.length, R2 = this.R * 2;
    for (let i = 0; i < n; i++) {
      const ea = entries[i]; if (!ea.active || ea.ghostT > 0) continue;
      const A = ea.vehicle;
      for (let k = i + 1; k < n; k++) {
        const eb = entries[k]; if (!eb.active || eb.ghostT > 0) continue;
        const B = eb.vehicle;
        if (Math.abs(A.pos.x - B.pos.x) > 7 || Math.abs(A.pos.z - B.pos.z) > 7 || Math.abs(A.pos.y - B.pos.y) > 2.5) continue;
        const sa = this._seg(A, this._sa), sb = this._seg(B, this._sb), c = this._closest(sa, sb, this._c);
        let nx = c.px - c.qx, nz = c.pz - c.qz; const d = Math.hypot(nx, nz);
        if (d >= R2 || d < 1e-6) continue;
        nx /= d; nz /= d;
        const pen = R2 - d;
        // Positionskorrektur je zur Hälfte
        A.pos.x += nx * pen * 0.5; A.pos.z += nz * pen * 0.5; B.pos.x -= nx * pen * 0.5; B.pos.z -= nz * pen * 0.5;
        // Kontaktpunkt und Relativgeschwindigkeit
        const cx = (c.px + c.qx) * 0.5, cz = (c.pz + c.qz) * 0.5;
        const rA = [cx - A.pos.x, 0.05, cz - A.pos.z], rB = [cx - B.pos.x, 0.05, cz - B.pos.z];
        const va = this._pv(A, rA), vb = this._pv(B, rB);
        const vrx = va[0] - vb[0], vry = va[1] - vb[1], vrz = va[2] - vb[2];
        const vn = vrx * nx + vrz * nz;
        if (vn >= 0) continue;
        A.R.fromQuat(A.q); B.R.fromQuat(B.q);
        const den = A.invMass + B.invMass + this._angTerm(A, rA, nx, nz) + this._angTerm(B, rB, nx, nz);
        const j = -(1 + this.E) * vn / den;
        A._applyImpulse(rA[0], rA[1], rA[2], nx * j, 0, nz * j);
        B._applyImpulse(rB[0], rB[1], rB[2], -nx * j, 0, -nz * j);
        // Reibung tangential
        const tx = vrx - nx * vn, tz = vrz - nz * vn, tl = Math.hypot(tx, tz);
        if (tl > 0.05) {
          const jt = Math.min(this.MU * j, tl / (A.invMass + B.invMass) * 0.5);
          A._applyImpulse(rA[0], rA[1], rA[2], -tx / tl * jt, 0, -tz / tl * jt);
          B._applyImpulse(rB[0], rB[1], rB[2], tx / tl * jt, 0, tz / tl * jt);
        }
        const sp = -vn;
        for (const [V, s] of [[A, 1], [B, -1]]) {
          if (sp > 0.6) { V.impact = Math.max(V.impact, sp); V.impactTime = V.time; V.impactNormal.set(nx * s, 0, nz * s); V.events.push({ type: 'impact', value: sp, car: true }); }
        }
        if (onHit) onHit(ea, eb, sp, cx, cz);
      }
    }
  },
  _pv(V, r) { const v = V.vel, w = V.angVel; return [v.x + w.y * r[2] - w.z * r[1], v.y + w.z * r[0] - w.x * r[2], v.z + w.x * r[1] - w.y * r[0]]; },
  _angTerm(V, r, nx, nz) {
    // n · ((I⁻¹ (r × n)) × r)
    const rxn = V._t1.set(r[1] * nz, r[2] * nx - r[0] * nz, -r[1] * nx);
    const ii = V._invInertiaWorld(rxn, V._t2);
    const cx = ii.y * r[2] - ii.z * r[1], cz = ii.x * r[1] - ii.y * r[0];
    return cx * nx + cz * nz;
  },
};

/** Startplatz k (0 = Pole) – identisch zu RaceSession._placeGrid (Mehrspieler: Client stellt sein Auto selbst auf) */
function gridSlot(T, k) {
  const L = T.length, s = L - 14 - k * 8.2, j = Math.floor(s / T.ds) % T.N, hw = T.HW[j];
  return { s, lat: (k % 2 === 0 ? -1 : 1) * Math.min(2.7, hw * 0.34) };
}

/** Trefferrichtung Welt → Fahrzeugsystem (lx rechts, lz hinten; normiert) */
function localDir(v, wx, wz) {
  const R = v.R.fromQuat(v.q).e;
  const rx = R[0], rz = R[6], fx = -R[2], fz = -R[8];
  const lx = wx * rx + wz * rz, lf = wx * fx + wz * fz, l = Math.hypot(lx, lf) || 1;
  return [lx / l, -lf / l];
}

// ---------------------------------------------------------------------------
//  Zeitnahme: Runden, Sektoren (mit Interpolation), Track Limits
// ---------------------------------------------------------------------------
class LapTiming {
  constructor(track, { mode = 'practice' } = {}) {
    this.track = track; this.mode = mode;
    this.time = 0; this.lapStart = 0; this.started = false; this.crossings = 0;
    this.lap = 0;                // aktuelle Runde (1 = erste gezeitete Runde)
    this.prevS = null; this.progress = 0;
    this.sector = 0; this.secStart = 0;
    this.cur = [null, null, null]; this.last = [null, null, null]; this.best = [Infinity, Infinity, Infinity];
    this.lastLap = Infinity; this.bestLap = Infinity; this.laps = [];
    this.valid = true;
    this.limT = 0; this.limOut = false; this.limBackT = 0; this.violations = 0;
    this.listeners = [];
  }
  on(fn) { this.listeners.push(fn); }
  _emit(type, data) { for (const f of this.listeners) f(type, data, this); }
  get lapTime() { return this.started ? this.time - this.lapStart : 0; }
  invalidate(reason) { if (this.started && this.valid) { this.valid = false; this._emit('invalid', reason); } }
  /** Rennstart: Zeitnahme läuft ab dem Erlöschen der Ampel, Runde 1 beginnt sofort */
  startRace(t, s0 = 0) { this.started = true; this.lapStart = t; this.secStart = t; this.sector = 0; this.lap = 1; this.valid = true; this.progress = s0 > this.track.length / 2 ? s0 - this.track.length : s0; }
  step(h, v) {
    this.time += h;
    const L = this.track.length, s = v.trackS, Sb = this.track.sectorS;
    if (this.prevS !== null) {
      let ds = s - this.prevS; if (ds < -L / 2) ds += L; if (ds > L / 2) ds -= L;
      this.progress += ds;
      const tPrev = this.time - h;
      // Ziellinie
      if (this.prevS > L - 80 && s < 80 && ds > 0) {
        const frac = (L - this.prevS) / Math.max(1e-6, (L - this.prevS) + s), tc = tPrev + h * frac;
        this.crossings++;
        if (this.mode === 'race') {
          if (this.started && this.progress > L * 0.5) this._finishLap(tc, v);
          else if (this.started) this.progress = s;      // Startüberquerung direkt nach dem Start zählt nicht
        } else {
          if (this.started) this._finishLap(tc, v);
          this.started = true; this.lap++; this.lapStart = tc; this.secStart = tc; this.sector = 0; this.valid = true;
          this.cur = [null, null, null]; this.progress = s;
          this._emit('lapStart', this.lap);
        }
      } else if (this.started && ds > 0) {
        // Sektorgrenzen 1 und 2
        for (let k = 1; k < Sb.length; k++) {
          if (this.sector === k - 1 && this.prevS < Sb[k] && s >= Sb[k] && s - this.prevS < 80) {
            const tc = tPrev + h * (Sb[k] - this.prevS) / Math.max(1e-6, s - this.prevS);
            this._sector(k - 1, tc - this.secStart); this.secStart = tc; this.sector = k;
          }
        }
      }
    }
    this.prevS = s;
    // Track Limits: alle vier Räder jenseits der weißen Linie
    if (this.started && v.speed > 12 && !v.inPitLane && !v.pitAuto) {
      if (v.limitWheels >= 4) {
        this.limT += h; this.limBackT = 0;
        if (!this.limOut && this.limT > 0.12) { this.limOut = true; this.violations++; this.invalidate('Track Limits'); this._emit('limits', this.violations); }
      } else { this.limT = 0; this.limBackT += h; if (this.limBackT > 0.8) this.limOut = false; }
    }
  }
  _sector(k, t) {
    this.cur[k] = t;
    const pb = t < this.best[k];
    if (this.valid && pb) this.best[k] = t;
    this._emit('sector', { k, t, pb: pb && this.valid });
  }
  _finishLap(tc, v) {
    const t = tc - this.lapStart;
    if (this.sector === 2) this._sector(2, tc - this.secStart);
    const valid = this.valid && (this.mode === 'race' || this.progress > this.track.length * 0.95);
    this.lastLap = t; this.last = this.cur.slice();
    const rec = { lap: this.lap, time: t, sectors: this.cur.slice(), valid };
    this.laps.push(rec);
    const best = valid && t < this.bestLap;
    if (best) this.bestLap = t;
    this._emit('lap', { ...rec, best });
    if (this.mode === 'race') {
      this.lap++; this.lapStart = tc; this.secStart = tc; this.sector = 0; this.valid = true; this.cur = [null, null, null];
      this.progress = v.trackS;
    }
  }
}

// ---------------------------------------------------------------------------
//  Rennablauf
// ---------------------------------------------------------------------------
const RACE_MARKS = 120;    // Zeitmarken je Runde für Abstände

class RaceSession {
  /**
   * opts: { track, line, laps, entries: [{ driver, team, number, player?, profile? }],
   *         damage: 'off'|'reduced'|'full', aiStrength, rng, startDelay }
   */
  constructor(opts) {
    this.track = opts.track; this.line = opts.line; this.laps = opts.laps;
    this.damage = opts.damage || 'full'; this.rng = opts.rng || Math.random;
    this.time = 0; this.state = 'grid'; this.lights = 0; this.greenAt = null;
    this.stateT = 0; this.holdT = 1.0 + this.rng() * 2.0;
    this.flag = 'green'; this.leaderDone = false; this.finishOrder = []; this.messages = [];
    this.bestSectors = [Infinity, Infinity, Infinity]; this.fastest = { time: Infinity, entry: null, lap: 0 };
    this.slipT = 0; this.stratT = 0;
    this.mandatory = opts.mandatory ?? this.laps >= 10;          // Pflichtstopp: zwei verschiedene Trockenmischungen
    this.safetyCarOn = opts.safetyCar !== false;
    this.weather = opts.weather || new Weather('dry');
    this.sc = null; this.zones = []; this.playerFlag = 'green'; this.flagT = 0; this.prevAhead = new Map();
    const T = this.track, L = T.length;
    this.entries = opts.entries.map((e, idx) => {
      const v = new Vehicle(CAR_SPEC, e.setup || {});
      v.setCompound(e.compound || 'medium', 75);
      const en = {
        idx, driver: e.driver, team: e.team, number: e.number, player: !!e.player, remote: !!e.remote, netId: e.netId ?? null, name: e.driver.name,
        vehicle: v, ai: null, timing: new LapTiming(T, { mode: 'race' }),
        active: true, retired: false, finished: false, finishTime: null, penalty: 0, warnings: 0,
        distance: -1e9, pos: idx + 1, gridPos: idx + 1, marks: new Float64Array((this.laps + 3) * RACE_MARKS).fill(NaN), markIdx: -1,
        ghostT: 0, jump: false, gridX: 0, gridZ: 0, pitStops: 0, lastHit: -10,
        pitPlan: null, pitting: false, pitPilot: null, used: new Set([e.compound || 'medium']), stintStart: 0, penaltyServed: 0,
        teamIdx: Math.max(0, TEAMS.findIndex(t => t.id === e.team)), stopLap: 0.3 + this.rng() * 0.35,
      };
      if (!e.player && !e.remote) {
        const prof = e.profile || makeAIProfile(e.driver, opts.aiStrength ?? 1, this.rng);
        if ((opts.aiStrength ?? 1) > 1) v.trackGrip = 1 + ((opts.aiStrength ?? 1) - 1) * 0.6;   // über 100 %: etwas mehr Haftung
        if (e.trackGrip) v.trackGrip = (v.trackGrip || 1) * e.trackGrip;                     // Karriere: Teamstärke
        en.ai = new AIDriver(v, this.line, prof, idx * 13 + 7);
        en.ai.relPlayer = e.relPlayer || 0;                                                     // Karriere: Beziehung zum Spieler (−1…1)
        en.ai.hold();
      } else if (e.trackGrip) v.trackGrip = e.trackGrip;
      v.onImpact = (sp, nx, nz) => this._onWall(en, sp, nx, nz);
      en.timing.on((type, data) => this._onTiming(en, type, data));
      return en;
    });
    this._placeGrid();
    this.player = this.entries.find(e => e.player) || null;
  }

  /** Startplätze: versetzt in Zweierreihen hinter der Linie (8 m Abstand) */
  /** Mehrspieler: Fahrzeug eines Mitspielers (Zustand vom Netz) – Zeitnahme/Distanz wie bei allen anderen */
  _stepRemote(e, h, L) {
    const v = e.vehicle;
    v.netStep(h);
    e.timing.step(h, v);
    const tm = e.timing;
    e.distance = tm.started ? tm.laps.length * L + tm.progress : v.trackS - L;
    if (e.distance >= 0) { const k = Math.floor(e.distance / L * RACE_MARKS); while (e.markIdx < k && e.markIdx + 1 < e.marks.length) { e.markIdx++; e.marks[e.markIdx] = this.time; } }
    if (e.netRetired && !e.retired) this._retire(e, 'Unfall');
  }
  _placeGrid() {
    const T = this.track, L = T.length;
    this.entries.forEach((e, k) => {
      const s = L - 14 - k * 8.2;
      const j = Math.floor(s / T.ds) % T.N, hw = T.HW[j];
      const lat = (k % 2 === 0 ? -1 : 1) * Math.min(2.7, hw * 0.34);
      e.vehicle.placeOnTrack(T, s, lat);
      e.vehicle.gear = 1; e.vehicle.drsOK = false;
      e.gridX = e.vehicle.pos.x; e.gridZ = e.vehicle.pos.z;
      e.timing.prevS = e.vehicle.trackS;
      e.distance = s - L;
    });
  }

  msg(text, entry = null, kind = 'info') { this.messages.push({ t: this.time, text, entry, kind }); if (this.messages.length > 60) this.messages.shift(); Events.emit('race:msg', text, entry, kind); }

  _onWall(en, sp, nx, nz) {
    if (this.state === 'grid' || this.state === 'lights') return;
    const v = en.vehicle;
    const [lx, lz] = localDir(v, -nx, -nz);
    this._hurt(en, sp, lx, lz);
  }
  _hurt(en, sp, lx, lz) {
    if (en.remote) { if (this.onRemoteHit) this.onRemoteHit(en, sp, lx, lz); return; }   // Schaden rechnet der Rechner des Mitspielers
    const v = en.vehicle, r = Damage.apply(v, sp, lx, lz, this.damage, this.rng);
    if (!r) return;
    if (en.player && r.amt > 0.08) Events.emit('race:damage', r.parts, Damage.summary(v));
    if (Damage.terminal(v) && !en.retired) this._retire(en, 'Unfall');
  }
  _retire(en, why) {
    en.retired = true; en.retireReason = why;
    // Unfallwrack bleibt als Hindernis stehen (gelbe Flagge), bis es geborgen wird
    if (this.state === 'race') { en.wreck = true; en.wreckT = 0; this._neutralize(en); } else if (!en.player) en.active = false;
    this.msg(`${en.name} ist ausgeschieden (${why})`, en, 'out');
    Events.emit('race:retired', en, why);
    if (this.onMark) this.onMark('out', en.idx, `${en.name} ausgeschieden`);
  }
  _onTiming(en, type, data) {
    if (type === 'lap') {
      const t = data.time;
      if (data.valid && t < this.fastest.time) {
        const first = this.fastest.entry === null;
        this.fastest = { time: t, entry: en, lap: data.lap };
        if (!first || this.laps > 1) this.msg(`Schnellste Runde: ${en.name} ${fmtTime(t)}`, en, 'fastest');
      }
      // Zielflagge
      const done = en.timing.laps.length;
      if (!en.finished && (done >= this.laps || this.leaderDone)) {
        en.finished = true; en.finishTime = en.timing.time; this.finishOrder.push(en);
        if (this.mandatory && !this.weather.wetEver && en.used.size < 2) { en.penalty += 30; this.msg(`${en.name}: 30 s Strafe – Pflichtstopp nicht erfüllt`, en, 'pen'); }
        if (!this.leaderDone) { this.leaderDone = true; this.flag = 'chequered'; this.msg(`${en.name} gewinnt das Rennen!`, en, 'win'); }
        Events.emit('race:finished', en);
      }
    } else if (type === 'sector') {
      if (en.timing.valid && data.t < this.bestSectors[data.k]) { this.bestSectors[data.k] = data.t; data.overall = true; }
      if (en.player) Events.emit('race:sector', data);
    } else if (type === 'limits') {
      en.warnings = data;
      if (en.ai) en.ai.caution = Math.min(0.025, en.ai.caution + 0.006);   // nach Verwarnung vorsichtiger
      if (data <= 3) { if (en.player) Events.emit('race:limits', data, data === 3 ? 'Schwarz-weiße Flagge' : `Verwarnung ${data}/3`); }
      else { en.penalty += 5; this.msg(`${en.name}: 5 s Zeitstrafe (Track Limits)`, en, 'pen'); if (en.player) Events.emit('race:limits', data, '5 s Zeitstrafe'); }
    }
  }

  /** Abstand in Sekunden von b hinter a (über Zeitmarken), oder Runden zurück */
  gap(a, b) {
    if (!a || !b) return null;
    const lapsDown = Math.floor((a.distance - b.distance) / this.track.length);
    if (lapsDown >= 1 && !(a.finished && b.finished)) return { laps: lapsDown };
    const k = b.markIdx;
    if (k < 0 || isNaN(a.marks[k]) || isNaN(b.marks[k])) return { s: 0 };
    return { s: b.marks[k] - a.marks[k] };
  }

  /** Ein Physikschritt aller Fahrzeuge (Spieler-Eingaben sind bereits gesetzt) */
  step(h) {
    this.time += h; this.stateT += h;
    const T = this.track, L = T.length, aiState = this.state === 'race' ? 'race' : 'grid';
    // Start-Ablauf: 5 Lichter im Sekundentakt, dann zufällige Wartezeit, Ampel aus
    if (this.state === 'grid' && this.stateT > 2.5) { this.state = 'lights'; this.stateT = 0; this.lights = 0; }
    if (this.state === 'lights') {
      const n = Math.min(5, Math.floor(this.stateT) + 1);
      if (n !== this.lights) { this.lights = n; Events.emit('race:lights', n); }
      if (this.stateT > 5 + this.holdT) {
        this.state = 'race'; this.lights = 0; this.greenAt = this.time; Events.emit('race:lights', 0); Events.emit('race:start');
        for (const e of this.entries) { e.timing.startRace(e.timing.time, e.vehicle.trackS); if (e.ai) e.ai.launch(this.time); }
      }
    }
    this.weather.step(h);
    const water = this.weather.water;
    for (const e of this.entries) e.vehicle.water = water;
    if (this.sc && this.sc.car) this.sc.car.vehicle.water = water;
    const ctx = { cars: this.sc && this.sc.car ? this.entries.concat([this.sc.car]) : this.entries, state: aiState, time: this.time, me: null, cap: 0 };
    if (this.sc && this.sc.car) this._stepSafetyCar(h);
    for (const e of this.entries) {
      if (!e.active) continue;
      const v = e.vehicle;
      // Spieler in der Startaufstellung: Kupplung getrennt halten (Gas geben zum Vorbereiten ist erlaubt)
      if (e.player && !e.ai && this.state !== 'race') v.input.clutch = 1;
      if (e.remote) { this._stepRemote(e, h, L); continue; }
      this._pitLogic(e);
      if (e.wreck) { v.input.throttle = 0; v.input.brake = 1; v.input.steer = 0; e.wreckT += h; if (!e.player && e.wreckT > (this.sc ? 20 : 14)) { e.wreck = false; e.active = false; } }
      const drv = e.retired ? null : (e.pitPilot || e.ai);
      if (drv) {
        ctx.me = e; ctx.cap = e.finished ? 52 : 0;
        drv.control(h, ctx);
        if (drv.needsReset && !e.pitting) this._recover(e);
      }
      v.step(h);
      if (!e.player) v.events.length = 0;
      e.timing.step(h, v);
      if (e.ghostT > 0) e.ghostT -= h;
      // Frühstart (nur Spieler): mehr als 1 m vom Startplatz vor Ampel aus
      if (e.player && (this.state === 'grid' || this.state === 'lights') && !e.jump && Math.hypot(v.pos.x - e.gridX, v.pos.z - e.gridZ) > 1.0) {
        e.jump = true; e.penalty += 5; this.msg('Frühstart – 5 s Zeitstrafe', e, 'pen'); Events.emit('race:limits', 0, 'Frühstart – 5 s Zeitstrafe');
      }
      // Renndistanz und Zeitmarken
      const tm = e.timing;
      e.distance = tm.started ? tm.laps.length * L + tm.progress : v.trackS - L;
      if (e.distance >= 0) {
        const k = Math.floor(e.distance / L * RACE_MARKS);
        while (e.markIdx < k && e.markIdx + 1 < e.marks.length) { e.markIdx++; e.marks[e.markIdx] = this.time; }
      }
      // Motorschaden durch Treffer → Ausfall
      if (e.vehicle.health.engine <= 0.05 && !e.retired) this._retire(e, 'Antriebsschaden');
    }
    // Kollisionen
    CarContacts.resolve(this.entries, L, (a, b, sp, cx, cz) => {
      if (this.state !== 'race') return;
      for (const en of [a, b]) {
        if (this.time - en.lastHit < 0.25) continue;
        en.lastHit = this.time;
        const [lx, lz] = localDir(en.vehicle, cx - en.vehicle.pos.x, cz - en.vehicle.pos.z);
        // KI gegen KI: abgeschwächter Schaden (die KI soll sich nicht gegenseitig aus dem Rennen nehmen)
        this._hurt(en, sp * (a.player || b.player ? 0.8 : 0.45), lx, lz);
      }
      if ((a.player || b.player) && sp > 3) Events.emit('race:contact', sp);
      if (this.onContact && sp > 2) this.onContact(a, b, sp);
      if (sp > 2.5 && this.onMark) this.onMark('contact', (a.player || b.player) ? (a.player ? a : b).idx : a.idx, `Kontakt ${a.name} / ${b.name}`);
    });
    // Windschatten / verwirbelte Luft (≈ 20 Hz)
    this.slipT -= h;
    if (this.slipT <= 0) { this.slipT = 0.05; this._aeroWake(); this._positions(); this._overtakeDetect(); this._flags(0.05); }
    if (this.sc) this._scLogic(h);
    this.stratT -= h;
    if (this.stratT <= 0) { this.stratT = 1; for (const e of this.entries) this._strategy(e); }
    // Rennende: alle im Ziel oder ausgeschieden
    if (this.leaderDone && !this.over) {
      const left = this.entries.filter(e => !e.finished && !e.retired);
      const humansDone = this.entries.every(e => !(e.player || e.remote) || e.finished || e.retired);
      if (!left.length || (this.player && humansDone && this.time - this.finishOrder[0].finishTime > 75)) { this.over = true; Events.emit('race:over'); }
    }
  }

  // ---------------------------------------------------------------------------
  //  Boxenstopps
  // ---------------------------------------------------------------------------
  /** Box anfordern/abbrechen (Spieler): plan = { compound, repair } */
  togglePit(e, plan) {
    if (e.pitting) return 'läuft';
    if (e.pitPlan) { e.pitPlan = null; return 'abgebrochen'; }
    e.pitPlan = Object.assign({ why: 'Spieler' }, plan); return 'angefordert';
  }
  _damaged(v) { const H = v.health; return H.fw < 0.97 || H.rw < 0.97 || H.floor < 0.97 || H.susp.some(x => x < 0.97); }
  _pitLogic(e) {
    const T = this.track, P = T.pit, v = e.vehicle;
    if (!P || e.retired || this.state !== 'race' || e.pitting) return;
    // ohne Anforderung in die Gasse gefahren → Standardstopp
    if (!e.pitPlan && v.inPitLane) e.pitPlan = { compound: v.compound === 'medium' ? 'hard' : 'medium', repair: true, why: 'Spieler' };
    if (!e.pitPlan) return;
    const L = T.length, dIn = ((P.sIn - v.trackS) % L + L) % L, rel = T.pitRel(v.trackS);
    if (dIn < 180 || (rel >= 0 && rel < P.open * T.ds) || v.inPitLane) this._beginPit(e);
  }
  _beginPit(e) {
    const P = this.track.pit, plan = e.pitPlan, v = e.vehicle;
    e.pitting = true;
    let drv = e.ai;
    if (!drv || e.player) { drv = e.pitPilot = new AIDriver(v, this.line, { skill: 0.97, aggression: 0, consistency: 1, reaction: 0 }, 77); }
    const repair = plan.repair !== false && this._damaged(v);
    const pending = Math.max(0, e.penalty - e.penaltyServed);
    const service = 2.2 + this.rng() * 0.7 + (repair ? 6.5 : 0) + pending;
    drv.startPit({ boxS: P.boxes[e.teamIdx % P.boxes.length], serviceTime: service,
      onService: () => this._service(e, plan, repair, service, pending),
      onDone: () => { e.pitting = false; e.pitPilot = null; v.pitAuto = false; Events.emit('race:pitdone', e); },
      onAbort: () => { e.pitting = false; e.pitPilot = null; v.pitAuto = false; if (e.player) Events.emit('race:pitmissed', e); } });
    if (e.player) Events.emit('race:pitentry', e, plan);
  }
  _service(e, plan, repair, t, pending) {
    const v = e.vehicle;
    // KI: Reifenwahl beim Stopp an die aktuelle Nässe anpassen (der Plan kann Runden alt sein)
    if (!e.player) {
      const w = this.weather.water, best = Weather.bestFor(w), wetC = plan.compound === 'inter' || plan.compound === 'wet';
      if (best && !wetC) plan.compound = best;
      else if (best && wetC && plan.compound !== best) plan.compound = best;
      else if (!best && wetC) plan.compound = (this.laps - e.timing.laps.length) <= 8 ? 'soft' : 'medium';
    }
    v.setCompound(plan.compound, 80);
    if (repair) { const toe = v.health.toe; Damage.repair(v); toe.fill(0); }
    e.used.add(plan.compound); e.pitStops++; e.stintStart = e.distance; e.penaltyServed += pending;
    e.pitPlan = null;
    const txt = `${e.name}: Boxenstopp ${t.toFixed(1).replace('.', ',')} s · ${COMPOUNDS[plan.compound].name}${repair ? ' · Reparatur' : ''}${pending ? ` · ${pending} s Strafe abgesessen` : ''}`;
    this.msg(txt, e, 'pit');
    Events.emit('race:service', e, t, { plan, repair });
  }
  /** KI-Strategie (1 Hz): Reifenverschleiß, Pflichtstopp, Schaden, Safety Car */
  _strategy(e) {
    if (!e.ai || e.player || e.pitting || e.pitPlan || e.finished || e.retired || this.state !== 'race' || !this.track.pit) return;
    const L = this.track.length, done = e.timing.laps.length, rem = this.laps - done;
    if (rem < 1) return;
    const v = e.vehicle, wear = Math.max(...v.wheels.map(w => w.tyre.wear));
    const stint = (e.distance - e.stintStart) / L, cur = v.compound;
    const rateM = stint > 1 ? wear / stint / COMPOUNDS[cur].wear : 0.042;     // Verschleiß je Runde, auf „Mittel“ normiert
    const life = (c) => 0.66 / (rateM * COMPOUNDS[c].wear);                      // Runden bis zur Verschleißgrenze
    const mustStop = this.mandatory && !this.weather.wetEver && e.used.size < 2;
    const endWear = wear + rateM * COMPOUNDS[cur].wear * rem;
    let why = '';
    // Wetter: auf passende Reifen wechseln (Intermediate ab ≈ 42 % Nässe, Regenreifen ab ≈ 64 %)
    const water = this.weather.water, best = Weather.bestFor(water), wetTyre = cur === 'inter' || cur === 'wet';
    let wetPick = null;
    if (!wetTyre && best && water > (best === 'wet' ? 0.6 : 0.44) && rem >= 1) wetPick = best;
    else if (cur === 'inter' && water > 0.68 && rem > 2) wetPick = 'wet';
    else if (cur === 'wet' && water < 0.55 && water > 0.4 && rem > 2) wetPick = 'inter';
    if (wetPick) { if (!this.entries.some(o => o !== e && o.team === e.team && (o.pitting || o.pitPlan))) e.pitPlan = { compound: wetPick, repair: true, why: 'Regen' }; return; }
    if (wetTyre && water < 0.33 && rem > 1) why = 'Abtrocknen';
    else if (wetTyre) return;
    else if (wear > 0.66 && rem > 1) why = 'Reifen';
    else if ((v.health.fw < 0.6 || v.health.rw < 0.55) && rem > 4) why = 'Schaden';
    else if (mustStop && rem <= 2) why = 'Pflichtstopp';
    else if (this.sc && this.sc.kind && rem > 3 && wear > 0.22 && (mustStop || endWear > 0.66)) why = 'Safety Car';
    else if (mustStop && done >= Math.floor(this.laps * e.stopLap) && endWear > 0.3) why = 'Plan';
    else if (!mustStop && endWear > 0.72 && life(cur) - stint < 1.5 && rem > 2) why = 'Reifen';
    if (!why) return;
    // nicht gleichzeitig mit dem Teamkollegen (eine Box je Team)
    if (this.entries.some(o => o !== e && o.team === e.team && (o.pitting || o.pitPlan))) return;
    const order = ['soft', 'medium', 'hard'];
    let pick = order.find(c => life(c) >= rem) || 'hard';
    if (mustStop && e.used.has(pick)) pick = order.find(c => !e.used.has(c) && life(c) >= rem * 0.9) || order.find(c => !e.used.has(c));
    e.pitPlan = { compound: pick, repair: true, why };
  }

  // ---------------------------------------------------------------------------
  //  Flaggen, Safety Car, virtuelles Safety Car
  // ---------------------------------------------------------------------------
  /** Unfall: je nach Lage gelbe Flagge, VSC oder Safety Car */
  _neutralize(en) {
    const lead = (this.order || this.entries)[0], rem = this.laps - (lead ? lead.timing.laps.length : 0);
    if (!this.safetyCarOn || rem <= 2 || this.leaderDone) return;
    if (this.sc) { this.sc.t = Math.min(this.sc.t, 10); return; }        // läuft schon → verlängern
    this._startSC(this.rng() < 0.55 ? 'sc' : 'vsc');
  }
  _startSC(kind) {
    const T = this.track, L = T.length, lead = (this.order || this.entries).find(e => !e.retired) || this.entries[0];
    this.sc = { kind, t: 0, phase: 'deploy', startLaps: lead.timing.laps.length, car: null, dur: 30 + this.rng() * 15 };
    if (kind === 'sc') {
      const v = new Vehicle(CAR_SPEC, {}); v.setCompound('hard', 90);
      const s = (lead.vehicle.trackS + 450) % L;
      v.placeOnTrack(T, s, this.line.offsetAt(s));
      const ai = new AIDriver(v, this.line, { skill: 0.95, aggression: 0, consistency: 1, reaction: 0 }, 999);
      ai.flagCap = 0.75; ai.noPass = true;
      this.sc.car = { vehicle: v, ai, sc: true, active: true, name: 'Safety Car', team: 'sc', distance: lead.distance + 450, idx: -1 };
    }
    this.msg(kind === 'sc' ? 'SAFETY CAR' : 'VIRTUELLES SAFETY CAR', null, 'sc');
    Events.emit('race:sc', kind, 'deploy');
  }
  _stepSafetyCar(h) {
    const c = this.sc.car, v = c.vehicle, lead = (this.order || this.entries).find(e => !e.retired);
    c.ai.control(h, { cars: [], me: null, state: 'race', time: this.time, cap: 0 });
    v.step(h); v.events.length = 0;
    if (lead) { let ds = v.trackS - lead.vehicle.trackS; const L = this.track.length; if (ds < -L / 2) ds += L; if (ds > L / 2) ds -= L; c.distance = lead.distance + ds; }
  }
  _scLogic(h) {
    const sc = this.sc, T = this.track, L = T.length;
    sc.t += h;
    const lead = (this.order || this.entries).find(e => !e.retired && !e.finished);
    if (!lead) { this.sc = null; return; }
    if (sc.kind === 'vsc') {
      if (sc.phase === 'deploy' && sc.t > sc.dur) { sc.phase = 'ending'; sc.t = 0; this.msg('VSC endet', null, 'sc'); Events.emit('race:sc', 'vsc', 'ending'); }
      else if (sc.phase === 'ending' && sc.t > 4) this._green();
    } else {
      // Safety Car: nach zwei Führungsrunden hinter dem SC kommt es herein, Neustart an der Linie
      if (sc.phase === 'deploy' && lead.timing.laps.length - sc.startLaps >= 1 && sc.t > 75) { sc.phase = 'in'; this.msg('Safety Car kommt in dieser Runde herein', null, 'sc'); Events.emit('race:sc', 'sc', 'in'); }
      if (sc.phase === 'in' && sc.car && T.pit) {
        const dIn = ((T.pit.sIn - sc.car.vehicle.trackS) % L + L) % L;
        if (dIn < 60) { sc.car = null; sc.phase = 'restart'; sc.restartLaps = lead.timing.laps.length; }
      }
      if (sc.phase === 'restart' && lead.timing.laps.length > sc.restartLaps) this._green();
    }
  }
  _green() { this.sc = null; this.msg('GRÜNE FLAGGE', null, 'green'); Events.emit('race:sc', null, 'green'); }
  /** Gelbe Zonen um langsame/stehende Autos; Flaggen je Fahrer; Strafen für den Spieler (20 Hz) */
  _flags(dt) {
    const T = this.track, L = T.length, live = this.state === 'race' && this.time - (this.greenAt || 0) > 8;
    this.zones = [];
    for (const e of this.entries) {
      if (!e.active || e.finished) continue;
      const v = e.vehicle;
      const slow = live && !e.pitting && !v.inPitLane && v.speed < 14;
      if (e.wreck || slow) e.yellowUntil = this.time + 4;
      if ((e.yellowUntil || 0) > this.time) this.zones.push({ s: v.trackS, e });
    }
    const inYellow = (s, self) => this.zones.some(z => { if (z.e === self) return false; let d = z.s - s; if (d < -L / 2) d += L; if (d > L / 2) d -= L; return d > -40 && d < 260; });
    const sc = this.sc, neutral = sc && sc.phase !== 'ending';
    for (const e of this.entries) {
      if (!e.ai || e.retired) continue;
      const ai = e.ai, yel = inYellow(e.vehicle.trackS, e);
      ai.noPass = !!neutral || yel; ai.scGap = sc && sc.kind === 'sc' ? 14 : 0;
      let cap = yel ? 0.9 : 1;
      if (sc && sc.kind === 'vsc' && sc.phase === 'deploy') cap = 0.7;
      ai.queue = null;
      if (sc && sc.kind === 'sc') {
        // Kolonne: dem physisch nächsten Auto voraus folgen (Spitzenreiter → Safety Car), unabhängig von der Spur
        cap = Math.min(cap, 0.95);
        if (!e.pitting && !e.vehicle.inPitLane) {
          let best = null, bd = 1e9;
          const cand = sc.car ? this.entries.concat([sc.car]) : this.entries;
          for (const o of cand) {
            if (o === e || !o.active || o.pitting || o.vehicle.inPitLane) continue;
            let ds = o.vehicle.trackS - e.vehicle.trackS; if (ds < 0) ds += L;
            if (ds > 1 && ds < bd) { bd = ds; best = o; }
          }
          if (best && bd < L * 0.5) ai.queue = { v: best.vehicle, ds: bd };
        }
      }
      ai.flagCap = cap;
    }
    // Spieler: Flagge, Überholen unter Gelb/SC, VSC-Tempo
    const me = this.player; if (!me || me.retired || me.finished) { this.playerFlag = this.flag === 'chequered' ? 'chequered' : 'green'; return; }
    const mv = me.vehicle, yel = inYellow(mv.trackS, me);
    let blue = false;
    for (const o of this.entries) {
      if (o === me || !o.active || o.retired) continue;
      let ds = o.vehicle.trackS - mv.trackS; if (ds < -L / 2) ds += L; if (ds > L / 2) ds -= L;
      if (ds < 0 && ds > -70 && o.distance - me.distance > L * 0.5) blue = true;
      const ahead = o.distance > me.distance, was = this.prevAhead.get(o.idx);
      if (live && was === true && !ahead && (yel || neutral) && o.vehicle.speed > 18 && !mv.inPitLane && !o.vehicle.inPitLane && !o.pitting && Math.abs(ds) < 60) {
        me.penalty += 5; this.msg(`Du: 5 s Zeitstrafe – Überholen unter ${neutral ? (sc.kind === 'sc' ? 'Safety Car' : 'VSC') : 'gelber Flagge'}`, me, 'pen');
        Events.emit('race:limits', 0, `5 s Strafe: Überholen unter ${neutral ? (sc.kind === 'sc' ? 'Safety Car' : 'VSC') : 'Gelb'}`);
      }
      this.prevAhead.set(o.idx, ahead);
    }
    this.vscMax = null;
    if (sc && sc.kind === 'vsc' && sc.phase === 'deploy') {
      const prof = this.line.profile(1), vmax = prof[mv.trackIdx] * 0.7 * 1.06;
      this.vscMax = vmax;
      if (mv.vLong > vmax && !mv.inPitLane) me.vscOver = (me.vscOver || 0) + dt;
      if (me.vscOver > 3 && !me.vscPen) { me.vscPen = true; me.penalty += 5; this.msg('Du: 5 s Zeitstrafe – zu schnell unter VSC', me, 'pen'); Events.emit('race:limits', 0, '5 s Strafe: zu schnell unter VSC'); }
    } else { me.vscOver = 0; me.vscPen = false; }
    const f = this.flag === 'chequered' ? 'chequered' : neutral ? sc.kind : (sc && sc.phase === 'ending') ? 'vscEnd' : yel ? 'yellow' : blue ? 'blue' : 'green';
    if (f !== this.playerFlag) { this.playerFlag = f; Events.emit('race:flag', f); }
  }

  /** KI zurück auf die Strecke setzen (kurzzeitig ohne Kollision) */
  _recover(e) {
    const v = e.vehicle, T = this.track;
    const s = v.trackS, lo = this.line.offsetAt(s);
    const tyres = v.wheels.map(w => w.tyre), soc = v.soc;
    v.placeOnTrack(T, s, lo);
    v.wheels.forEach((w, i) => { w.tyre = tyres[i]; }); v.soc = soc; v.gear = 1;
    e.timing.prevS = v.trackS;
    e.ghostT = 4; e.ai.resetAfterRecovery();
  }

  _aeroWake() {
    const L = this.track.length, A = this.entries.filter(e => e.active);
    for (const e of A) {
      const v = e.vehicle; let slip = 0, dirty = 0;
      for (const o of A) {
        if (o === e) continue;
        let ds = o.vehicle.trackS - v.trackS; if (ds > L / 2) ds -= L; if (ds < -L / 2) ds += L;
        if (ds <= 2 || ds > 60) continue;
        const dl = Math.abs(o.vehicle.lateral - v.lateral);
        if (dl > 2.2) continue;
        const w = 1 - dl / 2.2;
        slip = Math.max(slip, (1 - ds / 60) * w * smoothstep(25, 45, v.speed));
        if (ds < 30) dirty = Math.max(dirty, (1 - ds / 30) * w);
      }
      v.slipstream = slip; v.dirtyAir = dirty;
    }
  }

  _positions() {
    const fin = this.finishOrder;
    const rest = this.entries.filter(e => !e.finished).sort((a, b) => (a.retired - b.retired) || (b.distance - a.distance));
    const order = [...fin, ...rest];
    order.forEach((e, i) => { e.pos = i + 1; });
    this.order = order;
  }

  /** Überholmodus: an den Erkennungspunkten < 1 s hinter dem Vordermann → für eine Runde verfügbar */
  _overtakeDetect() {
    if (this.state !== 'race') return;
    const D = this.track.detectS, order = this.order || this.entries;
    for (const e of order) {
      const v = e.vehicle, s = v.trackS;
      e._lastDetS = e._lastDetS ?? s;
      for (const d of D) {
        if (e._lastDetS < d && s >= d && s - e._lastDetS < 100) {
          const ahead = order[e.pos - 2];
          const g = ahead ? this.gap(ahead, e) : null;
          const ok = e.timing.laps.length >= 1 && g && g.s != null && g.s > 0 && g.s < 1.0;
          v.overtakeAvailable = ok; v.drsOK = ok; if (!ok) v.overtakeActive = false;
          if (e.ai && ok) e.ai.wantOvertake = true;
        }
      }
      e._lastDetS = s;
      if (e.ai && v.spec.ers.overtake && v.overtakeAvailable && !v.overtakeActive && e.ai.leader && e.ai.leadDs < 35) { v.overtakeActive = true; v.overtakeAvailable = false; }
    }
  }

  /** Ergebnisliste (für Endstand und Zeitenturm) */
  classification() {
    this._positions();
    const lead = this.order[0];
    const rows = this.order.map((e, i) => {
      const total = e.finished ? e.finishTime - this.greenAt + (e.penalty - e.penaltyServed) : null;
      return { e, pos: i + 1, name: e.name, team: e.team, number: e.number, laps: e.timing.laps.length, best: e.timing.bestLap, total, penalty: e.penalty, retired: e.retired, finished: e.finished, gap: i === 0 ? null : this.gap(lead, e) };
    });
    // Zeitstrafen nachträglich einrechnen (nur unter Fahrern im Ziel mit gleicher Rundenzahl)
    const fin = rows.filter(r => r.finished).sort((a, b) => (b.laps - a.laps) || (a.total - b.total));
    const others = rows.filter(r => !r.finished);
    const out = [...fin, ...others];
    out.forEach((r, i) => { r.pos = i + 1; if (r.finished && i > 0 && fin[0]) r.gapTotal = r.laps < fin[0].laps ? { laps: fin[0].laps - r.laps } : { s: r.total - fin[0].total }; });
    return out;
  }
}

/** Startfeld zusammenstellen: Spieler im gewählten Team, KI-Fahrer der übrigen Plätze */
function buildField({ playerTeam, playerName = 'Du', playerNumber = 77, size = 20, gridMode = 'random', playerGrid = 'back', rng = Math.random, drivers: pool = null }) {
  if (pool) {   // Karriere: festes Fahrerfeld (Spielerplatz ist schon frei)
    const list = pool.map(d => ({ driver: d, team: d.team, number: d.num, trackGrip: d.trackGrip, relPlayer: d.relPlayer }));
    const pl = { driver: { name: playerName, nat: '', num: playerNumber, team: playerTeam, rating: 1 }, team: playerTeam, number: playerNumber, player: true };
    list.splice(Math.floor(list.length / 2), 0, pl);
    return list;
  }
  const drivers = DRIVERS.slice();
  // Spieler übernimmt das zweite Cockpit seines Teams
  const mate = drivers.filter(d => d.team === playerTeam);
  const replaced = mate[1] || mate[0];
  let ai = drivers.filter(d => d !== replaced);
  // Feldgröße: schwächste Fahrer zuerst weglassen (Teamkollege bleibt)
  ai.sort((a, b) => b.rating - a.rating);
  ai = ai.slice(0, Math.max(0, size - 1));
  let order;
  if (gridMode === 'rating') order = ai.slice().sort((a, b) => (b.rating + (rng() - 0.5) * 0.12) - (a.rating + (rng() - 0.5) * 0.12));
  else { order = ai.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
  const pl = { driver: { name: playerName, nat: '', num: playerNumber, team: playerTeam, rating: 1 }, team: playerTeam, number: playerNumber, player: true };
  const list = order.map(d => ({ driver: d, team: d.team, number: d.num }));
  const at = playerGrid === 'pole' ? 0 : playerGrid === 'middle' ? Math.floor(list.length / 2) : list.length;
  list.splice(at, 0, pl);
  return list;
}

// ---------------------------------------------------------------------------
//  Aufzeichnung je Runde: Telemetrie (alle 5 m) und Ghost (30 Hz)
// ---------------------------------------------------------------------------
const TELE_STEP = 5, GHOST_HZ = 30;
class LapRecorder {
  constructor(track, { ghost = true, keep = 15 } = {}) { this.track = track; this.ghostOn = ghost; this.keep = keep; this.cur = null; this.laps = []; this.best = null; }
  begin(lap) { this.cur = { lap, d: [], t: [], spd: [], thr: [], brk: [], str: [], gear: [], rpm: [], lat: [], g: [], nextD: 0, nextT: 0 }; }
  sample(v, lapTime, progress) {
    const c = this.cur; if (!c) return;
    while (progress >= c.nextD && c.d.length < 4000) {
      c.d.push(c.nextD); c.t.push(lapTime); c.spd.push(v.speedKmh); c.thr.push(v.input.throttle); c.brk.push(v.input.brake);
      c.str.push(v.input.steer); c.gear.push(v.gear); c.rpm.push(v.rpm); c.lat.push(v.accelLat / G0);
      c.nextD += TELE_STEP;
    }
    if (this.ghostOn) while (lapTime >= c.nextT && c.g.length < 7 * GHOST_HZ * 400) {
      c.g.push(Math.round(v.pos.x * 100) / 100, Math.round(v.pos.y * 100) / 100, Math.round(v.pos.z * 100) / 100,
        Math.round(v.q.x * 1e4) / 1e4, Math.round(v.q.y * 1e4) / 1e4, Math.round(v.q.z * 1e4) / 1e4, Math.round(v.q.w * 1e4) / 1e4);
      c.nextT += 1 / GHOST_HZ;
    }
  }
  /** Runde abschließen; rec = { lap, time, sectors, valid } */
  end(rec) {
    const c = this.cur; this.cur = null;
    if (!c || c.d.length < 10) return null;
    const lap = { lap: rec.lap, time: rec.time, sectors: rec.sectors, valid: rec.valid, d: c.d, t: c.t, spd: c.spd, thr: c.thr, brk: c.brk, str: c.str, gear: c.gear, rpm: c.rpm, lat: c.lat, ghost: c.g };
    this.laps.push(lap);
    if (this.laps.length > this.keep) { const drop = this.laps.findIndex(l => l !== this.best); this.laps.splice(drop, 1); }
    if (rec.valid && (!this.best || rec.time < this.best.time)) this.best = lap;
    return lap;
  }
  cancel() { this.cur = null; }
}

/** Ghost-Wiedergabe: Pose zur Rundenzeit t (lineare Interpolation, Quaternion normalisiert) */
function ghostPose(g, t, out) {
  const n = g.length / 7; if (n < 2) return null;
  const f = t * GHOST_HZ, i = Math.floor(f);
  if (i < 0 || i >= n - 1) return null;
  const a = i * 7, b = a + 7, u = f - i;
  out.x = g[a] + (g[b] - g[a]) * u; out.y = g[a + 1] + (g[b + 1] - g[a + 1]) * u; out.z = g[a + 2] + (g[b + 2] - g[a + 2]) * u;
  let qx = g[a + 3], qy = g[a + 4], qz = g[a + 5], qw = g[a + 6], bx = g[b + 3], by = g[b + 4], bz = g[b + 5], bw = g[b + 6];
  if (qx * bx + qy * by + qz * bz + qw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
  qx += (bx - qx) * u; qy += (by - qy) * u; qz += (bz - qz) * u; qw += (bw - qw) * u;
  const l = Math.hypot(qx, qy, qz, qw) || 1; out.qx = qx / l; out.qy = qy / l; out.qz = qz / l; out.qw = qw / l;
  return out;
}

// ---------------------------------------------------------------------------
//  Testfahrt / Training: Zeitnahme, Live-Delta zur Bestzeit, Ghost, Telemetrie
// ---------------------------------------------------------------------------
class PracticeSession {
  constructor(track) {
    this.kind = 'practice';
    this.track = track;
    this.timing = new LapTiming(track, { mode: 'practice' });
    this.rec = new LapRecorder(track);
    // Bestzeiten/Ghosts je Epoche getrennt (Standardauto behält die alten Schlüssel)
    this.key = track.id + (ACTIVE_ERA === 'e2026' ? '' : '|' + ACTIVE_ERA);
    const best = Save.get('bestLaps', {})[this.key];
    this.storedBest = best ? best.time : Infinity;
    this.bestTrace = best && best.trace ? Float32Array.from(best.trace) : null;
    this.storedBestSectors = best && best.sectors ? best.sectors : null;
    const gh = Save.get('ghosts', {})[this.key];
    this.ghost = gh && gh.data ? { time: gh.time, data: gh.data } : null;
    this.delta = null;
    const N = Math.ceil(track.length / 10) + 2;
    this.trace = new Float32Array(N).fill(-1);
    this.sectorState = [null, null, null];
    this.timing.on((type, data) => this._on(type, data));
  }
  get lap() { return this.timing.lap; }
  get lapTime() { return this.timing.lapTime; }
  get lastLap() { return this.timing.lastLap; }
  get bestLap() { return Math.min(this.timing.bestLap, this.storedBest); }
  get lapValid() { return this.timing.valid; }
  get started() { return this.timing.started; }
  invalidate(r) { this.timing.invalidate(r); }
  _on(type, data) {
    const v = this._v;
    if (type === 'lapStart') {
      this.trace.fill(-1); this.rec.begin(data); this.sectorState = [null, null, null];
      if (v) { v.overtakeActive = false; v.overtakeAvailable = true; }
      Events.emit('lap:start', data);
    } else if (type === 'sector') {
      // lila = Allzeit-Bestwert dieser Strecke, grün = Bestwert dieser Sitzung, gelb = langsamer
      const all = Save.get('bestSectors', {}), bs = all[this.key] || [Infinity, Infinity, Infinity];
      let st = 'yellow';
      if (!this.timing.valid) st = 'invalid';
      else if (data.t <= (bs[data.k] ?? Infinity)) { st = 'purple'; bs[data.k] = data.t; all[this.key] = bs; Save.set('bestSectors', all); }
      else if (data.pb) st = 'green';
      this.sectorState[data.k] = st;
      Events.emit('lap:sector', data.k, data.t, this.sectorState[data.k]);
    } else if (type === 'lap') {
      const lap = this.rec.end(data);
      Events.emit('lap:done', data.time, data.valid);
      if (data.valid && data.time < this.storedBest) {
        this.storedBest = data.time;
        this.bestTrace = Float32Array.from(this.trace);
        this.storedBestSectors = data.sectors;
        const all = Save.get('bestLaps', {});
        all[this.key] = { time: data.time, trace: Array.from(this.trace, x => Math.round(x * 1000) / 1000), sectors: data.sectors, compound: v ? v.compound : '', date: new Date().toISOString() };
        Save.set('bestLaps', all);
        if (lap && lap.ghost.length) {
          this.ghost = { time: data.time, data: lap.ghost };
          const gs = Save.get('ghosts', {}); gs[this.key] = { time: data.time, data: lap.ghost }; Save.set('ghosts', gs);
        }
        Events.emit('lap:best', data.time);
      }
    } else if (type === 'limits') {
      Events.emit('lap:limits', data);
    } else if (type === 'invalid') {
      this.sectorState = this.sectorState.map(s => s && 'invalid');
    }
  }
  step(h, v) {
    this._v = v;
    const tm = this.timing;
    tm.step(h, v);
    if (!tm.started) return;
    this.rec.sample(v, tm.lapTime, tm.progress);
    const s = v.trackS, k = Math.floor(s / 10);
    if (k >= 0 && k < this.trace.length && this.trace[k] < 0 && tm.progress > s - 20) this.trace[k] = tm.lapTime;
    if (this.bestTrace && tm.progress > 30) {
      const f = s / 10, i0 = Math.floor(f), b0 = this.bestTrace[i0], b1 = this.bestTrace[i0 + 1];
      this.delta = b0 >= 0 && b1 >= 0 ? tm.lapTime - lerp(b0, b1, f - i0) : null;
    } else this.delta = null;
  }
}
