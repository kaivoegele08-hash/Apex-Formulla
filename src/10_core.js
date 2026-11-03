// ============================================================================
//  CORE – Grundmathematik, Ereignisbus, Spielschleife (fester Zeitschritt),
//  Speichern (localStorage, immer abgesichert)
//  Dieser Abschnitt ist frei von DOM-/THREE-Abhängigkeiten (auch in Node testbar).
// ============================================================================

const APP_NAME = 'Apex Formula';
const APP_VERSION = '0.3.0 – Phase 3';
const PHYS_HZ = 360;                 // fester Physik-Takt
const PHYS_DT = 1 / PHYS_HZ;
const DEG = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const G0 = 9.81;
const KMH = 3.6;

// ---------------------------------------------------------------------------
//  Skalare Helfer
// ---------------------------------------------------------------------------
function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function sgn(x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); }
/** Frame-unabhängiges exponentielles Annähern */
function damp(cur, target, lambda, dt) { return target + (cur - target) * Math.exp(-lambda * dt); }
function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
/** Stückweise lineare Interpolation in einer Tabelle [[x,y],...] (x aufsteigend) */
function interpTable(tab, x) {
  if (x <= tab[0][0]) return tab[0][1];
  const n = tab.length;
  if (x >= tab[n - 1][0]) return tab[n - 1][1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m][0] <= x) lo = m; else hi = m; }
  const t = (x - tab[lo][0]) / (tab[hi][0] - tab[lo][0]);
  return tab[lo][1] + (tab[hi][1] - tab[lo][1]) * t;
}
/** Zeitformat m:ss.mmm */
function fmtTime(t, showMs = true) {
  if (!isFinite(t) || t < 0) return showMs ? '-:--.---' : '-:--';
  const m = Math.floor(t / 60), s = t - m * 60;
  const ss = Math.floor(s), ms = Math.floor((s - ss) * 1000);
  return showMs ? `${m}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
function fmtNum(x, d = 1) { return x.toFixed(d).replace('.', ','); }

/** Deterministischer Zufallsgenerator (mulberry32) – für reproduzierbare Szenerie */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Glatter, deterministischer 1D-Wert-Rauschwert (für Fahrbahnunebenheiten) */
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function noise1(x) { const i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f); return lerp(hash1(i), hash1(i + 1), u) * 2 - 1; }

function deepClone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
/** Rekursives Zusammenführen: Standardwerte werden mit gespeicherten Werten überlagert */
function deepMerge(base, over) {
  if (over === null || over === undefined) return deepClone(base);
  if (Array.isArray(base)) return Array.isArray(over) ? deepClone(over) : deepClone(base);
  if (typeof base !== 'object' || base === null) return (typeof over === typeof base) ? over : base;
  const out = {};
  for (const k of Object.keys(base)) out[k] = deepMerge(base[k], over[k]);
  for (const k of Object.keys(over)) if (!(k in base)) out[k] = deepClone(over[k]);
  return out;
}

// ---------------------------------------------------------------------------
//  Kleine Vektor-/Quaternion-/Matrix-Klassen ohne Allokationen im Hotpath
// ---------------------------------------------------------------------------
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  /** this = a × b */
  crossVectors(a, b) {
    const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
    this.x = x; this.y = y; this.z = z; return this;
  }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { const l = this.length(); if (l > 1e-12) { this.x /= l; this.y /= l; this.z /= l; } return this; }
}

class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z, this.w) || 1; this.x /= l; this.y /= l; this.z /= l; this.w /= l; return this; }
  setFromAxisAngle(ax, ay, az, ang) { const h = ang / 2, s = Math.sin(h); this.x = ax * s; this.y = ay * s; this.z = az * s; this.w = Math.cos(h); return this; }
  /** this = a * b */
  multiplyQuats(a, b) {
    const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
    const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
    const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
    const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
    this.x = x; this.y = y; this.z = z; this.w = w; return this;
  }
  /** Integration mit Winkelgeschwindigkeit (Weltsystem) über dt */
  integrate(wx, wy, wz, dt) {
    const hx = wx * dt * 0.5, hy = wy * dt * 0.5, hz = wz * dt * 0.5;
    const x = this.x, y = this.y, z = this.z, w = this.w;
    this.x += hx * w + hy * z - hz * y;
    this.y += hy * w + hz * x - hx * z;
    this.z += hz * w + hx * y - hy * x;
    this.w += -hx * x - hy * y - hz * z;
    return this.normalize();
  }
}

/** 3×3-Rotationsmatrix (zeilenweise), Spalten = lokale Achsen im Weltsystem */
class Mat3 {
  constructor() { this.e = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]); }
  fromQuat(q) {
    const { x, y, z, w } = q, e = this.e;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    e[0] = 1 - (yy + zz); e[1] = xy - wz; e[2] = xz + wy;
    e[3] = xy + wz; e[4] = 1 - (xx + zz); e[5] = yz - wx;
    e[6] = xz - wy; e[7] = yz + wx; e[8] = 1 - (xx + yy);
    return this;
  }
  /** out = R * v (lokal → Welt) */
  mulVec(v, out) {
    const e = this.e, x = v.x, y = v.y, z = v.z;
    out.x = e[0] * x + e[1] * y + e[2] * z; out.y = e[3] * x + e[4] * y + e[5] * z; out.z = e[6] * x + e[7] * y + e[8] * z;
    return out;
  }
  mulXYZ(x, y, z, out) {
    const e = this.e;
    out.x = e[0] * x + e[1] * y + e[2] * z; out.y = e[3] * x + e[4] * y + e[5] * z; out.z = e[6] * x + e[7] * y + e[8] * z;
    return out;
  }
  /** out = Rᵀ * v (Welt → lokal) */
  mulTVec(v, out) {
    const e = this.e, x = v.x, y = v.y, z = v.z;
    out.x = e[0] * x + e[3] * y + e[6] * z; out.y = e[1] * x + e[4] * y + e[7] * z; out.z = e[2] * x + e[5] * y + e[8] * z;
    return out;
  }
}

// ---------------------------------------------------------------------------
//  Ereignisbus
// ---------------------------------------------------------------------------
class EventBus {
  constructor() { this.map = new Map(); }
  on(type, fn) { if (!this.map.has(type)) this.map.set(type, new Set()); this.map.get(type).add(fn); return () => this.off(type, fn); }
  off(type, fn) { const s = this.map.get(type); if (s) s.delete(fn); }
  emit(type, a, b, c) {
    const s = this.map.get(type);
    if (!s) return;
    for (const fn of s) { try { fn(a, b, c); } catch (err) { console.error('[Events]', type, err); } }
  }
}
const Events = new EventBus();

// ---------------------------------------------------------------------------
//  Spielschleife: Physik mit festem Takt (Akkumulator), Rendern entkoppelt
// ---------------------------------------------------------------------------
class GameLoop {
  constructor(step = PHYS_DT, maxSteps = 48) {
    this.step = step; this.maxSteps = maxSteps;
    this.acc = 0; this.last = 0; this.running = false;
    this.timeScale = 1; this.paused = false;
    this.onPre = null;      // (frameDt) → Eingaben vor den Physikschritten
    this.onStep = null;     // (dt) → feste Physikschritte
    this.onFrame = null;    // (frameDt, alpha) → Eingabe/Render/UI
    this.frameDt = 0; this.stepsLastFrame = 0;
    this._raf = this._raf.bind(this);
  }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); requestAnimationFrame(this._raf); }
  _raf(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.1) dt = 0.1;          // Spirale des Todes vermeiden (Tab im Hintergrund etc.)
    if (dt < 0) dt = 0;
    this.frameDt = dt;
    let steps = 0;
    if (this.onPre) this.onPre(dt);
    if (!this.paused && this.onStep) {
      this.acc += dt * this.timeScale;
      while (this.acc >= this.step && steps < this.maxSteps) { this.onStep(this.step); this.acc -= this.step; steps++; }
      if (steps >= this.maxSteps) this.acc = 0;
    }
    this.stepsLastFrame = steps;
    const alpha = this.paused ? 1 : clamp(this.acc / this.step, 0, 1);
    if (this.onFrame) this.onFrame(dt, alpha);
    requestAnimationFrame(this._raf);
  }
}

// ---------------------------------------------------------------------------
//  Speichern – localStorage immer in try/catch, Spiel funktioniert auch ohne
// ---------------------------------------------------------------------------
const Save = {
  prefix: 'apexformula.v1.',
  available: false,
  memory: {},   // Fallback-Speicher, falls localStorage gesperrt ist
  init() {
    try {
      const k = this.prefix + '__test';
      globalThis.localStorage.setItem(k, '1');
      globalThis.localStorage.removeItem(k);
      this.available = true;
    } catch (e) { this.available = false; }
    return this.available;
  },
  get(key, def) {
    try {
      if (this.available) {
        const s = globalThis.localStorage.getItem(this.prefix + key);
        if (s !== null && s !== undefined) return JSON.parse(s);
      } else if (key in this.memory) return deepClone(this.memory[key]);
    } catch (e) { console.warn('[Save] Lesen fehlgeschlagen:', key, e); }
    return deepClone(def);
  },
  set(key, value) {
    this.memory[key] = deepClone(value);
    if (!this.available) return false;
    try { globalThis.localStorage.setItem(this.prefix + key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('[Save] Schreiben fehlgeschlagen:', key, e); return false; }
  },
  remove(key) {
    delete this.memory[key];
    if (!this.available) return;
    try { globalThis.localStorage.removeItem(this.prefix + key); } catch (e) { /* ignorieren */ }
  },
  /** Alle Spieldaten als JSON-Text */
  exportAll() {
    const out = { app: APP_NAME, version: APP_VERSION, exported: new Date().toISOString(), data: {} };
    try {
      if (this.available) {
        for (let i = 0; i < globalThis.localStorage.length; i++) {
          const k = globalThis.localStorage.key(i);
          if (k && k.startsWith(this.prefix)) out.data[k.slice(this.prefix.length)] = JSON.parse(globalThis.localStorage.getItem(k));
        }
      } else out.data = deepClone(this.memory);
    } catch (e) { console.warn('[Save] Export fehlgeschlagen', e); }
    return JSON.stringify(out, null, 2);
  },
  importAll(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || !obj.data) throw new Error('Kein gültiger Apex-Formula-Export');
    for (const [k, v] of Object.entries(obj.data)) this.set(k, v);
    return Object.keys(obj.data).length;
  }
};
