// ============================================================================
//  LIZENZMODUS (offline) – Lizenzklassen, Safety Rating und iRating wie bei Online-Rennligen.
//  Zwei Kategorien (Formel, GT) mit je eigener Lizenz (R → D → C → B → A) und Safety Rating (0–4,99).
//  iRating je Fahrzeugklasse (F4, F3, F2, 2026, GT, Klassik). Serien verlangen eine Mindestlizenz,
//  jede Serie hat eine Saison mit 12 Rennwochen (eine Woche = 2 Rennen), die Strecke wechselt wöchentlich.
//  KI-Gegner bekommen ein iRating um das eigene herum – die Feldstärke (SOF) bestimmt, wie schnell sie sind.
// ============================================================================

const LICENSE_V = 1;
const LIC_LEVELS = [
  { id: 'R', name: 'Rookie', color: '#e0262b' },
  { id: 'D', name: 'Klasse D', color: '#ff8a00' },
  { id: 'C', name: 'Klasse C', color: '#f2c200' },
  { id: 'B', name: 'Klasse B', color: '#2fb84c' },
  { id: 'A', name: 'Klasse A', color: '#2f7bff' },
];
const LIC_CATS = { formel: 'Formel', gt: 'GT & Sportwagen' };
const LIC_IR_CLASSES = { f4: 'F4', f3: 'F3', f2: 'F2', e2026: '2026', gt3: 'GT', klassik: 'Klassik' };
const LIC_KLASSIK = ['e1990', 'e2000', 'e2010', 'e2014', 'e2017', 'e2020', 'e2022'];
const LIC_SERIES = [
  { id: 'f4cup', name: 'F4 Rookie-Cup', cat: 'formel', cls: 'f4', min: 0, laps: 6, field: 16, quali: 0, incLimit: 17, desc: 'Einstieg: leichte Autos, kurze Rennen, Startaufstellung nach iRating.' },
  { id: 'gtsprint', name: 'GT Sprint', cat: 'gt', cls: 'gt3', min: 0, laps: 6, field: 16, quali: 0, incLimit: 17, desc: 'Sportwagen mit ABS und Traktionskontrolle – lange Bremswege, Türen an Türen.' },
  { id: 'f3', name: 'F3-Serie', cat: 'formel', cls: 'f3', min: 1, laps: 8, field: 18, quali: 5, incLimit: 17, desc: 'Abtrieb und DRS. Kurzes Qualifying vor dem Rennen.' },
  { id: 'gtend', name: 'GT Langstrecke', cat: 'gt', cls: 'gt3', min: 2, laps: 16, field: 20, quali: 5, incLimit: 25, mandatory: true, desc: 'Lange Rennen mit Pflicht-Boxenstopp, Reifen- und Spritgefühl gefragt.' },
  { id: 'f2', name: 'F2-Serie', cat: 'formel', cls: 'f2', min: 2, laps: 10, field: 20, quali: 8, incLimit: 17, desc: 'Turbo, viel Abtrieb, Reifen bauen ab – die letzte Stufe vor der Königsklasse.' },
  { id: 'f1', name: 'Königsklasse 2026', cat: 'formel', cls: 'e2026', min: 3, laps: 12, field: 20, quali: 10, incLimit: 17, desc: 'Das schnellste Auto: ERS, aktive Aero, Überholmodus.' },
  { id: 'klassik', name: 'Klassik-Serie', cat: 'formel', cls: 'klassik', min: 4, laps: 10, field: 20, quali: 10, incLimit: 17, desc: 'Jede Woche eine andere Epoche (1990–2022). Nur für A-Lizenzen.' },
];
const LIC_WEEKS = 12, LIC_RACES_PER_WEEK = 2, LIC_START_IR = 1350, LIC_BR1 = 1600 / Math.LN2;
const LIC_MPR = 4;   // Mindestrennen in der aktuellen Lizenzklasse vor dem Aufstieg

