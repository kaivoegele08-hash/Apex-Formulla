// Browsertest: Schnelles Rennen (1 Runde, volles Feld), Startampel, Zeitenturm, Kameras, Ergebnis
const { launch } = require('./harness');
(async () => {
  const T = await launch({ width: 1440, height: 810 });
  const { page, frames, sleep, clickText, shot, logs } = T;
  let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
  const ev = (f, a) => page.evaluate(f, a);
  await T.open();
  await ev(() => { const S = ApexDebug.game.settings; S.race.laps = 1; S.race.opponents = 19; S.race.playerGrid = 'middle'; S.camera.mode = 'chaseNear'; });
  await clickText('Schnelles Rennen'); await sleep(300);
  await shot('60_race_setup');
  await clickText('Rennen starten');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  const st0 = await ev(() => ({ n: ApexDebug.game.race.entries.length, vis: ApexDebug.game.raceVis.length, pos: ApexDebug.game.race.player.pos }));
  check('Startfeld aufgebaut', st0.n === 20 && st0.vis === 19, JSON.stringify(st0));
  // Spielerauto für den Test von der KI fahren lassen
  await ev(() => { const g = ApexDebug.game, me = g.race.player; me.ai = new ApexDebug.AIDriver(me.vehicle, g.race.line, { skill: 0.97, aggression: 0.5, consistency: 0.95, reaction: 0.2 }, 5); me.ai.hold(); });
  await page.waitForFunction(() => ApexDebug.game.race.state === 'lights' && ApexDebug.game.race.lights >= 3, null, { timeout: 120000 });
  await frames(2); await shot('61_race_lights');
  check('Startampel sichtbar', await ev(() => !document.getElementById('hudLights').classList.contains('hidden') && document.querySelectorAll('#hudLights i.on').length >= 3));
  await page.waitForFunction(() => ApexDebug.game.race.state === 'race', null, { timeout: 120000 });
  await ev(() => { const g = ApexDebug.game; g.race.player.ai.launch(g.race.time); });
  // Bildrate während des Rennens messen
  const fps = await ev(() => new Promise(r => { let n = 0, t0 = performance.now(); const f = () => { if (++n >= 90) r(n / ((performance.now() - t0) / 1000)); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  console.log(`Bildrate (SwiftShader, Software-Rendering): ${fps.toFixed(1)} FPS`);
  await sleep(3000); await frames(3);
  await shot('62_race_start');
  const tw = await ev(() => document.querySelectorAll('#hudTower .tr').length);
  check('Zeitenturm mit allen Fahrern', tw === 20, String(tw));
  await ev(() => ApexDebug.game.setCamera('tv')); await sleep(1500); await frames(2);
  await shot('63_race_tv');
  await ev(() => ApexDebug.game.setCamera('cockpit')); await sleep(800); await frames(2);
  await shot('64_race_cockpit');
  await ev(() => ApexDebug.game.setCamera('nose')); await sleep(600); await frames(2);
  await shot('65_race_nose');
  await ev(() => ApexDebug.game.setCamera('chaseFar'));
  // Rennen beschleunigt zu Ende simulieren (zusätzliche Physikschritte pro Frame), bis das Ergebnis erscheint
  await ev(() => { const g = ApexDebug.game; g._fast = setInterval(() => { for (let i = 0; i < 360 && g.state !== 'menu' && g.race; i++) g.step(1 / 360); }, 30); });
  await page.waitForFunction(() => ApexDebug.UI.current === 'results', null, { timeout: 600000 });
  await sleep(1500);
  const res = await ev(() => { const r = ApexDebug.game.race; return { over: r.over, fin: r.finishOrder.length, me: r.player.pos, rows: document.querySelectorAll('table.res tr').length, contacts: r.entries.filter(e => ApexDebug.Damage.summary(e.vehicle) !== 'keiner').length }; });
  check('Ergebnisliste angezeigt', res.rows === 21, JSON.stringify(res));
  await shot('66_race_results');
  await ev(() => clearInterval(ApexDebug.game._fast));
  await clickText('Telemetrie'); await sleep(600);
  const tl = await ev(() => document.querySelectorAll('.tele canvas').length);
  check('Telemetrie aus dem Rennen', tl === 5, String(tl));
  await shot('67_race_telemetry');
  await clickText('Zurück'); await sleep(300);
  await clickText('Hauptmenü'); await sleep(500);
  check('Zurück im Hauptmenü, Sitzung abgebaut', await ev(() => ApexDebug.game.state === 'menu' && !ApexDebug.game.race && ApexDebug.game.raceVis.length === 0));
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await T.browser.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
