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

const AI_LIMITS_DEFAULT = Object.assign({}, AI_LIMITS);   // Standardauto (Epoche 2026)

/** Schalter für Verhaltensweisen (Tests/Feinabstimmung) */
const AI_TUNE = { brakeGain: 0.23, latMaxK: 1, brakeMod: true, draft: true, defend: true, door: true, lateBrake: true, edgeYield: false, startCare: true, dirtyAir: true, minCurv: true };   // edgeYield: im Test (36 Starts) schlechter

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
    if (AI_TUNE.minCurv) this._refine(T, off, lim, px, pz);
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
  /**
   * Feinschliff: echte Krümmung (Umkreis über ±4 Punkte) minimieren statt nur zu glätten.
   * Die reine Glättung zieht die Linie auf durchgehend gleichsinnigen Kurven nach innen (kürzester Weg);
   * hier darf jeder Punkt quer wandern, wenn die Summe κ² seiner Umgebung dadurch sinkt.
   */
  _refine(T, off, lim, px, pz) {
    const N = this.N, st = 4;
    const kap = (a, b, c) => {
      const ax = px[a], az = pz[a], bx = px[b], bz = pz[b], cx = px[c], cz = pz[c];
      const cr = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), den = Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az);
      return den > 1e-9 ? 2 * cr / den : 0;
    };
    const local = (j) => { let c = 0; for (let q = -st; q <= st; q += st) { const m = (j + q + N) % N; const k = kap((m - st + N) % N, m, (m + st) % N); c += k * k; } return c; };
    let step = 0.6;
    for (let it = 0; it < 140; it++) {
      for (let j = 0; j < N; j++) {
        const o0 = off[j], c0 = local(j);
        for (const d of [step, -step]) {
          const o1 = clamp(o0 + d, -lim[j], lim[j]); if (o1 === o0) continue;
          off[j] = o1; px[j] = T.X[j] + T.RX[j] * o1; pz[j] = T.Z[j] + T.RZ[j] * o1;
          if (local(j) < c0 - 1e-12) break;
          off[j] = o0; px[j] = T.X[j] + T.RX[j] * o0; pz[j] = T.Z[j] + T.RZ[j] * o0;
        }
      }
      if (it % 40 === 39) step *= 0.5;
    }
    // leicht nachglätten (Zacken der Koordinatensuche)
    for (let it = 0; it < 30; it++) for (let j = 0; j < N; j++) {
      const a = (j - 1 + N) % N, b = (j + 1) % N, d = ((px[a] + px[b]) * 0.5 - px[j]) * T.RX[j] + ((pz[a] + pz[b]) * 0.5 - pz[j]) * T.RZ[j];
      off[j] = clamp(off[j] + 0.5 * d, -lim[j], lim[j]); px[j] = T.X[j] + T.RX[j] * off[j]; pz[j] = T.Z[j] + T.RZ[j] * off[j];
    }
  }

  /** Geschwindigkeitsprofil für einen Griff-Faktor (1 = Fahrzeuggrenze) */
  profile(grip = 1) {
    const key = Math.round(grip * 1000);
    if (this.profiles.has(key)) return this.profiles.get(key);
    const N = this.N, K = this.K, DS = this.DS, L = AI_LIMITS, g = G0;
    // gelernte Kurvenfaktoren (je Strecke und Epoche): Querhaftung je Punkt
    const GM = this.gripMap || (typeof gripMapFor === 'function' ? gripMapFor(this.track, this) : null);
    const latA = (v, j) => Math.min(L.lat0 + L.latAero * v * v, L.latMax * (AI_TUNE.latMaxK || 1)) * g * grip * (GM && j !== undefined ? GM[j] : 1);
    const brkA = (v) => Math.min(L.brk0 + L.brkAero * v * v, L.brkMax) * g * grip;
    const v = new Float32Array(N), vTop = 96;
    for (let j = 0; j < N; j++) {
      const k = Math.abs(K[j]);
      // v² · k = latA(v) – Fixpunktiteration
      let x = vTop; for (let it = 0; it < 12; it++) x = k < 1e-5 ? vTop : Math.min(vTop, Math.sqrt(latA(x, j) / k));
      v[j] = x;
    }
    const ell = (vv, k, aMax, j) => { const al = vv * vv * Math.abs(k), am = latA(vv, j); return aMax * Math.sqrt(Math.max(0, 1 - (al / am) ** 2)); };
    // rückwärts: Bremsen (Abtrieb + Luftwiderstand, Reibungsellipse) → Höchsttempo für die Regelung
    for (let pass = 0; pass < 2; pass++) {
      for (let q = 2 * N; q > 0; q--) {
        const j = q % N, jp = (j - 1 + N) % N, vv = v[j];
        const b = Math.max(1, ell(vv, K[jp], brkA(vv), jp) + L.drag * vv * vv * 0.5);
        v[jp] = Math.min(v[jp], Math.sqrt(vv * vv + 2 * b * DS[jp]));
      }
    }
    // vorwärts zusätzlich Beschleunigung (Leistung, Traktion) → nur zur Rundenzeit-Vorhersage
    const pred = Float32Array.from(v);
    for (let pass = 0; pass < 2; pass++) {
      for (let q = 0; q < 2 * N; q++) {
        const j = q % N, jn = (j + 1) % N, vv = pred[j];
        const aPow = Math.min(1.55 * g, L.power / (L.mass * Math.max(vv, 8))) - L.drag * vv * vv;
        const a = Math.max(0.05, Math.min(aPow, ell(vv, K[j], 1.55 * g * grip, j)));
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
    skill: clamp((0.955 + 0.045 * base) * strength, 0.80, 1.0),
    aggression: clamp(0.35 + 0.5 * (driver.aggression ?? rng()), 0, 1),
    consistency: clamp(0.6 + 0.35 * base + (rng() - 0.5) * 0.1, 0.3, 0.98),
    reaction: 0.17 + (1 - base) * 0.12 + rng() * 0.08,
  };
}

class AIDriver {
  constructor(vehicle, line, prof, seed = 1) {
    this.v = vehicle; this.line = line; this.prof = prof;
    this.speedProf = line.profile(prof.skill * (vehicle.trackGrip || 1));
    this.latOff = 0; this.latWant = 0; this.passSide = 0; this.passT = 0;
    this.thr = 0; this.seed = seed;
    this.trafT = 0; this.leader = null; this.followV = Infinity; this.blue = false; this.yieldF = 1; this.startLat = null; this.dmgF = 1; this.passCool = 0;
    this.chaser = null; this.chaserDs = -1e9; this.latMin = -1e9; this.latMax = 1e9; this.pit = null; this.caution = 0; this.flagCap = 1; this.noPass = false; this.scGap = 0; this.queue = null; this.defendSide = 0; this.defendJ = 0; this.doorUsed = false; this.doorT = 0; this.doorLat = 0;
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
    const j0self = v.trackIdx;
    let lead = null, leadDs = 1e9, blue = false, push = 0, alongBehind = false, along = 0, emergency = Infinity, chaser = null, chaserDs = -1e9, tight = false, latMin = -1e9, latMax = 1e9;
    for (const c of cars) {
      if (c === me || !c.vehicle || c.active === false) continue;
      const o = c.vehicle;
      if (!!o.inPitLane !== !!v.inPitLane) continue;
      let ds = o.trackS - v.trackS; if (ds > L / 2) ds -= L; if (ds < -L / 2) ds += L;
      if (Math.abs(ds) > 90) continue;
      const dl = o.lateral - v.lateral;
      // geplante eigene Querposition an der Stelle des anderen (Linie + Versatz)
      const lo = line.off[o.trackIdx];
      let inLane = Math.abs(dl) < 2.55 || (ds > 6 && (Math.abs(o.lateral - (lo + this.latOff)) < 2.4 || Math.abs(o.lateral - (lo + this.latWant)) < 2.4));
      // eigene geplante Linie über die nächsten Meter (Einlenken!) gegen die Position des anderen prüfen
      if (!inLane && ds > 0 && ds < 70) {
        for (let q = Math.floor(ds / T.ds); q < (ds + 45) / T.ds; q += 3) {
          if (Math.abs(o.lateral - (line.off[(j0self + q) % N] + this.latOff)) < 2.3) { inLane = true; break; }
        }
      }
      // Notbremsung: dicht dahinter und schnell aufschließend
      if (ds > 0 && ds < 22 && Math.abs(dl) < 2.5 && v.vLong - o.vLong > 2.5) emergency = Math.min(emergency, Math.max(0, o.vLong - 1 + (ds - 7) * 0.4));
      if (ds > 0 && ds < 85 && inLane && ds < leadDs) { lead = c; leadDs = ds; }
      // Angreifer hinter mir (der Spieler wird früher beachtet)
      const range = c.player ? 40 : 30;
      if (ds < -1.5 && ds > -range && Math.abs(dl) < 5 && ds > chaserDs && !(me && c.distance - me.distance > L * 0.5)) { chaser = c; chaserDs = ds; }
      // Nebeneinander: seitlichen Abstand halten
      if (Math.abs(ds) < 6.2 && Math.abs(dl) < 3.4) {
        push += (dl > 0 ? -1 : 1) * (3.4 - Math.abs(dl));
        along++; if (ds > 1.2) alongBehind = true;
        // zu eng nebeneinander: wer hinten liegt bzw. angreift, nimmt Gas weg
        if (Math.abs(dl) < 2.6 && (ds > 0.8 || (this.passSide && ds > -1.5))) tight = true;
        // harte Grenze: nie seitlich in ein Auto neben mir hineinlenken (auch nicht beim Einlenken zur Ideallinie)
        if (Math.abs(ds) < 6.5) { if (dl > 0) latMax = Math.min(latMax, o.lateral - 2.9); else latMin = Math.max(latMin, o.lateral + 2.9); }
      }
      if (ds < 0 && ds > -45 && me && me.distance != null && c.distance - me.distance > L * 0.5 && o.vLong > v.vLong - 2) blue = true;
    }
    this.leader = lead; this.leadDs = leadDs; this.blue = blue; this.along = along;
    // Energie: im Zweikampf angreifen bzw. verteidigen, allein mit wenig Batterie sparen
    if (this.noPass) v.ersMode = 'save';
    else if ((lead && leadDs < 35) || (chaser && chaserDs > -25)) v.ersMode = v.socFrac > 0.12 ? 'attack' : 'balanced';
    else v.ersMode = v.socFrac < 0.3 ? 'save' : 'balanced';
    this.latMin = latMin; this.latMax = latMax; this.chaser = chaser; this.chaserDs = chaserDs;
    const P = this.prof, j = v.trackIdx, lineOff = line.off[j];
    if (lead) {
      const o = lead.vehicle, closing = v.vLong - o.vLong;
      const faster = lead.ai ? (this.speedProf.pred[j] > lead.ai.speedProf.pred[o.trackIdx] * 0.995 || closing > 1.5) : (closing > 0.4 || leadDs < 16);
      // Gegen den Spieler: Freunde greifen fairer an, Rivalen härter (Karriere-Beziehung relPlayer −1…1)
      const aggr = clamp(P.aggression + (lead.player ? 0.25 - 0.3 * (this.relPlayer || 0) : 0), 0, 1) * (AI_TUNE.startCare && time - this.launchAt < 25 ? 0.55 : 1);
      // Kurve voraus? Dann nur weiter angreifen, wenn schon neben dem Vordermann
      let kAhead = 0; for (let q = 4; q < 20 + v.vLong * 0.5; q += 4) kAhead = Math.max(kAhead, Math.abs(line.K[(j + q) % N]));
      if (this.passSide && kAhead > 0.0075 && leadDs > 4.5) { this.passSide = 0; this.passCool = 1.2; }
      const strikeDist = kAhead > 0.004 ? 20 + 22 * aggr : 11 + 6 * aggr;
      if (this.noPass) this.passSide = 0;
      if (!this.noPass && leadDs < strikeDist && faster && time - this.launchAt > 6 && this.passCool <= 0 && !(kAhead > 0.0075 && leadDs > 4.5)) {
        if (!this.passSide || (this.passT > 7 && leadDs > 14)) {
          let kSum = 0; for (let q = 5; q < 75; q += 5) kSum += line.K[(j + q) % N];
          let want = kSum > 0.002 ? 1 : (kSum < -0.002 ? -1 : (v.lateral > o.lateral ? 1 : -1));
          const room = (sgn) => { const jj = (o.trackIdx + 3) % N; return T.HW[jj] - 1.1 - sgn * o.lateral; };
          // schon seitlich versetzt? Dann auf dieser Seite bleiben – nie hinter/durch den Gegner die Seite wechseln
          const curSide = Math.abs(v.lateral - o.lateral) > 0.9 ? Math.sign(v.lateral - o.lateral) : 0;
          if (curSide && (leadDs < 14 || room(want) < 2.8)) want = curSide;
          if (room(want) < 2.8) want = curSide ? 0 : -want;
          this.passSide = want && room(want) >= 2.8 ? want : 0; this.passT = 0;
        }
      } else if (leadDs > 45) this.passSide = 0;
      // Folgen: Anhalteweg zum Vordermann (dessen Verzögerung vorweggenommen)
      const vL = Math.max(0, o.vLong + Math.min(0, o.accelLong) * (this.noPass ? 0.8 : 0.35));
      const gapC = leadDs - (this.scGap || 6.3);
      const sideBySide = Math.abs(o.lateral - v.lateral) > 2.6 && Math.abs(o.lateral - (lineOff + this.latWant)) > 2.6;
      // eigene Bremsfähigkeit (75 % der gemessenen Grenze) – nicht übervorsichtig, sonst bilden sich „Züge“
      // Startphase (erste 25 s): kalte Reifen und dichtes Feld → mit dem echten Griff und Reserve rechnen
      const startPh = AI_TUNE.startCare && time - this.launchAt < 25;
      const LIM = AI_LIMITS, bMe = Math.min(LIM.brk0 + LIM.brkAero * v.vLong * v.vLong, LIM.brkMax) * G0 * (this.noPass ? 0.5 : 0.75) * (startPh ? Math.min(1, this.dmgF) * 0.82 : 1);
      this.followV = sideBySide ? Infinity : Math.sqrt(vL * vL + 2 * bMe * Math.max(0, gapC)) + (gapC > 0 ? 0 : gapC * 1.5);
    } else { this.followV = Infinity; if (this.passSide && this.passT > 2) this.passSide = 0; }
    this.followV = Math.min(this.followV, emergency);
    // Ziel-Querablage relativ zur Ideallinie
    let want = 0;
    // Bremszone voraus: Profiltempo fällt innerhalb von 150 m um > 20 %
    let vMinAhead = 1e9; for (let q = 5; q < 75; q += 3) vMinAhead = Math.min(vMinAhead, this.speedProf[(j + q) % N]);
    const brakeZone = vMinAhead < this.speedProf[j] * 0.8;
    // Kurve voraus (25–110 m): Richtung und Stärke
    let kSum = 0, kMax = 0; for (let q = 12; q < 55; q += 3) { const k = line.K[(j + q) % N]; kSum += k; kMax = Math.max(kMax, Math.abs(k)); }
    const cornerSoon = kMax > 0.006, inside = kSum > 0 ? 1 : -1;
    if (this.passSide && lead) want = (lead.vehicle.lateral + this.passSide * 3.4) - lineOff;
    // Windschatten: auf der Geraden direkt hinter dem Vordermann bleiben
    else if (AI_TUNE.draft && lead && !cornerSoon && leadDs > 8 && leadDs < 50 && v.vLong > 45) want = lead.vehicle.lateral - lineOff;
    // Verteidigen: Innenseite vor der Kurve zudecken (ein Spurwechsel je Kurve), Tür auf der Geraden einmal schließen
    const threat = chaser && chaserDs > -18 && (chaser.vehicle.vLong > v.vLong + 0.8 || (chaser.ai && chaser.ai.passSide) || (chaser.player && chaserDs > -14));
    const defends = AI_TUNE.defend && !this.noPass && threat && !this.passSide && !this.blue && time - this.launchAt > 8 && (chaser.player || P.aggression > 0.4);
    if (defends) {
      const cv = chaser.vehicle, dlC = cv.lateral - v.lateral;
      // nur wenn der Angreifer noch nicht innen liegt und genug Abstand ist
      if (brakeZone && cornerSoon && chaserDs < -8 && dlC * inside < 0.8 && (this.defendSide === 0 || ((j - this.defendJ + N) % N) > 90)) { this.defendSide = inside; this.defendJ = j; }
      const rp = chaser.player ? (this.relPlayer || 0) : 0;
      if (rp < -0.35 && this.doorUsed && this.doorT <= 0 && chaserDs > -14) this.doorUsed = false;   // Rivalen machen die Tür auch zweimal zu
      if (AI_TUNE.door && rp < 0.35 && !cornerSoon && !this.doorUsed && chaserDs < -10 && chaserDs > -20 && Math.abs(dlC) > 1.8 && Math.abs(dlC) < 3.5) { this.doorLat = v.lateral + Math.sign(dlC) * 1.2; this.doorUsed = true; this.doorT = 2.0; }
    }
    if (!chaser || chaserDs < -45) this.doorUsed = false;
    if (this.defendSide && along) this.defendSide = 0;
    if (this.doorT > 0 && along) this.doorT = 0;
    if (this.defendSide && ((j - this.defendJ + N) % N) < 90) want = this.defendSide * (T.HW[j] - 3.0) - lineOff;
    else this.defendSide = 0;
    if (this.doorT > 0) want = this.doorLat - lineOff;
    if (this.blue) want = (lineOff > 0 ? -1 : 1) * 3.2;
    // Start: eigene Spur halten, dann über einige Sekunden zur Ideallinie einscheren
    const tl = time - this.launchAt;
    if (this.startLat != null && tl < 11) { const w = clamp(1 - (tl - 4) / 7, 0, 1); want = lerp(want, this.startLat - lineOff, w); }
    want += push * 1.0;
    const hw = T.HW[j] - 1.05;
    let raw = lineOff + want;
    const squeezed = latMin > latMax || latMin > hw || latMax < -hw;
    if (!squeezed) raw = clamp(raw, latMin, latMax);
    const cl = clamp(raw, -hw, hw);
    this.latWant = cl - lineOff;
    // eingeklemmt (kein Platz zum Ausweichen) oder hinten in einer Kurve nebeneinander → nachgeben
    this.yieldF = tight || squeezed ? 0.92 : (along && Math.abs(raw - cl) > 0.4) || (alongBehind && Math.abs(line.K[(j + 15) % N]) > 0.004) ? 0.94 : along ? 0.97 : 1;
    // Nebeneinander in eine Kurve und an den Rand gedrückt (Spur bis zur weißen Linie): zurückstecken statt abfliegen
    const edged = latMin > hw - 1.8 || latMax < -hw + 1.8;
    if (AI_TUNE.edgeYield && cornerSoon && (along || alongBehind) && (edged || squeezed)) this.yieldF = Math.min(this.yieldF, 0.85);
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
    if (this.pit) { this._pitControl(h, ctx); return; }
    this.trafT -= h; this.passT += h; this.passCool -= h; this.doorT -= h;
    if (this.trafT <= 0) { this.trafT = 1 / 30; this._traffic(ctx.cars || [], ctx.me, ctx.time); this._damageCheck(); }
    const lr = this.along ? 5 : 3; this.latOff += clamp(this.latWant - this.latOff, -h * lr, h * lr);
    const spd = Math.max(4, v.vLong), j = v.trackIdx;
    // Spurführung: Pure Pursuit auf Ideallinie + Querversatz
    const La = 7.5 + 0.27 * spd;
    const fs = v.trackS + La, jf = (fs / T.ds), j0 = Math.floor(jf) % N, j1 = (j0 + 1) % N, fr = jf - Math.floor(jf);
    const hwT = T.HW[j0] - 1.05;
    let lo = lerp(line.off[j0], line.off[j1], fr) + this.latOff;
    if (this.latMin <= this.latMax) lo = clamp(lo, this.latMin, this.latMax);
    lo = clamp(lo, -hwT, hwT);
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
    if (kAbs > 0.004) vt *= 1 - clamp(Math.abs(this.latOff) * 0.012, 0, 0.06);
    // verwirbelte Luft kostet Abtrieb – auch beim Bremsen
    vt *= 1 - 0.06 * v.dirtyAir;
    if (this.blue) vt *= 0.97;
    // Ausbremsen: innen neben dem Gegner etwas später bremsen
    if (AI_TUNE.lateBrake && this.passSide && this.leader && this.leadDs < 5 && kAbs > 0.004 && Math.sign(line.K[jt]) === this.passSide) vt *= 1.012;
    vt *= this.yieldF;
    if (this.letByUntil && ctx.time < this.letByUntil) { vt *= 0.9; this.passSide = 0; }   // Teamorder: Teamkollegen vorbeilassen
    vt = Math.min(vt, this.followV);
    // Safety-Car-Kolonne: sanft auf 15 m hinter dem Vordermann (Bremsweg mit 8 m/s²)
    if (this.queue) {
      const q = this.queue.v; let ds = q.trackS - v.trackS; if (ds < 0) ds += T.length;
      const vA = Math.max(0, q.vLong), gap = ds - 15;
      vt = Math.min(vt, gap > 0 ? Math.sqrt(vA * vA + 2 * 8 * gap) : Math.max(0, vA + gap * 0.6));
    }
    if (ctx.cap) vt = Math.min(vt, ctx.cap);
    if (this.flagCap < 1) vt *= this.flagCap;                 // Gelb / VSC / Safety Car
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
    inp.brake = err < -0.6 ? clamp(-err * (AI_TUNE.brakeGain || 0.23), 0, 1) : 0;
    // Bremse dosieren: ABS kennt nur Längsschlupf – beim Anbremsen in die Kurve (Kombischlupf) Druck lösen,
    // sonst blockiert das Heck (v. a. Autos ohne Abtrieb, 1990) und das Auto dreht sich
    if (AI_TUNE.brakeMod && inp.brake > 0) { const sb = Math.max(v.wheels[0].sComb, v.wheels[1].sComb, rs * 1.15); if (sb > 1.3) inp.brake *= clamp(2.3 - sb, 0.3, 1); }
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
    // Aero-Schaden, Mischung und Reifenverschleiß bestimmen das Tempoprofil
    const wv = this.v.water || 0, cpd = COMPOUNDS[this.v.compound], wetF = 1 - cpd.wetLoss * wv - cpd.dryPenalty * (1 - wv);
    const W = this.v.wheels, tyreF = wetF * (cpd.mu / 1.84) * (W.reduce((a, w) => a + w.tyre.wearFactor() * Math.min(1, w.tyre.gripT + 0.015), 0) / 4);
    // verwirbelte Luft hinter einem Auto kostet Frontabtrieb → Kurven etwas langsamer (sonst Untersteuern ins Kiesbett)
    const da = AI_TUNE.dirtyAir ? this.v.dirtyAir || 0 : 0;
    const f = Math.round((1 - 0.16 * (1 - H.fw) - 0.1 * (1 - H.rw) - 0.25 * (1 - H.floor)) * tyreF * (1 - this.caution) * (1 - 0.06 * wv) * (1 - 0.07 * da) * 200) / 200;
    if (f !== this.dmgF) { this.dmgF = f; this.speedProf = this.line.profile(this.prof.skill * f * (this.v.trackGrip || 1)); }
  }
  /**
   * Boxenstopp einleiten: { boxS, serviceTime, onService(), onDone() }.
   * Ablauf: anfahren (Boxenseite) → Einfahrt → Gasse (80 km/h) → Box → Service → Ausfahrt → einfädeln
   */
  startPit(opts) {
    const T = this.line.track, rel = T.pitRel(this.v.trackS);
    this.pit = Object.assign({ phase: rel >= 0 ? (rel < T.pit.open * T.ds ? 'entry' : 'lane') : 'approach', t: 0 }, opts);
    this.passSide = 0; this.defendSide = 0;
  }
  _pitControl(h, ctx) {
    const v = this.v, inp = v.input, line = this.line, T = line.track, P = T.pit, N = T.N, pt = this.pit, L = T.length;
    v.pitAuto = true;
    const s = v.trackS, rel = T.pitRel(s), relBox = T.pitRel(pt.boxS);
    const wallInR = P.open * T.ds, wallOutR = (P.n - P.open) * T.ds;
    const spd = Math.max(3, v.vLong);
    // Zielquerlage an Gassenposition r (Vorzeichen: Boxenseite)
    const latAt = (r, j) => {
      const bd = T.BD[P.s][j], fast = P.sg * (bd + 4), box = P.sg * (bd + 9.5), edge = P.sg * (T.HW[j] - 1.3);
      if (r < 0) { const dIn = ((P.sIn - (j * T.ds)) % L + L) % L; return lerp(line.off[j], edge, smoothstep(90, 15, dIn)); }
      if (r < wallInR) return lerp(edge, fast, smoothstep(0, wallInR * 0.85, r));
      if (pt.phase === 'lane' || pt.phase === 'service') { const d = relBox - r; if (d < 50 && d > -12) return lerp(fast, box, smoothstep(50, 18, d)); }
      if (r < wallOutR) return fast;
      return lerp(fast, P.sg * (T.HW[j] - 1.3), smoothstep(wallOutR, P.len, r));
    };
    // festgefahren (Unfall, Blockade)? In der Gasse zurück auf die schnelle Spur, davor Stopp abbrechen
    pt.stuckT = pt.phase !== 'service' && v.speed < 1 ? (pt.stuckT || 0) + h : 0;
    if (pt.stuckT > 4) {
      pt.stuckT = 0;
      const tyres = v.wheels.map(w => w.tyre), soc = v.soc;
      if (v.inPitLane && rel >= 0) {
        v.placeOnTrack(T, s + 3, P.sg * (T.BD[P.s][v.trackIdx] + 4)); v.wheels.forEach((w, i) => { w.tyre = tyres[i]; }); v.soc = soc; v.gear = 1;
        v.inPitLane = true; if (pt.phase === 'lane' && relBox - rel < 15) { pt.phase = 'service'; pt.t = pt.serviceTime; }
      } else { this.pit = null; v.pitAuto = false; v.pitLimiter = false; this.needsReset = true; if (pt.onAbort) pt.onAbort(); }
      return;
    }
    // Phasenwechsel
    if (pt.phase === 'approach' && rel >= 0) pt.phase = 'entry';
    if (pt.phase === 'entry' && rel >= wallInR - 15) {
      if (!v.inPitLane) { this.pit = null; v.pitAuto = false; v.pitLimiter = false; if (pt.onAbort) pt.onAbort(); return; }   // Einfahrt verpasst → nächste Runde
      pt.phase = 'lane'; v.pitLimiter = true;
    }
    if (pt.phase === 'lane' && ((relBox - rel < 0.8 && v.speed < 0.7) || relBox - rel < -4)) { pt.phase = 'service'; pt.t = pt.serviceTime; }
    if (pt.phase === 'service') {
      pt.t -= h;
      inp.steer = 0; inp.throttle = 0; inp.brake = 1; inp.clutch = 1;
      if (pt.t <= 0) { pt.phase = 'leave'; if (pt.onService) pt.onService(); }
      return;
    }
    if (pt.phase === 'leave' && rel >= wallOutR) { pt.phase = 'merge'; v.pitLimiter = false; }
    if (pt.phase === 'merge' && rel < 0) { pt.phase = 'rejoin'; pt.d0 = s; }
    if (pt.phase === 'rejoin') {
      // nach der Ausfahrt: am Streckenrand beschleunigen, dann über 150 m auf die Ideallinie
      const d = ((s - pt.d0) % L + L) % L;
      let vMin = 1e9; for (let q = 4; q < 75; q += 4) vMin = Math.min(vMin, this.speedProf[(v.trackIdx + q) % N]);
      const brakeAhead = vMin < v.vLong * 0.9;      // Bremszone/Kurve voraus → nicht am Rand bleiben
      if ((d > 120 && v.vLong > 0.85 * this.speedProf[v.trackIdx]) || d > 450 || brakeAhead) { this.pit = null; v.pitAuto = false; v.pitLimiter = false; this.latOff = (v.lateral - line.off[v.trackIdx]); if (pt.onDone) pt.onDone(); return; }
    }
    // Spurführung
    const La = 5 + 0.25 * spd, fs = s + La, jf = ((fs % L) + L) % L / T.ds, j0 = Math.floor(jf) % N, j1 = (j0 + 1) % N, fr = jf - Math.floor(jf);
    const lo = pt.phase === 'rejoin' ? P.sg * (T.HW[j0] - 1.3) : latAt(T.pitRel(fs) >= 0 ? T.pitRel(fs) : (pt.phase === 'merge' || pt.phase === 'leave' ? 1e9 : -1), j0);
    const loS = Number.isFinite(lo) ? lo : line.off[j0];
    const tx = lerp(T.X[j0], T.X[j1], fr) + T.RX[j0] * loS, tz = lerp(T.Z[j0], T.Z[j1], fr) + T.RZ[j0] * loS;
    const dx = tx - v.pos.x, dz = tz - v.pos.z;
    const lx = dx * v._right.x + dz * v._right.z, lz = dx * v._fwd.x + dz * v._fwd.z;
    inp.steer = clamp(Math.atan(2 * v.spec.wheelbase * Math.sin(Math.atan2(lx, Math.max(0.5, lz))) / La) / (v.spec.maxWheelAngleDeg * DEG), -1, 1);
    // Tempo
    const j = v.trackIdx, prof = this.speedProf[(j + 3) % N];
    let vt;
    if (pt.phase === 'approach') { const dIn = ((P.sIn - s) % L + L) % L; vt = Math.min(prof, Math.sqrt(PIT_SPEED ** 2 + 2 * 20 * Math.max(0, dIn + wallInR - 25))); }
    else if (pt.phase === 'entry') vt = Math.min(prof, Math.sqrt(PIT_SPEED ** 2 + 2 * 20 * Math.max(0, wallInR - 25 - rel)));
    else if (pt.phase === 'lane') vt = Math.min(PIT_SPEED * 0.97, Math.sqrt(2 * 6 * Math.max(0, relBox - rel - 0.4)));
    else if (pt.phase === 'leave') vt = PIT_SPEED * 0.97;
    else vt = prof;
    const err = vt - v.vLong;
    const thrT = err > 0 ? clamp(err * 0.5 + 0.15, 0, 1) : 0;
    this.thr += clamp(thrT - this.thr, -h * 30, h * 6);
    inp.throttle = this.thr; inp.brake = err < -0.4 ? clamp(-err * 0.3, 0, 1) : 0; inp.clutch = 0;
    this.debug.vt = vt;
  }
  resetAfterRecovery() { this.stuckT = 0; this.wrongT = 0; this.needsReset = false; this.thr = 0; this.latOff = 0; this.passSide = 0; }
}
