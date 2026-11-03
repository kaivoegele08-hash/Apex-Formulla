// UI-Test: Einstellungen (alle Reiter), Hilfe, Eingabetest mit simuliertem Lenkrad + Profil
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const SP = process.env.APEX_TMP || require('path').join(__dirname); // Bilder unter shots/, three über APEX_THREE_DIR
require('fs').mkdirSync(SP + '/shots', { recursive: true });
const FILE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '../../dist/apex-formula.html');
const shots = SP + '/shots';
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', async (route) => {
    const rel = route.request().url().replace('https://cdn.jsdelivr.net/npm/three@0.160.0/', '');
    const fp = path.join((process.env.APEX_THREE_DIR || path.join(__dirname, '../../node_modules/three')), rel);
    if (fs.existsSync(fp)) await route.fulfill({ path: fp, contentType: 'application/javascript' }); else await route.fulfill({ status: 404, body: 'nf' });
  });
  await ctx.addInitScript(() => {
    const pad = { id: '046d-c24f-Logitech G29 Driving Force Racing Wheel', index: 0, connected: true, mapping: '', timestamp: 0,
      axes: [0.1, 1, 1, 1, 0, 0], buttons: Array.from({ length: 25 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__pad = pad;
    // vorbereitetes Profil (wie aus dem Assistenten) im Firefox-ID-Format, damit die Seite es direkt nutzt
    const key = (/firefox/i.test(navigator.userAgent) ? 'firefox' : 'chromium') + '|046d:c24f#1';
    const prof = { id: 'ptest', name: 'G29 Testprofil', browser: /firefox/i.test(navigator.userAgent) ? 'firefox' : 'chromium', rotation: 900,
      devices: { [key]: { id: pad.id, name: 'Logitech G29', type: 'wheel', vendor: '046d', product: 'c24f' } },
      bindings: { steer: { dev: key, kind: 'axis', index: 0, center: 0, left: -1, right: 1, deadIn: 0, deadOut: 0, gamma: 1, sat: 1, filter: 0 },
        throttle: { dev: key, kind: 'axis', index: 2, rest: 1, full: -1, deadIn: 0.02, deadOut: 0.02, curve: [[0, 0], [0.25, 0.12], [0.5, 0.33], [0.75, 0.6], [1, 1]], filter: 0 },
        brake: { dev: key, kind: 'axis', index: 3, rest: 1, full: -1, deadIn: 0.02, deadOut: 0.02, curve: [[0, 0], [0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [1, 1]], filter: 0 },
        shiftUp: { dev: key, kind: 'button', index: 4, label: 'Logitech G29 · Knopf 5' }, shiftDown: { dev: key, kind: 'button', index: 5, label: 'Logitech G29 · Knopf 6' } },
      info: { throttle: { inverted: true, range: '−1…1' }, brake: { inverted: true, range: '−1…1' } } };
    try { localStorage.setItem('apexformula.v1.inputProfiles', JSON.stringify({ activeId: 'ptest', list: [prof] })); } catch (e) { }
    navigator.getGamepads = () => [Object.assign({}, pad, { axes: pad.axes.slice(), buttons: pad.buttons.map(b => Object.assign({}, b)) })];
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => window.__apexReady === true, null, { timeout: 60000 });
  const frames = (n = 1) => page.evaluate((n) => new Promise(r => { let k = 0; const f = () => { if (++k >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
  const clickText = async (txt, sel = 'button') => { await page.locator(sel, { hasText: txt }).first().click(); await frames(2); };
  await frames(3);
  await page.evaluate(() => { window.__pad.axes[2] = 0.2; window.__pad.axes[0] = 0.15; });
  await clickText('Einstellungen');
  await frames(3);
  await page.screenshot({ path: shots + '/20_set_wheel.png' });
  for (const [t, f] of [['Tastatur', '21_set_keys'], ['Gamepad', '22_set_pad'], ['Kamera & Sicht', '23_set_cam'], ['Grafik', '24_set_gfx'], ['Audio', '25_set_audio'], ['Fahrhilfen', '26_set_aids'], ['Daten', '27_set_data']]) {
    await page.locator('.tabs button', { hasText: t }).first().click(); await frames(2);
    await page.screenshot({ path: shots + '/' + f + '.png' });
  }
  await clickText(/^\s*Zurück\s*$/);
  await clickText(/Hilfe & Steuerung/);
  await page.screenshot({ path: shots + '/28_help.png' });
  await clickText(/^\s*Zurück\s*$/);
  await clickText('Eingabetest');
  await frames(3);
  await page.screenshot({ path: shots + '/29_inputtest.png' });
  console.log('Zustand:', await page.evaluate(() => JSON.stringify(window.ApexDebug.input.state)));
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await browser.close();
})().catch(e => { console.error('TEST-FEHLER', e); process.exit(1); });
