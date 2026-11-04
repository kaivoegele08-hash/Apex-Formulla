// Browsertest Phase 5: Qualifying (Uhr, KI-Zeiten, Ergebnis → Startaufstellung), Meisterschaft (Saison, Wertung, Tabelle)
const { launch } = require('./harness');
(async () => {
  const T = await launch({ width: 1440, height: 810 });
  const { page, frames, sleep, clickText, shot, logs } = T;
  let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
  const ev = (f, a) => page.evaluate(f, a);
  await T.open();
  await ev(() => { localStorage.clear(); const S = ApexDebug.game.settings; ApexDebug.game.endSeason(); S.game.track = 'hafen'; S.game.weather = 'dry'; S.graphics.autoQuality = false; S.race.laps = 3; S.race.opponents = 9; S.race.quali = true; S.race.qualiMin = 5; S.camera.mode = 'chaseNear'; S.aids.autoShift = true; });
  await clickText('Schnelles Rennen'); await sleep(200);
  check('Rennvorbereitung: Qualifying-Karte', await ev(() => /Qualifying/i.test(document.body.innerText) && !!document.evaluate("//button[contains(., 'Qualifying starten')]", document, null, 9, null).singleNodeValue));
  await clickText('Qualifying starten');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  await frames(10);
  const q0 = await ev(() => ({ mode: ApexDebug.game.mode, tower: document.getElementById('hudTower').innerText, box: document.getElementById('hudBox').innerText, n: ApexDebug.game.session.ai.length }));
  check('Qualifying läuft: Modus, Zeitenliste, Restzeit', q0.mode === 'quali' && /Qualifying/i.test(q0.tower) && /noch \d:\d\d/.test(q0.box) && q0.n === 9, JSON.stringify(q0));
  // KI fährt das Spielerauto, Zeitraffer bis eine gezeitete Runde steht
  await ev(() => {
    const g = ApexDebug.game, v = g.vehicle;
    const ai = new ApexDebug.AIDriver(v, g.getLine(g.track.id), { skill: 0.99, aggression: 0, consistency: 1, reaction: 0 }, 4);
    const step = g.step.bind(g), me = { vehicle: v, ai };
    g.step = (h) => { if (g.state === 'driving') { ai.control(h, { cars: [me], me, state: 'free', time: v.time }); } step(h); };
    window.__ff = (cond) => new Promise(res => { const id = setInterval(() => { for (let i = 0; i < 360; i++) { g.step(1 / 360); if (cond()) { clearInterval(id); res(); return; } } }, 10); });
  });
  await ev(() => window.__ff(() => isFinite(ApexDebug.game.session.playerBest) || ApexDebug.game.session.clock > 280));
  await frames(6);
  const q1 = await ev(() => { const q = ApexDebug.game.session; return { best: q.playerBest, pos: q.standings().findIndex(r => r.player) + 1, shown: q.ai.filter(a => isFinite(a.shown)).length, clock: q.clock }; });
  check('Gezeitete Qualifying-Runde und vorläufige Position', isFinite(q1.best) && q1.pos >= 1, JSON.stringify(q1));
  await shot('95_qualifying_hud');
  await ev(() => ApexDebug.game.pause('Test')); await sleep(300);
  check('Pausemenü: Qualifying beenden', await ev(() => /Qualifying beenden/i.test(document.body.innerText) && /Qualifying · noch/i.test(document.body.innerText)));
  await ev(() => ApexDebug.game.resume());
  // Uhr ablaufen lassen → letzte Runde → Ende
  await ev(() => { const q = ApexDebug.game.session; q.clock = q.duration - 0.5; });
  await ev(() => window.__ff(() => ApexDebug.game.session.phase === 'done'));
  await page.waitForFunction(() => ApexDebug.UI.current === "qualiResults", null, { timeout: 15000 });
  await sleep(300);
  const qr = await ev(() => ({ txt: document.body.innerText, grid: ApexDebug.game.pendingGrid.map(e => e.driver.name), st: ApexDebug.game.session.standings().map(r => r.name), allShown: ApexDebug.game.session.ai.every(a => a.shown === a.best), dbg: ApexDebug.game.session.standings().slice(0, 4).map(r => r.name + ' ' + r.time.toFixed(2)) }));
  check('Qualifying-Ergebnis: Tabelle, alle KI-Zeiten, Startaufstellung', /Startplatz \d+/i.test(qr.txt) && /Zum Rennen/i.test(qr.txt) && qr.allShown && qr.grid.join() === qr.st.join(), qr.grid.slice(0, 3).join(', ') + ' | ' + JSON.stringify(qr.dbg));
  await shot('96_qualifying_ergebnis');
  await clickText('Zum Rennen');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving' && ApexDebug.game.mode === 'race', null, { timeout: 180000 });
  const rg = await ev(() => ApexDebug.game.race.entries.map(e => e.name));
  check('Rennen startet in Qualifying-Reihenfolge', rg.join() === qr.grid.join(), rg.slice(0, 3).join(', '));
  await frames(6); await shot('97_start_nach_quali');
  // Meisterschaft
  await ev(() => ApexDebug.game.toMenu()); await sleep(200);
  await clickText('Meisterschaft'); await sleep(300);
  check('Neue Saison: Einstellungen', await ev(() => /Neue Saison/i.test(document.body.innerText) && /Kalender/i.test(document.body.innerText)));
  await clickText('Aus (Startplatz Mitte)'); await clickText('Sonnig', 'div.chip');
  await clickText('Saison starten'); await sleep(300);
  const s0 = await ev(() => ({ s: ApexDebug.game.season, txt: document.body.innerText, saved: !!JSON.parse(localStorage.getItem('apexFormula.season') || localStorage.getItem('apex.season') || 'null') || Object.keys(localStorage).some(k => /season/.test(k)) }));
  check('Saison angelegt und gespeichert', s0.s && s0.s.round === 0 && !s0.s.quali && /Runde 1 von 4/i.test(s0.txt) && s0.saved, Object.keys(s0.s || {}).join(','));
  await shot('98_meisterschaft_start');
  await clickText('Rennen starten');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving' && ApexDebug.game.mode === 'race', null, { timeout: 180000 });
  const sr = await ev(() => ({ track: ApexDebug.game.track.id, laps: ApexDebug.game.race.laps, n: ApexDebug.game.race.entries.length, me: ApexDebug.game.race.player.gridPos }));
  check('Saisonrennen: Strecke 1, 5 Runden, 20 Autos, Startplatz Mitte', sr.track === 'ringpark' && sr.laps === 5 && sr.n === 20 && sr.me >= 9 && sr.me <= 12, JSON.stringify(sr));
  await ev(() => ApexDebug.game.race._positions()); 
  await ev(() => { ApexDebug.game.scoreSeasonRace(); ApexDebug.game.toMenu(); ApexDebug.UI.show("season", { justScored: true }); });
  await sleep(300);
  const s1 = await ev(() => { const S = ApexDebug.game.season; return { round: S.round, sum: Object.values(S.drivers).reduce((a, d) => a + d.pts, 0), teams: Object.values(S.teams).reduce((a, b) => a + b, 0), txt: document.body.innerText }; });
  check('Wertung: Runde 2, 101 Punkte verteilt, Tabelle sichtbar', s1.round === 1 && s1.sum >= 101 && s1.sum <= 102 && s1.teams === s1.sum && /Fahrerwertung/i.test(s1.txt) && /Runde 2 von 4/i.test(s1.txt), `${s1.round} ${s1.sum} ${s1.teams}`);
  await shot('99_meisterschaft_tabelle');
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await T.browser.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
