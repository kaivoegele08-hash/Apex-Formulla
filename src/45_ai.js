// ============================================================================
//  KI – Ideallinie, Geschwindigkeitsprofil und Fahrer-Regler.
//  Die KI fährt mit derselben Fahrphysik wie der Spieler (keine Abkürzungen):
//  sie bekommt nur Lenk-, Gas- und Bremseingaben.
//    RacingLine  – Linie minimaler Krümmung innerhalb der Streckenbreite
//    AIDriver    – Spurführung (Pure Pursuit), Tempo aus Reibungsellipse,
//                  Verkehr: Folgen, Überholen, Seite halten, Platz lassen
// ============================================================================

/** Fahrzeuggrenzen, im Fahrversuch gemessen (Kreisfahrt / Vollbremsung, Medium-Reifen warm) */
const AI_LIMITS = {
  lat0: 1.75, latAero: 0.000472, latMax: 3.35,      // Querbeschleunigung [g] = lat0 + latAero·v², gedeckelt
  brk0: 2.0, brkAero: 0.0006, brkMax: 4.3,          // Verzögerung [g]
  power: 600000, mass: 800, drag: 0.0011,           // wirksame Leistung/Luftwiderstand (Vmax ≈ 317 km/h)
};

class RacingLine {
  /** margin = Abstand der Fahrzeugmitte zur weißen Linie (m) */
  constructor(track, { margin = 1.05 } = {}) {
    const T = track, N = T.N;
    this.track = T; this.N = N;
    const off = this.off = new Float32Array(N);
    const lim = new Float32Array(N);
    for (let j = 0; j < N; j++) lim[j] = Math.max(0, T.HW[j] - margin);
    const px = new Float64Array(N), pz = new Float64Array(N);
    const sync = () => { for (let j = 0; j < N; j++) { px[j] = T.X[j] + T.RX[j] * off[j]; pz[j] = T.Z[j] + T.RZ[j] * off[j]; } };
    // Mehrstufige Relaxation: jeder Punkt wandert zur Mitte seiner Nachbarn (glättet die Krümmung),
    // begrenzt durch die Streckenbreite → Kurven werden außen–innen–außen angefahren
    for (const [k, iters] of [[40, 160], [20, 220], [10, 260], [5, 260], [2, 200], [1, 120]]) {
      for (let it = 0; it < iters; it++) {
        sync();
        for (let j = 0; j < N; j++) {
          const a = j - k < 0 ? j - k + N : j - k, b = j + k >= N ? j + k - N : j + k;
          const d = ((px[a] + px[b]) * 0.5 - px[j]) * T.RX[j] + ((pz[a] + pz[b]) * 0.5 - pz[j]) * T.RZ[j];
          off[j] = clamp(off[j] + 0.6 * d, -lim[j], lim[j]);
        }
      }
    }
    sync();
    this.X = Float32Array.from(px); this.Z = Float32Array.from(pz);
    // Bogenlänge und Krümmung der Linie (3-Punkt-Kreis über ±3 Samples, geglättet)
    this.DS = new Float32Array(N); this.K = new Float32Array(N);
    for (let j = 0; j < N; j++) { const b = (j + 1) % N; this.DS[j] = Math.hypot(px[b] - px[j], pz[b] - pz[j]); }
    const kr = new Float32Array(N), st = 3;
    for (let j = 0; j < N; j++) {
      const a = (j - st + N) % N, c = (j + st) % N;
      const ax = px[a], az = pz[a], bx = px[j], bz = pz[j], cx = px[c], cz = pz[c];
      const cr = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      const den = Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az);
      kr[j] = den > 1e-9 ? -2 * cr / den : 0;   // Vorzeichen wie Strecke: > 0 = Rechtskurve
    }
    for (let j = 0; j < N; j++) { let s = 0; for (let q = -2; q <= 2; q++) s += kr[(j + q + N) % N]; this.K[j] = s / 5; }
    this.profiles = new Map();
  }

  /** Geschwindigkeitsprofil für einen Griff-Faktor (1 = Fahrzeuggrenze) */
  profile(grip = 1) {
    const key = Math.round(grip * 1000);
    if (this.profiles.has(key)) return this.profiles.get(key);
    const N = this.N, K = this.K, DS = this.DS, L = AI_LIMITS, g = G0;
    const latA = (v) => Math.min(L.lat0 + L.latAero * v * v, L.latMax) * g * grip;
    const brkA = (v) => Math.min(L.brk0 + L.brkAero * v * v, L.brkMax) * g * grip;
    const v = new Float32Array(N), vTop = 96;
    for (let j = 0; j < N; j++) {
      const k = Math.abs(K[j]);
      // v² · k = latA(v) – Fixpunktiteration
      let x = vTop; for (let it = 0; it < 12; it++) x = k < 1e-5 ? vTop : Math.min(vTop, Math.sqrt(latA(x) / k));
      v[j] = x;
    }
    const ell = (vv, k, aMax) => { const al = vv * vv * Math.abs(k), am = latA(vv); return aMax * Math.sqrt(Math.max(0, 1 - (al / am) ** 2)); };
    // rückwärts: Bremsen (Abtrieb + Luftwiderstand, Reibungsellipse) → Höchsttempo für die Regelung
    for (let pass = 0; pass < 2; pass++) {
      for (let q = 2 * N; q > 0; q--) {
        const j = q % N, jp = (j - 1 + N) % N, vv = v[j];
        const b = Math.max(1, ell(vv, K[jp], brkA(vv)) + L.drag * vv * vv * 0.5);
        v[jp] = Math.min(v[jp], Math.sqrt(vv * vv + 2 * b * DS[jp]));
      }
    }
    // vorwärts zusätzlich Beschleunigung (Leistung, Traktion) → nur zur Rundenzeit-Vorhersage
    const pred = Float32Array.from(v);
    for (let pass = 0; pass < 2; pass++) {
      for (let q = 0; q < 2 * N; q++) {
        const j = q % N, jn = (j + 1) % N, vv = pred[j];
        const aPow = Math.min(1.55 * g, L.power / (L.mass * Math.max(vv, 8))) - L.drag * vv * vv;
        const a = Math.max(0.05, Math.min(aPow, ell(vv, K[j], 1.55 * g * grip)));
        pred[jn] = Math.min(pred[jn], Math.sqrt(vv * vv + 2 * a * DS[j]));
      }
    }
    v.pred = pred;
    let t = 0; for (let j = 0; j < N; j++) t += DS[j] / Math.max(4, pred[j]);
    v.lapTime = t;
    this.profiles.set(key, v);
    return v;
  }
  /** Querablage der Linie an Streckenmeter s (interpoliert) */
  offsetAt(s) {
    const T = this.track, f = (((s % T.length) + T.length) % T.length) / T.ds, j = Math.floor(f) % this.N, j1 = (j + 1) % this.N;
    return lerp(this.off[j], this.off[j1], f - Math.floor(f));
  }
}

