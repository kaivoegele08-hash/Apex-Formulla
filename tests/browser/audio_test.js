// Browsertest: physikalisches Motormodell (AudioWorklet aus Blob) lädt, klingt, lässt sich umschalten
const { launch } = require('./harness');
(async () => {
  const T = await launch();
  const { page, frames, sleep, clickText, logs } = T;
  let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
  await T.open();
  await page.mouse.click(5, 5); await sleep(1500);   // Nutzergeste → Audio entsperren, Worklet laden
  const st = await page.evaluate(() => { const e = ApexDebug.AudioSys.engine; return { ctx: ApexDebug.AudioSys.ctx && ApexDebug.AudioSys.ctx.state, model: !!(e && e.model), use: !!(e && e.useModel) }; });
  check('AudioWorklet-Motormodell geladen', st.model && st.use, JSON.stringify(st));
  await clickText('Testfahrt'); await frames(2); await clickText('Losfahren');
  await page.waitForFunction(() => ApexDebug.game.state === 'driving', null, { timeout: 180000 });
  await page.evaluate(() => {
    const A = ApexDebug.AudioSys, e = A.engine, an = A.ctx.createAnalyser(); an.fftSize = 2048; e.out.connect(an); window.__an = an;
    window.__lvl = () => { const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); };
  });
  // Mittelwert über 2 s (einzelne Messungen fallen sonst zufällig auf Schaltvorgänge)
  await page.evaluate(() => { window.__avg = async (ms) => { let s = 0, n = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { const r = window.__lvl(); s += r * r; n++; await new Promise(r => setTimeout(r, 40)); } return Math.sqrt(s / n); }; });
  await page.keyboard.down('ArrowUp'); await sleep(800);
  const lv = await page.evaluate(async () => ({ rms: await window.__avg(2000), rpm: ApexDebug.vehicle.rpm, p: ApexDebug.AudioSys.engine.pRpm.value }));
  check('Motormodell erzeugt Klang beim Fahren', lv.rms > 0.01 && lv.rms < 1, `rms ${lv.rms.toFixed(3)} bei ${lv.rpm.toFixed(0)} U/min (Parameter ${lv.p.toFixed(0)})`);
  await page.keyboard.up('ArrowUp');
  await page.evaluate(() => { const S = ApexDebug.game.settings.audio; S.engineModel = 'synth'; ApexDebug.AudioSys.setVolumes(S); });
  await sleep(300);
  check('Umschalten auf einfache Synthese', await page.evaluate(() => !ApexDebug.AudioSys.engine.useModel));
  console.log('--- Konsole ---'); console.log(logs.length ? logs.join('\n') : '(keine)');
  await T.browser.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FEHLER', e); process.exit(1); });
