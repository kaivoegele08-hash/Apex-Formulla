// Browsertest Lizenzmodus: Hub-Kachel, Lizenz-Bildschirm, Lizenzrennen starten (Feld nach iRating), Abbruch = Ausfall
const { launch } = require('./harness');
let bad = 0; const check = (n, c, i = '') => { if (!c) bad++; console.log((c ? 'OK   ' : 'FEHL ') + n + (i ? ' – ' + i : '')); };
(async () => {
  const T = await launch(), { page } = T;
  try {
    await T.open();
    await page.evaluate(() => { const S = ApexDebug.game.settings; S.graphics.autoQuality = false; S.graphics.preset = 'niedrig'; ApexDebug.Render.applyQuality(S.graphics); ApexDebug.game.resetLicense(); ApexDebug.UI.show('main', { noHistory: true }); });
    await T.frames(3); await T.shot('lic_hub');
    check('Hub-Kachel Lizenz-Rennen', await page.locator('text=Lizenz-Rennen').count() > 0);
    await page.locator('text=Lizenz-Rennen').first().click(); await T.frames(3);
    check('Lizenz-Bildschirm', await page.locator('#licenseScreen').count() === 1);
    check('F3 gesperrt für Rookie', await page.locator('text=Benötigt Klasse D').count() >= 1);
    await T.shot('lic_screen');
    // Lizenzrennen starten
    await page.locator('#licenseScreen button', { hasText: 'Rennen beitreten' }).first().click();
    await page.waitForFunction(() => ApexDebug.game.race && ApexDebug.game.state !== 'loading' && ApexDebug.game.race.entries.length === 16, null, { timeout: 240000 });
    const info = await page.evaluate(() => { const G = ApexDebug.game, r = G.race, P = G.raceParams(); return { lic: G.licenseRound, era: P.era, n: r.entries.length, strength: P.strength, grid: r.entries.slice().sort((a, b) => a.gridPos - b.gridPos).slice(0, 3).map(e => e.name) }; });
    check('Lizenzrennen läuft (F4, 16 Autos)', info.lic && info.era === 'f4' && info.n === 16, JSON.stringify(info));
    await T.sleep(4000); await T.shot('lic_race');
    // Rennen als gestartet markieren und verlassen → Ausfall-Wertung
    await page.evaluate(() => { const G = ApexDebug.game; G.license.pending = G.licEvent; G.saveLicense(); G.toMenu(); ApexDebug.UI.show('license', { noHistory: true }); });
    await T.frames(3);
    const h = await page.evaluate(() => ApexDebug.game.license.history[0]);
    check('Abbruch als Ausfall gewertet', h && h.retired && h.dIR < 0, h && `iR ${h.ir} (${h.dIR}), SR ${h.sr}`);
    // Saubere Rennen simulieren → Aufstieg sichtbar
    await page.evaluate(() => { const { License } = ApexDebug, p = ApexDebug.game.license; let sum; for (let k = 0; k < 5; k++) { ApexDebug.applyEra('f4'); const ev = License.makeEvent(p, 'f4cup'); sum = License.afterRace(p, ev, [{ e: { player: true }, name: 'Du' }].concat(ev.opp.map(o => ({ e: {}, name: o.name }))), 0, 6, 10, 'Kurstadt Ringpark'); } ApexDebug.game.saveLicense(); ApexDebug.UI.show('license', { noHistory: true, summary: sum }); });
    await T.frames(3); await T.shot('lic_result');
    check('Aufstieg auf D', await page.evaluate(() => ApexDebug.game.license.cats.formel.lvl === 1));
  } catch (e) { check('Ablauf', false, e.message); }
  for (const l of T.logs.filter(l => !/WebGL|GPU stall|swiftshader/i.test(l)).slice(0, 8)) console.log(l);
  await T.browser.close();
  console.log(bad ? `${bad} Fehler` : 'Alle Lizenz-Tests bestanden');
  process.exit(bad ? 1 : 0);
})();
