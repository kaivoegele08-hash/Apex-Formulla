// ============================================================================
//  INPUT – Tastatur, Gamepads, Lenkräder, Pedale, Button-Boxen.
//  Jede Achse / jeder Knopf kann von einem beliebigen angeschlossenen Gerät
//  stammen (Lenkrad-Basis + separate Pedale + Handbremse/Button-Box).
// ============================================================================

const BROWSER = (typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)) ? 'firefox' : 'chromium';

/** Belegbare Knopf-Funktionen */
const BUTTON_ACTIONS = [
  ['shiftUp', 'Hochschalten'], ['shiftDown', 'Runterschalten'], ['overtake', 'Überholmodus'], ['aero', 'Aero-Modus (manuell)'],
  ['pitLimiter', 'Boxenfunk / Begrenzer'], ['bbUp', 'Bremsbalance +'], ['bbDown', 'Bremsbalance −'], ['ersUp', 'Energiemodus +'],
  ['ersDown', 'Energiemodus −'], ['mfd', 'MFD-Menü'], ['camera', 'Kamera wechseln'], ['lookBack', 'Blick zurück'],
  ['lookLeft', 'Blick links'], ['lookRight', 'Blick rechts'], ['pause', 'Pause'], ['reset', 'Auto zurücksetzen'],
  ['inputOverlay', 'Eingabe-Overlay'], ['hud', 'HUD ein/aus'], ['pitRequest', 'Box anfordern'],
];
const ACTION_LABEL = Object.fromEntries(BUTTON_ACTIONS);
const AXIS_ACTIONS = [['steer', 'Lenkung'], ['throttle', 'Gas'], ['brake', 'Bremse'], ['clutch', 'Kupplung']];

const DEFAULT_KEYS = {
  steerLeft: ['ArrowLeft', 'KeyA'], steerRight: ['ArrowRight', 'KeyD'], throttle: ['ArrowUp', 'KeyW'], brake: ['ArrowDown', 'KeyS'], clutch: [],
  shiftUp: ['ShiftLeft', 'ShiftRight'], shiftDown: ['ControlLeft', 'ControlRight'], overtake: ['Space'], aero: ['KeyF'],
  pitLimiter: ['KeyP'], bbUp: ['BracketRight'], bbDown: ['BracketLeft'], ersUp: ['Period'], ersDown: ['Comma'], mfd: ['KeyM'],
  camera: ['KeyC'], lookBack: ['KeyV'], lookLeft: ['KeyQ'], lookRight: ['KeyE'], pause: ['Escape'], reset: ['KeyR'],
  inputOverlay: ['KeyI'], hud: ['KeyH'], pitRequest: ['KeyB'],
};
/** Standard-Gamepad (W3C-„standard“-Mapping) */
const DEFAULT_PAD = {
  steer: { kind: 'axis', index: 0 }, throttle: { kind: 'button', index: 7 }, brake: { kind: 'button', index: 6 },
  shiftUp: { kind: 'button', index: 5 }, shiftDown: { kind: 'button', index: 4 }, overtake: { kind: 'button', index: 2 },
  aero: { kind: 'button', index: 0 }, lookBack: { kind: 'button', index: 1 }, camera: { kind: 'button', index: 3 },
  mfd: { kind: 'button', index: 8 }, pause: { kind: 'button', index: 9 }, pitLimiter: { kind: 'button', index: 10 },
  reset: { kind: 'button', index: 11 }, bbUp: { kind: 'button', index: 12 }, bbDown: { kind: 'button', index: 13 },
  ersDown: { kind: 'button', index: 14 }, ersUp: { kind: 'button', index: 15 },
};
const HAT_NAMES = ['oben', 'oben rechts', 'rechts', 'unten rechts', 'unten', 'unten links', 'links', 'oben links'];
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'Backquote']);

