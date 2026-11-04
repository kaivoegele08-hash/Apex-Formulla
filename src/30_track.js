// ============================================================================
//  TRACK – Streckenmodell: geschlossener zentripetaler Catmull-Rom-Spline →
//  gleichabständige Samples (≈2 m) mit Breite, Banking, Höhe, Krümmung.
//  Seitenprofile (Randsteine, Kunstrasen, Auslauf, Barrieren), Bodenabfrage
//  für die Physik, Sektoren, Aero-Zonen, Referenz-Geschwindigkeitsprofil.
// ============================================================================

const BARRIER = { WALL: 0, GUARDRAIL: 1, TYRES: 2, NONE: 3 };
const BARRIER_BY_KEY = { wall: 0, guardrail: 1, tyres: 2, none: 3 };
const PIT_LANE_W = 13;      // Breite der Boxengasse hinter der Boxenmauer (m)
const PIT_SPEED = 80 / 3.6; // Tempolimit in der Boxengasse
const KERB_W = [0, 1.30, 1.05];          // Breite je Randsteintyp (flach, Sägezahn)
const SAUSAGE_W = 0.50;
const KERB_H = [0, 0.022, 0.016];        // Überhöhung der Randsteine

/** Ergebnis einer Bodenabfrage (wird wiederverwendet → keine Allokation) */
class GroundHit {
  constructor() {
    this.i = 0; this.f = 0; this.s = 0; this.d = 0; this.side = 1;
    this.h = 0; this.nx = 0; this.ny = 1; this.nz = 0;
    this.surf = 0; this.edge = 0; this.barrier = 100; this.onTrack = true;
    this.inAero = false;
  }
}

