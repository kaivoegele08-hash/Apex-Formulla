// ============================================================================
//  FFB – Echtes Force Feedback über WebHID (Chrome / Chromium / Edge / Brave)
//  Logitech G920 und G923 (Xbox/PC-Version) sprechen HID++ 2.0; Force Feedback
//  ist das Feature 0x8123. Befehle und Parameterlayout entsprechen dem
//  Linux-Kerneltreiber „hid-logitech-hidpp“ (der Treiber dient als Dokumentation,
//  hier ist alles eigenständig in JavaScript umgesetzt).
//  Andere Geräte und Firefox (kein WebHID): sauberer Abbruch mit Hinweis.
// ============================================================================

const FFB_DEVICES = [
  { vendorId: 0x046d, productId: 0xc262, name: 'Logitech G920' },
  { vendorId: 0x046d, productId: 0xc26e, name: 'Logitech G923 (Xbox/PC)' },
];
const HIDPP = { SHORT: 0x10, LONG: 0x11, VLONG: 0x12, DEV: 0xff, SWID: 0x0b, ERR20: 0xff, ERR10: 0x8f };
// Funktionen von Feature 0x8123 (oberes Nibble; das untere Nibble trägt unsere Software-ID)
const FF_FN = { GET_INFO: 0x00, RESET_ALL: 0x10, DOWNLOAD: 0x20, SET_STATE: 0x30, DESTROY: 0x40, GET_APERTURE: 0x50, SET_APERTURE: 0x60, GET_GAINS: 0x70, SET_GAINS: 0x80 };
const FF_EFFECT = { CONSTANT: 0x00, SINE: 0x01, DAMPER: 0x07 };
const FF_STATE = { STOP: 0x01, PLAY: 0x02 };
const HIDPP_ERRORS = { 1: 'unbekannt', 2: 'ungültiges Argument', 3: 'außerhalb des Bereichs', 4: 'Hardwarefehler', 5: 'nicht erlaubt', 6: 'ungültiger Feature-Index', 7: 'ungültige Funktion', 8: 'beschäftigt', 9: 'nicht unterstützt' };

const be16 = (v) => { const x = v & 0xffff; return [x >> 8, x & 0xff]; };

/** Ein über WebHID geöffnetes HID++-Lenkrad */
class HidppWheel {
  constructor(device, info) {
    this.dev = device; this.info = info;
    this.waiters = new Map();          // "feature:funktion" → { resolve, reject, timer }
    this.queue = Promise.resolve();    // Befehle strikt nacheinander (wie im Kerneltreiber)
    this.feat = 0; this.slots = 0; this.range = 900;
    this.constSlot = 0; this.damperSlot = 0; this.rumbleSlot = 0;
    this.longLen = 0; this.vlongLen = 0;
    this.want = 0; this.sent = null; this.sentT = 0; this.busy = false;
    this.rumbleWant = { mag: 0, period: 40 }; this.rumbleSent = { mag: -1, period: 0 }; this.rumbleT = 0; this.rumbleBusy = false;
    this.errors = 0; this.closed = false; this.onFail = null;
    this._onReport = (e) => this._report(e);
  }

  /** Größe einer Ausgabemeldung aus dem Report-Deskriptor (Bytes ohne Report-ID) */
  static reportLength(device, reportId) {
    let len = 0;
    const walk = (cols) => {
      for (const c of cols || []) {
        for (const r of c.outputReports || []) if (r.reportId === reportId) len = Math.max(len, (r.items || []).reduce((s, it) => s + it.reportSize * it.reportCount, 0) / 8);
        walk(c.children);
      }
    };
    walk(device.collections);
    return Math.floor(len);
  }

  async open() {
    this.longLen = HidppWheel.reportLength(this.dev, HIDPP.LONG);
    this.vlongLen = HidppWheel.reportLength(this.dev, HIDPP.VLONG);
    if (this.longLen < 19) throw new Error('Diese Geräteschnittstelle unterstützt kein HID++ (keine Meldung 0x11).');
    if (!this.dev.opened) await this.dev.open();
    this.dev.addEventListener('inputreport', this._onReport);
  }

