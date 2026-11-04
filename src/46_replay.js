// ============================================================================
//  WIEDERHOLUNG (Phase 6) – Aufzeichnung aller Fahrzeuge mit 15 Hz, kompakt
//  (Position/Strecke als Float32, Rest als Int16 ≈ 42 Byte je Auto und Bild),
//  in Blöcken zu 60 s, höchstens die letzten 40 Minuten. Ohne Grafik → Node-testbar.
// ============================================================================

const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4];
const REPLAY_HZ = 15, REPLAY_CHUNK = REPLAY_HZ * 60, RF = 5, RI = 11;
// Float32: x, y, z, dist (Rennfortschritt), trackS
// Int16:   qx, qy, qz, qw (×32767), steer (×30000), speed (×100), rpm, thr, brk, flap (×10000), flags
//          flags: Bit0 sichtbar · Bit1–3 Mischung · Bit4–7 Gang+1 · Bit8 Boxengasse · Bit9 Bremse blockiert

class ReplayRecorder {
  /**
   * sources: [{ vehicle, team, number, name, player?, visible?(): bool, dist?(): number }]
   * Ein Eintrag darf vehicle = null haben (z. B. Safety Car, solange es nicht fährt); dann über get() auflösen.
   */
  constructor(sources, { hz = REPLAY_HZ, maxSec = 2400 } = {}) {
    this.src = sources; this.n = sources.length; this.hz = hz; this.dt = 1 / hz;
    this.maxChunks = Math.max(2, Math.ceil(maxSec / 60) + 1);   // + 1: mindestens maxSec bleiben erhalten
    this.chunks = []; this.frames = 0; this.base = 0;    // base = Index des ersten noch vorhandenen Bildes
    this.t = 0; this.nextT = 0; this.events = [];
  }
  get start() { const c = this.chunks[0]; return c && c.count ? c.t[0] : 0; }
  get end() { const c = this.chunks[this.chunks.length - 1]; return c && c.count ? c.t[c.count - 1] : 0; }
  get length() { return Math.max(0, this.end - this.start); }
  get bytes() { return this.chunks.length * REPLAY_CHUNK * this.n * (RF * 4 + RI * 2); }
  /** Pro Physikschritt aufrufen */
  step(h) {
    this.t += h;
    if (this.t + 1e-9 >= this.nextT) { this.capture(); this.nextT += this.dt; if (this.nextT < this.t) this.nextT = this.t + this.dt; }
  }
  /** Ereignis für die Zeitleiste (Kontakt, Überholmanöver, Ausfall, Safety Car …) */
  mark(type, idx = -1, text = '') {
    const last = this.events[this.events.length - 1];
    if (last && last.type === type && last.idx === idx && this.t - last.t < 3) return;
    this.events.push({ t: this.t, type, idx, text });
    if (this.events.length > 600) this.events.shift();
  }
  _chunk() {
    let c = this.chunks[this.chunks.length - 1];
    if (!c || c.count >= REPLAY_CHUNK) {
      if (this.chunks.length >= this.maxChunks) { const old = this.chunks.shift(); this.base += old.count; c = old; c.count = 0; }   // Speicher wiederverwenden
      else c = { f: new Float32Array(REPLAY_CHUNK * this.n * RF), s: new Int16Array(REPLAY_CHUNK * this.n * RI), t: new Float64Array(REPLAY_CHUNK), count: 0 };
      this.chunks.push(c);
      const t0 = this.chunks[0].count ? this.chunks[0].t[0] : this.t;
      this.events = this.events.filter(e => e.t >= t0);
    }
    return c;
  }
  capture() {
    const c = this._chunk(), k = c.count, n = this.n;
    c.t[k] = this.t;
    for (let i = 0; i < n; i++) {
      const src = this.src[i], v = src.get ? src.get() : src.vehicle;
      const fo = (k * n + i) * RF, so = (k * n + i) * RI;
      const vis = !!v && (src.visible ? src.visible() : true);
      if (!v) { c.s[so + 10] = 0; continue; }
      c.f[fo] = v.pos.x; c.f[fo + 1] = v.pos.y; c.f[fo + 2] = v.pos.z;
      c.f[fo + 3] = src.dist ? src.dist() : 0; c.f[fo + 4] = v.trackS || 0;
      const q = v.q;
      c.s[so] = q.x * 32767; c.s[so + 1] = q.y * 32767; c.s[so + 2] = q.z * 32767; c.s[so + 3] = q.w * 32767;
      const W = v.wheels;
      c.s[so + 4] = clamp((W[0].steer + W[1].steer) * 0.5, -1.09, 1.09) * 30000;
      c.s[so + 5] = clamp(v.speed, 0, 327) * 100;
      c.s[so + 6] = clamp(v.rpm, 0, 32000);
      c.s[so + 7] = clamp(v.input.throttle, 0, 1) * 10000; c.s[so + 8] = clamp(v.input.brake, 0, 1) * 10000;
      c.s[so + 9] = clamp(v.aeroFlap || 0, 0, 1) * 10000;
      const cpd = Math.max(0, COMPOUND_ORDER.indexOf(v.compound));
      const locked = W.some(w => w.locked) ? 1 : 0;
      c.s[so + 10] = (vis ? 1 : 0) | (cpd << 1) | ((clamp(v.gear + 1, 0, 15)) << 4) | ((v.inPitLane ? 1 : 0) << 8) | (locked << 9);
    }
    c.count++; this.frames++;
  }
  /** Globales Bild k → [Block, lokaler Index] */
  _at(k) {
    k -= this.base; if (k < 0) k = 0;
    const ci = Math.min(this.chunks.length - 1, Math.floor(k / REPLAY_CHUNK));
    return [this.chunks[ci], Math.min(this.chunks[ci].count - 1, k - ci * REPLAY_CHUNK)];
  }
  _time(k) { const [c, j] = this._at(k); return c.t[j]; }
  /** Bildindex k mit t(k) ≤ time < t(k+1) */
  _find(time) {
    const lo = this.base, hi = this.base + this.frames - (this.frames - this._kept()) - 1;
    let k = clamp(Math.floor((time - this.start) * this.hz) + lo, lo, hi);
    while (k > lo && this._time(k) > time) k--;
    while (k < hi && this._time(k + 1) <= time) k++;
    return [k, lo, hi];
  }
  _kept() { return this.chunks.reduce((a, c) => a + c.count, 0); }
  /**
   * Zustand von Auto i zur Zeit time (interpoliert: Position Catmull-Rom, Rotation nlerp).
   * out wird befüllt und zurückgegeben; out.visible = false, wenn das Auto (noch) nicht fährt.
   */
  sample(time, i, out = {}) {
    if (!this.frames) { out.visible = false; return out; }
    const [k, lo, hi] = this._find(time);
    const k1 = Math.min(hi, k + 1), t0 = this._time(k), t1 = this._time(k1);
    const a = t1 > t0 ? clamp((time - t0) / (t1 - t0), 0, 1) : 0;
    const P = (kk) => { const [c, j] = this._at(clamp(kk, lo, hi)); return [c, (j * this.n + i)]; };
    const [c0, o0] = P(k), [c1, o1] = P(k1), [cm, om] = P(k - 1), [cp, op] = P(k1 + 1);
    const f0 = o0 * RF, f1 = o1 * RF, s0 = o0 * RI, s1 = o1 * RI;
    const fl0 = c0.s[s0 + 10], fl1 = c1.s[s1 + 10];
    out.visible = !!(fl0 & 1) && !!(fl1 & 1 || a < 0.5);
    if (!out.visible) return out;
    const cr = (p0, p1, p2, p3) => crScalarR(p0, p1, p2, p3, a);
    const fm = om * RF, fp = op * RF;
    // Sprünge (Zurücksetzen, Wrack geborgen) nicht glätten
    const jump = Math.hypot(c1.f[f1] - c0.f[f0], c1.f[f1 + 2] - c0.f[f0 + 2]) > 60;
    for (let d = 0; d < 3; d++) {
      const p1 = c0.f[f0 + d], p2 = c1.f[f1 + d];
      out[['x', 'y', 'z'][d]] = jump ? (a < 0.5 ? p1 : p2) : cr(cm.f[fm + d], p1, p2, cp.f[fp + d]);
    }
    out.dist = lerp(c0.f[f0 + 3], c1.f[f1 + 3], a);
    out.trackS = a < 0.5 ? c0.f[f0 + 4] : c1.f[f1 + 4];
    let qx0 = c0.s[s0], qy0 = c0.s[s0 + 1], qz0 = c0.s[s0 + 2], qw0 = c0.s[s0 + 3];
    let qx1 = c1.s[s1], qy1 = c1.s[s1 + 1], qz1 = c1.s[s1 + 2], qw1 = c1.s[s1 + 3];
    if (qx0 * qx1 + qy0 * qy1 + qz0 * qz1 + qw0 * qw1 < 0) { qx1 = -qx1; qy1 = -qy1; qz1 = -qz1; qw1 = -qw1; }
    let qx = lerp(qx0, qx1, a), qy = lerp(qy0, qy1, a), qz = lerp(qz0, qz1, a), qw = lerp(qw0, qw1, a);
    const ql = Math.hypot(qx, qy, qz, qw) || 1;
    out.qx = qx / ql; out.qy = qy / ql; out.qz = qz / ql; out.qw = qw / ql;
    const L = (o) => lerp(c0.s[s0 + o], c1.s[s1 + o], a);
    out.steer = L(4) / 30000; out.speed = L(5) / 100; out.rpm = L(6);
    out.throttle = L(7) / 10000; out.brake = L(8) / 10000; out.flap = L(9) / 10000;
    const fl = a < 0.5 ? fl0 : fl1;
    out.compound = COMPOUND_ORDER[(fl >> 1) & 7] || 'medium';
    out.gear = ((fl >> 4) & 15) - 1; out.inPit = !!(fl & 256); out.locked = !!(fl & 512);
    return out;
  }
}
function crScalarR(a, b, c, d, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); }