const License = {
  create(name = 'Du') {
    const p = { v: LICENSE_V, created: Date.now(), name, cats: {}, ir: {}, series: {}, history: [], seq: 1 };
    for (const k of Object.keys(LIC_CATS)) p.cats[k] = { lvl: 0, sr: 2.5, races: 0, lvlRaces: 0, inc: 0, corners: 0 };
    for (const k of Object.keys(LIC_IR_CLASSES)) p.ir[k] = LIC_START_IR;
    return p;
  },
  /** Spielstand reparieren/ergänzen (neue Klassen, neue Serien) */
  fix(p) {
    if (!p || p.v !== LICENSE_V) return null;
    for (const k of Object.keys(LIC_CATS)) p.cats[k] = p.cats[k] || { lvl: 0, sr: 2.5, races: 0, lvlRaces: 0, inc: 0, corners: 0 };
    for (const k of Object.keys(LIC_IR_CLASSES)) if (!(p.ir[k] > 0)) p.ir[k] = LIC_START_IR;
    return p;
  },
  series(id) { return LIC_SERIES.find(s => s.id === id); },
  level(p, cat) { return LIC_LEVELS[p.cats[cat].lvl]; },
  /** Lizenz als Text wie „D 3.41“ */
  licText(p, cat) { const c = p.cats[cat]; return `${LIC_LEVELS[c.lvl].id} ${c.sr.toFixed(2)}`; },
  allowed(p, s) { return p.cats[s.cat].lvl >= s.min; },
  sstate(p, id) { return p.series[id] || (p.series[id] = { races: 0, season: 1, wins: 0, top5: 0, pts: 0, best: 0 }); },
  /** Rennwoche und Strecke der Serie (Woche wechselt alle zwei Rennen; nach 12 Wochen neue Saison) */
  week(p, s) { const st = this.sstate(p, s.id), n = Math.floor(st.races / LIC_RACES_PER_WEEK); return { season: 1 + Math.floor(n / LIC_WEEKS), week: n % LIC_WEEKS, raceInWeek: st.races % LIC_RACES_PER_WEEK }; },
  trackFor(s, week, season = 1) {
    const list = TRACK_ORDER.filter(id => TRACKS[id]), idx = LIC_SERIES.indexOf(s);
    return list[((idx * 3 + week + (season - 1) * 5) % list.length + list.length) % list.length];
  },
  eraFor(s, week, season = 1) { return s.cls === 'klassik' ? LIC_KLASSIK[(week + season) % LIC_KLASSIK.length] : s.cls; },
  /** Wochenplan der aktuellen Saison (für die Übersicht) */
  schedule(p, s) { const W = this.week(p, s); return Array.from({ length: LIC_WEEKS }, (_, w) => ({ week: w, track: this.trackFor(s, w, W.season), era: this.eraFor(s, w, W.season), now: w === W.week })); },
  /** Feldstärke wie bei Online-Ligen: SOF = br1 · ln(N / Σ e^(−iR/br1)) */
  sof(list) { const n = list.length; return Math.round(LIC_BR1 * Math.log(n / list.reduce((a, r) => a + Math.exp(-r / LIC_BR1), 0))); },
  /** Feldstärke → KI-Stärke (0,84 bei SOF 500 … 1,05 bei SOF 6000) */
  strengthFor(sof) {
    const P = [[500, 0.84], [1000, 0.89], [1500, 0.93], [2000, 0.96], [3000, 0.995], [4500, 1.03], [6000, 1.05]];
    if (sof <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) if (sof <= P[i][0]) { const [a, x] = P[i - 1], [b, y] = P[i]; return +(x + (y - x) * (sof - a) / (b - a)).toFixed(3); }
    return P[P.length - 1][1];
  },
  /**
   * Rennen vorbereiten (nach applyEra der Klasse, damit DRIVERS stimmt): Gegner mit iRating, SOF, Strecke.
   * Gibt ein Ereignis zurück, das bis zur Wertung gespeichert bleibt.
   */
  makeEvent(p, sid, rng = Math.random) {
    const s = this.series(sid); if (!s) throw new Error('Serie unbekannt');
    const W = this.week(p, s), irKey = s.cls, my = p.ir[irKey] || LIC_START_IR;
    const gauss = () => { let u = 0; for (let k = 0; k < 6; k++) u += rng(); return (u - 3) / 1.22; };
    const pool = DRIVERS.slice().sort(() => rng() - 0.5).slice(0, Math.min(s.field - 1, DRIVERS.length));
    // Gegner: um das eigene iRating gestreut, leicht zur Mitte (1500) gezogen
    const opp = pool.map(d => ({ name: d.name, nat: d.nat, num: d.num, team: d.team, aggression: d.aggression, ir: Math.round(clamp((my * 0.85 + 1500 * 0.15) * Math.exp(gauss() * 0.28), 250, 9000)) }));
    const sof = this.sof(opp.map(o => o.ir).concat([my]));
    for (const o of opp) o.rating = +clamp(0.8 + 0.14 * Math.tanh((o.ir - sof) / 1200), 0.6, 0.97).toFixed(3);
    const wet = rng() < 0.18;
    return { sid, irKey, era: this.eraFor(s, W.week, W.season), track: this.trackFor(s, W.week, W.season), week: W.week, season: W.season, laps: s.laps, quali: s.quali, sof, strength: this.strengthFor(sof), myIR: my, weather: wet ? 'random' : 'dry', opp, mandatory: !!s.mandatory, incLimit: s.incLimit };
  },
  /** Erwartete Siege gegen einen Gegner (Formel der Online-Ligen) */
  _pWin(ri, rj) { const a = Math.exp(-ri / LIC_BR1), b = Math.exp(-rj / LIC_BR1); return (1 - a) * b / ((1 - b) * a + (1 - a) * b); },
  /** iRating-Änderung: (tatsächlich geschlagene − erwartete) · 200 / (N − 1) */
  irDelta(myIR, myIdx, irs) {
    const n = irs.length; if (n < 2) return 0;
    let exp = 0, act = 0;
    irs.forEach((r, j) => { if (j === myIdx) return; exp += this._pWin(myIR, r); if (j > myIdx) act++; });
    return Math.round((act - exp) * 200 / (n - 1));
  },
  /** Safety Rating: Gewinn je Kurve, Abzug je Vorfallpunkt (höhere Lizenz = strenger) */
  srDelta(lvl, corners, inc) {
    const g = [0.0026, 0.0022, 0.0019, 0.0016, 0.0013][lvl], k = [0.035, 0.04, 0.045, 0.05, 0.055][lvl];
    return +clamp(corners * g - inc * k, -0.9, 0.5).toFixed(2);
  },
  /** Kurven je Runde aus der Streckenkrümmung (zusammenhängende Bereiche mit Radius < 300 m) */
  cornersOf(track) {
    const K = track.K, N = K.length, ds = track.ds || track.length / N, gap = Math.round(40 / ds);
    let n = 0, inC = false, quiet = gap;
    for (let j = 0; j < N; j++) { const c = Math.abs(K[j]) > 1 / 300; if (c) { if (!inC && quiet >= gap) n++; inC = true; quiet = 0; } else { inC = false; quiet++; } }
    return Math.max(4, n);
  },
  /**
   * Rennen werten. cls = Ergebnisliste (Einträge mit .e.player), inc = Vorfallpunkte des Spielers,
   * laps = gefahrene Runden, cpl = Kurven je Runde. Rückgabe: Zusammenfassung für die Anzeige.
   */
  afterRace(p, ev, cls, inc, laps, cpl, trackName = '') {
    const s = this.series(ev.sid), cat = p.cats[s.cat], st = this.sstate(p, s.id);
    const irOf = new Map(ev.opp.map(o => [o.name, o.ir]));
    const myIdx = cls.findIndex(r => r.e && r.e.player), me = cls[myIdx] || { retired: true };
    const irs = cls.map((r, i) => i === myIdx ? ev.myIR : (irOf.get(r.name) ?? ev.sof));
    const dIR = this.irDelta(ev.myIR, myIdx < 0 ? cls.length : myIdx, myIdx < 0 ? irs.concat([ev.myIR]) : irs);
    const oldIR = p.ir[ev.irKey] || LIC_START_IR;
    p.ir[ev.irKey] = Math.max(100, oldIR + dIR);
    const corners = Math.max(0, laps) * cpl, oldLvl = cat.lvl, oldSR = cat.sr;
    const dSR = this.srDelta(cat.lvl, corners, inc);
    cat.sr = +clamp(cat.sr + dSR, 0, 4.99).toFixed(2);
    cat.races++; cat.lvlRaces++; cat.inc += inc; cat.corners += corners;
    let change = '';
    // Aufstieg: Fast-Track ab SR 4,0 sofort, sonst ab SR 3,0 nach genügend Rennen in der Klasse; Abstieg unter SR 1,0
    if (cat.lvl < LIC_LEVELS.length - 1 && (cat.sr >= 4.0 || (cat.sr >= 3.0 && cat.lvlRaces >= LIC_MPR))) { cat.lvl++; cat.sr = +Math.max(2.5, cat.sr - 1).toFixed(2); cat.lvlRaces = 0; change = 'up'; }
    else if (cat.lvl > 0 && cat.sr < 1.0) { cat.lvl--; cat.sr = 3.0; cat.lvlRaces = 0; change = 'down'; }
    const pos = myIdx + 1, n = cls.length, pts = me.retired || myIdx < 0 ? 0 : Math.round(Math.max(0, (n - pos) / Math.max(1, n - 1)) * 100 * (ev.sof / 1500));
    st.races++; st.pts += pts; if (!me.retired && pos === 1) st.wins++; if (!me.retired && pos <= 5) st.top5++; st.best = st.best ? Math.min(st.best, pos) : pos;
    const sum = { id: p.seq++, t: Date.now(), sid: s.id, series: s.name, cat: s.cat, track: trackName || ev.track, era: ev.era, pos, n, retired: !!me.retired, dq: !!(me.e && me.e.dq), sof: ev.sof, inc, corners,
      ir: p.ir[ev.irKey], dIR, irKey: ev.irKey, sr: cat.sr, dSR, oldSR, lic: LIC_LEVELS[cat.lvl].id, oldLic: LIC_LEVELS[oldLvl].id, change, pts };
    p.history.unshift(sum); if (p.history.length > 60) p.history.length = 60;
    return sum;
  },
};