  _report(e) {
    const id = e.reportId;
    if (id !== HIDPP.LONG && id !== HIDPP.VLONG && id !== HIDPP.SHORT) return;
    const d = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);   // [Gerät, Feature, Funktion|SW-ID, Parameter …]
    if (d.length < 4) return;
    if (d[1] === HIDPP.ERR20 || d[1] === HIDPP.ERR10) {                               // Fehler: [Gerät, 0xFF, Feature, Funktion|SW-ID, Code]
      const w = this.waiters.get(d[2] + ':' + d[3]);
      if (w) { this.waiters.delete(d[2] + ':' + d[3]); clearTimeout(w.timer); w.reject(new Error('HID++-Fehler: ' + (HIDPP_ERRORS[d[4]] || d[4]))); }
      return;
    }
    if ((d[2] & 0x0f) !== HIDPP.SWID) return;                                         // Antworten an den Kerneltreiber ignorieren
    const key = d[1] + ':' + d[2], w = this.waiters.get(key);
    if (w) { this.waiters.delete(key); clearTimeout(w.timer); w.resolve(d.slice(3)); }
  }

  _send(feat, fn, params) {
    const vl = params.length > 16;
    const len = vl ? this.vlongLen : this.longLen;
    if (!len) return Promise.reject(new Error('Sehr lange HID++-Meldung nicht verfügbar'));
    const buf = new Uint8Array(len);
    buf[0] = HIDPP.DEV; buf[1] = feat; buf[2] = (fn & 0xf0) | HIDPP.SWID;
    buf.set(params.slice(0, len - 3), 3);
    return this.dev.sendReport(vl ? HIDPP.VLONG : HIDPP.LONG, buf);
  }
  /** Befehl senden und auf die Antwort warten (serialisiert) */
  request(feat, fn, params = [], timeout = 400) {
    const run = () => new Promise((resolve, reject) => {
      if (this.closed) { reject(new Error('Gerät geschlossen')); return; }
      const key = feat + ':' + ((fn & 0xf0) | HIDPP.SWID);
      const timer = setTimeout(() => { this.waiters.delete(key); reject(new Error('Zeitüberschreitung')); }, timeout);
      this.waiters.set(key, { resolve, reject, timer });
      this._send(feat, fn, params).catch(err => { clearTimeout(timer); this.waiters.delete(key); reject(err); });
    });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => { });
    return p;
  }

  async init(damper) {
    // Feature-Index von 0x8123 über das Root-Feature (Index 0, Funktion 0 = getFeature)
    const r = await this.request(0x00, 0x00, [0x81, 0x23]);
    this.feat = r[0];
    if (!this.feat) throw new Error('Das Gerät meldet kein HID++-Force-Feedback (Feature 0x8123).');
    const info = await this.request(this.feat, FF_FN.GET_INFO);
    this.slots = Math.max(1, info[0] - 1);                                            // ein Platz ist reserviert
    await this.request(this.feat, FF_FN.RESET_ALL);
    try { const ap = await this.request(this.feat, FF_FN.GET_APERTURE); this.range = ((ap[0] << 8) | ap[1]) || 900; } catch (e) { this.range = 900; }
    try { await this.request(this.feat, FF_FN.SET_GAINS, [0xff, 0xff, 0x00, 0x00]); } catch (e) { /* Standardverstärkung behalten */ }
    // Konstante Kraft: unendliche Dauer (Länge 0), Wert wird laufend aktualisiert
    const c = await this.request(this.feat, FF_FN.DOWNLOAD, this._constParams(0, 0));
    this.constSlot = c[0];
    if (!this.constSlot) throw new Error('Kein freier Effektplatz im Lenkrad.');
    await this.request(this.feat, FF_FN.SET_STATE, [this.constSlot, FF_STATE.PLAY]);
    // Dämpfer und Vibrationseffekt benötigen die sehr lange Meldung – optional
    if (this.vlongLen >= 21) {
      try {
        const d = await this.request(this.feat, FF_FN.DOWNLOAD, this._damperParams(0, damper));
        this.damperSlot = d[0];
        if (this.damperSlot) await this.request(this.feat, FF_FN.SET_STATE, [this.damperSlot, FF_STATE.PLAY]);
      } catch (e) { this.damperSlot = 0; }
      try {
        const s = await this.request(this.feat, FF_FN.DOWNLOAD, this._sineParams(0, 0, 40));
        this.rumbleSlot = s[0];
        if (this.rumbleSlot) await this.request(this.feat, FF_FN.SET_STATE, [this.rumbleSlot, FF_STATE.PLAY]);
      } catch (e) { this.rumbleSlot = 0; }
    }
  }

  // Parameterlayout wie im Kerneltreiber (hidpp_ff_upload_effect)
  _constParams(slot, force) {
    return [slot, FF_EFFECT.CONSTANT, 0, 0, 0, 0, ...be16(clamp(Math.round(force), -32767, 32767)), 0, 0, 0, 0, 0, 0];
  }
  _damperParams(slot, k) {
    const coeff = Math.round(clamp(k, 0, 1) * 0x7fff), sat = 0xffff >> 1;              // Sättigung 15 Bit
    return [slot, FF_EFFECT.DAMPER, 0, 0, 0, 0, ...be16(sat), ...be16(coeff), 0, 0, 0, 0, ...be16(coeff), ...be16(sat)];
  }
  _sineParams(slot, mag, periodMs) {
    return [slot, FF_EFFECT.SINE, 0, 0, 0, 0, ...be16(clamp(Math.round(mag), 0, 32767)), 0, 0, ...be16(clamp(Math.round(periodMs), 4, 1000)), 0, 0, 0, 0, 0, 0, 0, 0];
  }

  /** Kraft −1…1 (Vorzeichen bereits in Gerätekonvention); Aktualisierung so schnell, wie das Lenkrad antwortet */
  setForce(v) { this.want = v; if (!this.busy) this._pump(); }
  async _pump() {
    if (this.closed || !this.constSlot) return;
    const f = Math.round(clamp(this.want, -1, 1) * 32767);
    if (this.sent !== null && Math.abs(f - this.sent) < 120 && performance.now() - this.sentT < 250) return;
    this.busy = true;
    try {
      await this.request(this.feat, FF_FN.DOWNLOAD, this._constParams(this.constSlot, f), 150);
      this.sent = f; this.sentT = performance.now(); this.errors = 0;
    } catch (e) {
      if (++this.errors > 25 && this.onFail) this.onFail('Das Lenkrad antwortet nicht mehr: ' + e.message);
    } finally { this.busy = false; }
    if (!this.closed && Math.abs(Math.round(clamp(this.want, -1, 1) * 32767) - (this.sent ?? 0)) >= 120) this._pump();
  }
  /** Vibration (Kerbs, Flatspot, Aufsetzen) als Sinus-Effekt im Gerät – frameratenunabhängig */
  setRumble(mag, hz) {
    if (!this.rumbleSlot || this.closed) return;
    this.rumbleWant = { mag: clamp(mag, 0, 1) * 32767, period: 1000 / clamp(hz, 2, 120) };
    const now = performance.now();
    if (this.rumbleBusy || now - this.rumbleT < 70) return;
    const w = this.rumbleWant, s = this.rumbleSent;
    if (Math.abs(w.mag - s.mag) < 600 && Math.abs(w.period - s.period) < 2) return;
    this.rumbleBusy = true; this.rumbleT = now;
    this.request(this.feat, FF_FN.DOWNLOAD, this._sineParams(this.rumbleSlot, w.mag, w.period), 150)
      .then(() => { this.rumbleSent = { mag: w.mag, period: w.period }; })
      .catch(() => { }).finally(() => { this.rumbleBusy = false; });
  }
  async setDamper(k) { if (this.damperSlot && !this.closed) try { await this.request(this.feat, FF_FN.DOWNLOAD, this._damperParams(this.damperSlot, k)); } catch (e) { /* ignorieren */ } }
  async setRange(deg) {
    const r = clamp(Math.round(deg), 180, 900);
    await this.request(this.feat, FF_FN.SET_APERTURE, be16(r));
    this.range = r;
    return r;
  }
  /** Alle Kräfte aus und Gerät schließen */
  async shutdown() {
    if (this.closed) return;
    try { if (this.feat) await Promise.race([this.request(this.feat, FF_FN.RESET_ALL, [], 200), new Promise(r => setTimeout(r, 250))]); } catch (e) { /* ignorieren */ }
    this.closed = true;
    for (const w of this.waiters.values()) { clearTimeout(w.timer); w.reject(new Error('Gerät geschlossen')); }
    this.waiters.clear();
    try { this.dev.removeEventListener('inputreport', this._onReport); } catch (e) { /* ignorieren */ }
    try { if (this.dev.opened) await this.dev.close(); } catch (e) { /* ignorieren */ }
  }
}

