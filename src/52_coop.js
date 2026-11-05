// ============================================================================
//  KOOP-KARRIERE – eine Karriere für mehrere menschliche Fahrer im Mehrspieler.
//  Der Host führt und speichert sie (Speicherplätze coop.1–3). Gäste werden über
//  ihren Freundescode erkannt und behalten ihren Sitz über alle Rennen/Saisons.
//  Grundlage ist die normale Karriere (Career): Kalender, WM, Teams, KI-Fahrermarkt.
// ============================================================================

const COOP_V = 1;

const Coop = {
  /** Neue Koop-Karriere: Host = Karriere-Fahrer (c.me), sein Team aus den Startangeboten */
  create(opts) {
    const c = Career.create(opts);
    c.coop = { v: COOP_V, humans: {} };
    return c;
  },
  isCoop(c) { return !!(c && c.coop); },
  /** Teams nach Stärke; je Team zwei Cockpits */
  seatsUsed(c, team) { return (c.team === team ? 1 : 0) + Object.values(c.coop.humans).filter(h => h.team === team).length; },
  /**
   * Sitz für einen Gast (code = Freundescode). Bekannte Gäste behalten ihren Sitz,
   * neue kommen ins Team des Hosts (falls frei), sonst ins nächstbeste Team mit freiem Menschen-Platz.
   */
  seat(c, code, name, number) {
    const H = c.coop.humans;
    let h = H[code];
    if (h) return h;   // Name bleibt (WM-Wertung läuft über den Namen)
    const rank = Career.teamRank(c), order = [c.team].concat(rank.filter(t => t !== c.team));
    const team = order.find(t => this.seatsUsed(c, t) < 2) || c.team;
    let num = number | 0 || 2; const taken = new Set([c.me.number, ...Object.values(H).map(x => x.number)]);
    while (taken.has(num)) num = num % 99 + 1;
    h = H[code] = { code, name: name || 'Gast', number: num, team, joined: Date.now(), stats: { races: 0, wins: 0, podiums: 0, points: 0, titles: 0 } };
    Career.post(c, 'press', 'Presse', `${h.name} unterschreibt bei ${Career.teamName(team)} und startet ab sofort an der Seite von ${team === c.team ? c.me.name : 'einem KI-Fahrer'}.`);
    return h;
  },
  /** KI-Fahrer fürs Rennen: je Team so viele wie Plätze frei sind (Menschen verdrängen die Schwächeren) */
  aiDrivers(c, humanTeams) {
    const cnt = {}; for (const t of humanTeams) cnt[t] = (cnt[t] || 0) + 1;
    const all = Career.raceDrivers(c), out = [], byTeam = {};
    for (const d of all) (byTeam[d.team] = byTeam[d.team] || []).push(d);
    for (const [team, list] of Object.entries(byTeam)) {
      list.sort((a, b) => b.rating - a.rating);
      out.push(...list.slice(0, Math.max(0, 2 - (cnt[team] || 0))));
    }
    return out;
  },
  /** Rennen werten: Karriere (Host) + Statistik der Gäste. players: Map netId → code */
  afterRace(c, cls, fastest, trackName, codeOf) {
    const sum = Career.afterRace(c, cls, fastest, { contacts: [], passes: [], pole: false }, trackName);
    cls.forEach((r, i) => {
      const code = r.e && r.e.remote ? codeOf(r.e.netId) : null, h = code && c.coop.humans[code]; if (!h) return;
      h.stats.races++; const pts = !r.retired && i < POINTS.length ? POINTS[i] + (fastest && fastest.entry === r.e ? 1 : 0) : 0;
      h.stats.points += pts; if (c.teams[h.team]) c.teams[h.team].pts += pts; if (!r.retired && i === 0) h.stats.wins++; if (!r.retired && i < 3) h.stats.podiums++;
    });
    // Weltmeister unter den Gästen?
    if (c.phase === 'offseason' && c.history.length) { const last = c.history[c.history.length - 1]; for (const h of Object.values(c.coop.humans)) if (last.champion === h.name) h.stats.titles++; }
    return sum;
  },
  /** Zusammenfassung für die Lobby (an alle gesendet) */
  summary(c) {
    if (!c) return null;
    const S = c.season, next = S && !Season.done(S) ? S.tracks[S.round] : null;
    const humans = [{ name: c.me.name, team: c.team, number: c.me.number, host: true }].concat(Object.values(c.coop.humans).map(h => ({ name: h.name, team: h.team, number: h.number })));
    let rows = S ? Season.driverTable(S) : [];
    if (!rows.length) rows = humans.map(x => ({ name: x.name, team: x.team, pts: 0, wins: 0, player: true })).concat(this.aiDrivers(c, humans.map(x => x.team)).sort((a, b) => b.rating - a.rating).map(d => ({ name: d.name, team: d.team, pts: 0, wins: 0 })));
    const table = rows.slice(0, 20).map((d, i) => ({ pos: i + 1, name: d.name, team: d.team, pts: d.pts, wins: d.wins, human: humans.some(x => x.name === d.name) || !!d.player }));
    return { year: c.year, season: c.seasonNo, era: c.era, phase: c.phase, round: S ? S.round : 0, rounds: S ? S.tracks.length : 0, next, nextName: next && TRACKS[next] ? TRACKS[next].name : '', humans, table };
  },
  /** Saisonende im Koop: Host bleibt beim Team (oder nimmt das erste Angebot), Gäste behalten ihre Sitze */
  nextSeason(c, offerIdx = 0) {
    const of = c.offers[offerIdx] || c.offers.find(o => o.stay) || c.offers[0];
    Career.nextSeason(c, of);
  },
};
