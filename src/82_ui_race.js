// ============================================================================
//  UI – Rennen: Rennvorbereitung, Ergebnis, Fahrzeug-Setup, Telemetrie,
//  Renn-HUD (Zeitenturm, Startampel, Sektoren, Abstände)
// ============================================================================

const SETUP_GROUPS = [
  ['Aerodynamik', 'Mehr Flügel = mehr Abtrieb und Kurvengrip, aber mehr Luftwiderstand. Frontflügel verschiebt die Balance nach vorne (weniger Untersteuern).',
    [['frontWing', 'Frontflügel', '', 0], ['rearWing', 'Heckflügel', '', 0]]],
  ['Differenzial', 'Hohe Sperre unter Last = bessere Traktion, aber mehr Untersteuern am Kurvenausgang. Im Schiebebetrieb: Stabilität beim Einlenken.',
    [['diffOn', 'Sperre unter Last', '%', 0], ['diffOff', 'Sperre im Schiebebetrieb', '%', 0], ['diffPreload', 'Vorspannung', 'Nm', 0]]],
  ['Fahrwerksgeometrie', 'Mehr negativer Sturz = mehr Kurvengrip, aber höhere Innentemperatur der Reifen. Spur beeinflusst Einlenken und Stabilität.',
    [['camberF', 'Sturz vorne', '°', 1], ['camberR', 'Sturz hinten', '°', 1], ['toeF', 'Spur vorne', '°', 2], ['toeR', 'Spur hinten', '°', 2]]],
  ['Federung', 'Weichere Federn = mehr mechanischer Grip und Kerb-Tauglichkeit, aber mehr Bewegung der Plattform (Ground Effect). Tiefer = mehr Abtrieb, Gefahr des Aufsetzens.',
    [['springF', 'Federrate vorne', 'N/mm', 0], ['springR', 'Federrate hinten', 'N/mm', 0], ['arbF', 'Stabilisator vorne', 'N/mm', 0], ['arbR', 'Stabilisator hinten', 'N/mm', 0], ['rideF', 'Fahrhöhe vorne', 'mm', 0], ['rideR', 'Fahrhöhe hinten', 'mm', 0]]],
  ['Bremsen', 'Mehr Bremsbalance nach vorne = stabiler, aber Vorderräder blockieren früher.',
    [['brakePressure', 'Bremsdruck', '%', 0], ['brakeBias', 'Bremsbalance vorne', '%', 1]]],
  ['Reifen', 'Höherer Druck = weniger Rollwiderstand, kleinere Aufstandsfläche; optimal ≈ 22,5 / 21,0 psi.',
    [['pressureF', 'Reifendruck vorne', 'psi', 1], ['pressureR', 'Reifendruck hinten', 'psi', 1]]],
];

function shortName(name) { const p = String(name).trim().split(/\s+/); return (p.length > 1 ? p[p.length - 1] : p[0]).replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase(); }
function fmtGap(g) {
  if (!g) return '';
  if (g.laps) return `+${g.laps} Rd`;
  return '+' + Math.max(0, g.s).toFixed(3).replace('.', ',');
}

