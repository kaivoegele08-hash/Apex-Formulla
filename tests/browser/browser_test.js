// Browsertest: Hauptmenü, Testfahrt, Kameras, Pause, Eingabetest, Kalibrierung mit simuliertem Lenkrad
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const SP = process.env.APEX_TMP || require('path').join(__dirname); // Bilder unter shots/, three über APEX_THREE_DIR
require('fs').mkdirSync(SP + '/shots', { recursive: true });
const FILE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '../../dist/apex-formula.html');
const THREE_DIR = (process.env.APEX_THREE_DIR || path.join(__dirname, '../../node_modules/three'));
const shots = SP + '/shots';
const only = process.argv[3] || 'all';
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', async (route) => {
    const rel = route.request().url().replace('https://cdn.jsdelivr.net/npm/three@0.160.0/', '');
    const fp = path.join(THREE_DIR, rel);
    if (fs.existsSync(fp)) await route.fulfill({ path: fp, contentType: 'application/javascript' }); else await route.fulfill({ status: 404, body: 'nf' });
  });
  // Gamepad-Attrappe: Lenkrad G29 (Achsen 0 bis zur ersten Bewegung, Pedale invertiert)
  await ctx.addInitScript(() => {
    const mk = () => ({ id: 'Logitech G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)', index: 0, connected: true, mapping: '', timestamp: 0,
      axes: [0, 0, 0, 0, 0, 0], buttons: Array.from({ length: 25 }, () => ({ pressed: false, touched: false, value: 0 })) });
    window.__pad = null;
    window.__padOn = () => { window.__pad = mk(); window.dispatchEvent(new Event('gamepadconnected')); };
    window.__setAxis = (i, v) => { window.__pad.axes[i] = v; window.__pad.timestamp++; };
    window.__setBtn = (i, on) => { window.__pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; window.__pad.timestamp++; };
    navigator.getGamepads = () => [window.__pad ? Object.assign({}, window.__pad, { axes: window.__pad.axes.slice(), buttons: window.__pad.buttons.map(b => Object.assign({}, b)) }) : null, null, null, null];
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  const t0 = Date.now();
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => window.__apexReady === true, null, { timeout: 60000 });
  console.log('Bereit nach', Date.now() - t0, 'ms');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shots + '/01_menu.png' });
  const sleep = (ms) => page.waitForTimeout(ms);
  const frames = (n = 1) => page.evaluate((n) => new Promise(r => { let k = 0; const f = () => { if (++k >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
  const clickText = async (txt) => { await page.locator('button', { hasText: txt }).first().click(); };
  if (only === 'all' || only === 'drive') {
    await clickText('Testfahrt');
    await sleep(800);
    await page.screenshot({ path: shots + '/02_setup.png' });
    const tb = Date.now();
    await clickText('Losfahren');
    await page.waitForFunction(() => window.ApexDebug.game.state === 'driving', null, { timeout: 120000 });
    console.log('Sitzung aufgebaut in', Date.now() - tb, 'ms');
    await sleep(1500);
    await page.screenshot({ path: shots + '/03_chase.png' });
    // Vollgas
    await page.keyboard.down('ArrowUp');
    for (let i = 0; i < 6; i++) { await sleep(1000); const s = await page.evaluate(() => { const v = window.ApexDebug.vehicle; return `${v.speedKmh.toFixed(0)} km/h G${v.gear} ${v.rpm.toFixed(0)} rpm thr ${v.input.throttle.toFixed(2)} fps-steps ${window.ApexDebug.game.loop.stepsLastFrame}`; }); console.log('t+' + (i + 1) + 's', s); }
    for (let k = 0; k < 8; k++) { await frames(2); const g = await page.evaluate(() => window.ApexDebug.vehicle.rpm); if (g > 13000) { await page.keyboard.press('ShiftLeft'); await frames(3); } }
    await page.screenshot({ path: shots + '/04_chase_speed.png' });
    console.log(await page.evaluate(() => { const v = window.ApexDebug.vehicle; return `nach Schalten: ${v.speedKmh.toFixed(0)} km/h G${v.gear}`; }));
    await page.keyboard.up('ArrowUp');
    // Cockpit
    for (let k = 0; k < 2; k++) { await page.keyboard.press('KeyC'); await frames(2); console.log('Kamera:', await page.evaluate(() => window.ApexDebug.game.camMode)); }
    await page.screenshot({ path: shots + '/05a_cockpit.png' });
    await page.keyboard.press('KeyC'); await frames(2); console.log('Kamera:', await page.evaluate(() => window.ApexDebug.game.camMode));
    await page.screenshot({ path: shots + '/05b_tcam.png' });
    await page.keyboard.press('KeyC'); await frames(2); await page.keyboard.press('KeyC'); await frames(2); await page.keyboard.press('KeyC'); await frames(2);
    console.log('Kamera:', await page.evaluate(() => window.ApexDebug.game.camMode));
    await page.screenshot({ path: shots + '/05_cockpit.png' });
    // Lenken im Cockpit
    await page.keyboard.down('ArrowLeft'); await frames(3);
    await page.screenshot({ path: shots + '/06_cockpit_steer.png' });
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.press('KeyI'); await frames(2);
    await page.keyboard.press('KeyM'); await frames(2);
    await page.screenshot({ path: shots + '/07_overlay_mfd.png' });
    await page.keyboard.press('KeyI'); await frames(2); await page.keyboard.press('KeyM'); await frames(2);
    await page.keyboard.press('Escape'); await frames(2);
    await page.screenshot({ path: shots + '/08_pause.png' });
    console.log('Status:', await page.evaluate(() => window.ApexDebug.game.state));
    await page.keyboard.press('Escape'); await frames(2);
    console.log('Status nach Esc:', await page.evaluate(() => window.ApexDebug.game.state));
  }
  if (only === 'all' || only === 'wheel') {
    // Lenkrad anschließen → Kalibrierungsaufforderung
    if (await page.evaluate(() => window.ApexDebug.game.state) === 'driving') { await page.keyboard.press('Escape'); await frames(2); }
    await page.evaluate(() => window.__padOn());
    await sleep(600);
    await page.screenshot({ path: shots + '/09_wheel_prompt.png' });
    const hasPrompt = await page.evaluate(() => !!document.getElementById('calPrompt'));
    console.log('Kalibrierungsaufforderung:', hasPrompt);
    await clickText('Jetzt kalibrieren'); await sleep(400);
    // Schritt 1: Mitte
    await page.evaluate(() => { window.__setAxis(0, 0.0); });
    await clickText('Weiter'); await sleep(300);
    // Schritt 2: links, dann rechts, dann Mitte
    for (let k = 0; k <= 10; k++) { await page.evaluate((v) => window.__setAxis(0, v), -k / 10 * 1.0); await frames(1); }
    for (let k = 0; k <= 20; k++) { await page.evaluate((v) => window.__setAxis(0, v), -1 + k / 10); await frames(1); }
    for (let k = 0; k <= 10; k++) { await page.evaluate((v) => window.__setAxis(0, v), 1 - k / 10); await frames(1); }
    await frames(4); await sleep(500); await frames(3);
    await page.screenshot({ path: shots + '/10_wiz_after_steer.png' });
    console.log('Wizard-Schritt:', await page.evaluate(() => window.ApexDebug.input.calibration && window.ApexDebug.input.calibration.step.id));
    // Gas: Achse 2, Ruhe = 1 (wird bis zur ersten Bewegung als 0 gemeldet), voll = −1
    for (let k = 0; k <= 8; k++) { await page.evaluate((v) => window.__setAxis(2, v), 1 - k / 4); await frames(1); }
    await frames(2);
    for (let k = 0; k <= 8; k++) { await page.evaluate((v) => window.__setAxis(2, v), -1 + k / 4); await frames(1); }
    await sleep(500); await frames(4);
    console.log('Wizard-Schritt:', await page.evaluate(() => window.ApexDebug.input.calibration && window.ApexDebug.input.calibration.step.id));
    // Bremse: Achse 3
    await page.evaluate(() => window.__setAxis(3, 1)); await frames(2);
    for (let k = 0; k <= 8; k++) { await page.evaluate((v) => window.__setAxis(3, v), 1 - k / 4); await frames(1); }
    await frames(2);
    for (let k = 0; k <= 8; k++) { await page.evaluate((v) => window.__setAxis(3, v), -1 + k / 4); await frames(1); }
    await sleep(500); await frames(4);
    console.log('Wizard-Schritt:', await page.evaluate(() => window.ApexDebug.input.calibration && window.ApexDebug.input.calibration.step.id));
    await clickText('Überspringen'); await sleep(300);    // Kupplung
    // Schaltwippen: Knopf 4 (rechts), 5 (links)
    const wst = () => page.evaluate(() => { const c = window.ApexDebug.input.calibration; return c ? `${c.step.id} wait=${c.waitRelease} done=${c.status.done} cand=${c.status.candidate ? (c.status.candidate.label || c.status.candidate.index) : '-'}` : 'kein Assistent'; });
    console.log('vor Wippen:', await wst());
    for (const b of [4, 5]) { await page.evaluate((i) => window.__setBtn(i, true), b); await frames(2); console.log(' gedrückt', b, await wst()); await page.evaluate((i) => window.__setBtn(i, false), b); await frames(2); console.log(' los', b, await wst()); }
    console.log('Wizard-Schritt:', await page.evaluate(() => window.ApexDebug.input.calibration && window.ApexDebug.input.calibration.step.id));
    // Funktionsknöpfe: zwei belegen, Rest überspringen
    for (const b of [6, 7]) { await page.evaluate((i) => window.__setBtn(i, true), b); await frames(2); await page.evaluate((i) => window.__setBtn(i, false), b); await frames(2); }
    for (let k = 0; k < 9; k++) { const id = await page.evaluate(() => window.ApexDebug.input.calibration && window.ApexDebug.input.calibration.step.id); if (id === 'summary') break; await clickText('Überspringen'); await sleep(250); }
    await page.screenshot({ path: shots + '/11_wiz_summary.png' });
    await clickText('Profil speichern'); await sleep(400);
    const prof = await page.evaluate(() => JSON.stringify(window.ApexDebug.input.profile));
    console.log('Profil:', prof.slice(0, 900));
    // 1:1-Prüfung: Rotation 900° → Achse ±0,4 = ±180° = Vollausschlag
    await page.evaluate(() => { window.__setAxis(0, 0.2); });
    await frames(2);
    console.log('Achse 0,2 →', await page.evaluate(() => { const s = window.ApexDebug.input.state; return `Gerät ${s.steerDeg.toFixed(1)}°, Lenkung ${s.steer.toFixed(3)}, Quelle ${s.steerSource}`; }));
    await page.evaluate(() => { window.__setAxis(0, 0.4); }); await frames(2);
    console.log('Achse 0,4 →', await page.evaluate(() => { const s = window.ApexDebug.input.state; return `Gerät ${s.steerDeg.toFixed(1)}°, Lenkung ${s.steer.toFixed(3)}`; }));
    await page.evaluate(() => { window.__setAxis(0, 0.0); window.__setAxis(2, 1); window.__setAxis(3, 1); }); await frames(2);
    console.log('Pedale in Ruhe →', await page.evaluate(() => { const s = window.ApexDebug.input.state; return `Gas ${s.throttle.toFixed(2)} Bremse ${s.brake.toFixed(2)}`; }));
    await page.evaluate(() => { window.__setAxis(2, -1); window.__setAxis(3, 0); }); await frames(2);
    console.log('Gas voll, Bremse halb →', await page.evaluate(() => { const s = window.ApexDebug.input.state; return `Gas ${s.throttle.toFixed(2)} Bremse ${s.brake.toFixed(2)}`; }));
    await page.evaluate(() => { window.__setAxis(2, 1); window.__setAxis(3, 1); });
    // Mit dem Lenkrad weiterfahren: Cockpit, 90° nach rechts gelenkt
    if (await page.evaluate(() => window.ApexDebug.game.state) === 'menu') {
      await clickText('Testfahrt'); await frames(2); await clickText('Losfahren');
      await page.waitForFunction(() => window.ApexDebug.game.state === 'driving', null, { timeout: 180000 });
    } else { await clickText('Fortsetzen'); await frames(2); }
    await page.evaluate(() => window.ApexDebug.game.setCamera('cockpit'));
    await page.evaluate(() => { window.__setAxis(0, 0.2); window.__setAxis(2, 0.0); }); await frames(3);
    await page.screenshot({ path: shots + '/12a_cockpit_wheel90.png' });
    console.log('Cockpit-Lenkrad:', await page.evaluate(() => { const g = window.ApexDebug.game; return `Lenkradgruppe rot.z ${(g.carVis.sw.group.rotation.z * 180 / Math.PI).toFixed(1)}° · Gas ${g.vehicle.input.throttle.toFixed(2)}`; }));
    await page.evaluate(() => { window.__setAxis(0, 0.0); window.__setAxis(2, 1); });
    await page.keyboard.press('Escape'); await frames(2);
    // Eingabetest-Seite
    await clickText('Eingabetest');
    await sleep(800);
    await page.screenshot({ path: shots + '/12_inputtest.png' });
  }
  await sleep(300);
  console.log('--- Konsole (Fehler/Warnungen) ---');
  console.log(logs.length ? logs.join('\n') : '(keine)');
  await browser.close();
})().catch(e => { console.error('TEST-FEHLER', e); process.exit(1); });
