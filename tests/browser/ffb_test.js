// Browsertest: Force Feedback (WebHID-Attrappe einer G920 mit HID++-Antworten) und Menü-Fehler beim Lenken
//   node tests/browser/ffb_test.js [dist/apex-formula.html]
const { launch } = require('./harness');

function fakeDevices() {
  // ---- Gamepad: G920 (Chromium/Linux: Achse 0 Lenkung, 1 Gas, 2 Bremse, 3 Kupplung, 9 Steuerkreuz) ----
  const HAT_REST = 3.28571;
  const pad = { id: 'Logitech G920 Driving Force Racing Wheel (Vendor: 046d Product: c262)', index: 0, connected: true, mapping: '', timestamp: 0,
    axes: [0, 1, 1, 1, 0, 0, 0, 0, 0, HAT_REST], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__pad = pad;
  window.__setAxis = (i, v) => { pad.axes[i] = v; pad.timestamp++; };
  window.__setBtn = (i, on) => { pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; pad.timestamp++; };
  navigator.getGamepads = () => [Object.assign({}, pad, { axes: pad.axes.slice(), buttons: pad.buttons.map(b => Object.assign({}, b)) }), null, null, null];
  const br = /firefox/i.test(navigator.userAgent) ? 'firefox' : 'chromium', key = br + '|046d:c262#1';
  const prof = { id: 'pg920', name: 'G920 Test', browser: br, rotation: 900,
    devices: { [key]: { id: pad.id, name: 'Logitech G920', type: 'wheel', vendor: '046d', product: 'c262' } },
    bindings: {
      steer: { dev: key, kind: 'axis', index: 0, center: 0, left: -1, right: 1, deadIn: 0, deadOut: 0, gamma: 1, sat: 1, filter: 0 },
      throttle: { dev: key, kind: 'axis', index: 1, rest: 1, full: -1, deadIn: 0.02, deadOut: 0.02, curve: [[0, 0], [0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [1, 1]], filter: 0 },
      brake: { dev: key, kind: 'axis', index: 2, rest: 1, full: -1, deadIn: 0.02, deadOut: 0.02, curve: [[0, 0], [0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [1, 1]], filter: 0 },
      // Fehlerhafte Altbelegungen (Ursache des „Menü öffnet sich beim Lenken“): Lenk- bzw. Pedalachse als Knopf
      pause: { dev: key, kind: 'axisbtn', index: 0, dir: 1, rest: 0, thresh: 0.5, label: 'Achse 1+' },
      mfd: { dev: key, kind: 'axisbtn', index: 3, dir: -1, rest: 1, thresh: 0.5, label: 'Achse 4−' },
      camera: { dev: key, kind: 'hat', index: 9, value: -1, label: 'Steuerkreuz oben' },
      shiftUp: { dev: key, kind: 'button', index: 4, label: 'Wippe rechts' },
    } };
  try { if (!localStorage.getItem('apexformula.v1.inputProfiles')) localStorage.setItem('apexformula.v1.inputProfiles', JSON.stringify({ activeId: 'pg920', list: [prof] })); } catch (e) { }

  // ---- WebHID: G920 spricht HID++ 2.0, Feature 0x8123 auf Index 0x0B ----
  const log = window.__hidLog = [];
  const listeners = { inputreport: [] }, hidListeners = { disconnect: [] };
  let slots = 0;
  const FEAT = 0x0b;
  const dev = {
    vendorId: 0x046d, productId: 0xc262, productName: 'G920 Driving Force Racing Wheel', opened: false,
    collections: [{ usagePage: 0xff43, usage: 0x0602, outputReports: [
      { reportId: 0x10, items: [{ reportSize: 8, reportCount: 6 }] },
      { reportId: 0x11, items: [{ reportSize: 8, reportCount: 19 }] },
      { reportId: 0x12, items: [{ reportSize: 8, reportCount: 63 }] }], children: [] }],
    async open() { this.opened = true; }, async close() { this.opened = false; },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter(x => x !== f); },
    async sendReport(id, data) {
      const d = Array.from(data), feat = d[1], fn = d[2] & 0xf0, p = d.slice(3);
      let reply = [];
      if (feat === 0 && fn === 0) reply = [p[0] === 0x81 && p[1] === 0x23 ? FEAT : 0];
      else if (feat === FEAT) {
        if (fn === 0x00) reply = [5];
        else if (fn === 0x10) { slots = 0; log.push({ t: performance.now(), op: 'reset' }); }
        else if (fn === 0x20) {
          const slot = p[0] || ++slots; reply = [slot];
          if (p[1] === 0x00) { const f = (p[6] << 8 | p[7]) << 16 >> 16; log.push({ t: performance.now(), op: 'const', slot, f }); }
          else log.push({ t: performance.now(), op: 'effect', type: p[1], slot, id });
        }
        else if (fn === 0x50) reply = [900 >> 8, 900 & 255];
        else if (fn === 0x60) log.push({ t: performance.now(), op: 'range', v: p[0] << 8 | p[1] });
      }
      if (window.__hidDead) return;
      setTimeout(() => {
        const out = new Uint8Array(19); out.set([0xff, feat, d[2], ...reply].slice(0, 19));
        for (const f of listeners.inputreport) f({ reportId: 0x11, device: dev, data: new DataView(out.buffer) });
      }, 2);
    },
  };
  window.__hidDev = dev;
  window.__hidUnplug = () => { window.__hidDead = true; for (const f of hidListeners.disconnect) f({ device: dev }); };
  let granted = false;
  const hid = {
    async requestDevice() { granted = true; return [dev]; },
    async getDevices() { return granted ? [dev] : []; },
    addEventListener(t, f) { (hidListeners[t] = hidListeners[t] || []).push(f); }, removeEventListener() { },
  };
  Object.defineProperty(navigator, 'hid', { value: hid, configurable: true });
}

(async () => {
  const T = await launch({ initScripts: [fakeDevices] });
  const { page, frames, sleep, clickText, shot, logs } = T;
  const ok = [], bad = [];
  const check = (name, cond, info = '') => { (cond ? ok : bad).push(name + (info ? ' – ' + info : '')); console.log((cond ? 'OK   ' : 'FEHL ') + name + (info ? ' – ' + info : '')); };
  const ev = (fn, a) => page.evaluate(fn, a);
  await T.open(); await frames(3);
  await ev(() => { window.__setAxis(0, 0.01); window.__setAxis(1, 0.99); }); await frames(3);

  // 1) Bereinigung fehlerhafter Belegungen
  const rep = await ev(() => ({ notes: ApexDebug.input.repairNotes, b: Object.keys(ApexDebug.input.profile.bindings), hat: ApexDebug.input.profile.bindings.camera }));
  check('Achse-als-Knopf auf Lenkachse entfernt', !rep.b.includes('pause'), rep.notes.join(' | '));
  check('Achse-als-Knopf auf ungenutzter Pedalachse (Ruhe ±1) entfernt', !rep.b.includes('mfd'));
  check('Steuerkreuz-Belegung bleibt erhalten', !!rep.hat && rep.hat.kind === 'hat');

  // 2) FFB verbinden über die Einstellungen
  await clickText('Einstellungen'); await sleep(200);
  await clickText('Lenkrad verbinden'); await sleep(400); await frames(2);
  const st = await ev(() => ({ s: ApexDebug.FFB.state, m: ApexDebug.FFB.message, slots: [ApexDebug.FFB.wheel && ApexDebug.FFB.wheel.constSlot, ApexDebug.FFB.wheel && ApexDebug.FFB.wheel.damperSlot, ApexDebug.FFB.wheel && ApexDebug.FFB.wheel.rumbleSlot], rot: ApexDebug.input.profile.rotation }));
  check('FFB verbunden', st.s === 'on', st.m);
  check('Effektplätze konstant/Dämpfer/Vibration', st.slots.every(x => x > 0), st.slots.join('/'));
  check('Rotationsbereich ins Profil übernommen', st.rot === 900, String(st.rot));
  await shot('50_ffb_card');
  const nT = await ev(() => window.__hidLog.length);
  await clickText('Testkraft'); await sleep(2200); await frames(5);
  const seq = await ev((n) => window.__hidLog.slice(n).filter(e => e.op === 'const').map(e => e.f), nT);
  const iNeg = seq.findIndex(f => f < -8000), iPos = seq.findIndex(f => f > 8000);
  check('Testkraft erst rechts, dann links (HID++-Vorzeichen umgekehrt)', iNeg >= 0 && iPos > iNeg, seq.join(' '));
  check('Nach dem Test keine Kraft im Menü', seq[seq.length - 1] === 0, String(seq[seq.length - 1]));
  await clickText('Bereich 360°'); await sleep(200);
  const rng = await ev(() => ({ log: window.__hidLog.filter(e => e.op === 'range').slice(-1)[0], rot: ApexDebug.input.profile.rotation }));
  check('360° gesetzt und Profil angepasst', rng.log && rng.log.v === 360 && rng.rot === 360, JSON.stringify(rng));
  await clickText('Zurück'); await sleep(200);

  // 3) Fahren mit Lenkrad: hektisches Lenken darf nie pausieren, FFB muss arbeiten
  await clickText('Testfahrt'); await frames(2);
  await clickText('Losfahren');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  const n0 = await ev(() => window.__hidLog.length);
  await ev(() => window.__setAxis(1, -1));   // Vollgas
  let pausedDuringSteer = false, maxOut = 0;
  for (let k = 0; k < 120; k++) {
    await ev((v) => window.__setAxis(0, v), Math.sin(k / 4) * (k % 30 < 15 ? 1 : 0.4));
    await frames(1);
    const s = await ev(() => [ApexDebug.game.state, ApexDebug.FFB.out]);
    if (s[0] !== 'driving') { pausedDuringSteer = true; break; }
    maxOut = Math.max(maxOut, Math.abs(s[1]));
  }
  await ev(() => window.__setAxis(0, 0));
  const drv = await ev(() => ({ src: ApexDebug.input.state.steerSource, v: ApexDebug.vehicle.speedKmh, reason: ApexDebug.game.pauseReason }));
  const sent = await ev((n0) => window.__hidLog.slice(n0).filter(e => e.op === 'const').length, n0);
  check('Lenken bis Anschlag öffnet kein Menü', !pausedDuringSteer, drv.reason || '');
  check('Lenkrad ist Lenkquelle', drv.src === 'wheel', drv.src);
  check('FFB-Kraft wird während der Fahrt gesendet', sent > 20 && maxOut > 0.05, `${sent} Meldungen, max |F| ${maxOut.toFixed(2)}, ${drv.v.toFixed(0)} km/h`);
  await shot('51_ffb_driving');

  // 4) Steuerkreuz wechselt die Kamera (hat-Belegung), Ruheposition löst nichts aus
  const cam0 = await ev(() => ApexDebug.game.camMode);
  await ev(() => window.__setAxis(9, -1)); await frames(3); await ev(() => window.__setAxis(9, 3.28571)); await frames(3);
  const cam1 = await ev(() => ApexDebug.game.camMode);
  check('Steuerkreuz oben = Kamera wechseln', cam0 !== cam1, `${cam0} → ${cam1}`);

  // 5) Esc pausiert, Pausemenü nennt den Auslöser + Steam-Hinweis, Kräfte aus
  await ev(() => window.__setAxis(1, 1));
  await page.keyboard.press('Escape'); await frames(4); await sleep(300); await frames(2);
  const ps = await ev(() => ({ s: ApexDebug.game.state, txt: document.body.innerText, last: window.__hidLog.filter(e => e.op === 'const').slice(-1)[0].f }));
  check('Esc pausiert', ps.s === 'paused');
  check('Pausemenü zeigt Auslöser', /Pausiert durch:.*Esc/.test(ps.txt));
  check('Steam-Input-Hinweis bei Tastenpause mit Lenkrad', /Steam/.test(ps.txt));
  check('In der Pause keine Kraft', ps.last === 0, String(ps.last));
  await shot('52_pause_reason');

  // 6) Lenkrad abziehen → sauberer Fehlerzustand
  await ev(() => window.__hidUnplug()); await frames(3);
  const un = await ev(() => ({ s: ApexDebug.FFB.state, m: ApexDebug.FFB.message, w: !!ApexDebug.FFB.wheel }));
  check('Abziehen erkannt', un.s === 'error' && !un.w, un.m);

  console.log(`\n${ok.length} OK, ${bad.length} fehlgeschlagen`);
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await T.browser.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
