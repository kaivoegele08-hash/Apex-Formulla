// ============================================================================
//  KARRIERE – eigener Fahrer über mehrere Saisons: Teams mit wechselnder
//  Stärke, Verträge mit Bedingungen, Fahrermarkt (auch für die KI), Beziehungen
//  zu jedem KI-Fahrer (wirken auf der Strecke) und Social Media.
//  Reine Datenlogik ohne DOM → in Node testbar (tests/physik/test_career.js).
// ============================================================================

const CAREER_V = 1;
const PERSONALITIES = {
  freundlich: { name: 'freundlich', reply: 1.0, temper: 0.3, ego: 0.3 },
  ehrgeizig:  { name: 'ehrgeizig',  reply: 0.6, temper: 0.6, ego: 0.8 },
  hitzkopf:   { name: 'Hitzkopf',   reply: 0.4, temper: 1.0, ego: 0.7 },
  cool:       { name: 'cool',       reply: 0.7, temper: 0.2, ego: 0.5 },
  spassvogel: { name: 'Spaßvogel',  reply: 0.9, temper: 0.4, ego: 0.4 },
};
const PERS_KEYS = Object.keys(PERSONALITIES);
const ROOKIE_FIRST = ['Luca', 'Noah', 'Elias', 'Mats', 'Theo', 'Jonas', 'Leon', 'Milan', 'Oskar', 'Rafael', 'Hugo', 'Emil', 'Nico', 'Arvid', 'Tiago', 'Kenta', 'Liam', 'Aaron', 'Matteo', 'Finn'];
const ROOKIE_LAST = ['Brandauer', 'Silvestri', 'Kowalczyk', 'Lindgren', 'Arcand', 'Hollis', 'Vasquez', 'Okonkwo', 'Takeda', 'Riedl', 'Moreau', 'Halvorsen', 'Costa', 'Weidner', 'Ferreira', 'Ivanko', 'Delaunay', 'Sato', 'Bramwell', 'Engström'];
const ROOKIE_NAT = ['DEU', 'ITA', 'POL', 'SWE', 'FRA', 'GBR', 'ESP', 'NGA', 'JPN', 'AUT', 'FRA', 'NOR', 'BRA', 'DEU', 'PRT', 'UKR', 'BEL', 'JPN', 'GBR', 'SWE'];

