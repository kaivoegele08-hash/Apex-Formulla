// ============================================================================
//  UI – Karriere: Neue Karriere, Teamwahl, Karriere-Zentrale (Übersicht,
//  Social Media, Fahrer & Beziehungen, Teams, Laufbahn), Saisonende/Verträge
// ============================================================================

const NAT_CHOICES = ['DEU', 'AUT', 'CHE', 'GBR', 'NLD', 'BEL', 'FRA', 'ITA', 'ESP', 'POL', 'SWE', 'FIN', 'BRA', 'USA', 'JPN', 'AUS'];

function relBar(v) {
  const w = Math.abs(v) / 2, col = v >= 25 ? '#2fe36b' : v > -25 ? '#9aa3ad' : '#ff5b4a';
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
    h('span', { style: { position: 'relative', width: '100px', height: '8px', background: '#1d2430', display: 'inline-block' } },
      h('i', { style: { position: 'absolute', top: 0, bottom: 0, [v >= 0 ? 'left' : 'right']: '50%', width: w + '%', background: col } }),
      h('i', { style: { position: 'absolute', top: '-2px', bottom: '-2px', left: '50%', width: '1px', background: '#7d8898' } })),
    h('small', { style: { color: col, fontWeight: 800, minWidth: '74px' } }, `${v > 0 ? '+' : ''}${v} ${Career.relLabel(v)}`));
}
function meter(v, max = 100, col = '#ff3b1f') { return h('span', { style: { display: 'inline-block', width: '120px', height: '8px', background: '#1d2430', verticalAlign: 'middle' } }, h('i', { style: { display: 'block', height: '100%', width: clamp(v / max * 100, 0, 100) + '%', background: col } })); }
function teamSw(id) { const t = TEAMS.find(x => x.id === id); return h('i.sw', { style: { background: t ? t.colors[0] : '#555' } }); }
function fmtFans(n) { return n >= 1e6 ? fmtNum(n / 1e6, 1) + ' Mio.' : n >= 1000 ? fmtNum(n / 1000, 1) + ' Tsd.' : String(n); }