/** Fahrerprofile: skill = Griffausnutzung, aggression = Überholbereitschaft, consistency = Streuung */
function makeAIProfile(driver, strength = 1, rng = Math.random) {
  const base = driver.rating != null ? driver.rating : 0.5;              // 0…1
  return {
    skill: clamp((0.94 + 0.06 * base) * strength, 0.80, 1.0),
    aggression: clamp(0.35 + 0.5 * (driver.aggression ?? rng()), 0, 1),
    consistency: clamp(0.6 + 0.35 * base + (rng() - 0.5) * 0.1, 0.3, 0.98),
    reaction: 0.17 + (1 - base) * 0.12 + rng() * 0.08,
  };
}

class AIDriver {
  constructor(vehicle, line, prof, seed = 1) {
    this.v = vehicle; this.line = line; this.prof = prof;
    this.speedProf = line.profile(prof.skill);
    this.latOff = 0; this.latWant = 0; this.passSide = 0; this.passT = 0;
    this.thr = 0; this.seed = seed;
    this.trafT = 0; this.leader = null; this.followV = Infinity; this.blue = false; this.yieldF = 1; this.startLat = null; this.dmgF = 1; this.passCool = 0;
    this.stuckT = 0; this.wrongT = 0; this.needsReset = false;
    this.launchAt = -Infinity; this.state = 'drive';
    this.debug = { vt: 0, la: 0 };
    vehicle.aids.abs = true; vehicle.aids.tc = 1; vehicle.aids.autoShift = true; vehicle.aids.autoClutch = true;
    vehicle.aeroAuto = true;
  }