function careerRng(c) {
  // Zustand im Spielstand → reproduzierbar und speicherbar
  return () => { c.rs = (c.rs * 16807) % 2147483647; return c.rs / 2147483647; };
}
function handleOf(name) {
  return '@' + String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

// ---------------------------------------------------------------------------
//  Textbausteine Social Media (frei erfunden; {me} = Spieler-Handle)
// ---------------------------------------------------------------------------
const POSTS = {
  win: ['Was für ein Rennen in {track}! Danke Team, das war perfekt. 🏆', 'Sieg in {track}! Genau dafür arbeiten wir jeden Tag.', 'P1 in {track} – unglaublich. Feiern, dann weiter!', '{track}, du warst gut zu mir. Sieg! 🍾'],
  podium: ['Podium in {track}, starke Punkte für das Team.', 'P{pos} in {track} – wir kommen näher.', 'Schönes Gefühl, wieder auf dem Podest zu stehen.'],
  bad: ['Schwieriger Tag in {track}. Wir analysieren und kommen stärker zurück.', '{track} lief nicht nach Plan. Kopf hoch.', 'Nicht unser Wochenende. Weiter geht’s.'],
  angryContact: ['Danke für nichts, {me}. Wer so bremst, gehört nicht nach vorne.', '{me} hat mein Rennen ruiniert. Unglaublich.', 'Manche lernen es nie… {me}, schau mal in die Spiegel.', 'Das war kein Racing, {me}. Das war Kegeln.'],
  calmContact: ['Kontakt mit {me} in {track} – kann passieren, Rennunfall.', 'Schade um die Kollision mit {me}. Abhaken.'],
  sorryContact: ['Mein Fehler gegen {me} heute, sorry dafür.', 'Das ging auf meine Kappe, {me}. Entschuldige.'],
  goodFight: ['Starker Zweikampf mit {me} heute – hart, aber fair. 👊', 'Mit {me} kämpft man gerne Rad an Rad. Respekt!', 'Das Duell mit {me} hat richtig Spaß gemacht.'],
  rivalJab: ['Man sieht sich, {me}. Nächstes Mal bin ich vorne.', '{me} hatte heute Glück. Mal sehen, wie lange noch.'],
  teamGood: ['Starke Leistung von {mename} heute: P{pos} in {track}! 💪', 'Großartige Arbeit, {mename}. P{pos} – so geht’s weiter!'],
  teamBad: ['Schwieriges Rennen für {mename} in {track}. Wir arbeiten an der Pace.', 'P{pos} für {mename} – nicht das, was wir wollten. Wir analysieren.'],
  teamWarn: ['Wir erwarten mehr. Die nächsten Rennen sind wichtig für alle im Team.', 'Die Ergebnisse müssen besser werden – auf allen Positionen.'],
  fanGood: ['{mename} war heute der Wahnsinn!!! 🔥', 'Bester Fahrer im Feld, wer sagt was anderes? {me}', 'Mein Fahrer des Tages: {mename} 💯', 'So überholt man! {me} 😍'],
  fanBad: ['Was war das heute, {me}? 😬', '{mename} braucht ein besseres Auto. Oder bessere Bremspunkte 🤔', 'Kommt schon {me}, wir glauben an dich… noch.'],
  fanDrama: ['Popcorn ist bereit 🍿 {me} gegen {other} geht weiter', 'Die Social-Media-Fehde zwischen {mename} und {other} ist besser als jedes Rennen 😂'],
  pressWin: ['{winner} gewinnt in {track} – {wteam} jubelt.', 'Rennbericht {track}: {winner} siegt, {me2} wird {mepos}.', '{track}: Sieg für {winner}. Spannung in der Meisterschaft!'],
  pressLead: ['WM-Stand: {leader} führt mit {lpts} Punkten.', '{leader} baut die WM-Führung aus ({lpts} Pkt.).'],
  pressRumor: ['Gerüchte: {team} soll Interesse an {who} haben.', 'Fahrermarkt: {who} im Gespräch mit {team}?', 'Insider: {team} sucht für die nächste Saison einen neuen Fahrer.'],
  pressSwap: ['Offiziell: {team} ersetzt {out} durch {in} – mit sofortiger Wirkung.', 'Fahrerwechsel bei {team}: {in} übernimmt das Cockpit von {out}.'],
  pressMove: ['{who} wechselt zur neuen Saison zu {team}.', 'Transfer: {who} unterschreibt bei {team}.'],
  pressRetire: ['{who} beendet die Karriere. Danke für die Jahre!'],
  pressRookie: ['Neuling {who} bekommt ein Cockpit bei {team}.'],
  pressChamp: ['{who} ist Weltmeister! 🏆', 'Titel entschieden: {who} gewinnt die Meisterschaft.'],
  // Antworten der KI auf Beiträge des Spielers
  replyNice: ['Danke {me}, gleichfalls! 🙏', 'Respekt zurück, {me}.', 'Freut mich, {me}. Bis zum nächsten Duell!'],
  replyCool: ['Ok.', 'Wir sehen uns auf der Strecke.', '👍'],
  replyAngry: ['Große Worte, {me}. Auf der Strecke sieht das anders aus.', 'Sagt der Richtige, {me}. 🙄', 'Kümmer dich um dein eigenes Rennen, {me}.'],
  replyFunny: ['😂 {me}, du hast es echt drauf', 'Ich bring Popcorn mit, {me} 🍿', 'Haha, abgemacht {me}!'],
};
// Was der Spieler posten kann
const MY_POSTS = {
  thanksTeam: { label: 'Dem Team danken', text: ['Danke an das ganze Team für die harte Arbeit! 💪 {team}', 'Ohne die Jungs und Mädels in der Box wäre das nicht möglich. Danke!'], team: 4, fans: 1.01, rep: 0 },
  blameTeam: { label: 'Auto kritisieren', text: ['Das Auto war heute nicht konkurrenzfähig. Da muss mehr kommen.', 'Ich gebe alles – aber mit diesem Paket ist nicht mehr drin.'], team: -12, fans: 1.02, rep: -1 },
  confident: { label: 'Selbstbewusst ankündigen', text: ['Nächstes Rennen hole ich das Podium. Versprochen. 🔥', 'Ich bin bereit. Nächstes Wochenende greifen wir an!'], team: 1, fans: 1.03, rep: 0, claim: true },
  humble: { label: 'Bescheiden bleiben', text: ['Schritt für Schritt. Wir arbeiten weiter.', 'Viel gelernt dieses Wochenende. Weiter geht’s.'], team: 2, fans: 1.005, rep: 1 },
  fans: { label: 'Fans danken', text: ['Danke für eure Unterstützung, ihr seid die Besten! ❤️', 'Was für eine Stimmung an der Strecke – danke an alle Fans!'], team: 0, fans: 1.04, rep: 1 },
  praise: { label: 'Fahrer loben', target: true, text: ['Respekt an {t} – harter, fairer Kampf heute. 👊', 'Großes Rennen von {t}. Verdient!'], rel: 9, fans: 1.01, rep: 1 },
  provoke: { label: 'Fahrer provozieren', target: true, text: ['{t} sollte mal üben, wie man Spiegel benutzt. 🙄', 'Nächstes Mal bin ich vor {t}. Wetten? 😏', '{t} fährt, als würde die Strecke ihm gehören.'], rel: -16, fans: 1.05, rep: -2 },
  joke: { label: 'Spaß mit Fahrer', target: true, text: ['{t}, Revanche beim Kartfahren? 😄', 'Wer verliert, zahlt das Essen, {t}! 🍕'], rel: 5, fans: 1.02, rep: 0 },
};
const REPLY_TONES = { freundlich: { label: 'Freundlich', rel: 5, fans: 1.005, text: ['Danke! 🙏', 'Gerne wieder – war ein schöner Kampf.', 'Respekt zurück!'] }, neutral: { label: 'Neutral', rel: 0, fans: 1.0, text: ['Abgehakt. Fokus aufs nächste Rennen.', 'Wir sehen uns auf der Strecke.'] }, kontra: { label: 'Kontern', rel: -9, fans: 1.03, text: ['Komm erst mal an mir vorbei. 😏', 'Sagt der Richtige…', 'Spar dir die Worte für die Strecke.'] } };

const Career = {
  /** Neue Karriere: Fahrer, Epoche, Einstellungen. Fahrerfeld aus der Epoche mit Alter und Persönlichkeit */
  create({ name = 'Du', number = 77, nat = 'DEU', era = 'e2026', strength = 1, distance = 'short', quali = true, qualiMin = 10, weather = 'random', seed = Date.now() % 2147483646 + 1 } = {}) {
    const c = { v: CAREER_V, created: Date.now(), rs: Math.max(1, seed | 0), era, settings: { strength, distance, quali, qualiMin, weather },
      me: { name, number, nat, rep: 18, fans: 4800, handle: handleOf(name) }, team: null, contract: null, teamRel: 10,
      seasonNo: 1, year: Math.max(eraOf(era).year, 1990), phase: 'pick', season: null, drivers: [], teams: {}, rel: {}, feed: [], nextPost: 1,
      history: [], offers: [], claims: [], stats: { races: 0, wins: 0, podiums: 0, poles: 0, titles: 0, points: 0 }, pendingReplies: [] };
    const rng = careerRng(c);
    applyEra(era);
    // Teamstärke aus der Stärke der eingebauten Fahrer ableiten (Reihenfolge der Teams = Hierarchie)
    TEAMS.forEach((t, i) => { const base = clamp(0.92 - i * 0.075 + (rng() - 0.5) * 0.08, 0.15, 0.97); c.teams[t.id] = { perf: base, budget: base, pts: 0 }; });
    c.drivers = DRIVERS.map(d => ({ name: d.name, nat: d.nat, num: d.num, team: d.team, rating: d.rating, aggression: d.aggression, age: 20 + Math.floor(rng() * 16), pers: pick(rng, PERS_KEYS), until: 1 + Math.floor(rng() * 3), handle: handleOf(d.name), pts: 0 }));
    for (const d of c.drivers) if (d.num === number) d.num = 100 - number || 99;
    for (const d of c.drivers) c.rel[d.name] = Math.round((rng() - 0.5) * 20);
    for (let k = 0; k < 4; k++) c.drivers.push(this._rookie(c, rng));
    c.offers = this.startOffers(c);
    return c;
  },
  _rookie(c, rng) {
    let name = ''; for (let k = 0; k < 20 && (!name || c.drivers.some(d => d.name === name)); k++) { const i = Math.floor(rng() * ROOKIE_FIRST.length); name = ROOKIE_FIRST[i] + ' ' + pick(rng, ROOKIE_LAST); }
    let num = 0; while (!num || num === c.me.number || c.drivers.some(d => d.num === num)) num = 2 + Math.floor(rng() * 97);
    const d = { name, nat: pick(rng, ROOKIE_NAT), num, team: null, rating: +(0.5 + rng() * 0.2).toFixed(2), aggression: +(0.3 + rng() * 0.6).toFixed(2), age: 18 + Math.floor(rng() * 4), pers: pick(rng, PERS_KEYS), until: 0, handle: handleOf(name), pts: 0, rookie: true };
    c.rel[d.name] = 0;
    return d;
  },
  teamRank(c) { return Object.entries(c.teams).filter(([id]) => TEAMS.some(t => t.id === id)).sort((a, b) => b[1].perf - a[1].perf).map(([id]) => id); },
  teamName(id) { const t = TEAMS.find(x => x.id === id); return t ? t.name : id; },
  /** Erwartete WM-Position eines Teams (zwei Autos je Team) */
  expectation(c, team) { const r = this.teamRank(c).indexOf(team); return clamp(2 * r + 1, 1, 18); },
  /** Angebote zum Start: die drei schwächsten Teams, jeweils mit Bedingung */
  startOffers(c) {
    const rank = this.teamRank(c), rng = careerRng(c);
    return rank.slice(-3).reverse().map(team => this._offer(c, team, rng, true));
  },
  _offer(c, team, rng, first = false) {
    const exp = this.expectation(c, team), mate = c.drivers.find(d => d.team === team);
    const conds = [
      { type: 'beatMate', text: `Vor deinem Teamkollegen in der WM (${mate ? mate.name : 'Teamkollege'})` },
      { type: 'position', value: Math.min(19, exp + 1), text: `Mindestens WM-Platz ${Math.min(19, exp + 1)}` },
      { type: 'points', value: Math.max(5, Math.round((22 - exp) * 3.5)), text: `Mindestens ${Math.max(5, Math.round((22 - exp) * 3.5))} WM-Punkte` },
    ];
    return { team, years: first ? 2 : 1 + Math.floor(rng() * 3), salary: Math.round(300 + c.teams[team].perf * 4000 + c.me.rep * 30), cond: pick(rng, conds), perf: c.teams[team].perf, mate: mate ? mate.name : '' };
  },
  /** Angebot annehmen (Start oder Saisonende): Cockpit frei machen, Vertrag setzen */
  sign(c, offer) {
    if (c.team && c.team !== offer.team) { c.teamRel = 5; }
    const seat = c.drivers.filter(d => d.team === offer.team).sort((a, b) => a.rating - b.rating);
    if (seat.length >= 2) { const out = seat[0]; out.team = null; out.until = 0; this.post(c, 'press', 'Presse', fill(pick(careerRng(c), POSTS.pressSwap), { team: this.teamName(offer.team), out: out.name, in: c.me.name })); }
    c.team = offer.team; c.contract = { team: offer.team, until: c.seasonNo + offer.years - 1, cond: offer.cond, salary: offer.salary };
    c.offers = [];
    // Verwaistes Cockpit im alten Team füllen
    this._fillSeats(c, careerRng(c));
    if (c.phase === 'pick') this.newSeason(c);
  },
  /** Freie Cockpits: Teams nach Stärke wählen aus freien Fahrern (Bewertung) – Neulinge füllen auf */
  _fillSeats(c, rng, news = false) {
    const rank = this.teamRank(c);
    for (const team of rank) {
      const need = 2 - c.drivers.filter(d => d.team === team).length - (c.team === team ? 1 : 0);
      for (let k = 0; k < need; k++) {
        let free = c.drivers.filter(d => !d.team && !d.retired);
        if (free.length < 3) { c.drivers.push(this._rookie(c, rng)); free = c.drivers.filter(d => !d.team && !d.retired); }
        free.sort((a, b) => (b.rating + 0.002 * b.pts) - (a.rating + 0.002 * a.pts));
        // Spitzenteams nehmen den Besten, kleine Teams auch mal einen Neuling
        const d = c.teams[team].perf < 0.45 && rng() < 0.35 ? free.find(x => x.rookie) || free[0] : free[0];
        d.team = team; d.until = c.seasonNo + Math.floor(rng() * 3);
        if (news) this.post(c, 'press', 'Presse', fill(pick(rng, d.rookie ? POSTS.pressRookie : POSTS.pressMove), { who: d.name, team: this.teamName(team) }));
        d.rookie = false;
      }
    }
  },
  /** Saisonstart: Kalender, Saisonobjekt (Punkte wie die Meisterschaft), Ziel */
  newSeason(c) {
    const S = c.settings;
    c.season = Season.create({ tracks: TRACK_ORDER.slice(), distance: S.distance, quali: S.quali, qualiMin: S.qualiMin, weather: S.weather, strength: S.strength, team: c.team, playerName: c.me.name, number: c.me.number, era: c.era });
    for (const d of c.drivers) d.pts = 0;
    for (const t of Object.values(c.teams)) t.pts = 0;
    c.goal = this.expectation(c, c.team);
    c.phase = 'season'; c.claims = [];
    this.post(c, 'team', this.teamName(c.team), `Willkommen zur Saison ${c.year}! Unser Ziel: WM-Platz ${c.goal} oder besser. 🚀`, { team: c.team });
    this.post(c, 'press', 'Presse', `Saisonvorschau ${c.year}: ${this.teamName(this.teamRank(c)[0])} gilt als Favorit, ${c.me.name} startet für ${this.teamName(c.team)}.`);
  },
  /** Fahrerfeld für das nächste Rennen (ohne Spieler): Teamstärke als Haftungsfaktor, Beziehung zum Spieler */
  raceDrivers(c) {
    return c.drivers.filter(d => d.team && TEAMS.some(t => t.id === d.team)).map(d => ({ name: d.name, nat: d.nat, num: d.num, team: d.team, rating: d.rating, aggression: d.aggression,
      trackGrip: this.grip(c, d.team), relPlayer: clamp((c.rel[d.name] || 0) / 100, -1, 1) }));
  },
  /** Teamstärke → Haftungsfaktor ±1,5 % (macht Teams spürbar unterschiedlich, ohne die Physik zu verbiegen) */
  grip(c, team) { const p = c.teams[team] ? c.teams[team].perf : 0.5; return 0.985 + 0.03 * p; },
  relOf(c, name) { return c.rel[name] || 0; },
  addRel(c, name, d) { if (!name || name === c.me.name) return; c.rel[name] = clamp(Math.round((c.rel[name] || 0) + d), -100, 100); },
  driver(c, name) { return c.drivers.find(d => d.name === name); },
  post(c, kind, author, text, o = {}) {
    const rng = careerRng(c), fanF = Math.max(1, c.me.fans / 1000);
    const p = { id: c.nextPost++, season: c.seasonNo, round: c.season ? c.season.round : 0, kind, author, handle: o.handle || (kind === 'press' ? '@apex_news' : kind === 'team' ? handleOf(author) : kind === 'fan' ? '@' + pick(rng, ['speedfan', 'kurvenkoenig', 'boxenfunk', 'pitlane_paula', 'apex_ultra', 'v12_liebe', 'zielflagge']) + Math.floor(rng() * 99) : handleOf(author)),
      text, likes: Math.round((kind === 'me' ? fanF * (8 + rng() * 25) : 20 + rng() * 400) * (o.boost || 1)), replies: [], aboutMe: !!o.aboutMe, from: o.from || null, replied: false, team: o.team || null, tone: o.tone || 0 };
    c.feed.unshift(p); if (c.feed.length > 160) c.feed.length = 160;
    return p;
  },
  /**
   * Rennen auswerten. cls = race.classification() (Zeilen mit e.player), log = { contacts: [{ name, sp, fault }], passes: [{ by, on }], pole }
   */
  afterRace(c, cls, fastest, log, trackName) {
    const rng = careerRng(c), S = c.season, me = c.me;
    const order = Season.award(S, S.tracks[S.round], cls, fastest);
    const myRow = order.find(r => r.player), pos = myRow ? myRow.pos : 20, winner = order[0];
    c.stats.races++; if (pos === 1 && !myRow.retired) c.stats.wins++; if (pos <= 3 && !myRow.retired) c.stats.podiums++; if (log.pole) c.stats.poles++;
    c.stats.points += myRow ? myRow.pts : 0;
    // Punkte der KI-Fahrer und Teams für den Fahrermarkt
    for (const r of order) { if (r.player) { c.teams[c.team].pts += r.pts; continue; } const d = this.driver(c, r.name); if (d) { d.pts += r.pts; if (c.teams[d.team]) c.teams[d.team].pts += r.pts; } }
    const ctx = { track: trackName, me: me.handle, mename: me.name, pos, winner: winner.player ? me.name : winner.name, wteam: this.teamName(winner.team), me2: me.name, mepos: myRow && myRow.retired ? 'ausgeschieden' : `P${pos}` };
    // Ruf, Fans, Teamstimmung nach Ergebnis gegenüber dem Teamziel
    const delta = myRow && myRow.retired ? -3 : c.goal - pos;
    c.teamRel = clamp(c.teamRel + clamp(delta * 1.5, -6, 8), -100, 100);
    me.rep = clamp(me.rep + (pos === 1 ? 5 : pos <= 3 ? 3 : pos <= 10 ? 1 : -0.5) + clamp(delta * 0.3, -1, 1), 0, 100);
    me.fans = Math.round(me.fans * (1 + (pos === 1 ? 0.08 : pos <= 3 ? 0.04 : pos <= 10 ? 0.012 : 0.002)));
    // Ankündigungen („Podium nächstes Rennen“) einlösen
    for (const cl of c.claims) { if (pos <= 3 && !myRow.retired) { me.rep = clamp(me.rep + 5, 0, 100); me.fans = Math.round(me.fans * 1.05); this.post(c, 'fan', 'Fan', `Versprochen, gehalten! ${me.handle} holt das Podium 👏`, { aboutMe: true }); } else { me.rep = clamp(me.rep - 3, 0, 100); this.post(c, 'fan', 'Fan', `"Nächstes Mal Podium" – na klar, ${me.handle} 😂`, { aboutMe: true, boost: 1.5 }); } }
    c.claims = [];
    // Kontakte: Schuld des Spielers → Beziehung sinkt deutlich, sonst leicht; saubere Duelle verbessern
    const touched = new Map();
    for (const k of log.contacts || []) {
      const d = this.driver(c, k.name); if (!d) continue;
      const P = PERSONALITIES[d.pers] || PERSONALITIES.cool;
      const t = touched.get(k.name) || { n: 0, sp: 0, fault: 0 }; t.n++; t.sp = Math.max(t.sp, k.sp); t.fault += k.fault === 'player' ? 1 : k.fault === 'other' ? -1 : 0; touched.set(k.name, t);
    }
    for (const [name, t] of touched) {
      const d = this.driver(c, name), P = PERSONALITIES[d.pers] || PERSONALITIES.cool;
      if (t.fault > 0) {
        this.addRel(c, name, -(7 + Math.min(14, t.sp * 1.4)) * (0.6 + P.temper * 0.6));
        const angry = c.rel[name] < -15 || P.temper > 0.7;
        this.post(c, 'driver', name, fill(pick(rng, angry ? POSTS.angryContact : POSTS.calmContact), ctx), { aboutMe: true, from: name, tone: angry ? -1 : 0, boost: angry ? 2 : 1 });
      } else if (t.fault < 0) {
        this.addRel(c, name, -2);
        if (P.reply > 0.6 && rng() < 0.6) this.post(c, 'driver', name, fill(pick(rng, POSTS.sorryContact), ctx), { aboutMe: true, from: name, tone: 1 });
      } else this.addRel(c, name, -3);
    }
    const fought = new Map();
    for (const p of log.passes || []) { const other = p.by === me.name ? p.on : p.by; if (!other || touched.has(other)) continue; fought.set(other, (fought.get(other) || 0) + 1); }
    for (const [name, n] of fought) {
      this.addRel(c, name, Math.min(6, 2 * n));
      const d = this.driver(c, name); if (!d) continue;
      if (n >= 2 && rng() < 0.5) this.post(c, 'driver', name, fill(pick(rng, (c.rel[name] || 0) > -10 ? POSTS.goodFight : POSTS.rivalJab), ctx), { aboutMe: true, from: name, tone: (c.rel[name] || 0) > -10 ? 1 : -1 });
    }
    // Teamkollege: Rivalität
    const mate = c.drivers.find(d => d.team === c.team), mateRow = mate && order.find(r => r.name === mate.name);
    if (mate && mateRow) this.addRel(c, mate.name, mateRow.pos > pos ? -2 : 1);
    // Beiträge: Sieger, Team, Fans, Presse
    if (!winner.player) { const wd = this.driver(c, winner.name); this.post(c, 'driver', winner.name, fill(pick(rng, POSTS.win), ctx), { boost: 2 }); if (wd && (c.rel[wd.name] || 0) < -40 && rng() < 0.5) this.post(c, 'driver', wd.name, fill(pick(rng, POSTS.rivalJab), ctx), { aboutMe: true, from: wd.name, tone: -1 }); }
    else this.post(c, 'fan', 'Fan', fill(pick(rng, POSTS.fanGood), ctx), { aboutMe: true, boost: 3 });
    for (const r of order.slice(1, 3)) if (!r.player && rng() < 0.6) this.post(c, 'driver', r.name, fill(pick(rng, POSTS.podium), Object.assign({}, ctx, { pos: r.pos })));
    this.post(c, 'team', this.teamName(c.team), fill(pick(rng, delta >= 0 ? POSTS.teamGood : POSTS.teamBad), ctx), { team: c.team, aboutMe: true });
    this.post(c, 'fan', 'Fan', fill(pick(rng, delta >= 0 ? POSTS.fanGood : POSTS.fanBad), ctx), { aboutMe: true });
    const enemy = Object.entries(c.rel).filter(([n, v]) => v < -45 && this.driver(c, n) && this.driver(c, n).team).sort((a, b) => a[1] - b[1])[0];
    if (enemy && rng() < 0.4) this.post(c, 'fan', 'Fan', fill(pick(rng, POSTS.fanDrama), Object.assign({}, ctx, { other: enemy[0] })), { boost: 2 });
    this.post(c, 'press', 'Presse', fill(pick(rng, POSTS.pressWin), ctx));
    const table = Season.driverTable(S); if (table[0]) this.post(c, 'press', 'Presse', fill(pick(rng, POSTS.pressLead), { leader: table[0].name, lpts: table[0].pts }));
    // Antworten auf eigene Beiträge (aus dem letzten Rennwochenende)
    this._answerReplies(c, rng);
    // Teamwarnung bei deutlich verfehltem Ziel
    const myTab = table.findIndex(d => d.player) + 1;
    if (S.round >= 3 && myTab > c.goal + 5 && c.teamRel < 0 && rng() < 0.5) { this.post(c, 'team', this.teamName(c.team), pick(rng, POSTS.teamWarn), { team: c.team, aboutMe: true, tone: -1 }); c.teamRel = clamp(c.teamRel - 4, -100, 100); }
    // Fahrerwechsel während der Saison (KI): kein Punkt bei starkem Teamkollegen
    if (S.round >= 3 && !Season.done(S)) this._midSeasonSwaps(c, rng);
    // Gerüchte im letzten Saisondrittel
    if (S.round >= S.tracks.length * 0.6 && rng() < 0.6) {
      const t = pick(rng, this.teamRank(c)), who = rng() < 0.4 ? me.name : pick(rng, c.drivers.filter(d => d.team && d.team !== t)).name;
      this.post(c, 'press', 'Presse', fill(pick(rng, POSTS.pressRumor), { team: this.teamName(t), who }), { aboutMe: who === me.name });
    }
    if (Season.done(S)) this.seasonEnd(c);
    return { pos, pts: myRow ? myRow.pts : 0, retired: myRow && myRow.retired, tablePos: myTab };
  },
  _midSeasonSwaps(c, rng) {
    for (const team of Object.keys(c.teams)) {
      if (team === c.team) continue;
      const ds = c.drivers.filter(d => d.team === team); if (ds.length < 2) continue;
      ds.sort((a, b) => a.pts - b.pts);
      if (ds[0].pts === 0 && ds[1].pts >= 18 && rng() < 0.12) {
        const free = c.drivers.filter(d => !d.team && !d.retired).sort((a, b) => b.rating - a.rating)[0]; if (!free || free.rating < ds[0].rating - 0.05) continue;
        const out = ds[0]; out.team = null; out.until = 0; free.team = team; free.until = c.seasonNo; free.rookie = false;
        this.post(c, 'press', 'Presse', fill(pick(rng, POSTS.pressSwap), { team: this.teamName(team), out: out.name, in: free.name }));
      }
    }
  },
  /** Spieler postet: kind aus MY_POSTS, target = Fahrername (für praise/provoke/joke) */
  playerPost(c, kind, target = null) {
    const P = MY_POSTS[kind]; if (!P) return null;
    const rng = careerRng(c), tt = target ? (this.driver(c, target) || {}).handle || target : '';
    const text = fill(pick(rng, P.text), { t: tt, team: this.teamName(c.team) });
    const p = this.post(c, 'me', c.me.name, text, { handle: c.me.handle, boost: P.fans });
    c.me.fans = Math.round(c.me.fans * P.fans); c.me.rep = clamp(c.me.rep + (P.rep || 0), 0, 100);
    if (P.team) c.teamRel = clamp(c.teamRel + P.team, -100, 100);
    if (P.claim) c.claims.push({ round: c.season.round });
    if (target && P.rel) {
      const d = this.driver(c, target), pers = PERSONALITIES[d ? d.pers : 'cool'];
      this.addRel(c, target, P.rel * (P.rel < 0 ? 0.6 + pers.ego * 0.6 : 0.7 + pers.reply * 0.4));
      c.pendingReplies.push({ post: p.id, target, kind });
    }
    // Teamkollege und Team mögen öffentliche Kritik nicht
    if (kind === 'blameTeam') { const mate = c.drivers.find(d => d.team === c.team); if (mate) this.addRel(c, mate.name, -3); }
    return p;
  },
  /** Antwort des Spielers auf einen Beitrag (tone: freundlich | neutral | kontra) */
  replyTo(c, postId, tone) {
    const p = c.feed.find(x => x.id === postId), T = REPLY_TONES[tone]; if (!p || !T || p.replied) return null;
    const rng = careerRng(c);
    p.replied = true;
    p.replies.push({ author: c.me.name, handle: c.me.handle, text: pick(rng, T.text), me: true });
    c.me.fans = Math.round(c.me.fans * T.fans);
    if (p.from) {
      const d = this.driver(c, p.from), pers = PERSONALITIES[d ? d.pers : 'cool'];
      // Freundliche Antwort auf einen wütenden Beitrag wirkt stärker; Konter gegen einen Hitzkopf eskaliert
      let r = T.rel; if (tone === 'freundlich' && p.tone < 0) r += 4; if (tone === 'kontra') r *= 0.6 + pers.temper * 0.8;
      this.addRel(c, p.from, r);
      if (tone !== 'neutral') c.pendingReplies.push({ post: p.id, target: p.from, kind: tone === 'kontra' ? 'provoke' : 'praise', instant: true });
      this._answerReplies(c, rng, true);
    } else if (p.kind === 'team') { c.teamRel = clamp(c.teamRel + (tone === 'freundlich' ? 3 : tone === 'kontra' ? -8 : 0), -100, 100); }
    return p;
  },
  /** KI-Fahrer reagieren auf Beiträge des Spielers – je nach Persönlichkeit und Beziehung */
  _answerReplies(c, rng, onlyInstant = false) {
    const keep = [];
    for (const q of c.pendingReplies) {
      if (onlyInstant && !q.instant) { keep.push(q); continue; }
      const p = c.feed.find(x => x.id === q.post), d = this.driver(c, q.target); if (!p || !d) continue;
      const pers = PERSONALITIES[d.pers] || PERSONALITIES.cool, rel = c.rel[d.name] || 0;
      if (rng() > pers.reply + 0.15) continue;
      let pool = q.kind === 'provoke' ? (pers.temper > 0.6 || rel < -30 ? POSTS.replyAngry : d.pers === 'spassvogel' ? POSTS.replyFunny : POSTS.replyCool) : q.kind === 'joke' ? POSTS.replyFunny : rel > -20 ? POSTS.replyNice : POSTS.replyCool;
      p.replies.push({ author: d.name, handle: d.handle, text: fill(pick(rng, pool), { me: c.me.handle }) });
      if (q.kind === 'provoke' && pool === POSTS.replyAngry) this.addRel(c, d.name, -4);
    }
    c.pendingReplies = keep;
  },
  /** Bedingung des laufenden Vertrags prüfen */
  condMet(c) {
    const cond = c.contract && c.contract.cond; if (!cond || !c.season) return true;
    const table = Season.driverTable(c.season), mi = table.findIndex(d => d.player), me = table[mi] || { pts: 0 };
    if (cond.type === 'points') return me.pts >= cond.value;
    if (cond.type === 'position') return mi + 1 <= cond.value;
    if (cond.type === 'beatMate') { const mate = c.drivers.find(d => d.team === c.team); const mt = mate && table.find(d => d.name === mate.name); return !mt || me.pts > mt.pts || (me.pts === mt.pts && mi < table.indexOf(mt)); }
    return true;
  },
  /** Saisonende: Historie, Titel, Entwicklung von Fahrern und Teams, KI-Fahrermarkt, Angebote an den Spieler */
  seasonEnd(c) {
    const rng = careerRng(c), S = c.season, table = Season.driverTable(S), mi = table.findIndex(d => d.player);
    const champ = table[0], meRow = table[mi];
    c.history.push({ season: c.seasonNo, year: c.year, era: c.era, team: c.team, pos: mi + 1, pts: meRow ? meRow.pts : 0, wins: meRow ? meRow.wins : 0, podiums: meRow ? meRow.podiums : 0, champion: champ ? champ.name : '', teamPos: Season.teamTable(S).findIndex(t => t.id === c.team) + 1 });
    if (champ && champ.player) { c.stats.titles++; c.me.rep = clamp(c.me.rep + 15, 0, 100); c.me.fans = Math.round(c.me.fans * 1.25); }
    if (champ) this.post(c, 'press', 'Presse', fill(pick(rng, POSTS.pressChamp), { who: champ.name }), { boost: 4, aboutMe: champ.player });
    const met = this.condMet(c);
    c.lastCond = { met, text: c.contract && c.contract.cond ? c.contract.cond.text : '' };
    // Entwicklung: Alter, Wertung, Rücktritte
    for (const d of c.drivers) {
      if (d.retired) continue;
      d.age++;
      const dr = d.age < 24 ? 0.015 + rng() * 0.035 : d.age < 31 ? (rng() - 0.45) * 0.03 : d.age < 35 ? -0.01 - rng() * 0.015 : -0.025 - rng() * 0.02;
      d.rating = clamp(+(d.rating + dr + (d.pts > 100 ? 0.01 : 0)).toFixed(3), 0.4, 0.99);
      if ((d.age >= 37 && rng() < 0.55) || (d.age >= 33 && d.rating < 0.55 && rng() < 0.5)) { d.retired = true; if (d.team) this.post(c, 'press', 'Presse', fill(POSTS.pressRetire[0], { who: d.name })); d.team = null; }
    }
    // Teams: Entwicklung zurück zum Budget, Zufall, Erfolg bringt Geld
    const tt = Season.teamTable(S), maxPts = Math.max(1, ...tt.map(t => t.pts));
    for (const [id, t] of Object.entries(c.teams)) {
      const succ = ((tt.find(x => x.id === id) || { pts: 0 }).pts / maxPts - 0.5) * 0.06;
      t.perf = clamp(t.perf * 0.62 + t.budget * 0.38 + succ + (rng() - 0.5) * 0.16, 0.12, 0.98);
    }
    // KI-Verträge laufen aus: Teams trennen sich vom Schwächeren, wenn es Bessere auf dem Markt gibt
    for (const d of c.drivers) if (d.team && d.until <= c.seasonNo) { const mate = c.drivers.find(x => x.team === d.team && x !== d); const keep = d.pts > 30 || (mate && d.pts >= mate.pts && rng() < 0.7) || rng() < 0.35; if (keep) d.until = c.seasonNo + 1 + Math.floor(rng() * 2); else d.team = null; }
    // Spieler: Angebote je nach Ergebnis, Ruf und Teamstimmung
    const score = (meRow ? meRow.pts : 0) / Math.max(1, champ ? champ.pts : 1) * 0.6 + c.me.rep / 100 * 0.4;
    const offers = [];
    const rank = this.teamRank(c);
    const ownEnds = !c.contract || c.contract.until <= c.seasonNo || !met;
    for (const [k, team] of rank.entries()) {
      if (team === c.team) continue;
      const need = 0.85 - k * (0.8 / rank.length);     // Spitzenteam braucht viel, Hinterbänkler wenig
      if (score + (rng() - 0.5) * 0.15 >= need && offers.length < 3) offers.push(this._offer(c, team, rng));
    }
    if (ownEnds && met && c.teamRel > -25) offers.unshift(Object.assign(this._offer(c, c.team, rng), { renewal: true }));
    if (!ownEnds) offers.unshift({ team: c.team, stay: true, years: c.contract.until - c.seasonNo, cond: c.contract.cond, perf: c.teams[c.team].perf, salary: c.contract.salary, mate: '' });
    if (!offers.length) offers.push(this._offer(c, rank[rank.length - 1] === c.team ? rank[rank.length - 2] : rank[rank.length - 1], rng));
    c.offers = offers;
    if (!met) this.post(c, 'team', this.teamName(c.team), `Wir danken ${c.me.name} für die Saison – die vereinbarten Ziele wurden leider nicht erreicht.`, { team: c.team, aboutMe: true, tone: -1 });
    c.phase = 'offseason';
  },
  /** Neue Saison nach der Vertragsentscheidung (offer = Element aus c.offers) */
  nextSeason(c, offer) {
    const rng = careerRng(c);
    if (offer && !offer.stay) this.sign(c, offer); else c.offers = [];
    c.seasonNo++; c.year++;
    this._fillSeats(c, rng, true);
    this.newSeason(c);
  },
  /** Übersicht für die UI: Fahrer mit Team, Wertung, Beziehung */
  driverList(c) {
    const table = c.season ? Season.driverTable(c.season) : [];
    return c.drivers.filter(d => !d.retired).map(d => { const r = table.find(x => x.name === d.name); return Object.assign({}, d, { rel: c.rel[d.name] || 0, seasonPts: r ? r.pts : 0 }); })
      .sort((a, b) => (b.team ? 1 : 0) - (a.team ? 1 : 0) || b.seasonPts - a.seasonPts || b.rating - a.rating);
  },
  relLabel(v) { return v >= 60 ? 'Freund' : v >= 25 ? 'gut' : v > -25 ? 'neutral' : v > -60 ? 'angespannt' : 'Rivale'; },
};