Object.assign(UI, {
  scr_career(opts = {}) {
    const c = Game.career;
    if (!c) return opts.newCareer ? this._careerNew() : this._careerSlots();
    if (c.phase === 'pick') return this._careerPick(c);
    if (c.phase === 'offseason') return this._careerOffseason(c);
    return this._careerHub(c, opts);
  },

  // ---------------------------------------------------------------------------
  _careerSlots() {
    const cards = [1, 2, 3].map(slot => {
      const i = Game.careerInfo(slot);
      return h('div.card', { style: { flex: '1 1 280px', borderLeft: `5px solid ${i ? '#ff3b1f' : '#2a3342'}` } },
        h('h3', `Speicherplatz ${slot}`),
        i ? [h('h2.ital', { style: { margin: '0 0 6px' } }, i.name), h('p', `${i.team} · Saison ${i.season} (${i.year}) · Runde ${Math.min(i.round + 1, i.rounds)}/${i.rounds}`), h('p', { style: { color: '#7d8898' } }, `${i.era}${i.titles ? ` · ${i.titles} WM-Titel` : ''}`),
          h('div.actions', btn('Fortsetzen', () => { Game.useCareerSlot(slot); this.show('career', { noHistory: true }); }, 'primary small'),
            i.hasBak ? btn('Saisonende-Sicherung laden', () => this.confirm('Den Stand vom letzten Saisonende wiederherstellen? Der aktuelle Stand dieses Platzes wird ersetzt.', () => { Game.restoreCareerBackup(slot); this.show('career', { noHistory: true }); }), 'small') : null,
            btn('Löschen', () => this.confirm(`Karriere von ${i.name} (Platz ${slot}) löschen?`, () => { Game.endCareer(slot); this.show('career', { noHistory: true }); }), 'small ghost'))]
          : [h('p', { style: { color: '#7d8898' } }, 'Leer'), h('div.actions', btn('Neue Karriere', () => { Game.useCareerSlot(slot); this.show('career', { noHistory: true, newCareer: true }); }, 'primary small'))]);
    });
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Karriere'), h('h1', 'Speicherplätze')),
      h('div.row', { style: { alignItems: 'stretch', flexWrap: 'wrap' } }, cards),
      h('p', { style: { fontSize: '12px', color: '#7d8898', maxWidth: '760px' } }, 'Jede Karriere wird nach jedem Rennen gespeichert; am Saisonende entsteht zusätzlich eine Sicherung. Alle Spielstände kannst du unter Einstellungen → Allgemein als Datei sichern.'),
      h('div.actions', btn('Zurück', () => this.show('main', { noHistory: true }), 'ghost')));
  },

  _careerNew() {
    const G = Game.settings.game;
    const o = this._cOpts || (this._cOpts = { name: G.playerName && G.playerName !== 'Du' ? G.playerName : '', number: G.number || 77, nat: 'DEU', era: G.era || 'e2026', strength: Game.settings.race.strength || 1, distance: 'quarter', quali: true, qualiMin: 10, weather: 'random' });
    const nameIn = h('input', { type: 'text', value: o.name, placeholder: 'Vorname Nachname', maxlength: 24, style: { width: '100%', fontSize: '18px', padding: '8px' } });
    nameIn.addEventListener('input', () => { o.name = nameIn.value; });
    const numIn = h('input', { type: 'number', value: o.number, min: 1, max: 99, style: { width: '90px', fontSize: '18px', padding: '6px' } });
    numIn.addEventListener('input', () => { o.number = clamp(parseInt(numIn.value) || 1, 1, 99); });
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Karriere'), h('h1', 'Neue Karriere')),
      h('div.row', { style: { alignItems: 'flex-start' } },
        h('div.col', { style: { flex: '1 1 560px', maxWidth: '760px' } },
          h('div.card', h('h3', 'Dein Fahrer'),
            fieldRow('Name', nameIn), fieldRow('Startnummer', numIn),
            fieldRow('Nationalität', chips(NAT_CHOICES.map(n => ({ value: n, label: n })), o.nat, v => { o.nat = v; }))),
          eraCard(o.era, (id) => { o.era = id; }),
          h('div.card', h('h3', 'So funktioniert die Karriere'),
            h('p', 'Du startest bei einem kleinen Team. Jede Saison fährst du alle Strecken (auch Mod-Strecken). Gute Ergebnisse, dein Ruf und das Verhältnis zum Team entscheiden über neue Angebote – Verträge haben Bedingungen (z. B. „vor dem Teamkollegen“). Auch die KI-Fahrer wechseln Teams, treten zurück, Neulinge kommen nach.'),
            h('p', 'Jeder KI-Fahrer hat eine Beziehung zu dir: Kontakte auf der Strecke, faire Duelle und was du in Social Media postest verändern sie. Freunde fahren fairer gegen dich, Rivalen verteidigen härter und greifen aggressiver an.'))),
        h('div.col', { style: { flex: '0 1 440px' } },
          h('div.card', h('h3', 'Rennwochenende'),
            fieldRow('Renndistanz', toggle(Object.entries(SEASON_DISTANCES).map(([value, d]) => ({ value, label: d.name })), o.distance, v => { o.distance = v; })),
            fieldRow('Qualifying', toggle([{ value: 0, label: 'Aus' }, ...QUALI_DURATIONS.map(m => ({ value: m, label: `${m} min` }))], o.quali ? o.qualiMin : 0, v => { o.quali = v > 0; if (v) o.qualiMin = v; })),
            slider('KI-Stärke', o.strength, 0.85, 1.10, 0.01, v => { o.strength = v; }, v => Math.round(v * 100) + ' %'),
            h('div', { style: { marginTop: '8px' } }, chips(WEATHER_ORDER.map(id => ({ value: id, label: WEATHER_TYPES[id].name })), o.weather, v => { o.weather = v; }))),
          h('div.actions', btn('Karriere starten', () => {
            const name = (o.name || '').trim(); if (name.length < 2) { this.toast('Bitte einen Fahrernamen eingeben.'); return; }
            Game.newCareer({ name, number: o.number, nat: o.nat, era: o.era, strength: o.strength, distance: o.distance, quali: o.quali, qualiMin: o.qualiMin, weather: o.weather });
            Game.settings.game.playerName = name; Game.settings.game.number = o.number; Game.saveSettings();
            this.show('career', { noHistory: true });
          }, 'primary', '▶'), btn('Zurück', () => this.show('main', { noHistory: true }), 'ghost')),
        ),
      ),
    );
  },

  _offerCard(c, of, onSign, label = 'Unterschreiben') {
    const t = TEAMS.find(x => x.id === of.team) || TEAMS[0];
    return h('div.card', { style: { borderLeft: `5px solid ${t.colors[0]}`, flex: '1 1 300px' } },
      h('h3', of.stay ? 'Vertrag läuft weiter' : of.renewal ? 'Vertragsverlängerung' : 'Angebot'),
      h('h2.ital', { style: { margin: '0 0 8px' } }, t.name),
      h('p', 'Auto: ', meter(of.perf * 100, 100, t.colors[0]), ` ${Math.round(of.perf * 100)} %`),
      of.mate ? h('p', 'Teamkollege: ', h('b', of.mate)) : null,
      h('p', `Laufzeit: ${of.years} ${of.years === 1 ? 'Saison' : 'Saisons'} · Gehalt ${fmtNum(of.salary / 1000, 1)} Mio.`),
      of.cond ? h('p', { style: { color: '#ffb02e' } }, 'Bedingung: ', of.cond.text) : null,
      h('div.actions', btn(label, onSign, 'primary small')));
  },
  _careerPick(c) {
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Karriere'), h('h1', 'Wähle dein erstes Team'), h('span', { style: { color: '#7d8898' } }, `${c.me.name} · #${c.me.number} · ${eraOf(c.era).title}`)),
      h('p', { style: { maxWidth: '760px' } }, 'Drei Teams bieten dir ein Cockpit an. Kleine Teams haben schwächere Autos, aber geringere Erwartungen. Erfülle die Bedingung im Vertrag, sonst wird es schwer mit der Verlängerung.'),
      h('div.row', { style: { alignItems: 'stretch', flexWrap: 'wrap' } }, c.offers.map(of => this._offerCard(c, of, () => { Career.sign(c, of); Game.saveCareer(); this.show('career', { noHistory: true }); }))),
      h('div.actions', btn('Karriere abbrechen', () => this.confirm('Karriere wirklich löschen?', () => { Game.endCareer(); this.show('main', { noHistory: true }); }), 'ghost')));
  },

  _careerOffseason(c) {
    const last = c.history[c.history.length - 1] || {};
    const news = c.feed.filter(p => p.kind === 'press' && p.season === c.seasonNo).slice(0, 8);
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Karriere · Saisonende'), h('h1', last.pos === 1 ? `Weltmeister ${last.year}! 🏆` : `Saison ${last.year}: WM-Platz ${last.pos}`), h('span', { style: { color: '#7d8898' } }, `${last.pts} Punkte · ${last.wins} Siege · ${last.podiums} Podien · Weltmeister: ${last.champion}`)),
      c.lastCond && c.lastCond.text ? h('div.hint', c.lastCond.met ? '✔ Vertragsbedingung erfüllt: ' : '✘ Vertragsbedingung verfehlt: ', h('b', c.lastCond.text)) : null,
      h('div.row', { style: { alignItems: 'flex-start' } },
        h('div.col', { style: { flex: '1 1 640px' } },
          h('h3', { style: { color: '#ff3b1f' } }, 'Deine Optionen für die nächste Saison'),
          h('div.row', { style: { alignItems: 'stretch', flexWrap: 'wrap' } }, c.offers.map(of => this._offerCard(c, of, () => this.confirm(of.stay ? `Bei ${Career.teamName(of.team)} bleiben?` : `Bei ${Career.teamName(of.team)} unterschreiben?`, () => { Career.nextSeason(c, of); Game.saveCareer(); this.show('career', { noHistory: true, tab: 'news' }); }), of.stay ? 'Bleiben' : 'Unterschreiben')))),
        h('div.col', { style: { flex: '0 1 420px' } }, h('div.card', h('h3', 'Fahrermarkt & Nachrichten'), news.length ? news.map(p => h('p', { style: { fontSize: '13px' } }, p.text)) : h('p', 'Noch keine Meldungen.')))),
    );
  },

  _careerHub(c, opts) {
    const tab = this._cTab = opts.tab || this._cTab || 'overview';
    const S = c.season, table = Season.driverTable(S), mi = table.findIndex(d => d.player), team = TEAMS.find(t => t.id === c.team) || TEAMS[0];
    const next = S.tracks[S.round], nextT = TRACKS[next] ? Game.getTrackModel(next) : null;
    const unread = c.feed.filter(p => p.aboutMe && p.from && !p.replied).length;
    const tabs = h('div.chips', ...[['overview', 'Übersicht'], ['news', `Social Media${unread ? ` (${unread})` : ''}`], ['drivers', 'Fahrer & Beziehungen'], ['teams', 'Teams'], ['history', 'Laufbahn']].map(([id, label]) =>
      h('div.chip' + (id === tab ? '.on' : ''), { onclick: () => { AudioSys.uiClick(); this.show('career', { noHistory: true, tab: id }); } }, h('span', label))));
    let body;
    if (tab === 'news') body = this._careerNews(c);
    else if (tab === 'drivers') body = this._careerDrivers(c);
    else if (tab === 'teams') body = this._careerTeams(c);
    else if (tab === 'history') body = this._careerHistory(c);
    else body = this._careerOverview(c, opts, table, mi, nextT);
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Karriere'), h('h1', h('i.sw', { style: { background: team.colors[0], display: 'inline-block', width: '8px', height: '28px', marginRight: '12px', verticalAlign: '-4px' } }), `${c.me.name} · ${team.name}`),
        h('span', { style: { color: '#7d8898' } }, `Saison ${c.year} · Runde ${Math.min(S.round + 1, S.tracks.length)}/${S.tracks.length} · ${eraOf(c.era).title}`)),
      tabs, h('div', { style: { height: '12px' } }),
      h('div.scroll', { style: { flex: '1' } }, body),
      h('div.actions', nextT ? btn(`Rennwochenende: ${nextT.name}`, () => Game.startCareerRound(), 'primary', '▶') : null, nextT ? btn('Fahrzeug-Setup', () => { Game.settings.game.track = next; this.show('setup'); }) : null,
        btn('Hauptmenü', () => this.show('main', { noHistory: true }), 'ghost'),
        btn('Speicherplätze', () => { Game.closeCareer(); this.show('career', { noHistory: true }); }, 'ghost')),
    );
  },

  _careerOverview(c, opts, table, mi, nextT) {
    const S = c.season, sum = opts.summary;
    const dt = h('table.res', h('tr', h('th', 'Pos'), h('th', 'Fahrer'), h('th', 'Siege'), h('th', 'Punkte')));
    table.slice(0, 12).forEach((d, i) => dt.append(h('tr' + (d.player ? '.me' : ''), h('td.num', String(i + 1)), h('td', teamSw(d.team), d.name), h('td.num', String(d.wins)), h('td.num', String(d.pts)))));
    if (mi >= 12) dt.append(h('tr.me', h('td.num', String(mi + 1)), h('td', teamSw(c.team), c.me.name), h('td.num', String(table[mi].wins)), h('td.num', String(table[mi].pts))));
    const condOk = Career.condMet(c), mate = c.drivers.find(d => d.team === c.team);
    const goalPos = mi >= 0 ? mi + 1 : '–';
    return h('div.row', { style: { alignItems: 'flex-start' } },
      h('div.col', { style: { flex: '1 1 520px' } },
        sum ? h('div.hint', `Letztes Rennen: ${sum.retired ? 'ausgeschieden' : 'P' + sum.pos} · +${sum.pts} Punkte · WM-Platz ${sum.tablePos}`) : null,
        nextT ? h('div.card', h('h3', `Nächstes Rennen · Runde ${S.round + 1} von ${S.tracks.length}`), h('h2.ital', { style: { margin: '0 0 6px' } }, nextT.name),
          h('p', nextT.def.character), h('p', `${Season.lapsFor(S, nextT)} Runden · Qualifying ${c.settings.quali ? c.settings.qualiMin + ' min' : 'aus'} · Wetter ${WEATHER_TYPES[c.settings.weather] ? WEATHER_TYPES[c.settings.weather].name : c.settings.weather}`)) : null,
        h('div.card', h('h3', 'Ziele & Vertrag'),
          h('p', `Teamziel: WM-Platz ${c.goal} oder besser · aktuell: Platz ${goalPos}`),
          c.contract && c.contract.cond ? h('p', { style: { color: condOk ? '#2fe36b' : '#ffb02e' } }, (condOk ? '✔ ' : '⚠ ') + 'Bedingung: ' + c.contract.cond.text) : null,
          h('p', `Vertrag bis Saison ${c.contract ? c.year + (c.contract.until - c.seasonNo) : '–'} · Teamkollege: ${mate ? mate.name : '–'}`),
          h('p', 'Verhältnis zum Team: ', relBar(Math.round(c.teamRel))),
          h('p', 'Ruf: ', meter(c.me.rep), ` ${Math.round(c.me.rep)} · Follower: ${fmtFans(c.me.fans)}`),
          h('p', `Karriere: ${c.stats.races} Rennen · ${c.stats.wins} Siege · ${c.stats.podiums} Podien · ${c.stats.titles} Titel`))),
      h('div.col', { style: { flex: '0 1 440px' } }, h('div.card', h('h3', 'Fahrerwertung'), table.length ? dt : h('p', 'Noch keine Punkte – die Saison beginnt mit dem ersten Rennwochenende.'))));
  },

  _careerNews(c) {
    const drivers = c.drivers.filter(d => d.team && !d.retired).sort((a, b) => a.name.localeCompare(b.name));
    const o = this._postOpts || (this._postOpts = { kind: 'thanksTeam', target: drivers[0] ? drivers[0].name : '' });
    if (!drivers.some(d => d.name === o.target) && drivers[0]) o.target = drivers[0].name;
    const sel = h('select', { style: { fontSize: '14px', padding: '6px', background: '#151a22', color: '#f4f6fa', border: '1px solid #2a3342' } }, drivers.map(d => h('option', { value: d.name, selected: d.name === o.target }, `${d.name} (${Career.relLabel(c.rel[d.name] || 0)})`)));
    sel.addEventListener('change', () => { o.target = sel.value; });
    const targetRow = h('div', { style: { display: MY_POSTS[o.kind].target ? '' : 'none', marginTop: '8px' } }, fieldRow('An / über', sel));
    const compose = h('div.card', h('h3', 'Neuer Beitrag'),
      chips(Object.entries(MY_POSTS).map(([value, p]) => ({ value, label: p.label })), o.kind, v => { o.kind = v; targetRow.style.display = MY_POSTS[v].target ? '' : 'none'; }),
      targetRow,
      h('p', { style: { fontSize: '12px', color: '#7d8898' } }, 'Lob verbessert Beziehungen, Provokationen verschlechtern sie (bringen aber Follower). Kritik am Auto ärgert das Team. Eine Podiums-Ankündigung zahlt sich nur aus, wenn du sie einlöst.'),
      h('div.actions', btn('Posten', () => { Career.playerPost(c, o.kind, MY_POSTS[o.kind].target ? o.target : null); Game.saveCareer(); this.show('career', { noHistory: true, tab: 'news' }); }, 'primary small')));
    const feed = h('div');
    for (const p of c.feed.slice(0, 50)) {
      const tm = p.kind === 'team' ? TEAMS.find(t => t.id === p.team) : p.from ? TEAMS.find(t => t.id === (Career.driver(c, p.from) || {}).team) : p.kind === 'me' ? TEAMS.find(t => t.id === c.team) : null;
      const col = p.kind === 'press' ? '#38c6ff' : p.kind === 'fan' ? '#b65cff' : tm ? tm.colors[0] : '#7d8898';
      const badge = { driver: 'Fahrer', team: 'Team', fan: 'Fan', press: 'Presse', me: 'Du' }[p.kind];
      const box = h('div.card', { style: { marginBottom: '8px', borderLeft: `4px solid ${col}`, padding: '12px 16px', background: p.kind === 'me' ? 'rgba(255,59,31,0.08)' : '' } },
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'baseline' } }, h('b', p.author), h('small', { style: { color: '#7d8898' } }, p.handle), h('small', { style: { color: col, fontWeight: 800, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.1em' } }, badge),
          h('small', { style: { marginLeft: 'auto', color: '#7d8898' } }, `Saison ${p.season} · R${p.round} · ♥ ${p.likes}`)),
        h('p', { style: { margin: '6px 0 4px', fontSize: '15px' } }, p.text),
        ...p.replies.map(r => h('p', { style: { margin: '2px 0 2px 18px', fontSize: '13px', color: r.me ? '#ffb4a6' : '#b9c2cf' } }, h('b', r.author + ' '), h('small', { style: { color: '#7d8898' } }, r.handle + ' '), r.text)));
      if ((p.aboutMe && (p.from || p.kind === 'team')) && !p.replied && p.kind !== 'me')
        box.append(h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } }, h('small', { style: { color: '#7d8898', alignSelf: 'center' } }, 'Antworten:'),
          ...Object.entries(REPLY_TONES).map(([tone, T]) => btn(T.label, () => { Career.replyTo(c, p.id, tone); Game.saveCareer(); this.show('career', { noHistory: true, tab: 'news' }); }, 'small ghost'))));
      feed.append(box);
    }
    return h('div.row', { style: { alignItems: 'flex-start' } },
      h('div.col', { style: { flex: '1 1 620px', maxWidth: '820px' } }, feed),
      h('div.col', { style: { flex: '0 1 420px' } }, h('div.card', h('h3', 'Dein Profil'), h('p', h('b', c.me.name), ' ', h('small', { style: { color: '#7d8898' } }, c.me.handle)), h('p', `Follower: ${fmtFans(c.me.fans)} · Ruf ${Math.round(c.me.rep)}`)), compose));
  },

  _careerDrivers(c) {
    const tbl = h('table.res', h('tr', h('th', 'Fahrer'), h('th', 'Team'), h('th', 'Alter'), h('th', 'Stärke'), h('th', 'Typ'), h('th', 'Punkte'), h('th', 'Beziehung zu dir')));
    for (const d of Career.driverList(c)) {
      tbl.append(h('tr', h('td', h('b', d.name), ' ', h('small', { style: { color: '#7d8898' } }, `#${d.num} · ${d.nat}`)), h('td', d.team ? [teamSw(d.team), Career.teamName(d.team)] : h('small', { style: { color: '#7d8898' } }, 'ohne Cockpit')),
        h('td.num', String(d.age)), h('td', meter(d.rating * 100, 100, '#38c6ff')), h('td', (PERSONALITIES[d.pers] || {}).name || ''), h('td.num', String(d.seasonPts)), h('td', relBar(d.rel))));
    }
    return h('div', h('div.hint', 'Freunde (ab +25) fahren fairer gegen dich und machen Platz, Rivalen (unter −25) verteidigen härter und greifen aggressiver an. Kontakte, bei denen du von hinten kommst, kosten viel Sympathie – faire Duelle und nette Worte in Social Media bringen sie zurück.'), tbl);
  },

  _careerTeams(c) {
    const tt = Season.teamTable(c.season), tbl = h('table.res', h('tr', h('th', 'Team'), h('th', 'Auto'), h('th', 'Fahrer'), h('th', 'Punkte')));
    for (const id of Career.teamRank(c)) {
      const t = TEAMS.find(x => x.id === id); if (!t) continue;
      const ds = c.drivers.filter(d => d.team === id).map(d => d.name); if (id === c.team) ds.push(c.me.name + ' (du)');
      tbl.append(h('tr' + (id === c.team ? '.me' : ''), h('td', teamSw(id), t.name), h('td', meter(c.teams[id].perf * 100, 100, t.colors[0]), ` ${Math.round(c.teams[id].perf * 100)} %`), h('td', ds.join(', ')), h('td.num', String((tt.find(x => x.id === id) || { pts: 0 }).pts))));
    }
    return h('div', h('div.hint', 'Die Autostärke verändert sich jede Saison (Budget, Erfolg, Zufall) und wirkt im Rennen als kleiner Haftungsvorteil (±1,5 %).'), tbl);
  },

  _careerHistory(c) {
    const tbl = h('table.res', h('tr', h('th', 'Saison'), h('th', 'Team'), h('th', 'WM'), h('th', 'Punkte'), h('th', 'Siege'), h('th', 'Podien'), h('th', 'Weltmeister')));
    for (const r of c.history) tbl.append(h('tr', h('td', `${r.year} (${eraOf(r.era).name})`), h('td', teamSw(r.team), Career.teamName(r.team)), h('td.num', 'P' + r.pos), h('td.num', String(r.pts)), h('td.num', String(r.wins)), h('td.num', String(r.podiums)), h('td', r.champion)));
    const s = c.stats;
    return h('div', h('div.card', h('h3', 'Statistik'), h('p', `${s.races} Rennen · ${s.wins} Siege · ${s.podiums} Podien · ${s.poles} Poles · ${s.points} Punkte · ${s.titles} WM-Titel`)),
      c.history.length ? tbl : h('p', 'Noch keine abgeschlossene Saison.'));
  },
});
