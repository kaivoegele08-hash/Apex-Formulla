// Browsertest Phase 6: Wiederholung (Aufzeichnung, Abspielen, Spulen, Kameras, Regie), Reifenspuren, Detailstufen, Nachbearbeitung
const { launch } = require('./harness');
(async () => {
  const T = await launch({ width: 1440, height: 810 });
  const { page, frames, sleep, clickText, shot, logs } = T;
  let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
  const ev = (f, a) => page.evaluate(f, a);
  await T.open();
  await ev(() => { const S = ApexDebug.game.settings; S.game.track = 'ringpark'; S.game.weather = 'dry'; S.graphics.autoQuality = false; S.race.laps = 3; S.race.opponents = 9; S.race.quali = false; S.race.playerGrid = 'middle'; S.camera.mode = 'chaseNear'; S.aids.autoShift = true; });
  await clickText('Schnelles Rennen'); await sleep(200); await clickText('Rennen starten');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  await ev(() => {
    const g = ApexDebug.game, race = g.race, me = race.player;
    const ai = new ApexDebug.AIDriver(me.vehicle, race.line, { skill: 0.97, aggression: 0.5, consistency: 1, reaction: 0.2 }, 4); ai.hold();
    const step = g.step.bind(g);
    g.step = (h) => { if (race.state === 'race' && ai.launchAt === Infinity) ai.launch(race.time); if (g.state === 'driving') ai.control(h, { cars: race.entries, me, state: race.state === 'race' ? 'race' : 'grid', time: race.time }); if (window.__lock) { const v = me.vehicle; v.aids.abs = false; v.input.brake = 1; v.input.throttle = 0; } step(h); };
    window.__ff = (cond) => new Promise(res => { const id = setInterval(() => { for (let i = 0; i < 360; i++) { g.step(1 / 360); if (cond()) { clearInterval(id); res(); return; } } g._recordExtras(1); }, 10); });
  });
  await ev(() => window.__ff(() => { const r = ApexDebug.game.race; return r.state === 'race' && r.time - r.greenAt > 45; }));
  const rec = await ev(() => { const R = ApexDebug.game.replay; return { n: R.n, frames: R.frames, len: R.length, mb: R.bytes / 1e6, ev: R.events.length }; });
  check('Aufzeichnung läuft (alle Autos + Safety Car)', rec.n === 11 && rec.len > 45 && rec.frames > 600, JSON.stringify(rec));
  // Reifenspuren: Vollbremsung ohne ABS
  await ev(() => window.__ff(() => ApexDebug.game.vehicle.speedKmh > 200));
  const sk0 = await ev(() => ApexDebug.game.skids.count);
  await ev(() => { window.__lock = true; });
  await ev(() => { const g = ApexDebug.game; for (let k = 0; k < 150 && g.vehicle.speed > 3; k++) { for (let i = 0; i < 6; i++) g.step(1 / 360); g._updateVisuals(1 / 60, 1); } });
  await ev(() => { window.__lock = false; });
  await frames(4);
  const sk1 = await ev(() => ({ n: ApexDebug.game.skids.count, locked: ApexDebug.game.vehicle.wheels.some(w => w.locked) }));
  check('Reifenspuren bei blockierenden Rädern', sk1.n > sk0 + 5, `${sk0} → ${sk1.n}`);
  await ev(() => { const g = ApexDebug.game; g.setCamera('heli'); }); await frames(8);
  await shot('a5_reifenspuren');
  // Nachbearbeitung und Detailstufen
  const gfx = await ev(() => { const R = ApexDebug.Render, g = ApexDebug.game; return { post: !!R.composer, lods: g.raceVis.map(r => r.vis._lod).join(''), q: R.quality.post }; });
  check('Nachbearbeitung aktiv (Hoch), Detailstufen gesetzt', gfx.post && /[012]/.test(gfx.lods) && /2/.test(gfx.lods), JSON.stringify(gfx));
  await ev(() => ApexDebug.game.pause('Test')); await sleep(300);
  check('Pausemenü: Wiederholung', await ev(() => /Wiederholung/i.test(document.body.innerText)));
  await clickText('Wiederholung'); await frames(8);
  const r0 = await ev(() => { const g = ApexDebug.game; return { st: g.state, bar: !document.getElementById('replay').classList.contains('hidden'), cam: g.camMode, t: g.rp.t, tower: document.getElementById('replayTower').innerText.split('\n').length }; });
  check('Wiederholung offen: Leiste, TV-Kamera, Positionsliste', r0.st === 'replay' && r0.bar && r0.cam === 'tv' && r0.tower > 10, JSON.stringify(r0));
  // Abspielen: Autos bewegen sich, Spielerauto folgt der Aufzeichnung (nicht dem Live-Zustand)
  const p0 = await ev(() => ApexDebug.game.carVis.root.position.clone());
  await sleep(1200); await frames(4);
  const r1 = await ev(() => { const g = ApexDebug.game; return { t: g.rp.t, pos: g.carVis.root.position.clone(), live: g.vehicle.pos }; });
  const moved = Math.hypot(r1.pos.x - p0.x, r1.pos.z - p0.z);
  check('Wiedergabe läuft (Zeit und Position ändern sich)', r1.t > r0.t + 0.2 && moved > 3, `Δt ${(r1.t - r0.t).toFixed(2)} s, ${moved.toFixed(1)} m`);
  await shot('a0_replay_tv');
  // Zum Start springen, Regie, Helikopter, Zeitlupe
  await ev(() => { const g = ApexDebug.game; g.replaySeekTo(g.race.greenAt + 1.5); g.replayAuto(true); g.setCamera('heli'); g.replaySpeed(0.5); });
  await sleep(900); await frames(4);
  await shot('a1_replay_heli_start');
  const r2 = await ev(() => { const g = ApexDebug.game; return { t: g.rp.t - g.race.greenAt, speed: g.rp.speed, info: document.getElementById('rpInfo').textContent }; });
  check('Spulen zum Start, Zeitlupe', r2.t > 1.4 && r2.t < 3 && /Zeitlupe/.test(r2.info), JSON.stringify(r2));
  for (const [cam, name] of [['chaseFar', 'a2_replay_verfolger'], ['tcam', 'a3_replay_tcam']]) { await ev((c) => { ApexDebug.game.replaySpeed(1); ApexDebug.game.setCamera(c); ApexDebug.game.replayFollow(1); }, cam); await sleep(600); await frames(4); await shot(name); }
  // Zeitleiste anklicken
  const tl = await page.locator('#replay .rtl').boundingBox();
  await page.mouse.click(tl.x + tl.width * 0.5, tl.y + tl.height / 2); await frames(3);
  const r3 = await ev(() => { const g = ApexDebug.game, R = g.replay; return (g.rp.t - R.start) / R.length; });
  check('Klick auf die Zeitleiste springt', Math.abs(r3 - 0.5) < 0.06, r3.toFixed(3));
  // Beenden → Pause → Weiterfahren
  await page.keyboard.press('Escape'); await page.waitForFunction(() => ApexDebug.game.state === 'paused', null, { timeout: 15000 }).catch(() => { }); await sleep(300);
  const r4 = await ev(() => ({ st: ApexDebug.game.state, ui: ApexDebug.UI.current, bar: document.getElementById('replay').classList.contains('hidden') }));
  check('Esc beendet die Wiederholung → Pausemenü', r4.st === 'paused' && r4.ui === 'pause' && r4.bar, JSON.stringify(r4));
  await ev(() => ApexDebug.game.resume()); await frames(6);
  const r5b = await ev(() => { const g = ApexDebug.game, p = g.carVis.root.position, v = g.vehicle.pos; return { st: g.state, d: Math.hypot(p.x - v.x, p.z - v.z), rec: g.replay.frames }; });
  check('Live-Rennen läuft weiter, Auto wieder am echten Ort', r5b.st === 'driving' && r5b.d < 2, JSON.stringify(r5b));
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await T.browser.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
