// Browsertest Phase 4: Box anfordern (Taste B), Autopilot durch die Boxengasse, Service, Safety Car, Flaggen, Pausemenü
const { launch } = require('./harness');
(async () => {
  const T = await launch({ width: 1440, height: 810 });
  const { page, frames, sleep, clickText, shot, logs } = T;
  let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
  const ev = (f, a) => page.evaluate(f, a);
  await T.open();
  await ev(() => { const S = ApexDebug.game.settings; S.game.track = 'falkenried'; S.graphics.autoQuality = false; S.race.laps = 4; S.race.opponents = 9; S.race.playerGrid = 'pole'; S.camera.mode = 'chaseNear'; S.game.compound = 'medium'; S.aids.autoShift = true; });
  await clickText('Schnelles Rennen'); await sleep(200); await clickText('Rennen starten');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  await ev(() => {
    const g = ApexDebug.game, race = g.race, me = race.player;
    const ai = new ApexDebug.AIDriver(me.vehicle, race.line, { skill: 0.97, aggression: 0.3, consistency: 1, reaction: 0.2 }, 4); ai.hold();
    const step = g.step.bind(g); window.__ev = [];
    ApexDebug.events.on('race:service', (e, t, info) => { if (e.player) window.__ev.push(['service', info.plan.compound, me.vehicle.compound]); });
    ApexDebug.events.on('race:pitentry', (e) => window.__ev.push(['entry']));
    g.step = (h) => { if (race.state === 'race' && ai.launchAt === Infinity) ai.launch(race.time); if (g.state === 'driving' && !me.pitPilot) ai.control(h, { cars: race.entries, me, state: race.state === 'race' ? 'race' : 'grid', time: race.time }); step(h); };
    window.__ff = (cond) => new Promise(res => { const id = setInterval(() => { for (let i = 0; i < 240; i++) { g.step(1 / 360); if (cond()) { clearInterval(id); res(); return; } } }, 15); });
  });
  await ev(() => window.__ff(() => { const r = ApexDebug.game.race; return r.state === 'race' && r.player.vehicle.trackS > 2500 && r.player.vehicle.trackS < 3000; }));
  await page.keyboard.press('KeyB'); await frames(3);
  const req = await ev(() => ({ plan: ApexDebug.game.race.player.pitPlan, box: document.getElementById('hudBox').textContent }));
  check('Box angefordert (Taste B)', !!req.plan && /BOX angefordert/.test(req.box), req.box);
  await ev(() => window.__ff(() => { const me = ApexDebug.game.race.player; return me.pitting && me.vehicle.inPitLane && me.pitPilot && me.pitPilot.pit && me.pitPilot.pit.phase === 'lane'; }));
  await ev(() => ApexDebug.game.setCamera('chaseFar')); await frames(4);
  await shot('90_boxengasse');
  const lane = await ev(() => ({ lim: ApexDebug.game.vehicle.pitLimiter, kmh: ApexDebug.game.vehicle.speedKmh, tower: document.getElementById('hudTower').innerHTML.includes('BOX') }));
  check('In der Boxengasse: Begrenzer aktiv, ≤ 81 km/h, BOX im Zeitenturm', lane.lim && lane.kmh <= 81 && lane.tower, JSON.stringify(lane));
  await ev(() => window.__ff(() => !ApexDebug.game.race.player.pitting));
  const svc = await ev(() => window.__ev);
  check('Service: neue Reifen laut Plan', svc.some(e => e[0] === 'service' && e[2] === 'hard'), JSON.stringify(svc));
  // Safety Car auslösen
  await ev(() => { ApexDebug.game.race._startSC('sc'); });
  await ev(() => window.__ff(() => { const r = ApexDebug.game.race; return r.sc && r.sc.t > 12; }));
  await ev(() => ApexDebug.game.setCamera('chaseFar')); await frames(4);
  const sc = await ev(() => ({ flag: ApexDebug.game.race.playerFlag, banner: document.getElementById('hudFlag').textContent, vis: !!(ApexDebug.game.scVis && ApexDebug.game.scVis.root.visible) }));
  check('Safety Car: Flagge, Banner, Fahrzeug', sc.flag === 'sc' && /Safety Car/i.test(sc.banner) && sc.vis, JSON.stringify(sc));
  await ev(() => window.__ff(() => { const r = ApexDebug.game.race, sc = r.sc && r.sc.car; if (!sc) return true; let d = sc.vehicle.trackS - r.player.vehicle.trackS; if (d < 0) d += r.track.length; return d < 60; }));
  await frames(4); await shot('91_safety_car');
  await ev(() => ApexDebug.game.pause('Test')); await sleep(400);
  check('Pausemenü mit Boxenstopp-Plan', await ev(() => /Boxenstopp-Plan/i.test(document.body.innerText) && /Pflichtstopp|Reifen:/i.test(document.body.innerText)));
  await shot('92_pause_boxenplan');
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await T.browser.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