  /** Ampel aus: Start mit Reaktionszeit */
  launch(time) { this.launchAt = time + this.prof.reaction; this.startLat = this.v.lateral; }
  /** Startaufstellung: bis zum Erlöschen der Ampel stehen bleiben */
  hold() { this.launchAt = Infinity; }

  /** Verkehr analysieren (≈30 Hz): Vordermann, Nebenleute, blaue Flagge */
  _traffic(cars, me, time) {
    const v = this.v, line = this.line, T = line.track, L = T.length, N = T.N;
    let lead = null, leadDs = 1e9, blue = false, push = 0, alongBehind = false, along = 0, emergency = Infinity;
    for (const c of cars) {
      if (c === me || c.retired || !c.vehicle || c.active === false) continue;
      const o = c.vehicle;
      let ds = o.trackS - v.trackS; if (ds > L / 2) ds -= L; if (ds < -L / 2) ds += L;
      if (Math.abs(ds) > 90) continue;
      const dl = o.lateral - v.lateral;
      // geplante eigene Querposition an der Stelle des anderen (Linie + Versatz)
      const lo = line.off[o.trackIdx];
      const inLane = Math.abs(dl) < 2.55 || (ds > 6 && (Math.abs(o.lateral - (lo + this.latOff)) < 2.4 || Math.abs(o.lateral - (lo + this.latWant)) < 2.4));
      // Notbremsung: dicht dahinter und schnell aufschließend
      if (ds > 0 && ds < 22 && Math.abs(dl) < 2.5 && v.vLong - o.vLong > 2.5) emergency = Math.min(emergency, Math.max(0, o.vLong - 1 + (ds - 7) * 0.4));
      if (ds > 0 && ds < 85 && inLane && ds < leadDs) { lead = c; leadDs = ds; }
      // Nebeneinander: seitlichen Abstand halten
      if (Math.abs(ds) < 6.2 && Math.abs(dl) < 3.3) {
        push += (dl > 0 ? -1 : 1) * (3.3 - Math.abs(dl));
        along++; if (ds > 1.2) alongBehind = true;
      }
      if (ds < 0 && ds > -45 && me && me.distance != null && c.distance - me.distance > L * 0.5 && o.vLong > v.vLong - 2) blue = true;
    }
    this.leader = lead; this.leadDs = leadDs; this.blue = blue; this.along = along;
    const P = this.prof, j = v.trackIdx, lineOff = line.off[j];
    if (lead) {
      const o = lead.vehicle, closing = v.vLong - o.vLong;
      const faster = this.speedProf.pred[j] > (lead.ai ? lead.ai.speedProf.pred[o.trackIdx] : o.vLong) * 0.995 || closing > 1.5;
      // Kurve voraus? Dann nur weiter angreifen, wenn schon neben dem Vordermann
      let kAhead = 0; for (let q = 4; q < 20 + v.vLong * 0.5; q += 4) kAhead = Math.max(kAhead, Math.abs(line.K[(j + q) % N]));
      if (this.passSide && kAhead > 0.0075 && leadDs > 4.5) { this.passSide = 0; this.passCool = 1.2; }
      if (leadDs < 20 + 20 * P.aggression && faster && time - this.launchAt > 6 && this.passCool <= 0 && !(kAhead > 0.0075 && leadDs > 4.5)) {
        if (!this.passSide || this.passT > 7) {
          let kSum = 0; for (let q = 5; q < 75; q += 5) kSum += line.K[(j + q) % N];
          let want = kSum > 0.002 ? 1 : (kSum < -0.002 ? -1 : (v.lateral > o.lateral ? 1 : -1));
          const room = (sgn) => { const jj = (o.trackIdx + 3) % N; return T.HW[jj] - 1.1 - sgn * o.lateral; };
          if (room(want) < 2.8) want = -want;
          this.passSide = room(want) >= 2.8 ? want : 0; this.passT = 0;
        }
      } else if (leadDs > 45) this.passSide = 0;
      // Folgen: Anhalteweg zum Vordermann (dessen Verzögerung vorweggenommen)
      const vL = Math.max(0, o.vLong + Math.min(0, o.accelLong) * 0.35);
      const gapC = leadDs - 6.3;
      const sideBySide = Math.abs(o.lateral - v.lateral) > 2.6 && Math.abs(o.lateral - (lineOff + this.latWant)) > 2.6;
      // eigene Bremsfähigkeit (75 % der gemessenen Grenze) – nicht übervorsichtig, sonst bilden sich „Züge“
      const LIM = AI_LIMITS, bMe = Math.min(LIM.brk0 + LIM.brkAero * v.vLong * v.vLong, LIM.brkMax) * G0 * 0.75;
      this.followV = sideBySide ? Infinity : Math.sqrt(vL * vL + 2 * bMe * Math.max(0, gapC)) + (gapC > 0 ? 0 : gapC * 1.5);
    } else { this.followV = Infinity; if (this.passSide && this.passT > 2) this.passSide = 0; }
    this.followV = Math.min(this.followV, emergency);
    // Ziel-Querablage relativ zur Ideallinie
    let want = 0;
    if (this.passSide && lead) want = (lead.vehicle.lateral + this.passSide * 3.1) - lineOff;
    if (this.blue) want = (lineOff > 0 ? -1 : 1) * 3.2;
    // Start: eigene Spur halten, dann über einige Sekunden zur Ideallinie einscheren
    const tl = time - this.launchAt;
    if (this.startLat != null && tl < 11) { const w = clamp(1 - (tl - 4) / 7, 0, 1); want = lerp(want, this.startLat - lineOff, w); }
    want += push * 1.0;
    const hw = T.HW[j] - 1.05, raw = lineOff + want, cl = clamp(raw, -hw, hw);
    this.latWant = cl - lineOff;
    // eingeklemmt (kein Platz zum Ausweichen) oder hinten in einer Kurve nebeneinander → nachgeben
    this.yieldF = (along && Math.abs(raw - cl) > 0.4) || (alongBehind && Math.abs(line.K[(j + 15) % N]) > 0.004) ? 0.94 : 1;
  }

