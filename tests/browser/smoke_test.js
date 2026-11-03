const { chromium } = require('playwright');
const path = require('path');
const SP = process.env.APEX_TMP || require('path').join(__dirname); // Bilder unter shots/, three über APEX_THREE_DIR
require('fs').mkdirSync(SP + '/shots', { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', async (route) => {
    const rel = route.request().url().replace('https://cdn.jsdelivr.net/npm/three@0.160.0/', '');
    await route.fulfill({ path: path.join((process.env.APEX_THREE_DIR || path.join(__dirname, '../../node_modules/three')), rel), contentType: 'application/javascript' });
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(180000);
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  await page.goto('file://' + path.resolve(process.argv[2] || path.join(__dirname, '../../dist/apex-formula.html')));
  await page.waitForFunction(() => window.__apexReady === true, null, { timeout: 60000 });
  const frames = (n = 1) => page.evaluate((n) => new Promise(r => { let k = 0; const f = () => { if (++k >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
  await page.locator('button', { hasText: 'Testfahrt' }).first().click(); await frames(2);
  await page.locator('button', { hasText: 'Losfahren' }).first().click();
  await page.waitForFunction(() => window.ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  await page.evaluate(() => window.ApexDebug.game.setCamera('chaseFar'));
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.ApexDebug.vehicle.rpm > 13500, null, { timeout: 300000 });
  const g0 = await page.evaluate(() => window.ApexDebug.vehicle.gear);
  await page.keyboard.press('ShiftLeft'); await frames(3);
  const g1 = await page.evaluate(() => `${window.ApexDebug.vehicle.gear} @ ${window.ApexDebug.vehicle.speedKmh.toFixed(0)} km/h`);
  console.log('Schalten per Tastatur: Gang', g0, '→', g1);
  await frames(6);
  await page.screenshot({ path: SP + '/shots/40_final_chasefar.png' });
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('KeyI'); await frames(2); await page.keyboard.press('KeyM'); await frames(2);
  await page.screenshot({ path: SP + '/shots/41_final_overlay.png' });
  await page.keyboard.press('Escape'); await frames(2);
  await page.screenshot({ path: SP + '/shots/42_final_pause.png' });
  console.log('Status:', await page.evaluate(() => window.ApexDebug.game.state));
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await browser.close();
})().catch(e => { console.error('FEHLER', e.message); process.exit(1); });
