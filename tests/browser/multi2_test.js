// Browsertest Mehrspieler 2: Qualifying, Startaufstellung, Boxenstopp des Gasts, Strafe, Wiederverbinden, Ergebnis
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
  const ff = (p, cond, ms) => p.waitForFunction(cond, null, { timeout: ms || 300000 });
  const aiDrive = (p) => p.evaluate(() => {
    const g = ApexDebug.game, me = g.race ? g.race.player : null, v = g.vehicle, line = g.getLine(g.track.id);
    const ai = new ApexDebug.AIDriverRef(v, line, { skill: 0.96, aggression: 0.3, consistency: 1, reaction: 0.2 }, 5);
    if (me) { ai.hold(); me.ai = ai; setInterval(() => { if (g.race && g.race.state === 'race' && ai.launchAt === Infinity) ai.launch(g.race.time); }, 50); }
    else { const step = g.step.bind(g); const meC = { vehicle: v, ai }; g.step = (h) => { if (g.state === 'driving' && g.mode === 'quali') ai.control(h, { cars: [meC], me: meC, state: 'free', time: v.time }); step(h); }; }
  });
  const noRender = (p) => p.evaluate(() => { ApexDebug.Render._r = ApexDebug.Render._r || ApexDebug.Render.render; ApexDebug.Render.render = () => { }; });
  try {
    const code = await A.evaluate(async () => { const S = new ApexDebug.NetHost(); ApexDebug.Net.session = S; return S.openCode(); });
    await B.evaluate(async (c) => { const cl = new ApexDebug.NetClient(); ApexDebug.Net.session = cl; await cl.joinCode(c); }, code);
    await ff(A, () => ApexDebug.Net.session.players.length === 2, 20000);
    await A.evaluate(() => ApexDebug.Net.session.setSettings({ track: 'ringpark', laps: 2, ai: 3, weather: 'dry', damage: 'reduced', quali: 3 }));
    await B.evaluate(() => ApexDebug.Net.session.ready(true)); await ff(A, () => ApexDebug.Net.session.allReady(), 10000);
    // Qualifying
    await A.evaluate(() => ApexDebug.Net.session.start());
    await Promise.all([A, B].map(p => ff(p, () => ApexDebug.game.state === 'driving' && ApexDebug.game.mode === 'quali', 240000)));
    check('Qualifying startet auf beiden PCs', true);
    for (const p of [A, B]) { await aiDrive(p); await noRender(p); }
    await Promise.all([A, B].map(p => ff(p, () => isFinite(ApexDebug.game.session.playerBest), 400000)));
    await ff(A, () => ApexDebug.Net.session.qTimes.size === 1, 60000); await sleep(1500);
    await sleep(2500);
    const qa = await A.evaluate(() => ApexDebug.game.session.standings().map(r => `${r.name} ${isFinite(r.time) ? r.time.toFixed(2) : '-'}`));
    const qb = await B.evaluate(() => ApexDebug.game.session.standings().map(r => `${r.name} ${isFinite(r.time) ? r.time.toFixed(2) : '-'}`));
    check('Qualifying: Zeiten beider Menschen beim Host, Rangliste beim Gast', qa.some(x => /Max Gast \d/.test(x)) && qb.some(x => /Kai Host \d/.test(x)) && qb.length === 5, qa.join(' | '));
    for (const p of [A, B]) await p.evaluate(() => { const q = ApexDebug.game.session; q.clock = q.duration + 1; q._end(); });
    await ff(A, () => ApexDebug.UI.current === 'qualiResults' && ApexDebug.Net.session.qDone.size === 1, 30000);
    const order = await A.evaluate(() => ApexDebug.game.session.standings().map(r => r.name));
    await A.evaluate(() => ApexDebug.Net.session.raceFromQuali());
    await Promise.all([A, B].map(p => ff(p, () => ApexDebug.game.state === 'driving' && ApexDebug.game.race, 240000)));
    const ga = await B.evaluate(() => ApexDebug.game.race.entries.map(e => e.name));
    check('Startaufstellung = Qualifying-Reihenfolge (auch beim Gast)', ga.join() === order.join(), ga.join(', '));
    for (const p of [A, B]) { await aiDrive(p); await noRender(p); }
    // Boxenstopp des Gasts + Strafe
    await ff(B, () => ApexDebug.game.race.state === 'race' && ApexDebug.game.race.time - ApexDebug.game.race.greenAt > 15, 120000);
    await B.evaluate(() => { const g = ApexDebug.game; g.race.togglePit(g.race.player, { compound: 'hard', repair: true }); ApexDebug.Net.session.penalty(5, 'Test'); });
    await ff(B, () => ApexDebug.game.race.player.pitStops === 1 && !ApexDebug.game.race.player.pitting, 300000);
    await sleep(1500);
    const pit = await A.evaluate(() => { const e = ApexDebug.game.race.entries.find(x => x.remote); return { stops: e.pitStops, cpd: e.vehicle.compound, pen: e.penalty }; });
    check('Boxenstopp des Gasts (Autopilot auf seinem PC), Host sieht Stopp, Reifen und Strafe', pit.stops === 1 && pit.cpd === 'hard' && pit.pen >= 5, JSON.stringify(pit));
    // Verbindungsabbruch mitten im Rennen → automatisch wiederverbinden
    await B.evaluate(() => { const c = ApexDebug.Net.session; c.link.close(); });
    await ff(A, () => { const e = ApexDebug.game.race.entries.find(x => x.remote); return e && e.active === false; }, 45000);
    await ff(B, () => ApexDebug.game.state === 'driving' && ApexDebug.game.mode === 'netclient' && ApexDebug.Net.session && ApexDebug.Net.session.link && ApexDebug.Net.session.link.open && ApexDebug.game.race.state === 'race', 120000);
    await ff(A, () => { const e = ApexDebug.game.race.entries.find(x => x.remote); return e && e.active === true; }, 30000);
    const rj = await B.evaluate(() => ({ laps: ApexDebug.game.race.player.timing.laps.length, kmh: ApexDebug.game.vehicle.speedKmh }));
    check('Wiederverbunden: Gast fährt im selben Rennen weiter', true, JSON.stringify(rj));
    for (const p of [B]) { await aiDrive(p); await noRender(p); }
    await Promise.all([A, B].map(p => ff(p, () => ApexDebug.game.race && ApexDebug.game.race.player.finished, 500000)));
    await Promise.all([A, B].map(p => ff(p, () => ApexDebug.UI.current === 'results', 60000)));
    const ra = await B.evaluate(() => ApexDebug.game.race.classification().map(r => r.name + (r.finished ? '' : ' (nicht im Ziel)')).join(', '));
    check('Ergebnis nach Box, Strafe und Wiederverbinden', /Max Gast/.test(ra) && /Kai Host/.test(ra), ra);
  } catch (e) { bad++; console.error('FEHLER', e.message); }
  console.log('--- Konsole ---'); console.log(logs.length ? logs.slice(0, 20).join('\n') : '(keine)');
  await browser.close(); server.kill();
  process.exit(bad ? 1 : 0);
})();
