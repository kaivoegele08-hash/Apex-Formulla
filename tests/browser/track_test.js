// Browsertest: Falkenried-Ring (Strecke nach Spielerskizze), Fahrhilfe Ideallinie, Rennstart
const { launch } = require('./harness');
(async () => {
  const T = await launch({ width: 1440, height: 810 });
  const { page, frames, sleep, clickText, shot, logs } = T;
  let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
  const ev = (f, a) => page.evaluate(f, a);
  await T.open();
  await clickText('Testfahrt / Training'); await sleep(300);
  await clickText('Falkenried-Ring', '.chip'); await sleep(400);
  await shot('80_drive_falkenried');
  check('Strecke gewählt', await ev(() => ApexDebug.game.settings.game.track === 'falkenried'));
  await clickText('Losfahren');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  check('Ideallinie aufgebaut', await ev(() => !!ApexDebug.game.idealLine && ApexDebug.game.idealLine.mesh.visible));
  // KI fährt das Spielerauto bis kurz vor die Bremszone von Kurve 1
  await ev(() => {
    const g = ApexDebug.game, ai = new ApexDebug.AIDriver(g.vehicle, g.getLine('falkenried'), { skill: 0.97, aggression: 0, consistency: 1, reaction: 0 }, 2);
    const step = g.step.bind(g); g._origStep = step;
    g.step = (h) => { if (g.state === 'driving') ai.control(h, { cars: [], me: null, state: 'free', time: performance.now() / 1000 }); step(h); };
    g._fast = setInterval(() => { for (let i = 0; i < 360 && g.state === 'driving'; i++) g.step(1 / 360); if (g.vehicle.trackS > 420 && g.vehicle.trackS < 1000) clearInterval(g._fast); }, 30);
  });
  await page.waitForFunction(() => { const v = ApexDebug.game.vehicle; return v.trackS > 420 && v.trackS < 1000; }, null, { timeout: 300000, polling: 500 });
  await ev(() => { const g = ApexDebug.game; g.step = g._origStep; g.setCamera('chaseFar'); g.vehicle.vel.set(g.vehicle.vel.x, 0, g.vehicle.vel.z); });
  await frames(4);
  const cols = await ev(() => { const g = ApexDebug.game, c = g.idealLine.col.array, N = g.track.N, j = g.vehicle.trackIdx; let r = 0, y = 0, gr = 0; for (let q = 0; q < 200; q++) { const k = (j + q) % N; if (c[k * 8 + 3] < 0.05) continue; if (c[k * 8 + 1] < 0.3) r++; else if (c[k * 8 + 1] < 0.9) y++; else gr++; } return { r, y, gr, kmh: g.vehicle.speedKmh }; });
  check('Ideallinie gefärbt (rot/gelb/grün vor Kurve 1)', cols.r > 0 && cols.gr > 0, JSON.stringify(cols));
  await shot('81_idealline');
  await ev(() => ApexDebug.game.setCamera('cockpit')); await frames(3);
  await shot('82_idealline_cockpit');
  await ev(() => ApexDebug.game.pause('Test')); await sleep(200);
  await clickText('Zum Hauptmenü'); await sleep(300);
  // Rennen auf der neuen Strecke
  await ev(() => { const S = ApexDebug.game.settings; S.race.laps = 3; S.race.opponents = 19; S.camera.mode = 'chaseNear'; });
  await clickText('Schnelles Rennen'); await sleep(300);
  await shot('83_race_setup_falkenried');
  await clickText('Rennen starten');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  await page.waitForFunction(() => ApexDebug.game.race.state === 'lights', null, { timeout: 120000 });
  await frames(3); await shot('84_race_grid_falkenried');
  check('Rennen auf Falkenried', await ev(() => ApexDebug.game.race.track.id === 'falkenried' && ApexDebug.game.race.entries.length === 20));
  await ev(() => ApexDebug.game.setCamera('tv')); await frames(3); await shot('85_tv_falkenried');
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await T.browser.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
