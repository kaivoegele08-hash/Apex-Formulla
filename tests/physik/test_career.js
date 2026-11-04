// Karriere: drei Saisons mit simulierten Ergebnissen – Fahrermarkt, Verträge, Beziehungen, Social Media, Speicherbarkeit
const c = Career.create({ name: 'Kai Tester', number: 8, nat: 'DEU', era: 'e2026', seed: 4242 });
console.log('Startangebote:', c.offers.map(o => `${Career.teamName(o.team)} (${(o.perf * 100).toFixed(0)} %, ${o.cond.text})`).join(' | '));
Career.sign(c, c.offers[0]);
let seed = 99; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
let bad = 0; const check = (n, ok, info = '') => { if (!ok) bad++; console.log((ok ? 'OK   ' : 'FEHL ') + n + (info ? ' – ' + info : '')); };
const seats = () => { const m = {}; for (const d of c.drivers) if (d.team) m[d.team] = (m[d.team] || 0) + 1; m[c.team] = (m[c.team] || 0) + 1; return m; };
for (let season = 1; season <= 3; season++) {
  const S = c.season;
  while (!Season.done(S)) {
    const ds = Career.raceDrivers(c);
    // Ergebnis: nach Fahrerstärke × Teamstärke mit Zufall, Spieler irgendwo
    const rows = ds.map(d => ({ e: { player: false }, name: d.name, team: d.team, retired: rnd() < 0.05, k: d.rating * d.trackGrip + rnd() * 0.12 }));
    rows.push({ e: { player: true }, name: c.me.name, team: c.team, retired: false, k: 0.8 * Career.grip(c, c.team) + rnd() * 0.15 + season * 0.03 });
    rows.sort((a, b) => (a.retired - b.retired) || (b.k - a.k));
    const others = ds.slice(0, 6).map(d => d.name);
    const log = { contacts: [{ name: others[0], sp: 7, fault: 'player' }, { name: others[1], sp: 3, fault: 'other' }], passes: [{ by: c.me.name, on: others[2] }, { by: others[2], on: c.me.name }, { by: c.me.name, on: others[2] }] };
    Career.afterRace(c, rows, { entry: rows[3].e }, log, TRACKS[S.tracks[S.round]].name);
    if (S.round === 1) { Career.playerPost(c, 'provoke', others[3]); Career.playerPost(c, 'praise', others[4]); Career.playerPost(c, 'thanksTeam'); }
    const mine = c.feed.find(p => p.from && !p.replied && p.aboutMe); if (mine) Career.replyTo(c, mine.id, rnd() < 0.5 ? 'freundlich' : 'kontra');
  }
  const hist = c.history[c.history.length - 1];
  console.log(`Saison ${hist.year}: ${Career.teamName(hist.team)} · WM-Platz ${hist.pos} (${hist.pts} Pkt.) · Weltmeister ${hist.champion} · Bedingung ${c.lastCond.met ? 'erfüllt' : 'verfehlt'} (${c.lastCond.text})`);
  console.log('  Angebote:', c.offers.map(o => `${Career.teamName(o.team)}${o.stay ? ' (läuft weiter)' : o.renewal ? ' (Verlängerung)' : ''}`).join(', '));
  check(`Saison ${season}: Phase Saisonende und mindestens ein Angebot`, c.phase === 'offseason' && c.offers.length >= 1);
  const teamsBefore = new Map(c.drivers.map(d => [d.name, d.team]));
  Career.nextSeason(c, c.offers[c.offers.length > 1 ? 1 : 0]);
  const moved = c.drivers.filter(d => teamsBefore.get(d.name) !== d.team && d.team).length;
  const st = seats(), wrong = Object.entries(st).filter(([t, n]) => n !== 2);
  check(`Saison ${season + 1}: alle Teams mit genau 2 Cockpits`, !wrong.length, wrong.map(([t, n]) => t + ':' + n).join(' '));
  const nums = c.drivers.filter(d => d.team).map(d => d.num).concat([c.me.number]);
  check(`Saison ${season + 1}: Startnummern eindeutig`, new Set(nums).size === nums.length);
  console.log(`  Fahrermarkt: ${moved} Wechsel, ${c.drivers.filter(d => d.retired).length} Rücktritte insgesamt, Team jetzt ${Career.teamName(c.team)}, Teamstärken ${Career.teamRank(c).slice(0, 3).map(t => Career.teamName(t) + ' ' + (c.teams[t].perf * 100).toFixed(0)).join(', ')}`);
}
const rels = Object.values(c.rel), feed = c.feed;
check('Beziehungen haben sich verändert (Freunde und Rivalen)', Math.min(...rels) < -30 && Math.max(...rels) > 10, `min ${Math.min(...rels)} max ${Math.max(...rels)}`);
check('Social Media: Beiträge von Fahrern, Team, Fans, Presse und Antworten', ['driver', 'team', 'fan', 'press', 'me'].every(k => feed.some(p => p.kind === k)) && feed.some(p => p.replies.length >= 2), `${feed.length} Beiträge`);
check('Fahrerwechsel während der Saison oder Transfers in der Presse', feed.some(p => /Fahrerwechsel|ersetzt|wechselt|unterschreibt|Neuling/.test(p.text)));
const json = JSON.stringify(c); const c2 = JSON.parse(json);
check('Spielstand speicherbar', c2.seasonNo === c.seasonNo && json.length < 400000, (json.length / 1024).toFixed(0) + ' KB');
console.log('Beispiel-Beiträge:'); for (const p of feed.slice(0, 6)) console.log(`  [${p.kind}] ${p.author} ${p.handle}: ${p.text} (${p.likes} ♥, ${p.replies.length} Antworten)`);
// Rennfeld aus der Karriere → RaceSession (Teamstärke/Beziehung kommen an)
const T = new TrackModel(TRACKS.ringpark), line = new RacingLine(T);
const field = buildField({ playerTeam: c.team, playerName: c.me.name, playerNumber: c.me.number, drivers: Career.raceDrivers(c) });
const race = new RaceSession({ track: T, line, laps: 1, entries: field, damage: 'full' });
const enemy = race.entries.find(e => !e.player && e.ai.relPlayer < -0.2);
check('Rennen: 20 Autos, Teamstärke und Beziehung gesetzt', race.entries.length === 20 && race.entries.some(e => e.vehicle.trackGrip && e.vehicle.trackGrip !== 1) && !!enemy, enemy ? `${enemy.name} rel ${enemy.ai.relPlayer.toFixed(2)}` : '');
console.log(bad ? 'FEHLER' : 'OK');
