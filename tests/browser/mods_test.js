// Browsertest Mods: mods/mods.js wird beim Start geladen, Menü „Mods“, Mod-Strecke fahrbar, Ordner-Import (simuliert), Fehlermeldung
const { launch } = require('./harness');
(async () => {
  const T = await launch({ width: 1440, height: 810 });
  const { page, frames, sleep, clickText, shot, logs } = T;
  let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
  const ev = (f, a) => page.evaluate(f, a);
  await T.open();
  const m0 = await ev(() => ({ idx: window.ApexMods.indexFound, list: window.ApexMods.list.map(m => m.id + '@' + m.source) }));
  check('mods/mods.js gefunden, Beispielstrecke registriert', m0.idx === true && m0.list.some(x => x.startsWith('beispiel-seeblick@beispiel_strecke.js')), JSON.stringify(m0.list));
  await clickText('Mods'); await sleep(300);
  const t0 = await ev(() => document.body.innerText);
  check('Menü „Mods“ zeigt die geladene Mod', /Seeblick-Ring/.test(t0) && /geladen/i.test(t0) && /README/.test(t0), '');
  // Ordner-Import simulieren: Datei mit Team, Fahrern und kaputter Strecke
  await ev(() => {
    ApexDebug.ModFolder.run('test_team.js', "ApexMods.register({ id: 'tt', name: 'Test-Team', teams: [{ id: 'testteam', name: 'Test Racing', colors: ['#00ff88', '#111111'] }], drivers: [{ name: 'Tina Test', team: 'testteam', num: 70, rating: 0.9 }] });");
    ApexDebug.ModFolder.run('kaputt.js', "ApexMods.register({ id: 'kp', name: 'Kaputt', tracks: [{ id: 'kp', layout: { corners: [[0,0,300],[100,0,300],[50,90,300]] } }] });");
    ApexDebug.ModFolder.run('syntax.js', "ApexMods.register({ id: 'x', ");
    ApexDebug.applyMods(window.ApexMods.list);
  });
  await clickText('Zurück'); await clickText('Mods'); await sleep(300);
  const t1 = await ev(() => document.body.innerText);
  check('Fehler werden angezeigt (Radius zu groß, Syntaxfehler)', /Radius 300 m ist zu groß/.test(t1) && /Fehler beim Ausführen/.test(t1) && /Test Racing/.test(t1), '');
  await shot('c0_mods_menue');
  await clickText('Zurück');
  // Mod-Strecke in der Testfahrt
  await clickText('Testfahrt / Training'); await sleep(300);
  check('Mod-Strecke in der Streckenauswahl', await ev(() => /Seeblick-Ring/i.test(document.body.innerText)));
  await clickText('Seeblick-Ring', 'div.chip'); await sleep(400);
  await ev(() => { ApexDebug.game.settings.graphics.autoQuality = false; ApexDebug.game.settings.camera.mode = 'chaseFar'; });
  await clickText('Losfahren');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  await frames(10);
  const d = await ev(() => ({ id: ApexDebug.game.track.id, len: ApexDebug.game.track.length, pit: !!ApexDebug.game.track.pit }));
  check('Testfahrt auf der Mod-Strecke', d.id === 'seeblick' && d.len > 3000 && d.pit, JSON.stringify(d));
  await shot('c1_mod_strecke');
  await ev(() => ApexDebug.game.toMenu());
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await T.browser.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