  /** Pro Physikschritt: Eingaben setzen. ctx = { cars, me, state: 'grid'|'race'|'free', time } */
  control(h, ctx) {
    const v = this.v, inp = v.input, T = this.line.track, N = T.N, line = this.line, P = this.prof;
    if (!v.track) return;
    // Startaufstellung: Bremse halten, Drehzahl vorbereiten
    if (ctx.state === 'grid' || ctx.time < this.launchAt) {
      inp.steer = 0; inp.brake = ctx.state === 'grid' ? 1 : 0.6; inp.throttle = ctx.state === 'grid' ? 0.35 : 0.4; inp.clutch = 0;
      return;
    }
    this.trafT -= h; this.passT += h; this.passCool -= h;
    if (this.trafT <= 0) { this.trafT = 1 / 30; this._traffic(ctx.cars || [], ctx.me, ctx.time); this._damageCheck(); }
    const lr = this.along ? 5 : 3; this.latOff += clamp(this.latWant - this.latOff, -h * lr, h * lr);
    const spd = Math.max(4, v.vLong), j = v.trackIdx;
    // Spurführung: Pure Pursuit auf Ideallinie + Querversatz
    const La = 7.5 + 0.27 * spd;
    const fs = v.trackS + La, jf = (fs / T.ds), j0 = Math.floor(jf) % N, j1 = (j0 + 1) % N, fr = jf - Math.floor(jf);
    const hwT = T.HW[j0] - 1.05, lo = clamp(lerp(line.off[j0], line.off[j1], fr) + this.latOff, -hwT, hwT);
    const tx = lerp(T.X[j0], T.X[j1], fr) + T.RX[j0] * lo, tz = lerp(T.Z[j0], T.Z[j1], fr) + T.RZ[j0] * lo;
    const dx = tx - v.pos.x, dz = tz - v.pos.z;
    const lx = dx * v._right.x + dz * v._right.z, lz = dx * v._fwd.x + dz * v._fwd.z;
    const alpha = Math.atan2(lx, Math.max(0.5, lz));
    let delta = Math.atan(2 * v.spec.wheelbase * Math.sin(alpha) / La);
    inp.steer = clamp(delta / (v.spec.maxWheelAngleDeg * DEG), -1, 1);
    // Tempo: Profil etwas voraus (Reaktions-/Stellzeit), Streuung, Abseits der Linie langsamer
    const jt = (j + 2 + Math.round(spd * 0.11 / T.ds)) % N;
    const noise = 1 - (1 - P.consistency) * 0.035 * (0.5 + 0.5 * noise1(ctx.time * 0.13 + this.seed * 7.31));
    let vt = this.speedProf[jt] * Math.sqrt(noise);
    const kAbs = Math.abs(line.K[jt]);
    if (kAbs > 0.004) vt *= 1 - clamp(Math.abs(this.latOff) * 0.012, 0, 0.06) - 0.025 * v.dirtyAir;
    if (this.blue) vt *= 0.97;
    vt *= this.yieldF;
    vt = Math.min(vt, this.followV);
    if (ctx.cap) vt = Math.min(vt, ctx.cap);
    this.debug.vt = vt;
    const err = vt - v.vLong;
    let thrT = err > 0 ? clamp(err * 0.55 + 0.3, 0, 1) : clamp(0.25 + err * 0.5, 0, 1);
    const rs = Math.max(v.wheels[2].sComb, v.wheels[3].sComb);
    thrT = Math.min(thrT, clamp(1.65 - rs, 0, 1));
    // Querrutschen (Übersteuern): Gas lupfen
    const slip = Math.abs(Math.atan2(v.vLat, Math.max(3, Math.abs(v.vLong))));
    if (slip > 0.12) thrT *= clamp(1 - (slip - 0.12) * 5, 0, 1);
    this.thr += clamp(thrT - this.thr, -h * 30, h * 9);
    inp.throttle = this.thr;
    inp.brake = err < -0.6 ? clamp(-err * 0.23, 0, 1) : 0;
    inp.clutch = 0;
    // Festgefahren / falsche Richtung → Rücksetzen anfordern (die Rennlogik prüft, ob Platz ist)
    const head = v._fwd.x * T.TX[j] + v._fwd.z * T.TZ[j];
    if (ctx.state === 'race' || ctx.state === 'free') {
      this.stuckT = v.speed < 2.5 ? this.stuckT + h : 0;
      this.wrongT = head < -0.2 ? this.wrongT + h : 0;
      if (this.stuckT > 3.5 || this.wrongT > 2.5) this.needsReset = true;
    }
  }
  /** Aerodynamischer Schaden → vorsichtigeres Tempoprofil */
  _damageCheck() {
    const H = this.v.health;
    const f = Math.round((1 - 0.16 * (1 - H.fw) - 0.1 * (1 - H.rw) - 0.25 * (1 - H.floor)) * 100) / 100;
    if (f !== this.dmgF) { this.dmgF = f; this.speedProf = this.line.profile(this.prof.skill * f); }
  }
  resetAfterRecovery() { this.stuckT = 0; this.wrongT = 0; this.needsReset = false; this.thr = 0; this.latOff = 0; this.passSide = 0; }
}