class TrackModel {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this._buildCenterline();
    this._buildCurvature();
    this._buildSides();
    this._buildZones();
    this._buildPit();
    this._buildSpeedProfile();
    this._buildGrid();
    this._buildMarkers();
    this._tmpHit = new GroundHit();
  }

  // ---------------------------------------------------------------------------
  //  Mittellinie
  // ---------------------------------------------------------------------------
  _buildCenterline() {
    const P = this.def.points, n = P.length;
    // Kontrollpunkt als Vektor [x, z, y, halbeBreite, bankTan]
    const cp = P.map(p => [p[0], p[1], p[2], p[3] * 0.5, Math.tan((p[4] || 0) * DEG)]);
    const SUB = 48;
    const dense = []; // [x,z,y,hw,tb, sAcc]
    const tmp = [0, 0, 0, 0, 0];
    const knot = (a, b) => Math.max(1e-3, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5));
    for (let i = 0; i < n; i++) {
      const p0 = cp[(i - 1 + n) % n], p1 = cp[i], p2 = cp[(i + 1) % n], p3 = cp[(i + 2) % n];
      const t0 = 0, t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
      for (let k = 0; k < SUB; k++) {
        const tt = t1 + (t2 - t1) * (k / SUB);
        for (let c = 0; c < 5; c++) {
          const A1 = ((t1 - tt) * p0[c] + (tt - t0) * p1[c]) / (t1 - t0);
          const A2 = ((t2 - tt) * p1[c] + (tt - t1) * p2[c]) / (t2 - t1);
          const A3 = ((t3 - tt) * p2[c] + (tt - t2) * p3[c]) / (t3 - t2);
          const B1 = ((t2 - tt) * A1 + (tt - t0) * A2) / (t2 - t0);
          const B2 = ((t3 - tt) * A2 + (tt - t1) * A3) / (t3 - t1);
          tmp[c] = ((t2 - tt) * B1 + (tt - t1) * B2) / (t2 - t1);
        }
        dense.push([tmp[0], tmp[1], tmp[2], tmp[3], tmp[4], 0]);
      }
    }
    // Bogenlänge (3D)
    let acc = 0;
    for (let i = 0; i < dense.length; i++) {
      dense[i][5] = acc;
      const a = dense[i], b = dense[(i + 1) % dense.length];
      acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    const L = acc;
    const N = Math.round(L / 2.0);
    const ds = L / N;
    this.length = L; this.N = N; this.ds = ds;
    this.X = new Float64Array(N); this.Z = new Float64Array(N); this.Y = new Float64Array(N);
    this.HW = new Float32Array(N); this.TB = new Float32Array(N); this.S = new Float64Array(N);
    let di = 0;
    for (let j = 0; j < N; j++) {
      const s = j * ds;
      while (di < dense.length - 1 && dense[di + 1][5] <= s) di++;
      const a = dense[di], b = di + 1 < dense.length ? dense[di + 1] : dense[0];
      const sb = di + 1 < dense.length ? b[5] : L;
      const t = (s - a[5]) / Math.max(1e-9, sb - a[5]);
      this.X[j] = lerp(a[0], b[0], t); this.Z[j] = lerp(a[1], b[1], t); this.Y[j] = lerp(a[2], b[2], t);
      this.HW[j] = lerp(a[3], b[3], t); this.TB[j] = lerp(a[4], b[4], t); this.S[j] = s;
    }
    // Tangenten (horizontal), Rechtsvektor, Steigung
    this.TX = new Float32Array(N); this.TZ = new Float32Array(N);
    this.RX = new Float32Array(N); this.RZ = new Float32Array(N); this.GR = new Float32Array(N);
    for (let j = 0; j < N; j++) {
      const jp = (j + 1) % N, jm = (j - 1 + N) % N;
      let tx = this.X[jp] - this.X[jm], tz = this.Z[jp] - this.Z[jm];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      this.TX[j] = tx; this.TZ[j] = tz; this.RX[j] = -tz; this.RZ[j] = tx;
      this.GR[j] = (this.Y[jp] - this.Y[jm]) / (2 * ds);
    }
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, minY = 1e9, maxY = -1e9;
    for (let j = 0; j < N; j++) {
      minX = Math.min(minX, this.X[j]); maxX = Math.max(maxX, this.X[j]);
      minZ = Math.min(minZ, this.Z[j]); maxZ = Math.max(maxZ, this.Z[j]);
      minY = Math.min(minY, this.Y[j]); maxY = Math.max(maxY, this.Y[j]);
    }
    this.bounds = { minX, maxX, minZ, maxZ, minY, maxY };
  }

  _buildCurvature() {
    const N = this.N, ds = this.ds;
    this.K = new Float32Array(N); this.KS = new Float32Array(N);
    for (let j = 0; j < N; j++) {
      const jp = (j + 1) % N, jm = (j - 1 + N) % N;
      this.K[j] = (this.TX[jm] * this.TZ[jp] - this.TZ[jm] * this.TX[jp]) / (2 * ds);   // >0: Rechtskurve
    }
    const W = 6;
    for (let j = 0; j < N; j++) {
      let s = 0; for (let k = -W; k <= W; k++) s += this.K[(j + k + N) % N];
      this.KS[j] = s / (2 * W + 1);
    }
  }

  /** Anteil 0…1 → Sample-Index */
  idxOf(frac) { return ((Math.round(frac * this.N) % this.N) + this.N) % this.N; }
  /** Liegt Index j im (evtl. umbrechenden) Bereich [from,to]? */
  inRange(j, from, to) {
    const f = j / this.N;
    return from <= to ? (f >= from && f <= to) : (f >= from || f <= to);
  }

  // ---------------------------------------------------------------------------
  //  Seitenprofile
  // ---------------------------------------------------------------------------
  _buildSides() {
    const N = this.N, ds = this.ds, def = this.def;
    const mk = (T) => [new T(N), new T(N)];
    this.kerbT = mk(Uint8Array); this.saus = mk(Uint8Array); this.astroW = mk(Float32Array);
    this.runT = mk(Uint8Array); this.runW = mk(Float32Array); this.barT = mk(Uint8Array);
    const dflt = def.defaults || {};
    for (let s = 0; s < 2; s++) for (let j = 0; j < N; j++) {
      this.runT[s][j] = SURF_BY_KEY[dflt.runoff || 'grass'];
      this.runW[s][j] = dflt.runoffWidth || 12;
      this.barT[s][j] = BARRIER_BY_KEY[dflt.barrier || 'guardrail'];
    }
    // --- automatische Randsteine und Ausläufe aus der Krümmung ---
    const minR = (def.autoKerbs && def.autoKerbs.minRadius) || 350;
    const kth = 1 / minR;
    const corners = [];
    let j0 = 0;
    // Startpunkt außerhalb einer Kurve suchen, damit Läufe nicht zerschnitten werden
    for (let j = 0; j < N; j++) if (Math.abs(this.KS[j]) < kth * 0.5) { j0 = j; break; }
    let run = null;
    for (let k = 0; k <= N; k++) {
      const j = (j0 + k) % N, kv = this.KS[j];
      const inC = Math.abs(kv) > kth;
      if (inC && (!run || sgn(kv) !== run.sign)) { if (run) corners.push(run); run = { a: k, b: k, sign: sgn(kv), kmax: Math.abs(kv) }; }
      else if (inC && run) { run.b = k; run.kmax = Math.max(run.kmax, Math.abs(kv)); }
      else if (!inC && run) { corners.push(run); run = null; }
    }
    if (run) corners.push(run);
    this.corners = [];
    const m = (k) => ((j0 + k) % N + N) % N;
    const span = (a, b, fn) => { for (let k = a; k <= b; k++) fn(m(k)); };
    for (const c of corners) {
      const R = 1 / c.kmax;
      const inside = c.sign > 0 ? 1 : 0, outside = 1 - inside;
      // Scheitelbereich (hohe Krümmung)
      let aa = c.b, bb = c.a;
      for (let k = c.a; k <= c.b; k++) if (Math.abs(this.KS[m(k)]) >= c.kmax * 0.55) { aa = Math.min(aa, k); bb = Math.max(bb, k); }
      const ext = Math.round(10 / ds);
      span(aa - ext, bb + ext, j => { this.kerbT[inside][j] = 1; });
      const exitType = R < 100 ? 2 : 1;
      const mid = Math.round((aa + bb) / 2);
      span(mid, c.b + Math.round(28 / ds), j => { this.kerbT[outside][j] = exitType; });
      if (R < 200) span(c.a - Math.round(18 / ds), c.a + Math.round(6 / ds), j => { if (!this.kerbT[outside][j]) this.kerbT[outside][j] = 1; });
      if (R < 260) {
        span(c.a - Math.round(40 / ds), c.b + Math.round(35 / ds), j => {
          this.runT[outside][j] = R < 100 ? SURF.RUNOFF : SURF.GRAVEL;
          this.runW[outside][j] = R < 100 ? 28 : 24;
          this.barT[outside][j] = BARRIER.TYRES;
        });
        span(mid, c.b + Math.round(30 / ds), j => { this.astroW[outside][j] = 3; });
      }
      this.corners.push({ a: m(c.a), b: m(c.b), apexA: m(aa), apexB: m(bb), sign: c.sign, radius: R });
    }
    // --- explizite Abschnitte aus der Streckendefinition (überschreiben) ---
    for (const sec of (def.sections || [])) {
      const sides = sec.side === 'B' ? [0, 1] : [sec.side === 'R' ? 1 : 0];
      for (let j = 0; j < N; j++) {
        if (!this.inRange(j, sec.from, sec.to)) continue;
        for (const s of sides) {
          if (sec.runoff !== undefined) this.runT[s][j] = SURF_BY_KEY[sec.runoff];
          if (sec.runoffWidth !== undefined) this.runW[s][j] = sec.runoffWidth;
          if (sec.barrier !== undefined) this.barT[s][j] = BARRIER_BY_KEY[sec.barrier];
          if (sec.kerb !== undefined) this.kerbT[s][j] = sec.kerb;
          if (sec.astro !== undefined) this.astroW[s][j] = sec.astro;
          if (sec.sausage !== undefined) this.saus[s][j] = sec.sausage ? 1 : 0;
        }
      }
    }
    // --- abgeleitete Abstände, Innenradius-Begrenzung, Glättung ---
    this.KE = mk(Float32Array); this.SE = mk(Float32Array); this.AE = mk(Float32Array); this.BD = mk(Float32Array);
    for (let s = 0; s < 2; s++) {
      const want = new Float32Array(N), lim = new Float32Array(N);
      for (let j = 0; j < N; j++) {
        const hw = this.HW[j];
        const ke = hw + KERB_W[this.kerbT[s][j]];
        const se = ke + (this.saus[s][j] ? SAUSAGE_W : 0);
        const ae = se + this.astroW[s][j];
        this.KE[s][j] = ke; this.SE[s][j] = se; this.AE[s][j] = ae;
        want[j] = ae + Math.max(1.5, this.runW[s][j]);
        // Innenseite einer Kurve: Querschnittslinien schneiden sich im Krümmungsmittelpunkt
        const k = this.KS[j];
        const isInside = (k > 0 && s === 1) || (k < 0 && s === 0);
        lim[j] = isInside ? Math.max(ae + 1.5, 0.72 / Math.max(Math.abs(k), 1e-6)) : 1e9;
      }
      // Minimum-Filter auf das Limit (vorausschauend), dann gleitender Mittelwert auf den Wunschabstand
      const lim2 = new Float32Array(N), W1 = 6;
      for (let j = 0; j < N; j++) { let v = 1e9; for (let k = -W1; k <= W1; k++) v = Math.min(v, lim[(j + k + N) % N]); lim2[j] = v; }
      const W2 = 8;
      for (let j = 0; j < N; j++) {
        let acc = 0; for (let k = -W2; k <= W2; k++) acc += want[(j + k + N) % N];
        const sm = acc / (2 * W2 + 1);
        this.BD[s][j] = Math.max(this.AE[s][j] + 1.2, Math.min(sm, lim2[j]));
      }
    }
    this._smoothEdges();
  }
  /**
   * Übergänge in Fahrtrichtung glätten: Randsteine laufen an ihren Enden flach aus, das Kiesbett sinkt
   * erst hinter dem breitesten Randstein der Umgebung ein (sonst entstehen an Abschnittsgrenzen
   * Stufen von 5–8 cm, die leichte Autos ohne Abtrieb aushebeln)
   */
  _smoothEdges() {
    const N = this.N, mk = (T) => [new T(N), new T(N)];
    this.KF = mk(Float32Array); this.SK0 = mk(Float32Array); this.SKD = mk(Float32Array);
    const ramp = Math.max(1, Math.round(5 / this.ds)), W = Math.max(2, Math.round(10 / this.ds));
    for (let s = 0; s < 2; s++) {
      const kt = this.kerbT[s], mx = new Float32Array(N), dep = new Float32Array(N);
      for (let j = 0; j < N; j++) {
        if (kt[j]) { let d = 1; while (d <= ramp && kt[(j + d) % N] && kt[(j - d + N) % N]) d++; this.KF[s][j] = clamp((d - 0.5) / ramp, 0, 1); }
        let m = 0; for (let k = -W; k <= W; k++) m = Math.max(m, this.AE[s][(j + k + N) % N]); mx[j] = m;
        dep[j] = SURFACES[this.runT[s][j]].sink || 0;
      }
      for (let j = 0; j < N; j++) {
        let a = 0, b = 0; for (let k = -W; k <= W; k++) { a += mx[(j + k + N) % N]; b += dep[(j + k + N) % N]; }
        this.SK0[s][j] = a / (2 * W + 1); this.SKD[s][j] = b / (2 * W + 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  //  Boxengasse: hinter der Boxenmauer, Ein-/Ausfahrt als Öffnung in der Mauer
  // ---------------------------------------------------------------------------
  _buildPit() {
    this.pit = null;
    const p = this.def.scenery && this.def.scenery.pit; if (!p) return;
    const N = this.N, s = p.side === 'R' ? 1 : 0, sg = s ? 1 : -1;
    const ja = this.idxOf(p.from), jb = this.idxOf(p.to), n = (jb - ja + N) % N;
    const open = Math.round(75 / this.ds);
    const inPit = new Uint8Array(N), H = new Float32Array(N), o = new GroundHit();
    for (let k = 0; k <= n; k++) {
      const j = (ja + k) % N;
      inPit[j] = (k < open || k > n - open) ? 2 : 1;                 // 2 = Öffnung (Ein-/Ausfahrt)
      if (inPit[j] === 2) this.barT[s][j] = BARRIER.NONE;
      this._profile(j, j, 0, sg * (this.BD[s][j] - 0.02), this.S[j], o, 0);
      H[j] = o.h;                                                       // Höhe der Gasse (relativ zur Mittellinie)
    }
    // Boxenplätze: 10 Teams gleichmäßig zwischen Ein- und Ausfahrt
    const k0 = open + Math.round(25 / this.ds), k1 = n - open - Math.round(25 / this.ds);
    const boxes = Array.from({ length: 10 }, (_, i) => this.S[(ja + Math.round(k0 + (k1 - k0) * i / 9)) % N]);
    this.pit = { s, sg, ja, jb, n, open, inPit, H, sIn: this.S[ja], sOut: this.S[jb], boxes,
      len: n * this.ds, wallIn: this.S[(ja + open) % N], wallOut: this.S[(ja + n - open) % N] };
  }
  /** Meter vom Gassenanfang (oder −1, wenn außerhalb) */
  pitRel(s) { const P = this.pit; if (!P) return -1; let d = s - P.sIn; if (d < 0) d += this.length; return d <= P.len ? d : -1; }

  // ---------------------------------------------------------------------------
  //  Zonen: Sektoren, Aero-Geraden, Überholmodus-Erkennungspunkte
  // ---------------------------------------------------------------------------
  _buildZones() {
    const N = this.N, def = this.def;
    this.sectorS = (def.sectors || [0, 0.33, 0.66]).map(f => f * this.length);
    this.aero = new Uint8Array(N);
    for (const [a, b] of (def.aeroZones || [])) for (let j = 0; j < N; j++) if (this.inRange(j, a, b)) this.aero[j] = 1;
    this.aeroZones = (def.aeroZones || []).map(([a, b]) => ({ from: a * this.length, to: b * this.length }));
    this.detectS = (def.overtakeDetection || []).map(f => f * this.length);
  }

  /** Referenz-Geschwindigkeitsprofil (Punktmasse mit Abtrieb) – Bremsschilder, später KI/Ideallinie */
  _buildSpeedProfile() {
    const N = this.N, ds = this.ds;
    const mu = 1.45, g = G0, cAero = 0.0026, cDrag = 0.00075, vTop = 95;
    const vLat = new Float32Array(N);
    for (let j = 0; j < N; j++) {
      const k = Math.abs(this.KS[j]);
      const den = k - mu * cAero;
      vLat[j] = den <= 1e-5 ? vTop : Math.min(vTop, Math.sqrt(mu * g / den));
    }
    const v = Float32Array.from(vLat);
    const acc = (vv) => Math.max(0.4, Math.min(mu * g * 0.62, 700000 / (770 * Math.max(vv, 5))) - cDrag * vv * vv);
    const brk = (vv) => mu * (g + cAero * vv * vv) * 0.92 + cDrag * vv * vv;
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < 2 * N; k++) { const j = k % N, jn = (j + 1) % N; v[jn] = Math.min(v[jn], Math.sqrt(v[j] * v[j] + 2 * acc(v[j]) * ds)); }
      for (let k = 2 * N; k > 0; k--) { const j = k % N, jp = (j - 1 + N) % N; v[jp] = Math.min(v[jp], Math.sqrt(v[j] * v[j] + 2 * brk(v[j]) * ds)); }
    }
    this.VP = v;
    let t = 0; for (let j = 0; j < N; j++) t += ds / Math.max(5, v[j]);
    this.refLapTime = t;
  }

  /** Bremsschilder vor Kurven mit großem Geschwindigkeitsabbau */
  _buildMarkers() {
    const N = this.N, ds = this.ds;
    this.brakeBoards = [];
    for (const c of this.corners) {
      // minimale Profilgeschwindigkeit in der Kurve und maximale 400 m davor
      let vmin = 1e9; for (let k = 0; k <= ((c.b - c.a + N) % N); k++) vmin = Math.min(vmin, this.VP[(c.a + k) % N]);
      let vmax = 0; for (let k = 1; k < 200; k++) vmax = Math.max(vmax, this.VP[(c.a - k + N) % N]);
      if (vmax - vmin < 22) continue;
      const outside = c.sign > 0 ? 0 : 1;
      for (const dist of [150, 100, 50]) {
        const j = (c.a - Math.round(dist / ds) + N) % N;
        this.brakeBoards.push({ j, dist, side: outside });
      }
    }
  }

  _buildGrid() {
    const cell = 30;
    this.gridCell = cell;
    this.grid = new Map();
    for (let j = 0; j < this.N; j++) {
      const key = Math.floor(this.X[j] / cell) + ',' + Math.floor(this.Z[j] / cell);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(j);
    }
  }

  /** Nächstgelegenes Sample (global, über Raster) */
  nearestSample(x, z, maxRing = 6) {
    const cell = this.gridCell, cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= maxRing; r++) {
      for (let ix = cx - r; ix <= cx + r; ix++) for (let iz = cz - r; iz <= cz + r; iz++) {
        if (Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== r) continue;
        const list = this.grid.get(ix + ',' + iz); if (!list) continue;
        for (const j of list) { const d = (this.X[j] - x) ** 2 + (this.Z[j] - z) ** 2; if (d < bd) { bd = d; best = j; } }
      }
      if (best >= 0 && r >= 1) break;
    }
    if (best < 0) {   // Weit weg: lineare Suche
      for (let j = 0; j < this.N; j += 2) { const d = (this.X[j] - x) ** 2 + (this.Z[j] - z) ** 2; if (d < bd) { bd = d; best = j; } }
    }
    return { j: best, dist: Math.sqrt(bd) };
  }

  /**
   * Lokalisierung über „Scheiben“ zwischen aufeinanderfolgenden Querschnitten.
   * Liefert Index, Anteil f und Querablage d (positiv = rechts). hint = letzter Index.
   */
  locate(x, z, hint, out) {
    const N = this.N, X = this.X, Z = this.Z, TX = this.TX, TZ = this.TZ;
    let j = (hint >= 0 && hint < N) ? hint : this.nearestSample(x, z).j;
    let dir = 0, flips = 0;
    for (let it = 0; it < 96; it++) {
      const a = (x - X[j]) * TX[j] + (z - Z[j]) * TZ[j];
      if (a < 0) { if (dir === 1) flips++; dir = -1; j = j === 0 ? N - 1 : j - 1; if (flips > 3) break; continue; }
      const j1 = j + 1 === N ? 0 : j + 1;
      const b = (x - X[j1]) * TX[j1] + (z - Z[j1]) * TZ[j1];
      if (b >= 0) { if (dir === -1) flips++; dir = 1; j = j1; if (flips > 3) break; continue; }
      const f = a / (a - b);
      const d0 = (x - X[j]) * this.RX[j] + (z - Z[j]) * this.RZ[j];
      const d1 = (x - X[j1]) * this.RX[j1] + (z - Z[j1]) * this.RZ[j1];
      out.i = j; out.f = f; out.d = d0 + (d1 - d0) * f;
      return out;
    }
    // Rückfall (z. B. weit abseits): nächstes Sample
    const ns = this.nearestSample(x, z).j;
    out.i = ns; out.f = 0;
    out.d = (x - X[ns]) * this.RX[ns] + (z - Z[ns]) * this.RZ[ns];
    return out;
  }

  /** Querprofil: Höhe relativ zur Mittellinienhöhe, Steigung dh/dd, Untergrund (nz = Fahrbahnrauschen 0/1) */
  _profile(j, j1, f, d, s, out, nz = 1) {
    const hw = this.HW[j] + (this.HW[j1] - this.HW[j]) * f;
    const tb = this.TB[j] + (this.TB[j1] - this.TB[j]) * f;
    const side = d >= 0 ? 1 : 0, sg = d >= 0 ? 1 : -1, a = d * sg;
    const jn = f < 0.5 ? j : j1;
    let h, dhda, surf;
    if (a <= hw) {
      surf = a > hw - 0.25 ? SURF.LINE : SURF.ASPHALT;
      h = d * tb; out.dhdd = tb;
      const sd = SURFACES[surf];
      h += nz * sd.vibAmp * noise1(s / sd.vibLen + d * 0.31);
      out.h = h; out.surf = surf; out.edge = a - hw; out.barrier = this.BD[side][jn];
      return;
    }
    const ke = this.KE[side][jn], se = this.SE[side][jn], ae = this.AE[side][jn], bd = this.BD[side][jn];
    const hEdge = sg * hw * tb;
    const slope = sg * tb * 0.5 - 0.006;
    h = hEdge + (a - hw) * slope; dhda = slope;
    const kt = this.kerbT[side][jn];
    if (kt && a <= ke) {
      surf = kt === 2 ? SURF.KERB_SAW : SURF.KERB;
      const kw = ke - hw, u = (a - hw) / kw;
      const win = smoothstep(0, 0.12, u) * (1 - smoothstep(0.88, 1, u));
      const kf = this.KF ? lerp(this.KF[side][j], this.KF[side][j1], f) : 1;
      h += KERB_H[kt] * win * kf;
      dhda += KERB_H[kt] * kf * ((u < 0.12 ? 1 : (u > 0.88 ? -1 : 0)) * 8 / kw);
      const sd = SURFACES[surf];
      if (kt === 2) { const ph = s / sd.vibLen; h += nz * sd.vibAmp * (Math.abs((ph - Math.floor(ph)) * 2 - 1) - 0.5) * win; }
      else h += nz * sd.vibAmp * 0.5 * Math.sin(s * Math.PI * 2 / sd.vibLen) * win;
    } else if (this.saus[side][jn] && a <= se) {
      surf = SURF.SAUSAGE;
      const u = (a - ke) / SAUSAGE_W, bump = 0.085;
      h += bump * Math.sin(Math.PI * u);
      dhda += bump * Math.PI * Math.cos(Math.PI * u) / SAUSAGE_W;
    } else if (a <= ae) {
      surf = SURF.ASTRO;
      h += nz * SURFACES[SURF.ASTRO].vibAmp * noise1(s / 1.6 + a);
    } else if (this.pit && side === this.pit.s && this.pit.inPit[jn] && a > bd - 0.02 && a <= bd + PIT_LANE_W) {
      surf = SURF.PIT; h = this.pit.H[jn]; dhda = 0;
      h += nz * SURFACES[SURF.PIT].vibAmp * noise1(s / 3 + a * 0.2);
      out.h = h; out.dhdd = 0; out.surf = surf; out.edge = a - hw; out.barrier = bd + PIT_LANE_W;
      return;
    } else if (a <= bd) {
      surf = this.runT[side][jn];
      const sd = SURFACES[surf];
      const sk = this.SKD ? lerp(this.SKD[side][j], this.SKD[side][j1], f) : (sd.sink || 0);
      if (sk > 0) { const a0 = this.SK0 ? lerp(this.SK0[side][j], this.SK0[side][j1], f) : ae; const t = smoothstep(a0, a0 + 0.8, a); h -= sk * t; dhda -= sk * (a > a0 && a < a0 + 0.8 ? 1.2 / 0.8 : 0); }
      h += nz * sd.vibAmp * noise1(s / sd.vibLen + a * 0.53);
    } else {
      surf = SURF.GRASS;
      h += nz * SURFACES[SURF.GRASS].vibAmp * noise1(s / 3.5 + a * 0.4);
    }
    out.h = h; out.dhdd = sg * dhda; out.surf = surf; out.edge = a - hw; out.barrier = bd;
  }

  /** Bodenabfrage für Physik: Höhe, Normale, Untergrund an (x,z) */
  query(x, z, hint, out) {
    this.locate(x, z, hint, out);
    const j = out.i, j1 = j + 1 === this.N ? 0 : j + 1, f = out.f, d = out.d;
    const yc = this.Y[j] + (this.Y[j1] - this.Y[j]) * f;
    const s = this.S[j] + f * this.ds;
    out.s = s;
    this._profile(j, j1, f, d, s, out);
    out.h += yc;
    out.side = d >= 0 ? 1 : 0;
    out.onTrack = out.edge <= 0;
    out.inAero = this.aero[f < 0.5 ? j : j1] === 1;
    const gr = this.GR[j] + (this.GR[j1] - this.GR[j]) * f;
    const rx = this.RX[j], rz = this.RZ[j], tx = this.TX[j], tz = this.TZ[j];
    let nx = -out.dhdd * rx - gr * tx, ny = 1, nz = -out.dhdd * rz - gr * tz;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
    return out;
  }

  /** Glatte Höhe am Sample j bei Querablage d (ohne Rauschen) – für die Grafik */
  visualHeight(j, d) {
    const o = this._tmpHit;
    this._profile(j, j, 0, d, this.S[j], o, 0);
    return this.Y[j] + o.h;
  }
  /** Nur Höhe (für Szenerie/Gelände) */
  heightAt(x, z, hint = -1) { return this.query(x, z, hint, this._tmpHit).h; }

  /** Pose auf der Strecke: Position (Mittellinie + Querablage), Gierwinkel */
  poseAt(s, lateral = 0) {
    s = ((s % this.length) + this.length) % this.length;
    const j = Math.floor(s / this.ds) % this.N, j1 = (j + 1) % this.N, f = (s - this.S[j]) / this.ds;
    const x = lerp(this.X[j], this.X[j1], f) + this.RX[j] * lateral;
    const z = lerp(this.Z[j], this.Z[j1], f) + this.RZ[j] * lateral;
    const tx = lerp(this.TX[j], this.TX[j1], f), tz = lerp(this.TZ[j], this.TZ[j1], f);
    const yaw = Math.atan2(-tx, -tz);
    const hit = this.query(x, z, j, this._tmpHit);
    return { x, y: hit.h, z, yaw, j, tx, tz };
  }

  /** Abstand s → Sektor (0..2) */
  sectorOf(s) { let k = 0; for (let i = 0; i < this.sectorS.length; i++) if (s >= this.sectorS[i]) k = i; return k; }
}
