// Browsertest Koop-Karriere: Host legt eine Karriere an, Gast bekommt einen Sitz und sieht WM/Kalender.
//   1. LAN-Einladung (manuelle Codes, ohne Vermittler)   2. Lobby-Code über einen lokalen PeerJS-Vermittler
//   3. Freundescode + Online-Status   4. Chat, Einstellungen, Bereit   5. Rennen mit 2 Menschen + KI bis zum Ergebnis
//   APEX_PEER_DIR = Ordner mit node_modules/peer und node_modules/peerjs (Standard: wie APEX_THREE_DIR)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const THREE_DIR = process.env.APEX_THREE_DIR || path.join(ROOT, 'node_modules/three');
const MODS = process.env.APEX_PEER_DIR || path.join(THREE_DIR, '..');
const FILE = path.resolve(process.argv[2] || path.join(ROOT, 'dist/apex-formula.html'));
const SHOTS = process.env.APEX_SHOTS || path.join(__dirname, 'shots');
const PORT = 9123;
let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const server = spawn(process.execPath, [path.join(MODS, 'peer/dist/bin/peerjs.js'), '--host', '127.0.0.1', '--port', String(PORT), '--path', '/'], { stdio: 'ignore' });
  await sleep(1200);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const logs = [];
  const open = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', async (route) => { const fp = path.join(THREE_DIR, route.request().url().replace('https://cdn.jsdelivr.net/npm/three@0.160.0/', '')); if (fs.existsSync(fp)) await route.fulfill({ path: fp, contentType: 'application/javascript' }); else await route.fulfill({ status: 404, body: 'nf' }); });
    await ctx.route('https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', (route) => route.fulfill({ path: path.join(MODS, 'peerjs/dist/peerjs.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript((port) => { window.APEX_NET_BROKER = { host: '127.0.0.1', port, path: '/', secure: false, key: 'peerjs' }; }, PORT);
    const page = await ctx.newPage(); page.setDefaultTimeout(240000);
    page.on('console', m => { if (m.type() === 'error') logs.push(`[${name}] ${m.text()}`); });
    page.on('pageerror', e => logs.push(`[${name} pageerror] ${e.message}`));
    await page.goto('file://' + FILE); await page.waitForFunction(() => window.__apexReady === true, null, { timeout: 60000 });
    await page.evaluate((n) => { const S = ApexDebug.game.settings; S.game.playerName = n; S.graphics.autoQuality = false; S.graphics.preset = 'niedrig'; S.race.podium = false; S.camera.mode = 'chaseFar'; S.aids.autoShift = true; ApexDebug.Render.applyQuality(S.graphics); }, name);
    return page;
  };
  const A = await open('Kai Host'), B = await open('Max Gast');
  try {
    const offer = await A.evaluate(async () => { const S = new ApexDebug.NetHost(); ApexDebug.Net.session = S; return S.lanOffer(true); });
    const answer = await B.evaluate(async (o) => { const c = new ApexDebug.NetClient(); ApexDebug.Net.session = c; return c.lanAnswer(o, true); }, offer);
    await A.evaluate((a) => ApexDebug.Net.session.lanAnswer(a), answer);
    await A.waitForFunction(() => ApexDebug.Net.session.players.length === 2, null, { timeout: 20000 });
    await A.evaluate(() => ApexDebug.UI.show('lobby', { noHistory: true }));
    await A.screenshot({ path: path.join(SHOTS, 'coop_host_slots.png') });
    // Neue Koop-Karriere über die Oberfläche: Knopf „Neue Koop-Karriere“ → Teamwahl
    await A.evaluate(() => { const D = ApexDebug.game; for (const s of [1, 2, 3]) D.endCoop(s); ApexDebug.UI.show('lobby', { noHistory: true }); });
    await A.click('text=Neue Koop-Karriere');
    await A.waitForSelector('.modal .box');
    await A.screenshot({ path: path.join(SHOTS, 'coop_team_pick.png') });
    await A.click('.modal .box .actions button.primary');
    await A.waitForFunction(() => ApexDebug.Net.session.settings.coop === 1);
    const st = await A.evaluate(() => { const S = ApexDebug.Net.session, c = ApexDebug.game.coop; return { team: c.team, me: S.me.team, guest: S.players[1].team, humans: Object.keys(c.coop.humans).length, track: S.settings.track, next: c.season.tracks[0] }; });
    check('Host-Team übernommen', st.team === st.me, JSON.stringify(st));
    check('Gast bekommt Sitz im Host-Team', st.guest === st.team && st.humans === 1);
    check('Strecke aus dem Kalender', st.track === st.next || !st.next);
    await B.waitForFunction(() => ApexDebug.Net.session.lobby && ApexDebug.Net.session.lobby.coop, null, { timeout: 20000 });
    await B.evaluate(() => ApexDebug.UI.show('lobby', { noHistory: true }));
    const g = await B.evaluate(() => { const L = ApexDebug.Net.session.lobby; return { n: L.coop.humans.length, rows: L.coop.table.length, txt: document.querySelector('#lobbyScreen').innerText.includes('Koop-Karriere') }; });
    check('Gast sieht Koop-Karriere', g.n === 2 && g.rows >= 18 && g.txt, JSON.stringify(g));
    await B.screenshot({ path: path.join(SHOTS, 'coop_guest_lobby.png') });
    const saved = await A.evaluate(() => ApexDebug.game.coopInfo(1));
    check('Spielstand gespeichert', saved && saved.guests.length === 1, JSON.stringify(saved));
    await A.evaluate(() => ApexDebug.UI.show('lobby', { noHistory: true }));
    await A.screenshot({ path: path.join(SHOTS, 'coop_host_lobby.png') });
  } catch (e) { check('Ablauf', false, e.message); }
  for (const l of logs.slice(0, 10)) console.log(l);
  await browser.close(); server.kill();
  console.log(bad ? `${bad} Fehler` : 'Alle Koop-Tests bestanden');
  process.exit(bad ? 1 : 0);
})();