// ---------------------------------------------------------------------------
//  Profil-Datenbank bekannter Geräte (Vendor/Product hex) + Namensmuster
//  type: wheel | pedals | gamepad | shifter | buttonbox · drive: dd | belt | gear
// ---------------------------------------------------------------------------
const DEVICE_DB = [
  { v: '046d', p: ['c24f'], name: 'Logitech G29', type: 'wheel', drive: 'gear', rot: 900 },
  { v: '046d', p: ['c262'], name: 'Logitech G920', type: 'wheel', drive: 'gear', rot: 900 },
  { v: '046d', p: ['c266', 'c26e'], name: 'Logitech G923', type: 'wheel', drive: 'gear', rot: 900 },
  { v: '046d', p: ['c29b'], name: 'Logitech G27', type: 'wheel', drive: 'gear', rot: 900 },
  { v: '046d', p: ['c299'], name: 'Logitech G25', type: 'wheel', drive: 'gear', rot: 900 },
  { v: '046d', p: ['c29a'], name: 'Logitech Driving Force GT', type: 'wheel', drive: 'gear', rot: 900 },
  { v: '046d', p: ['c298'], name: 'Logitech Driving Force Pro', type: 'wheel', drive: 'gear', rot: 900 },
  { v: '044f', p: ['b66d', 'b66e', 'b66f'], name: 'Thrustmaster T300 RS', type: 'wheel', drive: 'belt', rot: 1080 },
  { v: '044f', p: ['b65e'], name: 'Thrustmaster T500 RS', type: 'wheel', drive: 'belt', rot: 1080 },
  { v: '044f', p: ['b669'], name: 'Thrustmaster TX', type: 'wheel', drive: 'belt', rot: 900 },
  { v: '044f', p: ['b677'], name: 'Thrustmaster T150', type: 'wheel', drive: 'belt', rot: 1080 },
  { v: '044f', p: ['b67f'], name: 'Thrustmaster TMX', type: 'wheel', drive: 'belt', rot: 900 },
  { v: '044f', p: ['b689'], name: 'Thrustmaster TS-PC Racer', type: 'wheel', drive: 'belt', rot: 1080 },
  { v: '044f', p: ['b692'], name: 'Thrustmaster TS-XW', type: 'wheel', drive: 'belt', rot: 1080 },
  { v: '0eb7', p: ['0001', '0004'], name: 'Fanatec ClubSport Wheel Base', type: 'wheel', drive: 'belt', rot: 900 },
  { v: '0eb7', p: ['0005', '0e03'], name: 'Fanatec CSL Elite', type: 'wheel', drive: 'belt', rot: 1080 },
  { v: '0eb7', p: ['0006', '0007'], name: 'Fanatec Podium DD', type: 'wheel', drive: 'dd', rot: 1080 },
  { v: '0eb7', p: ['0011'], name: 'Fanatec CSR Elite', type: 'wheel', drive: 'belt', rot: 900 },
  { v: '0eb7', p: ['0020'], name: 'Fanatec CSL DD / GT DD Pro', type: 'wheel', drive: 'dd', rot: 1080 },
  { v: '346e', p: ['0000', '0002', '0004', '0005', '0006', '0010', '0012', '0014', '0015', '0016'], name: 'Moza Direct Drive', type: 'wheel', drive: 'dd', rot: 900 },
  { v: '16d0', p: ['0d5a', '0d5f', '0d60', '0d61'], name: 'Simucube', type: 'wheel', drive: 'dd', rot: 900 },
  { v: '2433', p: ['f300', 'f301', 'f303', 'f306'], name: 'Asetek SimSports', type: 'wheel', drive: 'dd', rot: 900 },
  { v: '3416', p: ['0301', '0302'], name: 'Cammus Direct Drive', type: 'wheel', drive: 'dd', rot: 900 },
  { v: '045e', p: ['028e', '028f', '02d1', '02dd', '02e3', '02ea', '0b00', '0b12', '0b13'], name: 'Xbox-Controller', type: 'gamepad' },
  { v: '054c', p: ['05c4', '09cc', '0ce6', '0df2'], name: 'PlayStation-Controller', type: 'gamepad' },
  { v: '057e', p: ['2009'], name: 'Switch Pro Controller', type: 'gamepad' },
  // Namensmuster (für Geräte ohne bekannte IDs bzw. neuere Modelle)
  { re: /RS50|G\s?PRO.*Wheel/i, name: 'Logitech Direct Drive', type: 'wheel', drive: 'dd', rot: 1080 },
  { re: /T818|T598|T-?GT/i, name: 'Thrustmaster Direct Drive / T-GT', type: 'wheel', drive: 'dd', rot: 1080 },
  { re: /T248|T128/i, name: 'Thrustmaster T248/T128', type: 'wheel', drive: 'gear', rot: 900 },
  { re: /fanatec|clubsport.*base|csl.*(dd|elite)|podium/i, name: 'Fanatec Lenkrad', type: 'wheel', drive: 'dd', rot: 1080 },
  { re: /moza.*(r\d|base|wheel)/i, name: 'Moza Direct Drive', type: 'wheel', drive: 'dd', rot: 900 },
  { re: /simucube|simagic|alpha\s?mini|vrs|directforce|cammus|asetek|ffbeast|accuforce/i, name: 'Direct-Drive-Lenkrad', type: 'wheel', drive: 'dd', rot: 900 },
  { re: /pedal|heusinkveld|sprint|crp|sr-?p|t-?lcm|t3pa/i, name: 'Pedalerie', type: 'pedals' },
  { re: /shifter|th8|sq\b|hgp/i, name: 'Schaltknüppel', type: 'shifter' },
  { re: /button\s?box|bbox/i, name: 'Button-Box', type: 'buttonbox' },
  { re: /wheel|lenkrad|racing/i, name: 'Lenkrad', type: 'wheel', drive: 'belt', rot: 900 },
  { re: /xbox|xinput|dualshock|dualsense|wireless controller|8bitdo|gamepad|joy-?con/i, name: 'Gamepad', type: 'gamepad' },
];

/** Vendor-/Product-ID aus dem ID-String (Chrome und Firefox) */
function parseGamepadId(id) {
  let m = /Vendor:\s*([0-9a-f]{1,4})\s*Product:\s*([0-9a-f]{1,4})/i.exec(id);
  if (m) return { vendor: m[1].toLowerCase().padStart(4, '0'), product: m[2].toLowerCase().padStart(4, '0'), name: id.replace(/\s*\([^()]*Vendor[^()]*\)\s*$/i, '').trim() || id };
  m = /^([0-9a-f]{1,4})-([0-9a-f]{1,4})-(.*)$/i.exec(id);
  if (m) return { vendor: m[1].toLowerCase().padStart(4, '0'), product: m[2].toLowerCase().padStart(4, '0'), name: m[3].trim() || id };
  return { vendor: null, product: null, name: id };
}
function matchDevice(parsed, mapping) {
  if (parsed.vendor) for (const e of DEVICE_DB) if (e.v === parsed.vendor && e.p.includes(parsed.product)) return { ...e, known: true };
  for (const e of DEVICE_DB) if (e.re && e.re.test(parsed.name)) return { ...e, known: false };
  if (mapping === 'standard') return { name: 'Gamepad', type: 'gamepad', known: false };
  return { name: 'Unbekanntes Gerät', type: 'unknown', known: false };
}

/** Zustand eines angeschlossenen Geräts (pro Frame aktualisiert) */
class DeviceState {
  constructor(gp, key) {
    this.key = key; this.id = gp.id; this.index = gp.index; this.mapping = gp.mapping || '';
    this.parsed = parseGamepadId(gp.id); this.info = matchDevice(this.parsed, this.mapping);
    this.axes = Float32Array.from(gp.axes); this.initAxes = Float32Array.from(gp.axes);
    this.prevAxes = Float32Array.from(gp.axes);   // Werte des vorigen Frames (Sprungerkennung digitaler Achsen)
    this.moved = new Uint8Array(gp.axes.length);
    this.buttons = new Float32Array(gp.buttons.length); this.btnDown = new Uint8Array(gp.buttons.length);
    this.connected = true; this.gp = gp; this.timestamp = gp.timestamp || 0; this.connectedAt = performance.now();
    this.update(gp);
  }
  update(gp) {
    this.gp = gp; this.connected = true; this.timestamp = gp.timestamp || this.timestamp;
    const ax = gp.axes, n = Math.min(ax.length, this.axes.length);
    for (let i = 0; i < n; i++) {
      const v = ax[i];
      this.prevAxes[i] = this.axes[i];
      this.axes[i] = v;
      if (!this.moved[i] && Math.abs(v - this.initAxes[i]) > 0.015) this.moved[i] = 1;
    }
    const bt = gp.buttons, m = Math.min(bt.length, this.buttons.length);
    for (let i = 0; i < m; i++) { const b = bt[i]; const val = typeof b === 'object' ? b.value : b; this.buttons[i] = val; this.btnDown[i] = (typeof b === 'object' ? b.pressed : val > 0.5) ? 1 : 0; }
  }
  get displayName() { return this.info.known ? this.info.name : this.parsed.name; }
}

