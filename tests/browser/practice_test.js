// Browsertest Phase 2: Testfahrt mit Sektoren, Track Limits, Ghost, Telemetrie, Setup, Kameras
const { launch } = require('./harness');
(async () => {
  const T = await launch({ width: 1440, height: 810 });
  const { page, frames, sleep, clickText, shot, logs } = T;
  let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
  const ev = (f, a) => page.evaluate(f, a);
  await T.open();
  // Setup-Bildschirm aus der Testfahrt-Vorbereitung
  await clickText('Testfahrt / Training'); await sleep(300);
  await clickText('Fahrzeug-Setup'); await sleep(300);
  const sliders = await ev(() => document.querySelectorAll('section.screen input[type=range]').length);
  check('Setup: alle Parameter einstellbar', sliders === 19, String(sliders));
  await shot('70_setup');
  // Frontflügel auf 9 stellen und übernehmen
  await ev(() => { const i = document.querySelector('section.screen input[type=range]'); i.value = 9; i.dispatchEvent(new Event('input')); });
  await clickText('Übernehmen'); await sleep(300);
  check('Setup gespeichert', await ev(() => ApexDebug.game.setupFor('ringpark').frontWing === 9));
  await clickText('Losfahren');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  check('Fahrzeug mit gespeichertem Setup', await ev(() => ApexDebug.vehicle.setup.frontWing === 9));
  // Für den Test fährt die KI das Spielerauto
  await ev(() => {
    const g = ApexDebug.game, ai = new ApexDebug.AIDriver(g.vehicle, g.getLine('ringpark'), { skill: 0.97, aggression: 0, consistency: 1, reaction: 0 }, 2);
    const step = g.step.bind(g); g._origStep = step;
    g.step = (h) => { if (g.state === 'driving') { ai.control(h, { cars: [], me: null, state: 'free', time: performance.now() / 1000 }); if (ai.needsReset) { g.resetCar(); ai.resetAfterRecovery(); } } step(h); };
    g._fast = setInterval(() => { for (let i = 0; i < 720 && g.state === 'driving'; i++) g.step(1 / 360); }, 30);
  });
  await page.waitForFunction(() => isFinite(ApexDebug.game.session.bestLap) && ApexDebug.game.session.lapTime > 22, null, { timeout: 600000, polling: 1000 });
  await ev(() => clearInterval(ApexDebug.game._fast));
  await frames(3);
  const st = await ev(() => { const s = ApexDebug.game.session; return { laps: s.rec.laps.length, best: s.bestLap, sec: s.sectorState, ghost: !!(s.ghost && s.ghost.data.length), ghostVis: ApexDebug.game.ghost.root.visible }; });
  check('Runde gezeitet, Bestzeit gespeichert', st.laps >= 1 && isFinite(st.best), JSON.stringify(st));
  check('Ghost der Bestrunde fährt mit', st.ghost && st.ghostVis);
  const secCls = await ev(() => [0, 1, 2].map(k => document.getElementById('sec' + k).className));
  check('Sektoranzeige im HUD', secCls[0] !== '' , secCls.join(','));
  await ev(() => ApexDebug.game.setCamera('chaseFar')); await sleep(400); await frames(3);
  await shot('71_practice_ghost');
  // Draw-Calls messen (Testfahrt)
  const calls2 = await ev(() => ApexDebug.Render.renderer.info.render.calls);
  console.log('Draw-Calls Testfahrt:', calls2);
  // Track Limits: Auto neben die Strecke setzen
  const tl = await ev(() => new Promise(res => {
    const g = ApexDebug.game, v = g.vehicle, T = g.track;
    const s0 = v.trackS + 40; const j = Math.floor(s0 / T.ds) % T.N;
    g.step = (h) => { v.input.throttle = 0.5; v.input.brake = 0; v.input.steer = 0; v.step(h); g.session.step(h, v); };
    const p = T.poseAt(s0, T.HW[j] + 4.2); const sp = v.speed;
    v.placeAt(p.x, p.y, p.z, p.yaw); v.vel.set(-p.tx * 30 * 0, 0, 0);
    const t0 = performance.now(); let n = 0;
    const tick = () => { for (let i = 0; i < 90; i++) { v.input.throttle = 1; g.session.step(1 / 360, v); v.step(1 / 360); } if (++n > 60 || !g.session.lapValid) res({ valid: g.session.lapValid, viol: g.session.timing.violations, lw: v.limitWheels, spd: v.speed }); else setTimeout(tick, 10); };
    tick();
  }));
  check('Track Limits erkannt (Runde ungültig)', !tl.valid && tl.viol >= 1, JSON.stringify(tl));
  await ev(() => { const g = ApexDebug.game; g.step = g._origStep; });
  // Telemetrie
  await ev(() => ApexDebug.game.pause('Test')); await sleep(300);
  await clickText('Telemetrie'); await sleep(800);
  check('Telemetrie-Diagramme', await ev(() => document.querySelectorAll('.tele canvas').length === 5));
  await shot('72_telemetry');
  await clickText('Zurück'); await sleep(200);
  await clickText('Zum Hauptmenü'); await sleep(400);
  // Rennen: Draw-Calls mit vollem Feld
  await ev(() => { const S = ApexDebug.game.settings; S.race.laps = 1; S.race.opponents = 19; S.camera.mode = 'chaseNear'; });
  await clickText('Schnelles Rennen'); await sleep(200); await clickText('Rennen starten');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  await frames(4);
  const rc = await ev(() => { const i = ApexDebug.Render.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
  console.log('Draw-Calls Rennen (20 Autos, Startaufstellung):', JSON.stringify(rc));
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await T.browser.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