/**
 * Automatische Regie: wählt das interessanteste Auto (Zweikampf in der Spitze, Ereignisse in Kürze,
 * sonst Spieler/Führender). Wechsel frühestens nach minHold Sekunden.
 */
class ReplayDirector {
  constructor(rec, { minHold = 7, playerIdx = -1 } = {}) { this.rec = rec; this.minHold = minHold; this.playerIdx = playerIdx; this.cur = playerIdx >= 0 ? playerIdx : 0; this.since = -1e9; this.tmp = {}; }
  pick(time) {
    if (time - this.since < this.minHold && time >= this.since) return this.cur;
    const R = this.rec, n = R.n, s = [];
    for (let i = 0; i < n; i++) { const p = R.sample(time, i, {}); if (p.visible && !R.src[i].noFocus) s.push({ i, d: p.dist, v: p.speed }); }
    if (!s.length) return this.cur;
    s.sort((a, b) => b.d - a.d);
    let best = -1, score = -1e9;
    // bevorstehende Ereignisse (Kontakte, Ausfälle) in den nächsten 4 s
    const ev = R.events.find(e => e.idx >= 0 && e.t > time && e.t - time < 4 && (e.type === 'contact' || e.type === 'out' || e.type === 'pass'));
    if (ev) best = ev.idx;
    else s.forEach((c, pos) => {
      const ahead = s[pos - 1], gap = ahead ? ahead.d - c.d : 999;
      let sc = (gap < 25 ? 60 - gap : 0) - pos * 2.2;
      if (c.i === this.playerIdx) sc += 14;
      if (c.i === this.cur) sc += 6;
      if (c.v < 15) sc -= 40;
      if (sc > score) { score = sc; best = c.i; }
    });
    if (best >= 0 && best !== this.cur) { this.cur = best; this.since = time; }
    else if (best >= 0) this.since = Math.min(this.since, time);
    return this.cur;
  }
  reset(time) { this.since = time - this.minHold; }
}
