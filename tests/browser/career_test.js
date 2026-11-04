// Browsertest Karriere: neue Karriere über das Menü, Teamwahl, Zentrale, Rennen werten, Social Media (Antwort/Beitrag), Saisonende, Vertrag, neue Saison
const { launch } = require('./harness');
(async () => {
  const T = await launch({ width: 1440, height: 810 });
  const { page, frames, sleep, clickText, shot, logs } = T;
  let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
  const ev = (f, a) => page.evaluate(f, a);
  await T.open();
  await ev(() => { ApexDebug.game.endCareer(); const S = ApexDebug.game.settings; S.graphics.autoQuality = false; S.camera.mode = 'chaseNear'; S.race.podium = false; });
  await clickText('Karriere'); await sleep(300);
  check('Speicherplätze', await ev(() => /Speicherplatz 1/i.test(document.body.innerText) && /Speicherplatz 3/i.test(document.body.innerText)));
  await clickText('Neue Karriere'); await sleep(300);
  check('Neue Karriere: Formular', await ev(() => /Neue Karriere/i.test(document.body.innerText) && /Startnummer/i.test(document.body.innerText)));
  await page.fill('input[placeholder="Vorname Nachname"]', 'Kai Vögele');
  await ev(() => { ApexDebug.UI._cOpts.quali = false; ApexDebug.UI._cOpts.distance = 'short'; ApexDebug.UI._cOpts.weather = 'dry'; });
  await shot('e0_karriere_neu');
  await clickText('Karriere starten'); await sleep(300);
  const p0 = await ev(() => ({ txt: document.body.innerText, c: ApexDebug.game.career && { phase: ApexDebug.game.career.phase, offers: ApexDebug.game.career.offers.length } }));
  check('Teamwahl mit drei Angeboten', p0.c && p0.c.phase === 'pick' && p0.c.offers === 3 && /Wähle dein erstes Team/i.test(p0.txt), JSON.stringify(p0.c));
  await shot('e1_karriere_teamwahl');
  await clickText('Unterschreiben'); await sleep(300);
  const p1 = await ev(() => { const c = ApexDebug.game.career; return { phase: c.phase, team: c.team, txt: document.body.innerText, saved: !!localStorage.getItem('apexformula.v1.career.1') }; });
  check('Karriere-Zentrale nach Unterschrift, gespeichert', p1.phase === 'season' && p1.team && /Rennwochenende/i.test(p1.txt) && /Teamziel/i.test(p1.txt) && p1.saved, p1.team);
  await shot('e2_karriere_uebersicht');
  // Rennwochenende (ohne Qualifying), kurz fahren, dann werten – mit protokolliertem Kontakt
  await clickText('Rennwochenende');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving' && ApexDebug.game.mode === 'race', null, { timeout: 180000 });
  const r = await ev(() => { const g = ApexDebug.game, race = g.race, me = race.player; const grips = race.entries.map(e => e.vehicle.trackGrip || 1); return { n: race.entries.length, me: me.name, team: me.team, gmin: Math.min(...grips), gmax: Math.max(...grips), rel: race.entries.filter(e => e.ai).map(e => e.ai.relPlayer).some(x => x !== 0) }; });
  check('Rennen mit Karriere-Fahrerfeld (Teamstärke, Beziehungen)', r.n === 20 && r.me === 'Kai Vögele' && r.gmax > r.gmin, JSON.stringify(r));
  await ev(() => { const g = ApexDebug.game, o = g.race.entries.find(e => !e.player); g.careerLog.contacts.push({ name: o.name, sp: 8, fault: 'player' }); g.careerLog.passes.push({ by: 'Kai Vögele', on: g.race.entries.find(e => !e.player && e !== o).name }); window.__victim = o.name; });
  const sum = await ev(() => { const s = ApexDebug.game.finishCareerRace(); ApexDebug.game.toMenu(); ApexDebug.UI.show('career', { summary: s, tab: 'news' }); return s; });
  await sleep(300);
  const n1 = await ev(() => { const c = ApexDebug.game.career; return { round: c.season.round, rel: c.rel[window.__victim], angry: c.feed.some(p => p.from === window.__victim && p.aboutMe), txt: document.body.innerText }; });
  check('Rennen gewertet, Kontakt kostet Beziehung, Social-Media-Beiträge', n1.round === 1 && n1.rel < 0 && n1.angry && /Neuer Beitrag/i.test(n1.txt), `rel ${n1.rel}`);
  await shot('e3_karriere_social');
  // Antworten und eigenen Beitrag posten
  const before = await ev(() => ApexDebug.game.career.feed.length);
  await page.locator('button', { hasText: 'Freundlich' }).first().click(); await sleep(300);
  await ev(() => { ApexDebug.UI._postOpts.kind = 'provoke'; ApexDebug.UI._postOpts.target = window.__victim; });
  await clickText('Posten'); await sleep(300);
  const n2 = await ev(() => { const c = ApexDebug.game.career; return { len: c.feed.length, mine: c.feed[0].kind, replied: c.feed.some(p => p.replies.some(r => r.me)), rel: c.rel[window.__victim] }; });
  check('Antwort und eigener Beitrag (Provokation senkt die Beziehung weiter)', n2.len === before + 1 && n2.mine === 'me' && n2.replied && n2.rel < n1.rel, JSON.stringify(n2));
  for (const [tab, name] of [['drivers', 'e4_karriere_fahrer'], ['teams', 'e5_karriere_teams']]) { await ev((t) => ApexDebug.UI.show('career', { noHistory: true, tab: t }), tab); await sleep(300); await shot(name); }
  // Saisonende erzwingen: letzte Runde fahren und werten
  await ev(() => { const c = ApexDebug.game.career; c.season.round = c.season.tracks.length - 1; ApexDebug.game.saveCareer(); });
  await ev(() => ApexDebug.game.startCareerRound());
  await page.waitForFunction(() => ApexDebug.game.state === 'driving' && ApexDebug.game.mode === 'race', null, { timeout: 180000 });
  await ev(() => { ApexDebug.game.finishCareerRace(); ApexDebug.game.toMenu(); ApexDebug.UI.show('career', { noHistory: true }); });
  await sleep(300);
  const e1 = await ev(() => { const c = ApexDebug.game.career; return { phase: c.phase, offers: c.offers.length, hist: c.history.length, txt: document.body.innerText }; });
  check('Saisonende: Historie, Optionen für die nächste Saison', e1.phase === 'offseason' && e1.offers >= 1 && e1.hist === 1 && /Optionen für die nächste Saison/i.test(e1.txt), JSON.stringify({ p: e1.phase, o: e1.offers }));
  await shot('e6_karriere_saisonende');
  await page.locator('button', { hasText: /Unterschreiben|Bleiben/ }).first().click(); await sleep(200);
  await clickText('Ja'); await sleep(400);
  const e2 = await ev(() => { const c = ApexDebug.game.career; return { phase: c.phase, season: c.seasonNo, round: c.season.round }; });
  check('Neue Saison gestartet', e2.phase === 'season' && e2.season === 2 && e2.round === 0, JSON.stringify(e2));
  await ev(() => ApexDebug.UI.show('main', { noHistory: true })); await sleep(300);
  check('Hauptmenü: Karriere-Kachel „Fortsetzen“', await ev(() => /Fortsetzen/i.test(document.body.innerText)));
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await T.browser.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