/** Force-Feedback-Verwaltung: Verbinden, Signal aus der Physik, Not-Aus */
const FFB = {
  supported: typeof navigator !== 'undefined' && !!navigator.hid,
  wheel: null, state: 'off', message: '', name: '', cfg: null, testUntil: 0, out: 0,

  init(cfg) {
    this.cfg = cfg;
    if (!this.supported) { this.message = 'Dein Browser unterstützt kein WebHID (z. B. Firefox). Force Feedback funktioniert in Chrome, Chromium, Edge oder Brave.'; return; }
    try {
      navigator.hid.addEventListener('disconnect', (e) => { if (this.wheel && e.device === this.wheel.dev) this._lost('Lenkrad getrennt'); });
    } catch (e) { /* ignorieren */ }
    // Not-Aus beim Verlassen der Seite und bei Laufzeitfehlern
    window.addEventListener('pagehide', () => this.shutdown());
    window.addEventListener('error', () => this.panic());
  },
  get active() { return this.state === 'on' && !!this.wheel; },
  _match(d) { return FFB_DEVICES.find(x => x.vendorId === d.vendorId && x.productId === d.productId); },

  /** Verbinden – muss aus einem Klick heraus aufgerufen werden (Geräteauswahl des Browsers) */
  async connect() {
    if (!this.supported) throw new Error(this.message);
    const devs = await navigator.hid.requestDevice({ filters: FFB_DEVICES.map(({ vendorId, productId }) => ({ vendorId, productId })) });
    if (!devs.length) throw new Error('Kein Gerät ausgewählt.');
    await this._use(devs);
  },
  /** Bereits freigegebenes Lenkrad automatisch wieder verbinden (ohne Klick) */
  async reconnect() {
    if (!this.supported || !this.cfg.enabled || this.wheel) return;
    try {
      const devs = (await navigator.hid.getDevices()).filter(d => this._match(d));
      if (devs.length) await this._use(devs);
    } catch (e) { this._setState('error', e.message); }
  },
  async _use(devs) {
    const ok = devs.filter(d => this._match(d) && HidppWheel.reportLength(d, HIDPP.LONG) >= 19);
    if (!ok.length) {
      const other = devs[0];
      throw new Error(other && !this._match(other) ? `„${other.productName}“ wird noch nicht unterstützt (bisher: Logitech G920/G923 Xbox).` : 'Die HID++-Schnittstelle des Lenkrads wurde nicht gefunden.');
    }
    await this.shutdown();
    this._setState('connecting', 'Verbinde …');
    const info = this._match(ok[0]);
    const w = new HidppWheel(ok[0], info);
    try {
      await w.open();
      await w.init(this.cfg.damper);
    } catch (e) {
      await w.shutdown();
      const denied = /open|NotAllowed|permission|access/i.test(String(e && (e.name + ' ' + e.message)));
      throw new Error(denied
        ? 'Zugriff auf das Lenkrad verweigert. Unter Linux fehlt die Berechtigung für /dev/hidraw – führe einmalig „apex-formula-ffb-einrichten.sh“ aus dem ZIP aus und stecke das Lenkrad neu ein.'
        : 'Initialisierung fehlgeschlagen: ' + e.message);
    }
    w.onFail = (m) => this._lost(m);
    this.wheel = w; this.name = info.name;
    this.cfg.enabled = true;
    Events.emit('ffb:changed');
    this._setState('on', `${info.name} verbunden · Bereich ${w.range}° · ${w.slots} Effektplätze${w.damperSlot ? ' · Dämpfer' : ''}${w.rumbleSlot ? ' · Vibration' : ''}`);
    this._syncRotation();
  },
  /** Rotationsbereich des Lenkrads ins Lenkradprofil übernehmen (sonst stimmt die 1:1-Lenkung nicht) */
  _syncRotation() {
    const p = Input.profile;
    if (!p || !this.wheel) return;
    const hex = this.wheel.info.productId.toString(16).padStart(4, '0');
    const uses = Object.keys(p.devices || {}).some(k => k.includes(':' + hex));
    if (uses && p.rotation !== this.wheel.range) {
      p.rotation = this.wheel.range; Input.saveProfiles();
      Events.emit('toast', `Rotationsbereich aus dem Lenkrad übernommen: ${this.wheel.range}° (für exakte 1:1-Lenkung)`);
    }
  },
  async setRange(deg) {
    if (!this.wheel) return;
    const r = await this.wheel.setRange(deg);
    this._syncRotation();
    this._setState('on', `${this.name} verbunden · Bereich ${r}°`);
  },
  async disconnect() { this.cfg.enabled = false; Events.emit('ffb:changed'); await this.shutdown(); this._setState('off', 'Getrennt'); },
  async shutdown() { const w = this.wheel; this.wheel = null; if (w) await w.shutdown(); if (this.state === 'on') this._setState('off', ''); },
  /** Not-Aus: sofort keine Kraft mehr */
  panic() { if (this.wheel) { try { this.wheel.setForce(0); this.wheel.setRumble(0, 40); } catch (e) { /* ignorieren */ } } },
  _lost(msg) { const w = this.wheel; this.wheel = null; if (w) w.shutdown(); this._setState('error', msg); },
  _setState(s, msg) { this.state = s; this.message = msg; Events.emit('ffb:state', s, msg); },

  /** Testkraft: erst nach rechts, dann nach links (zur Kontrolle der Richtung) */
  test() { this.testUntil = performance.now() + 1600; },
  setDamper(k) { if (this.wheel) this.wheel.setDamper(k); },

  /** Pro Frame: Signal aus der Physik berechnen und ans Lenkrad geben */
  update(dt, veh, driving) {
    const w = this.wheel; if (!w) return;
    const c = this.cfg, now = performance.now();
    let f = 0, rumble = 0, hz = 40;
    if (now < this.testUntil) {
      f = (this.testUntil - now > 800 ? 1 : -1) * 0.35;
    } else if (driving && veh) {
      // Rückstellmoment (Nachlauf, Untersteuern macht das Lenkrad leicht) – weich begrenzt
      let base = clamp(veh.ffbRaw, -1.6, 1.6);
      base = Math.tanh(base * 1.1) / Math.tanh(1.1);
      // Straßengefühl aus den Federbewegungen vorne, Kollisionsstöße
      const W = veh.wheels;
      const road = clamp((W[0].xdot - W[1].xdot) * 0.6, -0.25, 0.25) * c.road;
      const dI = veh.time - veh.impactTime;
      const imp = dI < 0.3 ? Math.min(1, veh.impact / 9) * Math.exp(-dI * 12) * (Math.sin(dI * 70) > 0 ? 1 : -1) * 0.8 : 0;
      f = (base + road + imp) * c.strength;
      // Vibration im Gerät: Randsteine, Aufsetzen, Flatspot
      const kerbHz = clamp(veh.speed / (W.some(x => x.surf === SURF.KERB_SAW) ? 0.42 : 1.0), 8, 70);
      const flat = Math.max(W[0].tyre.flat, W[1].tyre.flat), flatHz = Math.abs(W[0].omega) / (2 * Math.PI);
      const cand = [[veh.kerbVib * 0.55, kerbHz], [veh.scrapeIntensity * 0.4, 55], [flat * 0.8 * smoothstep(2, 12, veh.speed), clamp(flatHz, 3, 60)], [veh.surfVib * 0.3, 18]];
      cand.sort((a, b) => b[0] - a[0]);
      rumble = cand[0][0] * c.vibration; hz = cand[0][1];
    }
    // Vorzeichen: Spiel-Konvention „positiv = nach rechts“; HID++ nach Linux-Konvention umgekehrt
    const dev = (c.invert ? 1 : -1) * clamp(f, -1, 1);
    this.out = clamp(f, -1, 1);
    w.setForce(dev);
    w.setRumble(rumble, hz);
  },
  /** Pause/Menü: keine Kräfte */
  idle() { if (this.wheel) { if (performance.now() < this.testUntil) return; this.wheel.setForce(0); this.wheel.setRumble(0, 40); this.out = 0; } },
};