// ---------------------------------------------------------------------------
//  Achsenverarbeitung
// ---------------------------------------------------------------------------
const AxisProc = {
  /** Monotone kubische Interpolation (Fritsch–Carlson) durch Stützpunkte [[x,y],…] */
  curve(x, pts) {
    const n = pts.length;
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let k = 0; while (k < n - 2 && x > pts[k + 1][0]) k++;
    const sl = (i) => (pts[i + 1][1] - pts[i][1]) / Math.max(1e-6, pts[i + 1][0] - pts[i][0]);
    const tan = (i) => {
      if (i === 0) return sl(0);
      if (i === n - 1) return sl(n - 2);
      const a = sl(i - 1), b = sl(i);
      if (a * b <= 0) return 0;
      return 2 / (1 / a + 1 / b);
    };
    const x0 = pts[k][0], x1 = pts[k + 1][0], y0 = pts[k][1], y1 = pts[k + 1][1], hh = x1 - x0;
    const t = (x - x0) / hh, m0 = tan(k) * hh, m1 = tan(k + 1) * hh;
    const t2 = t * t, t3 = t2 * t;
    return clamp((2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1, 0, 1);
  },
  deadzone(a, dIn, dOut) {
    const s = a < 0 ? -1 : 1, m = Math.abs(a);
    if (m <= dIn) return 0;
    return s * clamp((m - dIn) / Math.max(0.01, 1 - dIn - dOut), 0, 1);
  },
  /** Lenkachse → normierter Anteil des Geräte-Rotationsbereichs (−1 links … +1 rechts) */
  steer(raw, b) {
    const d = raw - b.center, r = b.right - b.center, l = b.left - b.center;
    let n = 0;
    if (d * r > 0) n = d / r; else if (d * l > 0) n = -d / l;
    n = clamp(n, -1, 1);
    if (b.invert) n = -n;
    n = AxisProc.deadzone(n, b.deadIn || 0, b.deadOut || 0);
    const g = b.gamma || 1;
    if (g !== 1) n = sgn(n) * Math.pow(Math.abs(n), g);
    const sat = b.sat || 1;
    return clamp(n / sat, -1, 1);
  },
  /** Pedalachse → 0…1 */
  pedal(raw, b) {
    let p = (raw - b.rest) / ((b.full - b.rest) || 1);
    p = clamp(p, 0, 1);
    if (b.invert) p = 1 - p;
    const dIn = b.deadIn || 0, dOut = b.deadOut || 0;
    p = p <= dIn ? 0 : clamp((p - dIn) / Math.max(0.01, 1 - dIn - dOut), 0, 1);
    if (b.curve) p = AxisProc.curve(p, b.curve);
    const g = b.gamma || 1;
    if (g !== 1) p = Math.pow(p, g);
    return clamp(p / (b.sat || 1), 0, 1);
  },
};
const DEFAULT_CURVE = () => [[0, 0], [0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [1, 1]];

/**
 * Erkennt Achsen, die wie Knöpfe betätigt werden (Steuerkreuz, digitale Achsen).
 * Regeln: Chromium-Steuerkreuz (Ruhe > 1,05) sofort; sonst nur aus einer Mittel-Ruhelage,
 * sprunghaft ausgelenkt UND wieder in die Mitte losgelassen. Lenkrad (stetig) und Pedale
 * (Ruhe am Anschlag; unberührt meldet Chromium 0 – beim Antippen springen sie zum Anschlag
 * und kehren nie zu 0 zurück) werden so nie als Knopf erkannt.
 */
class AxisButtonDetector {
  constructor(base, excluded) { this.base = base; this.ex = excluded; this.pending = new Map(); }
  check(d, now) {
    const b = this.base.get(d.key); if (!b) return null;
    for (let i = 0; i < d.axes.length; i++) {
      const key = d.key + '/' + i;
      if (this.ex.has(key)) continue;
      const base = b.axes[i], v = d.axes[i];
      if (Math.abs(base) > 1.05) {
        if (Math.abs(v) > 1.0001) continue;
        const k = clamp(Math.round((v + 1) * 3.5), 0, 7);
        return { kind: 'hat', dev: d.key, index: i, value: -1 + k / 3.5, label: `${d.displayName} · Steuerkreuz ${HAT_NAMES[k]}` };
      }
      if (Math.abs(base) > 0.5) continue;
      const p = this.pending.get(key);
      if (!p) {
        if (Math.abs(v - base) > 0.6 && Math.abs(v) <= 1.05 && Math.abs(v - d.prevAxes[i]) > 0.45) this.pending.set(key, { t: now, dir: sgn(v - base) });
      } else if (Math.abs(v - base) < 0.2) {
        this.pending.delete(key);
        return { kind: 'axisbtn', dev: d.key, index: i, dir: p.dir, rest: base, thresh: 0.45, label: `${d.displayName} · Achse ${i + 1}${p.dir > 0 ? '+' : '−'}` };
      } else if (now - p.t > 1500) this.pending.delete(key);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
//  Eingabe-Manager
// ---------------------------------------------------------------------------
const Input = {
  devices: new Map(),            // key → DeviceState
  keys: new Set(),
  state: { steer: 0, throttle: 0, brake: 0, clutch: 0, steerSource: 'keyboard', steerDeg: 0, wheelNorm: 0, rawSteer: 0 },
  held: {}, prevHeld: {}, pressedNow: {}, src: {},   // src: Auslöser je Aktion (Diagnose, z. B. „Taste Esc“)
  repairNotes: [],               // beim Laden entfernte fehlerhafte Belegungen
  settings: null,                // Verweis auf Einstellungen (Steuerung)
  store: null,                   // { activeId, list: [profile] }
  capture: null,                 // { cb, mode } – nächste Eingabe einfangen (Neubelegung)
  calibration: null,             // laufende CalibrationSession
  filters: {},                   // Glättungszustände
  kbSteer: 0, kbThr: 0, kbBrk: 0, keyLatch: new Set(),
  lastActiveKind: 'keyboard', activePadKey: null,
  rumbleNext: 0, gameActive: false, supported: false,
  onDeviceConnected: null,       // Rückruf für UI (Kalibrierungsaufforderung)

  init(settings) {
    this.settings = settings;
    this.store = Save.get('inputProfiles', { activeId: null, list: [] });
    if (!Array.isArray(this.store.list)) this.store = { activeId: null, list: [] };
    // Fehlerhafte Knopfbelegungen reparieren (z. B. Lenk- oder Pedalachse als „Knopf“ → öffnete Menüs beim Lenken)
    let repaired = false;
    for (const p of this.store.list) { const r = this.sanitizeProfile(p); if (r.length) { repaired = true; this.repairNotes.push(`${p.name}: ${r.join(', ')}`); } }
    if (repaired) this.saveProfiles();
    this.supported = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
    window.addEventListener('keydown', (e) => this._keyDown(e), { capture: true });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => this.keys.clear());
    if (this.supported) {
      window.addEventListener('gamepadconnected', () => this.poll());
      window.addEventListener('gamepaddisconnected', () => this.poll());
    }
    for (const a of BUTTON_ACTIONS) { this.held[a[0]] = false; this.prevHeld[a[0]] = false; }
  },
  get profile() { return this.store.list.find(p => p.id === this.store.activeId) || null; },
  saveProfiles() { Save.set('inputProfiles', this.store); },

  _keyDown(e) {
    if (this.capture && e.code === 'Escape') { e.preventDefault(); const c = this.capture; this.capture = null; c.cb(null); return; }
    if (this.capture && (this.capture.mode === 'key' || this.capture.mode === 'any')) {
      e.preventDefault(); e.stopPropagation();
      const c = this.capture; this.capture = null; c.cb({ kind: 'key', code: e.code, label: keyLabel(e) }); return;
    }
    this.keys.add(e.code);
    this.keyLatch.add(e.code);      // auch sehr kurze Tastendrücke zwischen zwei Frames erfassen
    this.lastActiveKind = 'keyboard';
    // Browser-Kürzel abfangen, solange gefahren wird (Strg+W lässt sich im Browser nicht sperren → beforeunload-Schutz)
    if (this.gameActive) {
      const kb = this.settings.keys;
      let isGameKey = GAME_KEYS.has(e.code);
      if (!isGameKey) for (const k in kb) if (kb[k] && kb[k].includes(e.code)) { isGameKey = true; break; }
      if (isGameKey || (e.ctrlKey && ['KeyS', 'KeyD', 'KeyR', 'KeyF', 'KeyP', 'KeyA'].includes(e.code))) e.preventDefault();
    }
  },

  /** Gamepads abfragen (jedes Frame) */
  poll() {
    if (!this.supported) return;
    let pads;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
    const seen = new Set();
    const dupCount = {};
    for (const gp of pads) {
      if (!gp) continue;
      const parsed = parseGamepadId(gp.id);
      const base = parsed.vendor ? `${parsed.vendor}:${parsed.product}` : 'id:' + gp.id.slice(0, 48);
      dupCount[base] = (dupCount[base] || 0) + 1;
      const key = `${BROWSER}|${base}#${dupCount[base]}`;
      seen.add(key);
      let ds = this.devices.get(key);
      if (!ds || ds.index !== gp.index) {
        const isNew = !ds;
        ds = new DeviceState(gp, key);
        this.devices.set(key, ds);
        if (isNew) { Events.emit('input:connected', ds); if (this.onDeviceConnected) this.onDeviceConnected(ds); }
      } else ds.update(gp);
    }
    for (const [k, ds] of this.devices) if (!seen.has(k) && ds.connected) { ds.connected = false; Events.emit('input:disconnected', ds); }
  },

  /** Benötigt dieses Gerät eine Kalibrierung (Lenkrad/Pedale/unbekannt ohne Profil)? */
  needsCalibration(ds) {
    if (ds.info.type === 'gamepad' || (ds.mapping === 'standard' && ds.info.type !== 'wheel' && ds.info.type !== 'pedals')) return false;
    for (const p of this.store.list) if (p.browser === BROWSER && p.devices && p.devices[ds.key]) return false;
    return true;
  },
  /** Profil wählen, das zu den angeschlossenen Geräten passt */
  autoSelectProfile() {
    const cur = this.profile;
    const connectedKeys = [...this.devices.values()].filter(d => d.connected).map(d => d.key);
    const score = (p) => p && p.devices ? Object.keys(p.devices).filter(k => connectedKeys.includes(k)).length : 0;
    if (cur && score(cur) > 0) return cur;
    let best = null, bs = 0;
    for (const p of this.store.list) { const s = score(p); if (s > bs) { bs = s; best = p; } }
    if (best && best !== cur) { this.store.activeId = best.id; this.saveProfiles(); Events.emit('toast', `Lenkradprofil „${best.name}“ aktiviert`); }
    return best;
  },

  _dev(key) { const d = this.devices.get(key); return d && d.connected ? d : null; },
  _bindingValue(b) {
    const d = this._dev(b.dev); if (!d) return null;
    if (b.kind === 'button') return d.btnDown[b.index] ? 1 : 0;
    if (b.kind === 'axisbtn') { const v = d.axes[b.index]; return ((v - b.rest) * b.dir > (b.thresh || 0.5)) ? 1 : 0; }
    if (b.kind === 'hat') { const v = d.axes[b.index]; return Math.abs(v - b.value) < 0.08 ? 1 : 0; }
    return null;
  },
  /** Achsen, die nie als Knopf gelten dürfen: Lenkung, Pedale und mit der Lenkung mitlaufende Achsen */
  _excludedAxes(prof = this.profile) {
    const set = new Set();
    if (!prof || !prof.bindings) return set;
    for (const k of ['steer', 'throttle', 'brake', 'clutch']) { const b = prof.bindings[k]; if (b && b.kind === 'axis') set.add(b.dev + '/' + b.index); }
    for (const k of (prof.ignoreAxes || [])) set.add(k);
    return set;
  },
  /** Entfernt Knopfbelegungen, die auf Lenk-/Pedalachsen liegen oder wie Pedale ruhen. Rückgabe: entfernte Funktionen */
  sanitizeProfile(p) {
    const removed = [];
    if (!p || !p.bindings) return removed;
    const ex = this._excludedAxes(p);
    for (const [act, label] of BUTTON_ACTIONS) {
      const b = p.bindings[act];
      if (!b || (b.kind !== 'axisbtn' && b.kind !== 'hat')) continue;
      const bad = ex.has(b.dev + '/' + b.index) || (b.kind === 'axisbtn' && Math.abs(b.rest || 0) > 0.5);
      if (bad) { delete p.bindings[act]; removed.push(label); }
    }
    return removed;
  },
  _pedal(name, b, dt) {
    const d = this._dev(b.dev); if (!d || b.index >= d.axes.length) return null;
    let raw = d.axes[b.index];
    // Chromium meldet unbewegte Achsen oft als exakt 0 → als Ruhestellung behandeln
    if (!d.moved[b.index] && raw === 0 && Math.abs(b.rest) > 0.3) raw = b.rest;
    let v = AxisProc.pedal(raw, b);
    const tau = (b.filter || 0) * 0.08;
    if (tau > 0) { const f = this.filters[name] ?? v; v = f + (v - f) * (1 - Math.exp(-dt / tau)); }
    this.filters[name] = v;
    return v;
  },

  /** Eingaben verarbeiten → this.state + Knopfereignisse */
  update(dt, speedKmh = 0) {
    this.poll();
    const st = this.state, S = this.settings, prof = this.profile;
    // --- Kalibrierungsassistent bekommt die Rohdaten ---
    if (this.calibration) this.calibration.update(dt);
    // --- Einfangen einer Gerätetaste/-achse (Neubelegung) ---
    if (this.capture && (this.capture.mode === 'button' || this.capture.mode === 'any')) this._captureDevice();

    for (const a of BUTTON_ACTIONS) { this.prevHeld[a[0]] = this.held[a[0]]; this.held[a[0]] = false; this.src[a[0]] = ''; }
    const hold = (name, src) => { if (name in this.held) { this.held[name] = true; if (!this.src[name]) this.src[name] = src; } };

    // --- Tastatur ---
    const kb = S.keys, K = this.keys, KL = this.keyLatch;
    const down = (act) => (kb[act] || []).some(c => K.has(c) || KL.has(c));
    for (const a of BUTTON_ACTIONS) {
      const code = (kb[a[0]] || []).find(c => K.has(c) || KL.has(c));
      if (code) hold(a[0], 'Taste ' + codeLabel(code));
    }
    const kL = down('steerLeft'), kR = down('steerRight');
    const kT = down('throttle'), kB = down('brake'), kC = down('clutch');
    // Gleitende Tastaturlenkung mit geschwindigkeitsabhängigem Maximalausschlag
    const kbMax = lerp(1, S.kbSpeedSteer, smoothstep(30, 260, speedKmh));
    const kbTarget = (kR ? 1 : 0) - (kL ? 1 : 0);
    const rateIn = S.kbSteerRate * lerp(1, 0.55, smoothstep(40, 250, speedKmh)), rateOut = S.kbSteerReturn;
    const tgt = kbTarget * kbMax;
    if (kbTarget !== 0) this.kbSteer += clamp(tgt - this.kbSteer, -rateIn * dt, rateIn * dt);
    else this.kbSteer += clamp(-this.kbSteer, -rateOut * dt, rateOut * dt);
    this.kbThr += clamp((kT ? 1 : 0) - this.kbThr, -dt * 10, dt * 7);
    this.kbBrk += clamp((kB ? 1 : 0) - this.kbBrk, -dt * 12, dt * 9);

    let steer = this.kbSteer, steerSrc = 'keyboard', thr = this.kbThr, brk = this.kbBrk, clu = kC ? 1 : 0;
    let wheelActive = false;
    st.steerDeg = steer * 180; st.wheelNorm = steer;

    // --- Lenkradprofil (beliebige Geräte) ---
    if (prof && prof.bindings) {
      const B = prof.bindings;
      if (B.steer) {
        const d = this._dev(B.steer.dev);
        if (d && B.steer.index < d.axes.length) {
          const raw = d.axes[B.steer.index];
          st.rawSteer = raw;
          let n = AxisProc.steer(raw, B.steer);
          const tau = (B.steer.filter || 0) * 0.05;
          if (tau > 0) { const f = this.filters.steer ?? n; n = f + (n - f) * (1 - Math.exp(-dt / tau)); }
          this.filters.steer = n;
          const devDeg = n * (prof.rotation || 900) / 2;        // reale Lenkradstellung in Grad
          const carSteer = clamp(devDeg / CAR_SPEC.steerLockDeg, -1, 1);  // 1:1 – Anschlag bei ±180°
          st.wheelNorm = n; st.steerDeg = devDeg;
          if (!kL && !kR) { steer = carSteer; steerSrc = 'wheel'; wheelActive = true; }
        }
      }
      for (const [name] of [['throttle'], ['brake'], ['clutch']]) {
        if (!B[name]) continue;
        const v = this._pedal(name, B[name], dt);
        if (v === null) continue;
        if (name === 'throttle') thr = Math.max(thr, v);
        else if (name === 'brake') brk = Math.max(brk, v);
        else clu = Math.max(clu, v);
      }
      for (const a of BUTTON_ACTIONS) {
        const b = B[a[0]];
        if (b && this._bindingValue(b)) { const d = this._dev(b.dev); hold(a[0], b.label || `${d ? d.displayName : 'Gerät'} · ${b.kind === 'button' ? 'Knopf ' + (b.index + 1) : 'Achse ' + (b.index + 1)}`); }
      }
    }

    // --- Standard-Gamepads ---
    const P = S.pad;
    for (const d of this.devices.values()) {
      if (!d.connected || d.mapping !== 'standard') continue;
      if (prof && prof.devices && prof.devices[d.key]) continue;   // wird über das Profil genutzt
      if (d.info.type === 'wheel' || d.info.type === 'pedals') continue;   // Lenkräder nur kalibriert (sonst zufällige Knopfbelegung)
      const bp = (b) => b && (b.kind === 'axis' ? d.axes[b.index] : (d.buttons[b.index] || 0));
      const sx = bp(P.map.steer) || 0;
      const any = Math.abs(sx) > 0.15 || d.btnDown.some(x => x);
      if (any) { this.lastActiveKind = 'pad'; this.activePadKey = d.key; }
      let s = AxisProc.deadzone(sx, P.deadzone, 0.02);
      s = sgn(s) * Math.pow(Math.abs(s), P.linearity);
      const red = lerp(1, P.speedSteer, smoothstep(30, 260, speedKmh));
      s *= red;
      const f = this.filters.pad ?? s; s = f + (s - f) * (1 - Math.exp(-dt / 0.045)); this.filters.pad = s;
      if (Math.abs(s) > 0.002 && !kL && !kR && !wheelActive) { steer = s; steerSrc = 'pad'; }
      const pt = clamp(bp(P.map.throttle) || 0, 0, 1), pb = clamp(bp(P.map.brake) || 0, 0, 1);
      thr = Math.max(thr, Math.pow(pt, P.triggerGamma)); brk = Math.max(brk, Math.pow(pb, P.triggerGamma));
      for (const a of BUTTON_ACTIONS) { const b = P.map[a[0]]; if (b && b.kind === 'button' && d.btnDown[b.index]) hold(a[0], `${d.displayName} · Knopf ${b.index + 1}`); }
    }

    st.steer = clamp(steer, -1, 1); st.throttle = clamp(thr, 0, 1); st.brake = clamp(brk, 0, 1); st.clutch = clamp(clu, 0, 1);
    st.steerSource = steerSrc;
    for (const a of BUTTON_ACTIONS) this.pressedNow[a[0]] = this.held[a[0]] && !this.prevHeld[a[0]];
    KL.clear();
  },
  pressed(action) { return !!this.pressedNow[action]; },
  /** Auslöser der Aktion im aktuellen Frame (Diagnose) */
  sourceOf(action) { return this.src[action] || ''; },
  isHeld(action) { return !!this.held[action]; },
  /** Knopfereignisse verwerfen (z. B. nach Menüwechsel) */
  flush() { for (const k in this.pressedNow) this.pressedNow[k] = false; for (const k in this.held) this.prevHeld[k] = true; },

  /** Nächste Geräteeingabe (Knopf oder Achsensprung) einfangen */
  startCapture(mode, cb) {
    const base = this._snapshot();
    this.capture = { mode, cb, base, t0: performance.now(), det: new AxisButtonDetector(base, this._excludedAxes()) };
  },
  cancelCapture() { this.capture = null; },
  _snapshot() {
    const m = new Map();
    for (const d of this.devices.values()) if (d.connected) m.set(d.key, { axes: Float32Array.from(d.axes), btn: Uint8Array.from(d.btnDown) });
    return m;
  },
  _captureDevice() {
    const c = this.capture; if (!c) return;
    if (performance.now() - c.t0 < 250) return;
    for (const d of this.devices.values()) {
      if (!d.connected) continue;
      const b = c.base.get(d.key); if (!b) { c.base.set(d.key, { axes: Float32Array.from(d.axes), btn: Uint8Array.from(d.btnDown) }); continue; }
      for (let i = 0; i < d.btnDown.length; i++) if (d.btnDown[i] && !b.btn[i]) { this.capture = null; c.cb({ kind: 'button', dev: d.key, index: i, label: `${d.displayName} · Knopf ${i + 1}` }); return; }
      const cand = c.det.check(d, performance.now());
      if (cand) { this.capture = null; c.cb(cand); return; }
    }
  },

  /** Rumble über vibrationActuator (Chromium) bzw. hapticActuators (Firefox) */
  rumble(strong, weak, ms = 90) {
    if (!this.settings || this.settings.rumble <= 0) return;
    const now = performance.now();
    if (now < this.rumbleNext) return;
    this.rumbleNext = now + ms * 0.8;
    const k = this.settings.rumble;
    strong = clamp(strong * k, 0, 1); weak = clamp(weak * k, 0, 1);
    if (strong < 0.02 && weak < 0.02) return;
    for (const d of this.devices.values()) {
      if (!d.connected || !d.gp) continue;
      if (d.info.type !== 'gamepad' && d.mapping !== 'standard') continue;
      try {
        const va = d.gp.vibrationActuator;
        if (va && typeof va.playEffect === 'function') { va.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => { }); }
        else if (d.gp.hapticActuators && d.gp.hapticActuators[0] && d.gp.hapticActuators[0].pulse) d.gp.hapticActuators[0].pulse(Math.max(strong, weak), ms);
      } catch (e) { /* Gerät unterstützt kein Rumble */ }
    }
  },

  // --- Profile ---
  newProfileId() { return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); },
  addProfile(p) { this.store.list.push(p); this.store.activeId = p.id; this.saveProfiles(); },
  deleteProfile(id) { this.store.list = this.store.list.filter(p => p.id !== id); if (this.store.activeId === id) this.store.activeId = this.store.list[0] ? this.store.list[0].id : null; this.saveProfiles(); },
  exportProfile(id) { const p = this.store.list.find(x => x.id === id); return p ? JSON.stringify({ apexFormulaProfile: 1, profile: p }, null, 2) : ''; },
  importProfile(text) {
    const o = JSON.parse(text);
    const p = o && (o.profile || o);
    if (!p || !p.bindings) throw new Error('Kein gültiges Lenkradprofil');
    p.id = this.newProfileId(); p.name = (p.name || 'Importiert') + ' (Import)';
    if (p.browser && p.browser !== BROWSER) Events.emit('toast', 'Hinweis: Profil stammt aus einem anderen Browser – Achsen können abweichen.');
    this.addProfile(p);
    return p;
  },
};

function keyLabel(e) {
  const map = { Space: 'Leertaste', ShiftLeft: 'Umschalt links', ShiftRight: 'Umschalt rechts', ControlLeft: 'Strg links', ControlRight: 'Strg rechts', AltLeft: 'Alt', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Enter: 'Eingabe', Backspace: 'Rücktaste', Tab: 'Tab' };
  if (map[e.code]) return map[e.code];
  if (e.key && e.key.length === 1) return e.key.toUpperCase();
  return e.code.replace(/^Key|^Digit/, '');
}
function codeLabel(code) {
  const map = { Space: 'Leertaste', ShiftLeft: 'Umschalt L', ShiftRight: 'Umschalt R', ControlLeft: 'Strg L', ControlRight: 'Strg R', AltLeft: 'Alt', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', BracketLeft: 'Ü / [', BracketRight: '+ / ]', Period: '.', Comma: ',', Enter: 'Eingabe', Backquote: '^' };
  if (map[code]) return map[code];
  return code.replace(/^Key|^Digit|^Numpad/, '');
}

// ---------------------------------------------------------------------------
//  Kalibrierungslogik (Benutzeroberfläche im UI-Modul)
// ---------------------------------------------------------------------------
const CAL_FUNCTION_STEPS = ['overtake', 'aero', 'pitLimiter', 'bbUp', 'bbDown', 'ersUp', 'ersDown', 'mfd', 'camera', 'lookBack', 'pause'];
function buildCalSteps() {
  const s = [
    { id: 'center', kind: 'center', title: 'Lenkrad zentrieren', text: 'Stelle das Lenkrad genau in die Mitte, nimm die Füße von den Pedalen und klicke dann auf „Weiter“.' },
    { id: 'steer', kind: 'steer', title: 'Lenkachse erkennen', text: 'Drehe das Lenkrad ganz nach LINKS bis zum Anschlag, dann ganz nach RECHTS bis zum Anschlag und zurück zur Mitte.' },
    { id: 'throttle', kind: 'pedal', title: 'Gaspedal', text: 'Tritt das GASPEDAL voll durch und lass es wieder ganz los.' },
    { id: 'brake', kind: 'pedal', title: 'Bremspedal', text: 'Tritt das BREMSPEDAL voll durch und lass es wieder ganz los.' },
    { id: 'clutch', kind: 'pedal', optional: true, title: 'Kupplung (optional)', text: 'Tritt die KUPPLUNG (oder ziehe die Kupplungswippe) voll und lass wieder los – oder überspringe diesen Schritt.' },
    { id: 'shiftUp', kind: 'button', title: 'Schaltwippe rechts', text: 'Drücke die RECHTE Schaltwippe (Hochschalten).' },
    { id: 'shiftDown', kind: 'button', title: 'Schaltwippe links', text: 'Drücke die LINKE Schaltwippe (Runterschalten).' },
  ];
  for (const id of CAL_FUNCTION_STEPS) s.push({ id, kind: 'button', optional: true, title: ACTION_LABEL[id], text: `Drücke den Knopf für „${ACTION_LABEL[id]}“ – oder überspringe die Belegung.` });
  s.push({ id: 'summary', kind: 'summary', title: 'Zusammenfassung', text: 'Prüfe die erkannten Zuordnungen und speichere das Profil.' });
  return s;
}

class CalibrationSession {
  constructor(input) {
    this.input = input;
    this.steps = buildCalSteps();
    this.i = 0;
    this.result = { bindings: {}, devices: {}, rotation: 900, info: {}, ignoreAxes: [] };
    this.center = null;
    this.status = {};
    this.assignedButtons = new Set();
    this.begin();
  }
  get step() { return this.steps[this.i]; }
  snapshot() { return this.input._snapshot(); }
  begin() {
    this.base = this.snapshot();
    this.track = new Map();
    this.t0 = performance.now();
    this.status = { candidate: null, ready: false, done: false, msg: '' };
    this.releaseT = 0;
    this.waitRelease = this.step.kind === 'button';
    this.axisDet = null;
  }
  next() { if (this.i < this.steps.length - 1) { this.i++; this.begin(); } }
  back() {
    if (this.i > 0) {
      this.i--;
      const s = this.step;
      if (s.kind !== 'center') delete this.result.bindings[s.id];
      this.begin();
    }
  }
  skip() { delete this.result.bindings[this.step.id]; this.next(); }
  _usedAxes() {
    const B = this.result.bindings, set = new Set();
    for (const k of ['steer', 'throttle', 'brake', 'clutch']) if (B[k] && B[k].kind === 'axis') set.add(B[k].dev + '/' + B[k].index);
    return set;
  }
  confirmCenter() { this.center = this.snapshot(); this.next(); }

  update() {
    const s = this.step, now = performance.now();
    const devs = [...this.input.devices.values()].filter(d => d.connected);
    if (s.kind === 'steer') {
      for (const d of devs) {
        const c = this.center && this.center.get(d.key);
        for (let i = 0; i < d.axes.length; i++) {
          const v = d.axes[i];
          const k = d.key + '/' + i;
          let t = this.track.get(k);
          if (!t) { t = { dev: d.key, index: i, min: v, max: v, tMin: now, tMax: now, last: v, vals: new Set(), bad: false, center: c ? c.axes[i] : v }; this.track.set(k, t); }
          if (Math.abs(v) > 1.05) t.bad = true;            // Hat-Schalter (z. B. 3,28 in Ruhe) ausschließen
          t.vals.add(Math.round(v * 40));                   // verschiedene Stellungen (kontinuierliche Achse)
          t.last = v;
          if (v < t.min) { t.min = v; t.tMin = now; }
          if (v > t.max) { t.max = v; t.tMax = now; }
        }
      }
      let best = null;
      for (const t of this.track.values()) { if (t.bad || t.vals.size < 6) continue; if (!best || (t.max - t.min) > (best.max - best.min)) best = t; }
      this.status.candidate = best;
      if (best) {
        const range = best.max - best.min;
        const d = this.input.devices.get(best.dev);
        const cur = d ? d.axes[best.index] : 0;
        this.status.ready = range > 0.6;
        this.status.live = cur; this.status.range = range;
        const leftIsMin = best.tMin < best.tMax;
        this.status.left = leftIsMin ? best.min : best.max; this.status.right = leftIsMin ? best.max : best.min;
        // Automatisch weiter, wenn voller Ausschlag beidseitig und zurück in der Mitte
        if (range > 1.2 && Math.abs(cur - best.center) < range * 0.08 && now - Math.max(best.tMin, best.tMax) > 400) this.status.done = true;
      }
    } else if (s.kind === 'pedal') {
      // Ablauf: Startwert (Ruhe) → Extremwert (voll) → Rückkehr zur Ruhe. Chromium meldet unbewegte
      // Achsen bis zur ersten Bewegung als exakt 0 – dieser Wert wird nicht als Ruhelage übernommen.
      const used = this._usedAxes();
      const thrB = this.result.bindings.throttle, steerB = this.result.bindings.steer;
      for (const d of devs) {
        const b = this.base.get(d.key);
        for (let i = 0; i < d.axes.length; i++) {
          if (steerB && steerB.dev === d.key && steerB.index === i) continue;
          const v = d.axes[i];
          if (Math.abs(v) > 1.05) continue;
          const k = d.key + '/' + i;
          let t = this.track.get(k);
          if (!t) {
            const base = b ? b.axes[i] : v;
            const unreliable = base === 0 && !d.moved[i];
            t = { dev: d.key, index: i, start: unreliable ? null : base, full: null, dev0: 0, cur: v, combined: false, blocked: false };
            this.track.set(k, t);
          }
          if (t.start === null) { if (v !== 0) t.start = v; else continue; }
          const dv = Math.abs(v - t.start);
          if (dv > t.dev0) { t.dev0 = dv; t.full = v; }
          t.cur = v;
          // bereits belegte Achse nur als kombinierte Pedalachse (Gegenrichtung zum Gas) zulassen
          t.combined = false; t.blocked = false;
          if (used.has(k)) {
            t.combined = !!(thrB && thrB.dev === d.key && thrB.index === i && s.id !== 'throttle' && t.full !== null &&
              sgn(t.full - thrB.rest) === -sgn(thrB.full - thrB.rest) && t.dev0 > 0.4);
            t.blocked = !t.combined;
          }
        }
      }
      let best = null;
      for (const t of this.track.values()) { if (t.blocked || t.start === null) continue; if (t.dev0 > 0.45 && (!best || t.dev0 > best.dev0)) best = t; }
      this.status.candidate = best;
      if (best) {
        best.base = best.start;
        this.status.ready = true;
        this.status.live = best.cur;
        const back = Math.abs(best.cur - best.start) < 0.12 * best.dev0;
        if (back) { if (!this.releaseT) this.releaseT = now; if (now - this.releaseT > 350) { this.status.done = true; this.status.rest = best.cur; } }
        else this.releaseT = 0;
      }
    } else if (s.kind === 'button') {
      // erst warten, bis alle Knöpfe losgelassen sind
      if (this.waitRelease) {
        let anyDown = false;
        for (const d of devs) for (let i = 0; i < d.btnDown.length; i++) if (d.btnDown[i]) anyDown = true;
        if (!anyDown) { this.waitRelease = false; this.base = this.snapshot(); this.axisDet = null; }
        return;
      }
      if (!this.axisDet) {
        const ex = this._usedAxes();
        for (const k of this.result.ignoreAxes) ex.add(k);
        this.axisDet = new AxisButtonDetector(this.base, ex);
      }
      for (const d of devs) {
        const b = this.base.get(d.key); if (!b) continue;
        for (let i = 0; i < d.btnDown.length; i++) {
          const key = d.key + '/b' + i;
          if (d.btnDown[i] && !b.btn[i] && !this.assignedButtons.has(key)) { this.status.candidate = { kind: 'button', dev: d.key, index: i, key, label: `${d.displayName} · Knopf ${i + 1}` }; this.status.done = true; return; }
        }
        const cand = this.axisDet.check(d, now);
        if (cand) {
          cand.key = d.key + '/a' + cand.index + (cand.kind === 'hat' ? 'h' + cand.value.toFixed(2) : (cand.dir > 0 ? '+' : '-'));
          if (!this.assignedButtons.has(cand.key)) { this.status.candidate = cand; this.status.done = true; return; }
        }
      }
    }
  }

  /** Aktuelles Ergebnis des Schritts übernehmen */
  accept() {
    const s = this.step, c = this.status.candidate, B = this.result.bindings;
    if (!c) return false;
    const addDev = (key) => { const d = this.input.devices.get(key); if (d) this.result.devices[key] = { id: d.id, name: d.displayName, type: d.info.type, vendor: d.parsed.vendor, product: d.parsed.product }; };
    if (s.kind === 'steer') {
      const center = c.center;
      B.steer = { dev: c.dev, kind: 'axis', index: c.index, center, left: this.status.left, right: this.status.right, deadIn: 0, deadOut: 0, gamma: 1, sat: 1, filter: 0, invert: false };
      const d = this.input.devices.get(c.dev);
      if (d && d.info.rot) this.result.rotation = d.info.rot;
      // Achsen, die sich beim Lenken mitbewegt haben, nie als Knopf verwenden
      this.result.ignoreAxes = [...this.track.values()].filter(t => t !== c && !t.bad && (t.max - t.min) > 0.25).map(t => t.dev + '/' + t.index);
      this.result.info.steer = { range: (c.min < -0.9 && c.max > 0.9 ? '−1…1' : fmtNum(c.min, 2) + '…' + fmtNum(c.max, 2)), leftIsMin: this.status.left < this.status.right };
      addDev(c.dev);
    } else if (s.kind === 'pedal') {
      const rest = this.status.rest !== undefined ? this.status.rest : c.base;
      B[s.id] = { dev: c.dev, kind: 'axis', index: c.index, rest, full: c.full, deadIn: 0.02, deadOut: 0.02, curve: DEFAULT_CURVE(), gamma: 1, sat: 1, filter: 0, invert: false, combined: !!c.combined };
      if (c.combined && B.throttle) B.throttle.combined = true;
      this.result.info[s.id] = { inverted: c.full < rest, range: (Math.min(rest, c.full) >= -0.05 ? '0…1' : '−1…1'), combined: !!c.combined };
      addDev(c.dev);
    } else if (s.kind === 'button') {
      B[s.id] = c.kind === 'button' ? { dev: c.dev, kind: 'button', index: c.index }
        : (c.kind === 'hat' ? { dev: c.dev, kind: 'hat', index: c.index, value: c.value } : { dev: c.dev, kind: 'axisbtn', index: c.index, dir: c.dir, rest: c.rest, thresh: c.thresh });
      B[s.id].label = c.label;
      this.assignedButtons.add(c.key);
      addDev(c.dev);
    }
    return true;
  }

  /** Profil erzeugen */
  buildProfile(name, rotation) {
    return {
      id: this.input.newProfileId(), name: name || 'Lenkradprofil', browser: BROWSER, created: new Date().toISOString(),
      rotation: clamp(Math.round(rotation || this.result.rotation || 900), 90, 3600),
      devices: this.result.devices, bindings: this.result.bindings, info: this.result.info, ignoreAxes: this.result.ignoreAxes,
    };
  }
}
