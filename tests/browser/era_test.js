// Browsertest Epochen: Auswahl im Menü, Fahrzeugdaten, Optik (Halo/Radstand), HUD ohne ERS, Rennen mit Epochen-Fahrerfeld
const { launch } = require('./harness');
(async () => {
  const T = await launch({ width: 1440, height: 810 });
  const { page, frames, sleep, clickText, shot, logs } = T;
  let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
  const ev = (f, a) => page.evaluate(f, a);
  await T.open();
  await ev(() => { const S = ApexDebug.game.settings; S.game.track = 'ringpark'; S.game.weather = 'dry'; S.graphics.autoQuality = false; S.race.laps = 3; S.race.opponents = 9; S.race.quali = false; S.camera.mode = 'chaseNear'; S.aids.autoShift = true; });
  await clickText('Schnelles Rennen'); await sleep(300);
  check('Epochen-Karte in der Rennvorbereitung', await ev(() => /Epoche/i.test(document.body.innerText) && /1990/.test(document.body.innerText) && /2026/.test(document.body.innerText)));
  await clickText('1990', 'div.chip'); await sleep(300);
  const e0 = await ev(() => ({ era: ApexDebug.game.settings.game.era, spec: ApexDebug.game && window.ApexDebug && ApexDebug.vehicle === null, txt: document.body.innerText }));
  check('1990 gewählt: Beschreibung und Kenndaten', e0.era === 'e1990' && /Sauger-Ära 1990/i.test(e0.txt) && /V12/i.test(e0.txt), e0.era);
  await shot('b0_epoche_1990_auswahl');
  await clickText('Rennen starten');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  await frames(10);
  const r = await ev(() => { const g = ApexDebug.game, v = g.vehicle, d = g.race.entries.map(e => e.name);
    return { name: v.spec.name, mass: v.spec.mass, gears: v.spec.gearbox.ratios.length, lim: v.spec.engine.limitRpm, ers: v.spec.ers.maxKW, aero: v.spec.aero.mode, halo: g.carVis.haloMesh.visible, drivers: d.slice(0, 4), ersPanel: getComputedStyle(document.getElementById('hudSocBar')).display, ersTxt: document.getElementById('hudErsMode').textContent }; });
  check('Rennen mit 1990er-Auto (V12, 6 Gänge, kein ERS, keine Aero, kein Halo)', r.name === 'AF-90' && r.gears === 6 && r.lim === 13800 && r.ers === 0 && r.aero === 'none' && r.halo === false, JSON.stringify(r));
  check('HUD ohne Energieanzeige', r.ersPanel === 'none' && /kein ERS/.test(r.ersTxt), r.ersTxt);
  check('Fahrerfeld der Epoche (nicht die 2026-Fahrer)', !r.drivers.includes('Sven Lindqvist') && !r.drivers.includes('Lukas Brenner'), r.drivers.join(', '));
  await ev(() => ApexDebug.game.setCamera('chaseFar')); await frames(6);
  await shot('b1_rennen_1990');
  // Fahren: Autos beschleunigen und schalten bis in den 6. Gang
  await ev(() => {
    const g = ApexDebug.game, race = g.race, me = race.player;
    const ai = new ApexDebug.AIDriver(me.vehicle, race.line, { skill: 0.97, aggression: 0.4, consistency: 1, reaction: 0.2 }, 4); ai.hold();
    const step = g.step.bind(g);
    g.step = (h) => { if (race.state === 'race' && ai.launchAt === Infinity) ai.launch(race.time); if (g.state === 'driving') ai.control(h, { cars: race.entries, me, state: race.state === 'race' ? 'race' : 'grid', time: race.time }); step(h); };
    window.__ff = (cond) => new Promise(res => { const id = setInterval(() => { for (let i = 0; i < 360; i++) { g.step(1 / 360); if (cond()) { clearInterval(id); res(); return; } } }, 10); });
  });
  let maxGear = 0, maxKmh = 0;
  await ev(() => window.__ff(() => { const r = ApexDebug.game.race; return r.state === 'race' && r.time - r.greenAt > 40; }));
  const r2 = await ev(() => { const g = ApexDebug.game; return { gear: g.vehicle.gear, kmh: g.vehicle.speedKmh, pos: g.race.player.pos, active: g.race.entries.filter(e => e.active && !e.retired).length }; });
  check('1990er-Rennen läuft (40 s nach dem Start)', r2.active >= 8 && r2.kmh > 30, JSON.stringify(r2));
  await frames(4); await shot('b2_rennen_1990_fahrt');
  // Zurück, 2017 und 2020 in der Garage
  await ev(() => ApexDebug.game.toMenu()); await sleep(200);
  for (const [id, name] of [['e2000', 'b3_garage_2000'], ['e2020', 'b4_garage_2020']]) {
    await ev((x) => ApexDebug.game.setEra(x), id); await frames(10); await shot(name);
  }
  const g2 = await ev(() => ({ era: ApexDebug.game.settings.game.era, spec: ApexDebug.game.garage && ApexDebug.game.garage.car ? ApexDebug.game.garage.car.haloMesh.visible : null }));
  check('Garage zeigt das Auto der Epoche (2020 mit Halo)', g2.era === 'e2020' && g2.spec === true, JSON.stringify(g2));
  await ev(() => ApexDebug.game.setEra('e2026'));
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await T.browser.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
