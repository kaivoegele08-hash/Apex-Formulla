// Gemeinsame Testumgebung für die Browsertests (Playwright + Chromium).
//   APEX_THREE_DIR  – Ordner mit three@0.160.0 (Standard: node_modules/three, auch tests/node_modules)
//   APEX_SHOTS      – Ordner für Bildschirmfotos (Standard: tests/browser/shots)
//   1. Argument     – zu testende HTML-Datei (Standard: dist/apex-formula.html)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');

function findThree() {
  const cands = [process.env.APEX_THREE_DIR, path.join(ROOT, 'node_modules/three'), path.join(ROOT, 'tests/node_modules/three')];
  try { cands.push(path.dirname(require.resolve('three/package.json', { paths: [ROOT, __dirname] }))); } catch (e) { /* nicht installiert */ }
  const dir = cands.find(d => d && fs.existsSync(path.join(d, 'build/three.module.js')));
  if (!dir) throw new Error('three@0.160.0 nicht gefunden – „npm i three@0.160.0“ im Repo oder APEX_THREE_DIR setzen.');
  return dir;
}
const FILE = path.resolve(process.argv[2] || path.join(ROOT, 'dist/apex-formula.html'));
const SHOTS = process.env.APEX_SHOTS || path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

async function launch({ width = 1280, height = 720, initScripts = [] } = {}) {
  const THREE_DIR = findThree();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', async (route) => {
    const fp = path.join(THREE_DIR, route.request().url().replace('https://cdn.jsdelivr.net/npm/three@0.160.0/', ''));
    if (fs.existsSync(fp)) await route.fulfill({ path: fp, contentType: 'application/javascript' }); else await route.fulfill({ status: 404, body: 'nf' });
  });
  for (const s of initScripts) await ctx.addInitScript(s.fn ? s.fn : s, s.arg);
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  const frames = (n = 1) => page.evaluate((n) => new Promise(r => { let k = 0; const f = () => { if (++k >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const clickText = async (txt, sel = 'button') => { await page.locator(sel, { hasText: txt }).first().click(); await frames(2); };
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
  const open = async () => { await page.goto('file://' + FILE); await page.waitForFunction(() => window.__apexReady === true, null, { timeout: 60000 }); };
  return { browser, ctx, page, logs, frames, sleep, clickText, shot, open, FILE, SHOTS };
}
module.exports = { launch, ROOT };
