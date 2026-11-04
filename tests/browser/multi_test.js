// Browsertest Mehrspieler: zwei getrennte Browserfenster (Host + Gast).
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
    // 1. LAN-Einladung
    const offer = await A.evaluate(async () => { const S = new ApexDebug.NetHost(); ApexDebug.Net.session = S; return S.lanOffer(true); });
    const answer = await B.evaluate(async (o) => { const c = new ApexDebug.NetClient(); ApexDebug.Net.session = c; return c.lanAnswer(o, true); }, offer);
    check('LAN: Einladungs- und Antwort-Code erzeugt', /^AF[01]/.test(offer) && /^AF[01]/.test(answer), `${offer.length}/${answer.length} Zeichen`);
    await A.evaluate((a) => ApexDebug.Net.session.lanAnswer(a), answer);
    await A.waitForFunction(() => ApexDebug.Net.session.players.length === 2, null, { timeout: 20000 });
    await B.waitForFunction(() => ApexDebug.Net.session.lobby && ApexDebug.Net.session.lobby.players.length === 2, null, { timeout: 20000 });
    await B.evaluate(() => ApexDebug.Net.session.chat('Hallo aus dem LAN'));
    await A.waitForFunction(() => ApexDebug.Net.session.chat.some(c => c.text === 'Hallo aus dem LAN'), null, { timeout: 10000 });
    check('LAN: verbunden, Chat kommt an', true);
    await B.evaluate(() => { ApexDebug.Net.leave(); }); await A.evaluate(() => ApexDebug.Net.leave()); await sleep(800);
    // 2. Lobby-Code über den Vermittler + 3. Freunde
    const code = await A.evaluate(async () => { const S = new ApexDebug.NetHost(); ApexDebug.Net.session = S; await ApexDebug.NetPresence.start(); return S.openCode(); });
    check('Online-Lobby: Code erzeugt', /^[A-Z2-9]{5}$/.test(code), 'APEX-' + code);
    const fc = await A.evaluate(() => ApexDebug.NetProfile.get().code);
    const fr = await B.evaluate(async (fc) => { await ApexDebug.NetPresence.start(); ApexDebug.NetProfile.addFriend('Kai', fc); return ApexDebug.NetPresence.check(fc); }, fc);
    check('Freunde: Freundescode, online, Lobby sichtbar', fr && fr.name === 'Kai Host' && fr.lobby === code, JSON.stringify(fr));
    await B.evaluate(async (c) => { const cl = new ApexDebug.NetClient(); ApexDebug.Net.session = cl; await cl.joinCode('APEX-' + c); ApexDebug.UI.show('lobby', { noHistory: true }); }, code);
    await A.waitForFunction(() => ApexDebug.Net.session.players.length === 2, null, { timeout: 20000 });
    await A.evaluate(() => { ApexDebug.UI.show('lobby', { noHistory: true }); ApexDebug.Net.session.setSettings({ track: 'ringpark', laps: 1, ai: 3, weather: 'dry', damage: 'reduced', era: 'e2026' }); });
    await B.waitForFunction(() => ApexDebug.Net.session.lobby && ApexDebug.Net.session.lobby.settings.laps === 1 && ApexDebug.Net.session.lobby.settings.ai === 3, null, { timeout: 10000 });
    await B.evaluate(() => { ApexDebug.Net.session.setMe({ team: 'kestrel' }); ApexDebug.Net.session.ready(true); });
    await A.waitForFunction(() => ApexDebug.Net.session.allReady() && ApexDebug.Net.session.players[1].team === 'kestrel', null, { timeout: 10000 });
    await sleep(500);
    check('Lobby: Einstellungen beim Gast, Gast bereit (Team Kestrel)', true);
    await A.screenshot({ path: path.join(SHOTS, 'f0_lobby_host.png') });
    await B.screenshot({ path: path.join(SHOTS, 'f1_lobby_gast.png') });
    // 5. Rennen
    await A.evaluate(() => ApexDebug.Net.session.start());
    await Promise.all([A, B].map(p => p.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 240000 })));
    const g = await Promise.all([A, B].map(p => p.evaluate(() => ({ mode: ApexDebug.game.mode, n: ApexDebug.game.race.entries.length, names: ApexDebug.game.race.entries.map(e => e.name + (e.player ? '*' : '')).join(', ') }))));
    check('Rennen auf beiden PCs: gleiches Feld (2 Menschen + 3 KI)', g[0].n === 5 && g[1].n === 5 && g[1].mode === 'netclient' && g[0].names.replace('*', '') === g[1].names.replace('*', ''), g[0].names + ' | ' + g[1].names);
    // Beide Autos fährt eine KI (Test), Rendering aus, damit die Physik in Echtzeit läuft
    for (const p of [A, B]) await p.evaluate(() => {
      const g = ApexDebug.game, race = g.race, me = race.player, line = g.getLine(g.track.id);
      const ai = new ApexDebug.AIDriverRef(me.vehicle, line, { skill: 0.96, aggression: 0.3, consistency: 1, reaction: 0.2 }, 5); ai.hold(); me.ai = ai; window.__ai = ai;
      setInterval(() => { if (race.state === 'race' && ai.launchAt === Infinity) ai.launch(race.time); }, 50);
    });
    await sleep(2500);
    await A.screenshot({ path: path.join(SHOTS, 'f2_rennen_host.png') }); await B.screenshot({ path: path.join(SHOTS, 'f3_rennen_gast.png') });
    for (const p of [A, B]) await p.evaluate(() => { ApexDebug.Render._r = ApexDebug.Render.render; ApexDebug.Render.render = () => { }; });
    await Promise.all([A, B].map(p => p.waitForFunction(() => ApexDebug.game.race.state === 'race' && ApexDebug.game.race.time - ApexDebug.game.race.greenAt > 25, null, { timeout: 240000 })));
    const pa = await A.evaluate(() => { const r = ApexDebug.game.race, rem = r.entries.find(e => e.remote), me = r.player; return { rem: [rem.vehicle.pos.x, rem.vehicle.pos.z], remKmh: rem.vehicle.speedKmh, host: [me.vehicle.pos.x, me.vehicle.pos.z] }; });
    const pb = await B.evaluate(() => { const r = ApexDebug.game.race, me = r.player, host = r.entries.find(e => e.kind === 'host'); return { me: [me.vehicle.pos.x, me.vehicle.pos.z], host: [host.vehicle.pos.x, host.vehicle.pos.z], pos: me.pos, tower: document.getElementById('hudTower').innerText.split('\n').length }; });
    const d1 = Math.hypot(pa.rem[0] - pb.me[0], pa.rem[1] - pb.me[1]), d2 = Math.hypot(pa.host[0] - pb.host[0], pa.host[1] - pb.host[1]);
    check('Synchron: Gast-Auto beim Host ≈ Gast, Host-Auto beim Gast ≈ Host (< 25 m bei ~250 km/h)', d1 < 25 && d2 < 25 && pa.remKmh > 80, `Δ ${d1.toFixed(1)} m / ${d2.toFixed(1)} m, ${pa.remKmh.toFixed(0)} km/h`);
    check('Gast-HUD: Position und Zeitenturm vom Host', pb.pos >= 1 && pb.pos <= 5 && pb.tower >= 5, JSON.stringify({ pos: pb.pos, tower: pb.tower }));
    // Ziel: beide fahren die Runde zu Ende, Ergebnis auf beiden Seiten
    await Promise.all([A, B].map(p => p.waitForFunction(() => ApexDebug.game.race && ApexDebug.game.race.player.finished, null, { timeout: 400000 })));
    await Promise.all([A, B].map(p => p.waitForFunction(() => ApexDebug.UI.current === 'results', null, { timeout: 60000 })));
    for (const p of [A, B]) await p.evaluate(() => { ApexDebug.Render.render = ApexDebug.Render._r; });
    await sleep(800);
    const ra = await A.evaluate(() => ApexDebug.game.race.classification().map(r => r.name).join(', '));
    const rb = await B.evaluate(() => ({ names: ApexDebug.game.race.classification().map(r => r.name).join(', '), txt: document.body.innerText }));
    check('Ergebnis auf beiden PCs (Gast hat beide Menschen in der Wertung)', /Kai Host/.test(rb.names) && /Max Gast/.test(rb.names) && /Zur Lobby/i.test(rb.txt), ra + ' | ' + rb.names);
    await B.screenshot({ path: path.join(SHOTS, 'f4_ergebnis_gast.png') });
    // Zurück in die Lobby
    await A.evaluate(() => ApexDebug.game.netBackToLobby());
    await B.waitForFunction(() => ApexDebug.UI.current === 'lobby', null, { timeout: 15000 });
    check('Nach dem Rennen: beide wieder in der Lobby', await A.evaluate(() => ApexDebug.UI.current === 'lobby' && ApexDebug.Net.session.state === 'lobby'));
    await A.evaluate(() => ApexDebug.Net.leave());
    await B.waitForFunction(() => !ApexDebug.Net.session, null, { timeout: 15000 });
    check('Host schließt die Lobby → Gast wird benachrichtigt', true);
  } catch (e) { bad++; console.error('FEHLER', e.message); }
  console.log('--- Konsole ---'); console.log(logs.length ? logs.slice(0, 20).join('\n') : '(keine)');
  await browser.close(); server.kill();
  process.exit(bad ? 1 : 0);
})();
