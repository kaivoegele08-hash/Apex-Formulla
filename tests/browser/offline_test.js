// Browsertest ohne Internet: jede http(s)-Anfrage wird blockiert – das Spiel muss trotzdem starten und fahren
const { chromium } = require('playwright');
const path = require('path');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '../../dist/apex-formula.html'));
(async () => {
  let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const blocked = [];
  await ctx.route(/^https?:\/\//, (route) => { blocked.push(route.request().url()); route.abort(); });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => window.__apexReady === true, null, { timeout: 60000 });
  check('Start ohne Internet', true, `${blocked.length} Netzanfragen blockiert`);
  await page.evaluate(() => { ApexDebug.game.settings.graphics.autoQuality = false; ApexDebug.game.startTestDrive(); });
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  const r = await page.evaluate(() => ({ peer: typeof window.Peer, three: !!window.ApexLib.THREE.WebGLRenderer }));
  check('Testfahrt läuft, Three.js und PeerJS eingebettet', r.three && r.peer === 'function', JSON.stringify(r));
  check('Keine Skriptfehler', !errs.length, errs.join(' | '));
  await browser.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