Object.assign(UI, {
  // ---------------------------------------------------------------------------
  //  Schnelles Rennen: Vorbereitung
  // ---------------------------------------------------------------------------
  scr_raceSetup() {
    const S = Game.settings, R = S.race;
    const track = Game.getTrackModel(Game.trackId);
    const map = new Minimap(track, 230);
    const cv = h('canvas', { width: 230, height: 230 }); cv.getContext('2d').drawImage(map.bg, 0, 0);
    const full = track.def.raceLaps || 50;
    const save = () => Game.saveSettings();
    const lapsOpts = [3, 5, 10, 15, 20, Math.round(full / 2), full].filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b);
    const strength = slider('KI-Stärke', R.strength, 0.85, 1.10, 0.01, v => { R.strength = v; save(); }, v => Math.round(v * 100) + ' %' + (v > 1.0 ? ' (Legende – mehr Grip als möglich)' : v >= 0.98 ? ' (Profi)' : v >= 0.93 ? ' (Fortgeschritten)' : ' (Einsteiger)'));
    const est = h('p', { style: { fontSize: '12px', color: '#7d8898' } });
    const lapT = refLapTime(track, Game.getLine(track.id));
    const updEst = () => { est.textContent = `≈ ${Math.round(R.laps * (lapT + 2) / 60)} min Renndauer · KI-Rundenzeit bei 100 % ≈ ${fmtTime(lapT)}`; };
    updEst();
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Schnelles Rennen'), h('h1', 'Rennen vorbereiten')),
      h('div.row', { style: { alignItems: 'flex-start' } },
        h('div.col', { style: { flex: '1 1 560px', maxWidth: '760px' } },
          h('div.card.track-card', cv, h('div',
            h('h3', 'Strecke'), h('h2.ital', { style: { margin: '0 0 6px' } }, track.name),
            h('p', track.def.character),
            h('div', h('span.stat', h('b', fmtNum(track.length / 1000, 3) + ' km'), h('small', 'Länge')), h('span.stat', h('b', String(full)), h('small', 'Runden (100 %)'))),
          )),
          h('div.card', h('h3', 'Strecke wählen'), chips(TRACK_ORDER.map(id => ({ value: id, label: TRACKS[id].name })), track.id, v => { S.game.track = v; save(); this.show('raceSetup', { noHistory: true }); })),
          h('div.card', h('h3', 'Renndistanz'), chips(lapsOpts.map(n => ({ value: n, label: n === full ? `${n} Runden (100 %)` : `${n} Runden` })), R.laps, v => { R.laps = v; save(); updEst(); }), est),
          h('div.card', h('h3', 'Starterfeld'),
            fieldRow('Gegner', toggle([5, 9, 13, 19].map(n => ({ value: n, label: String(n) })), R.opponents, v => { R.opponents = v; save(); })),
            strength,
            fieldRow('Startaufstellung', toggle([{ value: 'random', label: 'Zufällig' }, { value: 'rating', label: 'Nach Stärke' }], R.grid, v => { R.grid = v; save(); })),
            fieldRow('Dein Startplatz', toggle([{ value: 'pole', label: 'Pole' }, { value: 'middle', label: 'Mitte' }, { value: 'back', label: 'Hinten' }], R.playerGrid, v => { R.playerGrid = v; save(); })),
          ),
          h('div.card', h('h3', 'Qualifying'),
            toggle([{ value: 0, label: 'Aus' }, ...QUALI_DURATIONS.map(m => ({ value: m, label: `${m} min` }))], R.quali ? (R.qualiMin || 10) : 0, v => { R.quali = v > 0; if (v) R.qualiMin = v; save(); }),
            h('p', { style: { fontSize: '12px' } }, 'Mit Qualifying fährst du zuerst gegen die Uhr; deine beste gültige Runde bestimmt deinen Startplatz (Startaufstellung und „Dein Startplatz“ gelten dann nicht). Läuft die Zeit ab, darfst du die begonnene Runde noch beenden.')),
          h('div.card', h('h3', 'Team / Lackierung'), chips(TEAMS.map(t => ({ value: t.id, label: t.name, color: t.colors[0] })), S.game.team, v => { S.game.team = v; save(); Game.refreshGarageCar(); })),
        ),
        h('div.col', { style: { flex: '0 1 420px' } },
          h('div.card', h('h3', 'Regeln'),
            fieldRow('Schaden', toggle([{ value: 'off', label: 'Aus' }, { value: 'reduced', label: 'Reduziert' }, { value: 'full', label: 'Realistisch' }], R.damage, v => { R.damage = v; save(); })),
            fieldRow('Safety Car / VSC', toggle([{ value: true, label: 'An' }, { value: false, label: 'Aus' }], R.safetyCar !== false, v => { R.safetyCar = v; save(); })),
            fieldRow('Pflichtstopp', toggle([{ value: 'auto', label: 'Ab 10 Runden' }, { value: 'on', label: 'Immer' }, { value: 'off', label: 'Aus' }], R.mandatory || 'auto', v => { R.mandatory = v; save(); })),
            h('p', { style: { fontSize: '12px' } }, 'Pflichtstopp: zwei verschiedene Trockenmischungen im Rennen, sonst 30 s Strafe. Box anfordern mit Taste B (am Lenkrad belegbar) – der Autopilot fährt durch die Gasse.'),
            h('p', { style: { fontSize: '12px' } }, 'Track Limits: alle vier Räder jenseits der weißen Linie = Verwarnung; ab der 4. Verwarnung 5 s Zeitstrafe. Start: das Auto wird gehalten, bis die Ampel erlischt.'),
          ),
          h('div.card', h('h3', 'Wetter & Tageszeit'),
            chips(WEATHER_ORDER.map(id => ({ value: id, label: WEATHER_TYPES[id].name })), S.game.weather || 'dry', v => { S.game.weather = v; save(); }),
            h('div', { style: { height: '8px' } }),
            chips([['track', 'Strecken-Standard'], ['morning', 'Vormittag'], ['afternoon', 'Nachmittag'], ['evening', 'Abend'], ['dusk', 'Dämmerung']].map(([value, label]) => ({ value, label })), S.game.timeOfDay || 'track', v => { S.game.timeOfDay = v; save(); })),
          h('div.card', h('h3', 'Startreifen'), h('p', { style: { fontSize: '12px' } }, 'Bei nasser Strecke werden automatisch Intermediate- bzw. Regenreifen aufgezogen.'), chips(COMPOUND_ORDER.slice(0, 3).map(id => ({ value: id, label: COMPOUNDS[id].name, color: COMPOUNDS[id].color })), S.game.compound, v => { S.game.compound = v; save(); })),
          h('div.card', h('h3', 'Fahrhilfen'),
            fieldRow('Traktionskontrolle', toggle([{ value: 0, label: 'Aus' }, { value: 1, label: 'Mittel' }, { value: 2, label: 'Voll' }], S.aids.tc, v => { S.aids.tc = v; save(); })),
            fieldRow('ABS', toggle([{ value: false, label: 'Aus' }, { value: true, label: 'An' }], S.aids.abs, v => { S.aids.abs = v; save(); })),
            fieldRow('Schalten', toggle([{ value: false, label: 'Manuell' }, { value: true, label: 'Automatisch' }], S.aids.autoShift, v => { S.aids.autoShift = v; save(); })),
            fieldRow('Ideallinie', toggle([{ value: 'off', label: 'Aus' }, { value: 'brake', label: 'Nur Bremszonen' }, { value: 'full', label: 'Voll' }], S.aids.idealLine || 'off', v => { S.aids.idealLine = v; save(); })),
          ),
          h('div.card', h('h3', 'Startkamera'), chips(CAMERA_MODES.filter(m => m !== 'tv').map(m => ({ value: m, label: CAMERA_NAMES[m] })), S.camera.mode, v => { S.camera.mode = v; save(); })),
          h('div.actions', btn(R.quali ? 'Qualifying starten' : 'Rennen starten', () => Game.startQuickRace(), 'primary', '▶'), btn('Fahrzeug-Setup', () => this.show('setup')), btn('Zurück', () => this.back(), 'ghost')),
        ),
      ),
    );
  },

  // ---------------------------------------------------------------------------
  //  Fahrzeug-Setup
  // ---------------------------------------------------------------------------
  scr_setup() {
    const trackId = Game.trackId;
    const locked = Game.state === 'paused' && Game.mode === 'race';
    const cur = Object.assign({}, DEFAULT_SETUP, Game.setupFor(trackId));
    const body = h('div.grid2');
    const render = () => {
      body.innerHTML = '';
      for (const [title, hint, items] of SETUP_GROUPS) {
        const card = h('div.card', h('h3', title), h('p', { style: { fontSize: '12px' } }, hint));
        for (const [key, label, unit, dec] of items) {
          const [mn, mx, st] = SETUP_RANGES[key];
          const sl = slider(label, cur[key], mn, mx, st, v => { cur[key] = v; }, v => fmtNum(v, dec) + (unit ? ' ' + unit : ''));
          if (locked) sl.querySelector('input').disabled = true;
          card.append(sl);
        }
        body.append(card);
      }
    };
    render();
    const presets = Object.entries(SETUP_PRESETS).map(([id, p]) => btn(p.name, () => { Object.assign(cur, DEFAULT_SETUP, p.values); render(); }, 'small' + (locked ? ' ghost' : '')));
    const apply = () => {
      Game.saveSetup(trackId, cur);
      if (Game.state === 'paused' && Game.mode === 'test') { Game.applySetupLive(cur); this.toast('Setup übernommen – Fahrzeug an die Strecke gesetzt'); }
      else this.toast('Setup gespeichert');
      this.back();
    };
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Fahrzeug'), h('h1', 'Setup'), h('span', { style: { color: '#7d8898' } }, Game.getTrackModel(trackId).name)),
      locked ? h('div.hint', 'Parc fermé: Während des Rennens kann das Setup nicht verändert werden (Bremsbalance über die Tasten im Auto).') : null,
      h('div.row', { style: { alignItems: 'center', marginBottom: '12px' } }, h('span', { style: { color: '#b9c2cf', fontSize: '13px' } }, 'Voreinstellungen:'), ...(locked ? [] : presets)),
      h('div.scroll', { style: { flex: '1' } }, body),
      h('div.actions', locked ? null : btn('Übernehmen', apply, 'primary'), locked ? null : btn('Standard', () => { Object.assign(cur, DEFAULT_SETUP); render(); }, 'ghost'), btn('Zurück', () => this.back(), 'ghost')),
    );
  },

  // ---------------------------------------------------------------------------
  //  Telemetrie: zwei Runden über der Distanz vergleichen
  // ---------------------------------------------------------------------------
  scr_telemetry() {
    const rec = Game.recorder;
    const laps = rec ? rec.laps.slice() : [];
    if (!laps.length) return h('section.screen.solid', h('header', h('span.crumb', 'Analyse'), h('h1', 'Telemetrie')),
      h('div.hint', 'Noch keine vollständige Runde aufgezeichnet. Fahre mindestens eine Runde.'), h('div.actions', btn('Zurück', () => this.back(), 'ghost')));
    const best = rec.best || laps[laps.length - 1];
    let A = laps[laps.length - 1], B = best !== A ? best : (laps[laps.length - 2] || null);
    const label = (l) => `Runde ${l.lap} · ${fmtTime(l.time)}${l.valid ? '' : ' (ungültig)'}${l === rec.best ? ' ★' : ''}`;
    const selA = h('select'), selB = h('select');
    laps.forEach((l, i) => { selA.append(h('option', { value: i, selected: l === A }, label(l))); selB.append(h('option', { value: i, selected: l === B }, label(l))); });
    selB.prepend(h('option', { value: -1, selected: !B }, '– kein Vergleich –'));
    const W = Math.min(1500, window.innerWidth - 130);
    const mk = (hh) => h('canvas', { width: W, height: hh });
    const cS = mk(170), cP = mk(110), cSt = mk(90), cG = mk(70), cD = mk(90);
    const secTbl = h('div');
    const draw = () => {
      const L = Game.track.length;
      const xOf = (d) => 40 + (d / L) * (W - 50);
      const plot = (cv, getA, getB, lo, hi, opts = {}) => {
        const g = cv.getContext('2d'), Hh = cv.height;
        g.fillStyle = '#07080b'; g.fillRect(0, 0, W, Hh);
        g.strokeStyle = '#1d2430'; g.lineWidth = 1; g.fillStyle = '#7d8898'; g.font = '11px sans-serif';
        for (let k = 0; k <= 4; k++) { const y = 6 + (Hh - 12) * k / 4; g.beginPath(); g.moveTo(40, y); g.lineTo(W - 10, y); g.stroke(); g.fillText(String(Math.round(hi - (hi - lo) * k / 4)), 2, y + 4); }
        // Sektorgrenzen
        g.strokeStyle = '#3a4456'; (Game.track.sectorS || []).forEach((s, i) => { if (i) { const x = xOf(s); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hh); g.stroke(); } });
        const yOf = (v) => 6 + (Hh - 12) * (1 - (v - lo) / (hi - lo));
        const line = (lap, get, col, dash) => {
          if (!lap) return; g.strokeStyle = col; g.lineWidth = 1.6; g.setLineDash(dash ? [5, 4] : []); g.beginPath();
          for (let i = 0; i < lap.d.length; i++) { const x = xOf(lap.d[i]), y = yOf(get(lap, i)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
          g.stroke(); g.setLineDash([]);
        };
        for (const [get, col] of getA) line(A, get, col, false);
        if (B) for (const [get, col] of getB) line(B, get, col, true);
        if (opts.title) { g.fillStyle = '#b9c2cf'; g.font = 'bold 12px sans-serif'; g.fillText(opts.title, 48, 18); }
      };
      plot(cS, [[(l, i) => l.spd[i], '#ff3b1f']], [[(l, i) => l.spd[i], '#38c6ff']], 0, 340, { title: 'Geschwindigkeit (km/h)' });
      plot(cP, [[(l, i) => l.thr[i] * 100, '#2fe36b'], [(l, i) => l.brk[i] * 100, '#ff3b3b']], [[(l, i) => l.thr[i] * 100, '#1f9a4a'], [(l, i) => l.brk[i] * 100, '#a82828']], 0, 100, { title: 'Gas / Bremse (%)' });
      plot(cSt, [[(l, i) => l.str[i] * 180, '#ffd400']], [[(l, i) => l.str[i] * 180, '#38c6ff']], -180, 180, { title: 'Lenkung (°)' });
      plot(cG, [[(l, i) => l.gear[i], '#e8edf5']], [[(l, i) => l.gear[i], '#38c6ff']], 0, 8, { title: 'Gang' });
      // Delta-Zeit B − A über Distanz
      const g = cD.getContext('2d'), Hh = cD.height;
      g.fillStyle = '#07080b'; g.fillRect(0, 0, W, Hh);
      g.fillStyle = '#b9c2cf'; g.font = 'bold 12px sans-serif';
      if (B) {
        const n = Math.min(A.d.length, B.d.length), dl = []; let mx = 0.2;
        for (let i = 0; i < n; i++) { const d = A.t[i] - B.t[i]; dl.push(d); mx = Math.max(mx, Math.abs(d)); }
        g.strokeStyle = '#2a3342'; g.beginPath(); g.moveTo(40, Hh / 2); g.lineTo(W - 10, Hh / 2); g.stroke();
        g.strokeStyle = '#ff3bd4'; g.lineWidth = 1.8; g.beginPath();
        for (let i = 0; i < n; i++) { const x = xOf(A.d[i]), y = Hh / 2 - dl[i] / mx * (Hh / 2 - 8); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
        g.fillText(`Zeitdifferenz A − B (±${mx.toFixed(2)} s; oben = A langsamer)`, 48, 16);
      } else g.fillText('Zeitdifferenz: Vergleichsrunde wählen', 48, 16);
      // Sektortabelle
      const row = (l, c) => h('tr', h('td', h('i.sw', { style: { background: c } }), label(l)), ...[0, 1, 2].map(k => h('td.num', l.sectors && l.sectors[k] != null ? l.sectors[k].toFixed(3).replace('.', ',') : '–')), h('td.num', fmtTime(l.time)));
      secTbl.innerHTML = '';
      secTbl.append(h('table.res', h('tr', h('th', 'Runde'), h('th', 'S1'), h('th', 'S2'), h('th', 'S3'), h('th', 'Zeit')), row(A, '#ff3b1f'), B ? row(B, '#38c6ff') : null));
    };
    selA.onchange = () => { A = laps[+selA.value]; draw(); };
    selB.onchange = () => { B = +selB.value < 0 ? null : laps[+selB.value]; draw(); };
    setTimeout(draw, 0);
    const csv = () => {
      const lines = ['distanz_m;zeit_s;kmh;gas;bremse;lenkung;gang;drehzahl;querg'];
      for (let i = 0; i < A.d.length; i++) lines.push([A.d[i], A.t[i].toFixed(3), A.spd[i].toFixed(1), A.thr[i].toFixed(3), A.brk[i].toFixed(3), A.str[i].toFixed(3), A.gear[i], Math.round(A.rpm[i]), A.lat[i].toFixed(2)].join(';'));
      this.showText(`Telemetrie Runde ${A.lap} (CSV)`, lines.join('\n'));
    };
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Analyse'), h('h1', 'Telemetrie')),
      h('div.row', { style: { alignItems: 'center', marginBottom: '6px' } }, h('span', { style: { color: '#ff3b1f', fontWeight: 800 } }, 'A'), selA, h('span', { style: { color: '#38c6ff', fontWeight: 800 } }, 'B'), selB, btn('Als CSV', csv, 'small ghost')),
      h('div.legend', h('span', h('i', { style: { background: '#ff3b1f' } }), 'Runde A (durchgezogen)'), h('span', h('i', { style: { background: '#38c6ff' } }), 'Runde B (gestrichelt)'), h('span', 'Senkrechte Linien = Sektorgrenzen')),
      h('div.scroll.tele', { style: { flex: '1' } }, cS, cP, cSt, cG, cD, secTbl),
      h('div.actions', btn('Zurück', () => this.back(), 'ghost')),
    );
  },

  // ---------------------------------------------------------------------------
  //  Rennergebnis
  // ---------------------------------------------------------------------------
  scr_results() {
    const race = Game.race;
    if (!race) return h('section.screen.solid', h('div.actions', btn('Hauptmenü', () => Game.toMenu(), 'primary')));
    const cls = race.classification();
    const me = race.player;
    const myRow = cls.find(r => r.e === me);
    const tbl = h('table.res', h('tr', h('th', 'Pos'), h('th', 'Fahrer'), h('th', 'Team'), h('th', 'Rd'), h('th', 'Zeit / Abstand'), h('th', 'Beste Runde'), h('th', 'Stopps'), h('th', 'Strafen')));
    for (const r of cls) {
      const team = TEAMS.find(t => t.id === r.team);
      const time = r.retired ? 'Ausgeschieden' : !r.finished ? (r.gap ? fmtGap(r.gap) : 'im Rennen') : r.pos === 1 ? fmtTime(r.total) : fmtGap(r.gapTotal);
      const fl = race.fastest.entry === r.e;
      tbl.append(h('tr' + (r.e === me ? '.me' : ''),
        h('td.num', String(r.pos)), h('td', h('i.sw', { style: { background: team.colors[0] } }), `${r.number} · ${r.name}`), h('td', team.name), h('td.num', String(r.laps)),
        h('td.num', time), h('td.num', { style: fl ? { color: '#b65cff', fontWeight: 800 } : {} }, fmtTime(r.best)), h('td.num', `${r.e.pitStops} · ${[...r.e.used].map(c => COMPOUNDS[c].short).join('-')}`), h('td.num', r.penalty - r.e.penaltyServed > 0 ? `+${r.penalty - r.e.penaltyServed} s` : (r.penalty ? `${r.penalty} s (abgesessen)` : ''))));
    }
    const title = myRow ? (myRow.retired ? 'Ausgeschieden' : `Platz ${myRow.pos}`) : 'Ergebnis';
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Rennergebnis'), h('h1', title), h('span', { style: { color: '#7d8898' } }, `${race.track.name} · ${race.laps} ${race.laps === 1 ? 'Runde' : 'Runden'}`)),
      race.fastest.entry ? h('div.hint', 'Schnellste Runde: ', h('b', `${race.fastest.entry.name} ${fmtTime(race.fastest.time)}`), ` (Runde ${race.fastest.lap})`) : null,
      h('div.scroll', { style: { flex: '1' } }, tbl),
      Game.seasonRound && Game.season
        ? h('div.actions', btn('Wiederholung', () => Game.openReplay('results')), btn('Punkte & Meisterschaftstabelle', () => { Game.scoreSeasonRace(); Game.toMenu(); this.show('season', { justScored: true }); }, 'primary', '▶'))
        : h('div.actions', btn('Wiederholung', () => Game.openReplay('results')), btn('Telemetrie', () => this.show('telemetry')), btn('Nochmal fahren', () => Game.startRace(), 'primary'), btn('Hauptmenü', () => Game.toMenu(), 'ghost')),
    );
  },

  // ---------------------------------------------------------------------------
  //  Wiederholung: Steuerleiste, Zeitleiste mit Ereignissen, Positionsliste
  // ---------------------------------------------------------------------------
  showReplay(on) {
    const el = $('replay'), tw = $('replayTower');
    if (!el) return;
    el.classList.toggle('hidden', !on); tw.classList.toggle('hidden', !on || Game.mode !== 'race');
    if (this._rpKey) { window.removeEventListener('keydown', this._rpKey, true); this._rpKey = null; }
    if (!on) { el.innerHTML = ''; tw.innerHTML = ''; return; }
    const R = Game.replay;
    const b = (label, fn, title = '') => h('button', { title, onclick: (e) => { e.stopPropagation(); AudioSys.uiClick(); fn(); this.updateReplay(Game.rp, R); } }, label);
    const tl = h('div.rtl', h('div.bg'), h('div.fg'), h('div.knob'));
    const seek = (ev) => { const r = tl.getBoundingClientRect(), f = clamp((ev.clientX - r.left) / r.width, 0, 1); Game.replaySeekTo(R.start + f * R.length); this.updateReplay(Game.rp, R); };
    let drag = false;
    tl.addEventListener('pointerdown', (ev) => { drag = true; tl.setPointerCapture(ev.pointerId); seek(ev); });
    tl.addEventListener('pointermove', (ev) => { if (drag) seek(ev); });
    tl.addEventListener('pointerup', () => { drag = false; });
    const span = Math.max(1, R.length);
    for (const e of R.events) { if (e.type === 'start') continue; tl.append(h('div.ev.' + e.type, { style: { left: ((e.t - R.start) / span * 100) + '%' }, title: e.text })); }
    const speeds = h('span', REPLAY_SPEEDS.map(x => b(x < 1 ? `${x === 0.25 ? '¼' : '½'}×` : `${x}×`, () => Game.replaySpeed(x), 'Tempo (Tasten , und .)')));
    speeds.classList.add('rspd');
    el.append(
      h('div.rtop', h('span.rtitle', 'Wiederholung'), h('span.rcar', { id: 'rpCar' }), h('span.rinfo', { id: 'rpInfo' })),
      tl,
      h('div.rbtns',
        b('⏮ Ereignis', () => Game.replayEvent(-1), 'Vorheriges Ereignis ([)'), b('−10 s', () => Game.replaySeek(-10)), h('span', { id: 'rpPlay' }, b('Pause', () => Game.replayToggle(), 'Abspielen/Pause (Leertaste)')), b('+10 s', () => Game.replaySeek(10)), b('Ereignis ⏭', () => Game.replayEvent(1), 'Nächstes Ereignis (])'),
        h('span.sep'), speeds, h('span.sep'),
        h('span', { id: 'rpCam' }, b('Kamera', () => Game.replayCam(), 'Kamera wechseln (C)')),
        b('◀ Auto', () => Game.replayFollow(-1), 'Vorheriges Auto (↑ / Schaltwippe)'), b('Auto ▶', () => Game.replayFollow(1), 'Nächstes Auto (↓ / Schaltwippe)'),
        h('span', { id: 'rpAuto' }, b('Regie', () => Game.replayAuto(), 'Automatische Regie an/aus (F)')),
        h('span.sep'), b('Beenden', () => Game.closeReplay(), 'Zurück (Esc)')),
      h('div.rkeys', 'Leertaste Abspielen/Pause · ← → 5 s spulen · ↑ ↓ Auto wechseln · , . Tempo · [ ] Ereignisse · C Kamera · F Regie · Esc zurück · Zeitleiste anklicken zum Springen'),
    );
    this._rpKey = (ev) => {
      if (Game.state !== 'replay') return;
      const k = ev.code;
      if (k === 'Escape') { ev.preventDefault(); ev.stopPropagation(); Input.keyLatch.delete('Escape'); Input.keys.delete('Escape'); Game.closeReplay(); return; }
      else if (k === 'ArrowLeft' || k === 'ArrowRight') { Game.replaySeek(k === 'ArrowLeft' ? -5 : 5); ev.preventDefault(); }
      else if (k === 'ArrowUp' || k === 'ArrowDown') { Game.replayFollow(k === 'ArrowUp' ? -1 : 1); ev.preventDefault(); }
      else return;
      this.updateReplay(Game.rp, R);
    };
    window.addEventListener('keydown', this._rpKey, true);
    this._rpCache = {};
    this.updateReplay(Game.rp, R);
  },
  updateReplay(rp, R) {
    if (!rp) return;
    const el = $('replay'); if (!el || el.classList.contains('hidden')) return;
    const C = this._rpCache || (this._rpCache = {});
    const set = (id, html) => { if (C[id] !== html) { C[id] = html; const e = $(id); if (e) e.innerHTML = html; } };
    const src = R.src[rp.follow], team = src.sc ? SC_TEAM : TEAMS.find(t => t.id === src.team) || TEAMS[0];
    const p = R.sample(rp.t, rp.follow, {});
    set('rpCar', `<i style="background:${team.colors[0]}"></i>${src.number ? src.number + ' · ' : ''}${src.name}${p.visible ? ` <small style="color:#9aa3ad;font-weight:700">${Math.round(p.speed * 3.6)} km/h · Gang ${p.gear <= 0 ? 'N' : p.gear}</small>` : ''}`);
    const rel = rp.t - R.start;
    set('rpInfo', `${fmtClock(rel)} / ${fmtClock(R.length)} · ${rp.speed === 1 ? 'Echtzeit' : rp.speed < 1 ? `Zeitlupe ${rp.speed}×` : `Zeitraffer ${rp.speed}×`}`);
    const f = R.length > 0 ? rel / R.length * 100 : 0;
    const fg = el.querySelector('.rtl .fg'), kn = el.querySelector('.rtl .knob');
    if (fg) fg.style.width = f + '%'; if (kn) kn.style.left = f + '%';
    const playBtn = el.querySelector('#rpPlay button'); if (playBtn) playBtn.textContent = rp.playing ? 'Pause' : '▶ Abspielen';
    const camBtn = el.querySelector('#rpCam button'); if (camBtn) camBtn.textContent = 'Kamera: ' + (CAMERA_NAMES[Game.camMode] || Game.camMode);
    const autoBtn = el.querySelector('#rpAuto button'); if (autoBtn) { autoBtn.textContent = rp.auto ? 'Regie: an' : 'Regie: aus'; autoBtn.classList.toggle('on', rp.auto); }
    el.querySelectorAll('.rspd button').forEach((bt, i) => bt.classList.toggle('on', REPLAY_SPEEDS[i] === rp.speed));
    // Positionsliste (Rennfortschritt zum Zeitpunkt)
    if (Game.mode === 'race') {
      const rows = [];
      for (let i = 0; i < R.n; i++) { if (R.src[i].noFocus) continue; const q = R.sample(rp.t, i, {}); rows.push({ i, d: q.visible ? q.dist : -1e12 + i }); }
      rows.sort((a, b) => b.d - a.d);
      let html = '<div class="hd">Positionen</div>';
      rows.forEach((r, k) => {
        const s = R.src[r.i], tm = TEAMS.find(t => t.id === s.team) || TEAMS[0];
        html += `<div class="tr${s.player ? ' me' : ''}${r.i === rp.follow ? ' cur' : ''}" data-i="${r.i}"><b>${k + 1}</b><i style="background:${tm.colors[0]}"></i><span>${s.player ? 'DU' : shortName(s.name)}</span></div>`;
      });
      const tw = $('replayTower');
      if (C.tower !== html) { C.tower = html; tw.innerHTML = html; tw.querySelectorAll('.tr').forEach(d => d.onclick = () => { Game.replayFocus(+d.dataset.i); this.updateReplay(Game.rp, R); }); }
    }
  },

  // ---------------------------------------------------------------------------
  //  Qualifying-Ergebnis
  // ---------------------------------------------------------------------------
  scr_qualiResults() {
    const q = Game.session;
    if (!q || q.kind !== 'quali') return h('section.screen.solid', h('div.actions', btn('Hauptmenü', () => Game.toMenu(), 'primary')));
    const st = q.standings(), pole = st[0].time;
    const tbl = h('table.res', h('tr', h('th', 'Pos'), h('th', 'Fahrer'), h('th', 'Team'), h('th', 'Zeit'), h('th', 'Abstand')));
    st.forEach((r, i) => {
      const team = TEAMS.find(t => t.id === r.team);
      tbl.append(h('tr' + (r.player ? '.me' : ''), h('td.num', String(i + 1)), h('td', h('i.sw', { style: { background: team.colors[0] } }), `${r.e.number} · ${r.name}`), h('td', team.name),
        h('td.num', { style: i === 0 ? { color: '#b65cff', fontWeight: 800 } : {} }, isFinite(r.time) ? fmtTime(r.time) : 'keine Zeit'), h('td.num', i && isFinite(r.time) ? '+' + (r.time - pole).toFixed(3).replace('.', ',') : '')));
    });
    const me = st.findIndex(r => r.player) + 1;
    const P = Game.raceParams();
    return h('section.screen.solid',
      h('header', h('span.crumb', Game.seasonRound ? `Meisterschaft · Runde ${Game.season.round + 1}` : 'Qualifying'), h('h1', isFinite(q.playerBest) ? `Startplatz ${me}` : `Keine gültige Runde – Startplatz ${me}`), h('span', { style: { color: '#7d8898' } }, `${q.track.name} · Pole: ${st[0].name} ${fmtTime(pole)}`)),
      h('div.scroll', { style: { flex: '1' } }, tbl),
      h('div.actions', btn(`Zum Rennen (${P.laps} ${P.laps === 1 ? 'Runde' : 'Runden'})`, () => Game.startRace(), 'primary', '▶'), btn('Wiederholung', () => Game.openReplay('results')), btn('Qualifying wiederholen', () => Game.startQualifying()), btn('Hauptmenü', () => Game.toMenu(), 'ghost')),
    );
  },

  // ---------------------------------------------------------------------------
  //  Meisterschaft: neue Saison, Kalender, Fahrer- und Teamwertung
  // ---------------------------------------------------------------------------
  scr_season(opts = {}) {
    const S = Game.season;
    const teamOf = (id) => TEAMS.find(t => t.id === id) || TEAMS[0];
    if (!S) {
      const o = this._seasonOpts || (this._seasonOpts = { distance: 'short', quali: true, qualiMin: 10, weather: 'random' });
      return h('section.screen.solid',
        h('header', h('span.crumb', 'Meisterschaft'), h('h1', 'Neue Saison')),
        h('div.row', { style: { alignItems: 'flex-start' } },
          h('div.col', { style: { flex: '1 1 520px', maxWidth: '720px' } },
            h('div.card', h('h3', 'Kalender'), h('ol', TRACK_ORDER.map(id => h('li', `${TRACKS[id].name} – ${fmtNum(Game.getTrackModel(id).length / 1000, 2)} km`))),
              h('p', { style: { fontSize: '12px' } }, `Punkte: ${POINTS.join('-')} für die Plätze 1–10, +1 für die schnellste Runde (wenn in den Top 10). Volles Feld mit 20 Autos, Fahrer- und Teamwertung. Der Spielstand wird automatisch gespeichert.`)),
            h('div.card', h('h3', 'Renndistanz'), toggle(Object.entries(SEASON_DISTANCES).map(([value, d]) => ({ value, label: d.name })), o.distance, v => { o.distance = v; })),
            h('div.card', h('h3', 'Qualifying'), toggle([{ value: 0, label: 'Aus (Startplatz Mitte)' }, ...QUALI_DURATIONS.map(m => ({ value: m, label: `${m} min` }))], o.quali ? o.qualiMin : 0, v => { o.quali = v > 0; if (v) o.qualiMin = v; })),
            h('div.card', h('h3', 'Wetter'), chips(WEATHER_ORDER.map(id => ({ value: id, label: WEATHER_TYPES[id].name })), o.weather, v => { o.weather = v; }), h('p', { style: { fontSize: '12px' } }, '„Zufällig“ würfelt das Wetter für jedes Wochenende neu.')),
          ),
          h('div.col', { style: { flex: '0 1 420px' } },
            h('div.card', h('h3', 'Team / Lackierung'), chips(TEAMS.map(t => ({ value: t.id, label: t.name, color: t.colors[0] })), Game.settings.game.team, v => { Game.settings.game.team = v; Game.saveSettings(); Game.refreshGarageCar(); })),
            h('div.card', h('h3', 'KI-Stärke'), h('p', `${Math.round(Game.settings.race.strength * 100)} % – einstellbar unter „Schnelles Rennen“.`)),
            h('div.actions', btn('Saison starten', () => { Game.newSeason(o); this.show('season', { noHistory: true }); }, 'primary', '▶'), btn('Zurück', () => this.back(), 'ghost')),
          ),
        ),
      );
    }
    const done = Season.done(S), table = Season.driverTable(S), teams = Season.teamTable(S);
    const cal = h('table.res', h('tr', h('th', 'Rd'), h('th', 'Strecke'), h('th', 'Sieger'), h('th', 'Du')));
    S.tracks.forEach((id, i) => {
      const r = S.results[i], win = r && r.order[0], mine = r && r.order.find(x => x.player);
      cal.append(h('tr' + (i === S.round && !done ? '.me' : ''), h('td.num', String(i + 1)), h('td', TRACKS[id].name), h('td', win ? `${win.name}${win.player ? ' (du)' : ''}` : i === S.round ? 'nächstes Rennen' : ''), h('td.num', mine ? (mine.retired ? 'AUS' : `P${mine.pos} · ${mine.pts} Pkt`) : '')));
    });
    const dt = h('table.res', h('tr', h('th', 'Pos'), h('th', 'Fahrer'), h('th', 'Team'), h('th', 'Siege'), h('th', 'Punkte')));
    table.forEach((d, i) => dt.append(h('tr' + (d.player ? '.me' : ''), h('td.num', String(i + 1)), h('td', h('i.sw', { style: { background: teamOf(d.team).colors[0] } }), d.name), h('td', teamOf(d.team).name), h('td.num', String(d.wins)), h('td.num', String(d.pts)))));
    const tt = h('table.res', h('tr', h('th', 'Pos'), h('th', 'Team'), h('th', 'Punkte')));
    teams.forEach((t, i) => tt.append(h('tr' + (t.id === S.team ? '.me' : ''), h('td.num', String(i + 1)), h('td', h('i.sw', { style: { background: teamOf(t.id).colors[0] } }), teamOf(t.id).name), h('td.num', String(t.pts)))));
    const myPos = table.findIndex(d => d.player) + 1;
    const last = S.results[S.results.length - 1], lastMine = last && last.order.find(x => x.player);
    const title = done ? (myPos === 1 ? 'Du bist Weltmeister!' : `Saison beendet – du wirst ${myPos}.`) : `Runde ${S.round + 1} von ${S.tracks.length}: ${TRACKS[S.tracks[S.round]].name}`;
    const nextTrack = !done && Game.getTrackModel(S.tracks[S.round]);
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Meisterschaft'), h('h1', title), h('span', { style: { color: '#7d8898' } }, `${SEASON_DISTANCES[S.distance].name} · Qualifying ${S.quali ? S.qualiMin + ' min' : 'aus'} · Wetter ${WEATHER_TYPES[S.weather] ? WEATHER_TYPES[S.weather].name : S.weather}`)),
      opts.justScored && lastMine ? h('div.hint', `${TRACKS[last.track].name}: ${lastMine.retired ? 'ausgeschieden' : `Platz ${lastMine.pos}`} – ${lastMine.pts} ${lastMine.pts === 1 ? 'Punkt' : 'Punkte'}${lastMine.fl ? ' (inkl. schnellste Runde)' : ''}. Du bist ${myPos}. der Fahrerwertung.`) : null,
      h('div.row.scroll', { style: { alignItems: 'flex-start', flex: '1' } },
        h('div.col', { style: { flex: '1 1 460px' } }, h('div.card', h('h3', 'Fahrerwertung'), dt)),
        h('div.col', { style: { flex: '0 1 400px' } }, h('div.card', h('h3', 'Kalender'), cal), h('div.card', h('h3', 'Teamwertung'), tt)),
      ),
      h('div.actions',
        done ? null : btn(`${S.quali ? 'Qualifying' : 'Rennen'} starten · ${nextTrack.name} (${Season.lapsFor(S, nextTrack)} Runden)`, () => Game.startSeasonRound(), 'primary', '▶'),
        done ? null : btn('Fahrzeug-Setup', () => { Game.settings.game.track = S.tracks[S.round]; this.show('setup'); }),
        btn(done ? 'Neue Saison' : 'Saison abbrechen', () => done ? (Game.endSeason(), this.show('season', { noHistory: true })) : this.confirm('Saison wirklich abbrechen? Der Spielstand geht verloren.', () => { Game.endSeason(); this.show('season', { noHistory: true }); }), 'ghost'),
        btn('Hauptmenü', () => this.show('main', { noHistory: true }), 'ghost')),
    );
  },

  // ---------------------------------------------------------------------------
  //  Renn-HUD
  // ---------------------------------------------------------------------------
  /** Flaggen-Banner: green kurz anzeigen, dann ausblenden */
  setFlag(f, vscMax) {
    const el = $('hudFlag');
    const names = { yellow: 'Gelbe Flagge', sc: 'Safety Car', vsc: 'Virtuelles Safety Car', vscEnd: 'VSC endet', blue: 'Blaue Flagge', green: 'Grüne Flagge', chequered: 'Zielflagge' };
    const sub = { yellow: 'Nicht überholen – langsamer', sc: 'Nicht überholen – hinter dem Vordermann einreihen', blue: 'Schnelleres Auto überrunden lassen', vsc: vscMax ? `Höchstens ${Math.round(vscMax * 3.6)} km/h · nicht überholen` : 'Nicht überholen' };
    const key = f + '|' + (f === 'vsc' && vscMax ? Math.round(vscMax * 3.6 / 5) : '');
    if (this.hudCache.flag === key) return;
    const was = this.hudCache.flag; this.hudCache.flag = key;
    if (!f || (f === 'green' && (!was || was.startsWith('green')))) { el.classList.add('hidden'); return; }
    el.className = f; el.innerHTML = `${names[f] || f}${sub[f] ? `<small>${sub[f]}</small>` : ''}`;
    clearTimeout(this._flagTimer);
    if (f === 'green') this._flagTimer = setTimeout(() => el.classList.add('hidden'), 2500);
  },
  setRaceHud(on, total = 20, kind = 'race') {
    $('hudFlag').classList.add('hidden'); $('hudBox').classList.add('hidden');
    $('hudTower').classList.toggle('hidden', !on);
    $('hudGaps').classList.toggle('hidden', !on || kind === 'quali');
    $('hudPos').classList.toggle('hidden', !on || kind === 'quali');
    $('hudLights').classList.add('hidden');
    if (on) $('hudPosTot').textContent = '/' + total;
    this.hudCache = {};
    this.setSectors([null, null, null], 0);
  },
  setLights(n) {
    const el = $('hudLights');
    el.classList.toggle('hidden', n <= 0 && !this._lightsShown);
    [...el.children].forEach((c, i) => c.classList.toggle('on', i < n));
    if (n > 0) this._lightsShown = true;
    if (n === 0 && this._lightsShown) { this._lightsShown = false; setTimeout(() => el.classList.add('hidden'), 1200); }
  },
  /** Sektoranzeige: states = ['purple'|'green'|'yellow'|'invalid'|null], cur = laufender Sektor */
  setSectors(states, cur) {
    for (let k = 0; k < 3; k++) {
      const cls = states[k] || (k === cur ? 'cur' : '');
      const el = $('sec' + k); if (el.className !== cls) el.className = cls;
    }
  },
  /** Qualifying-HUD: Restzeit, vorläufige Position, Zeitenliste */
  updateQualiHud(q) {
    const st = q.standings(), mi = st.findIndex(r => r.player);
    this._txt('hudPosNum', String(mi + 1));
    const pole = st[0].time;
    let html = `<div class="hd">Qualifying · ${q.phase === 'running' ? fmtClock(q.remaining) : q.phase === 'last' ? 'letzte Runde' : 'beendet'}</div>`;
    const rowH = 16, fit = Math.max(6, Math.floor((window.innerHeight - 190 - 250) / rowH));
    let show = st.map((_, i) => i);
    if (st.length > fit) { const top = 3, around = fit - top - 1, from = clamp(mi - Math.floor(around / 2), top, st.length - around); show = [...Array(top).keys(), ...Array.from({ length: around }, (_, k) => from + k)]; }
    let lastI = -1;
    show.forEach((i) => {
      const r = st[i];
      if (i !== lastI + 1) html += '<div class="tr" style="opacity:.5"><b></b><i></i><span>…</span><em></em></div>';
      lastI = i;
      const team = TEAMS.find(t => t.id === r.team);
      const t = !isFinite(r.time) ? '' : i === 0 ? fmtTime(r.time) : '+' + (r.time - pole).toFixed(3).replace('.', ',');
      html += `<div class="tr${r.player ? ' me' : ''}"><b>${i + 1}</b><i style="background:${team.colors[0]}"></i><span>${r.player ? 'DU' : shortName(r.name)}</span><em>${t}</em></div>`;
    });
    if (this.hudCache.tower !== html) { this.hudCache.tower = html; $('hudTower').innerHTML = html; }
    const bt = q.phase === 'running' ? `QUALIFYING · noch ${fmtClock(q.remaining)}${isFinite(q.playerBest) ? ` · Bestzeit ${fmtTime(q.playerBest)}` : ''}` : q.phase === 'last' ? 'Zeit abgelaufen – letzte Runde' : '';
    $('hudBox').classList.toggle('hidden', !bt);
    if (this.hudCache.box !== bt) { this.hudCache.box = bt; $('hudBox').innerHTML = bt; }
  },
  updateRaceHud(race) {
    const me = race.player; if (!me) return;
    this._towerT = (this._towerT || 0) + 1;
    const order = race.order || race.entries;
    this._txt('hudPosNum', String(me.pos));
    const lapNow = Math.min(race.laps, Math.max(1, me.timing.lap));
    this._txt('hudLapNo', `${lapNow}/${race.laps}`);
    // Abstände
    const ahead = order[me.pos - 2], behind = order[me.pos];
    const live = race.state === 'race';
    this._txt('gapAhead', ahead && live ? `${shortName(ahead.name)} ${fmtGap(race.gap(ahead, me)).replace('+', '−')}` : '–');
    this._txt('gapBehind', behind && !behind.retired && live ? `${shortName(behind.name)} ${fmtGap(race.gap(me, behind))}` : '–');
    // Zeitenturm (Abstand zum Vordermann)
    let html = `<div class="hd">${live || race.flag === 'chequered' ? `Runde ${lapNow}/${race.laps}` : 'Startaufstellung'}${race.flag === 'chequered' ? ' · Zielflagge' : ''}</div>`;
    // Platz: bei kleinen Fenstern Spitze + Umfeld des Spielers zeigen
    const rowH = 16, fit = Math.max(6, Math.floor((window.innerHeight - 190 - 250) / rowH));
    let show = order.map((_, i) => i);
    if (order.length > fit) {
      const mi = order.indexOf(me), top = 3, around = fit - top - 1;
      const from = clamp(mi - Math.floor(around / 2), top, order.length - around);
      show = [...Array(top).keys(), ...Array.from({ length: around }, (_, k) => from + k)];
    }
    let lastI = -1;
    show.forEach((i) => {
      const e = order[i];
      if (i !== lastI + 1) html += '<div class="tr" style="opacity:.5"><b></b><i></i><span>…</span><em></em></div>';
      lastI = i;
      const team = TEAMS.find(t => t.id === e.team);
      const prev = order[i - 1];
      let gap = !live && !e.finished && race.flag !== 'chequered' ? '' : i === 0 ? (e.finished ? 'Ziel' : 'Führt') : e.retired ? 'AUS' : fmtGap(race.gap(prev, e));
      if (e.finished && i > 0) gap = 'Ziel';
      if (e.penalty && !e.retired) gap += ` <span style="color:#ffb02e">+${e.penalty}</span>`;
      const fl = race.fastest.entry === e ? ' <span class="fl">●</span>' : '';
      if (e.pitting && !e.retired) gap = '<span class="bx">BOX</span>';
      const cp = `<span class="cp" style="background:${COMPOUNDS[e.vehicle.compound].color}"></span>`;
      html += `<div class="tr${e.player ? ' me' : ''}${e.retired ? ' out' : ''}"><b>${i + 1}</b><i style="background:${team.colors[0]}"></i><span>${e.player ? 'DU' : shortName(e.name)}${cp}${fl}</span><em>${gap}</em></div>`;
    });
    if (this.hudCache.tower !== html) { this.hudCache.tower = html; $('hudTower').innerHTML = html; }
    // Flaggen-Banner (VSC: erlaubtes Tempo) und Box-Status
    this.setFlag(race.playerFlag, race.vscMax);
    const plan = me.pitPlan, box = me.pitting ? 'BOXENGASSE · Autopilot' : plan ? `BOX angefordert · ${COMPOUNDS[plan.compound].name}${plan.repair ? ' · Reparatur' : ''}` : '';
    const mand = race.mandatory ? (me.used.size >= 2 ? 'Pflichtstopp erfüllt' : 'Pflichtstopp offen') : '';
    const bt = [box, mand].filter(Boolean).join('<br>');
    $('hudBox').classList.toggle('hidden', !bt);
    if (this.hudCache.box !== bt) { this.hudCache.box = bt; $('hudBox').innerHTML = bt; }
  },
});
