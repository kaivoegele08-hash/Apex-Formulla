// ============================================================================
//  UI – Menüs, Einstellungen, Kalibrierungsassistent, Eingabetest, Hilfe,
//  Pause, HUD, Meldungen
// ============================================================================

/** Kleiner DOM-Helfer: h('div.klasse#id', {attr}, kinder…) */
function h(sel, attrs, ...kids) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, n) => { if (t === '.') el.classList.add(n); else el.id = n; });
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (v !== false && v !== null && v !== undefined) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const $ = (id) => document.getElementById(id);
function btn(label, onclick, cls = '', key = '') { return h('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { onclick: (e) => { AudioSys.uiClick(); onclick(e); } }, h('span', label), key ? h('span.k', key) : null); }
function chips(options, value, onChange) {
  const wrap = h('div.chips');
  const render = (val) => {
    wrap.innerHTML = '';
    for (const o of options) {
      const c = h('div.chip' + (o.value === val ? '.on' : ''), { onclick: () => { AudioSys.uiClick(); onChange(o.value); render(o.value); } }, h('span', o.color ? h('i.dot', { style: { background: o.color } }) : null, o.label));
      wrap.append(c);
    }
  };
  render(value);
  return wrap;
}
function toggle(options, value, onChange) {
  const wrap = h('div.toggle');
  const render = (val) => { wrap.innerHTML = ''; for (const o of options) wrap.append(h('button' + (o.value === val ? '.on' : ''), { onclick: () => { AudioSys.uiClick(); onChange(o.value); render(o.value); } }, o.label)); };
  render(value);
  return wrap;
}
/** Schieberegler-Zeile */
function slider(label, value, min, max, step, onInput, fmt = (v) => String(v)) {
  const val = h('span.val', fmt(value));
  const inp = h('input', { type: 'range', min, max, step, value });
  inp.addEventListener('input', () => { const v = parseFloat(inp.value); val.textContent = fmt(v); onInput(v); });
  return h('div.field', h('label', label), inp, val);
}
/** Epochen-Auswahl mit Beschreibung und Kenndaten; onPick(id) – Standard: Einstellung + sofort aktivieren */
function eraCard(cur, onPick) {
  const info = h('div');
  const show = (id) => {
    const E = eraOf(id), S = Object.assign({}, CAR_SPEC_BASE, E.spec || {}), eng = Object.assign({}, CAR_SPEC_BASE.engine, (E.spec || {}).engine || {});
    const ice = Math.max(...eng.curve.map(([r, T]) => T * r * Math.PI / 30)) / 1000, ers = ((E.spec || {}).ers || CAR_SPEC_BASE.ers).maxKW;
    const aero = ((E.spec || {}).aero || {}).mode || 'active';
    info.innerHTML = '';
    info.append(h('h2.ital', { style: { margin: '8px 0 4px' } }, E.title), h('p', E.desc),
      h('div', h('span.stat', h('b', Math.round((ice + ers) * 1.36) + ' PS'), h('small', E.engineName)), h('span.stat', h('b', S.mass + ' kg'), h('small', 'mit Fahrer')),
        h('span.stat', h('b', ers ? `${ers} kW` : '–'), h('small', 'ERS')), h('span.stat', h('b', aero === 'drs' ? 'DRS' : aero === 'active' ? 'Aktiv' : '–'), h('small', 'Aero')), h('span.stat', h('b', E.halo ? 'ja' : 'nein'), h('small', 'Halo'))));
  };
  show(cur);
  return h('div.card', h('h3', 'Epoche (Fahrzeug, Fahrverhalten, Fahrerfeld)'),
    chips(ERA_ORDER.map(id => ({ value: id, label: ERAS[id].name })), cur, (id) => { (onPick || ((x) => Game.setEra(x)))(id); show(id); }), info);
}
function fieldRow(label, control) { return h('div.field.wide', h('label', label), control); }

const UI = {
  root: null, current: null, prev: [], wizard: null, wizEl: null, testEl: null, mfdOpen: false,
  hudCache: {}, hudT: 0, mapT: 0, ffbHist: new Float32Array(240), ffbI: 0, frameHist: new Float32Array(160), frameI: 0,

  init() {
    this.root = $('screens');
    this._buildHud();
    Events.on('toast', (m) => this.toast(m));
    Events.on('ffb:state', (st, msg) => {
      if (this.current === 'settings' && this.settingsTab === 'wheel' && this.rerenderSettings && !this.capturing) this.rerenderSettings();
      if (st === 'error' && msg) this.toast('Force Feedback: ' + msg, 7000);
    });
    Input.onDeviceConnected = (ds) => this._onDevice(ds);
    Events.on('input:disconnected', (ds) => this.toast(`Gerät getrennt: ${ds.displayName}`));
  },

  // ---------------------------------------------------------------------------
  //  Navigation
  // ---------------------------------------------------------------------------
  show(name, opts = {}) {
    if (this.current && this.current !== name && !opts.noHistory) this.prev.push(this.current);
    this.current = name;
    this.root.innerHTML = '';
    const build = this['scr_' + name];
    if (build) this.root.append(build.call(this, opts));
    Input.flush();
    Events.emit('ui:screen', name);
  },
  back() { const p = this.prev.pop(); if (p) this.show(p, { noHistory: true }); else this.show(Game.state === 'menu' ? 'main' : 'pause', { noHistory: true }); },
  hideScreens() { this.current = null; this.root.innerHTML = ''; this.prev = []; },
  toast(msg, ms = 3200) {
    const t = h('div', msg); $('toasts').append(t);
    setTimeout(() => t.remove(), ms);
  },
  hudMsg(msg, ms = 1500) {
    const box = $('hudMsg');
    const d = h('div', msg); box.append(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), ms);
  },

  // ---------------------------------------------------------------------------
  //  Hauptmenü
  // ---------------------------------------------------------------------------
  scr_main() {
    const S = Game.settings, G = S.game, E = eraOf(G.era || 'e2026'), team = Game.team;
    const devs = h('div.devices-pill', { id: 'devPill' });
    this._updateDevPill(devs);
    const season = Game.season, sDone = season && Season.done(season);
    const tile = (o) => {
      const el = h('button.tile' + (o.big ? '.big' : '') + (o.dim ? '.dim' : ''), { onclick: () => { if (o.dim) { this.toast(o.dimMsg || 'Kommt bald'); return; } AudioSys.uiClick(); o.go(); } },
        o.badge ? h('span.tbadge' + (o.dim ? '.soon' : ''), o.badge) : null, o.deco ? h('span.tdeco', o.deco) : null,
        h('span.tk', o.kicker || ''), h('span.tt', o.title), o.desc ? h('span.td', o.desc) : null);
      if (o.bg) el.style.setProperty('--tbg', o.bg);
      if (o.acc) el.style.setProperty('--tacc', o.acc);
      return el;
    };
    const c0 = team.colors[0], c1 = team.colors[1];
    const tiles = h('div.hub-main',
      tile({ big: true, kicker: 'Spielmodus', title: 'Karriere', desc: 'Eigener Fahrer, mehrere Saisons, Teamwechsel, Rivalen und Social Media.', deco: 'K', dim: !UI.scr_career, dimMsg: 'Die Karriere kommt mit einem der nächsten Updates.', badge: UI.scr_career ? ([1, 2, 3].some(k => Game.careerInfo(k)) ? 'Fortsetzen' : 'Neu') : 'Bald',
        bg: `linear-gradient(135deg, ${c0}cc 0%, #0e1117 70%)`, acc: c1, go: () => this.show('career') }),
      tile({ kicker: season && !sDone ? `Runde ${season.round + 1} von ${season.tracks.length}` : 'Saison', title: 'Meisterschaft', desc: season && !sDone ? `${eraOf(season.era || 'e2026').title} · weiterfahren` : 'Vier Rennen, Punkte, Fahrer- und Teamwertung.', deco: 'M', badge: season && !sDone ? 'Läuft' : '',
        bg: 'linear-gradient(135deg, #3a2a08 0%, #0e1117 75%)', acc: '#ffd400', go: () => this.show('season') }),
      tile({ kicker: 'Sofort fahren', title: 'Schnelles Rennen', desc: 'Strecke, Epoche, Wetter, Gegner – und los.', deco: 'R', bg: 'linear-gradient(135deg, #3a0f0a 0%, #0e1117 75%)', go: () => this.show('raceSetup') }),
      tile({ kicker: 'Training', title: 'Testfahrt / Training', desc: 'Bestzeiten, Ghost, Setup und Telemetrie.', deco: 'T', bg: 'linear-gradient(135deg, #0a2a33 0%, #0e1117 75%)', acc: '#38c6ff', go: () => this.show('drive') }),
      tile({ kicker: 'Online & LAN', title: 'Mehrspieler', desc: 'Lobby-Code, Freunde, der Host-PC ist der Server.', deco: 'MP', dim: !UI.scr_multi, dimMsg: 'Der Mehrspielermodus kommt mit einem der nächsten Updates.', badge: UI.scr_multi ? '' : 'Bald',
        bg: 'linear-gradient(135deg, #1d0f33 0%, #0e1117 75%)', acc: '#b65cff', go: () => this.show('multi') }),
      tile({ kicker: `Epoche ${E.name}`, title: 'Epochen & Mods', desc: `${E.title} · ${MOD_REPORT.filter(r => r.ok).length} Mods geladen`, deco: E.name.slice(-2), bg: 'linear-gradient(135deg, #0f2a17 0%, #0e1117 75%)', acc: '#2fe36b', go: () => this.show('mods') }),
    );
    const initials = String(G.playerName || 'Du').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const prof = h('div.hub-prof', { title: 'Fahrername ändern', onclick: () => this.promptText('Dein Fahrername (für Rennen, Karriere und Mehrspieler)', G.playerName || 'Du', (v) => { if (v && v.trim()) { G.playerName = v.trim().slice(0, 24); Game.saveSettings(); this.show('main', { noHistory: true }); } }) },
      h('span.av', { style: { background: c0 } }, initials), h('div', h('b', G.playerName || 'Du'), h('small', `#${G.number} · ${team.name}`)));
    return h('section.screen.hub',
      h('div.hub-top', h('div', h('div.brand', 'APEX ', h('b', 'FORMULA')), h('div.brand-sub', 'World Championship')), prof),
      tiles,
      h('div.hub-small',
        btn('Einstellungen', () => this.show('settings')),
        btn('Lenkrad kalibrieren', () => this.openWizard()),
        btn('Eingabetest', () => this.show('inputTest')),
        btn('Mods', () => this.show('mods')),
        btn('Hilfe & Steuerung', () => this.show('help')),
        btn(document.fullscreenElement ? 'Vollbild beenden' : 'Vollbild', () => Game.toggleFullscreen()),
      ),
      h('div.hub-foot', h('span', `${APP_NAME} · Version `, h('span', APP_VERSION), ' · Alle Teams, Fahrer, Strecken und Marken sind frei erfunden. · Speicher: ', Save.available ? 'lokal aktiv' : 'nicht verfügbar'), devs),
    );
  },
  _updateDevPill(el) {
    el = el || $('devPill'); if (!el) return;
    const list = [...Input.devices.values()].filter(d => d.connected);
    const prof = Input.profile;
    if (!list.length) { el.textContent = 'Kein Lenkrad/Gamepad erkannt – drücke einen Knopf am Gerät, damit der Browser es meldet.'; return; }
    el.textContent = 'Erkannt: ' + list.map(d => d.displayName).join(', ') + (prof ? ` · Profil: ${prof.name}` : '');
  },

  // ---------------------------------------------------------------------------
  //  Testfahrt-Vorbereitung
  // ---------------------------------------------------------------------------
  scr_drive() {
    const S = Game.settings;
    const track = Game.getTrackModel(Game.trackId);
    const map = new Minimap(track, 230);
    const cv = h('canvas', { width: 230, height: 230 }); cv.getContext('2d').drawImage(map.bg, 0, 0);
    const corners = (track.def.corners || []).map(c => c.name).join(' · ');
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Testfahrt / Fahrschule'), h('h1', 'Session vorbereiten')),
      h('div.row', { style: { alignItems: 'flex-start' } },
        h('div.col', { style: { flex: '1 1 560px', maxWidth: '760px' } },
          h('div.card.track-card', cv, h('div',
            h('h3', 'Strecke'), h('h2.ital', { style: { margin: '0 0 6px' } }, track.name),
            h('p', track.def.character),
            h('div', h('span.stat', h('b', fmtNum(track.length / 1000, 3) + ' km'), h('small', 'Länge')), h('span.stat', h('b', String(track.corners.length)), h('small', 'Kurven')), h('span.stat', h('b', String(track.aeroZones.length)), h('small', 'Aero-Zonen'))),
            h('p', { style: { fontSize: '12px', color: '#7d8898' } }, 'Kurven: ' + corners),
          )),
          h('div.card', h('h3', 'Strecke wählen'), chips(TRACK_ORDER.map(id => ({ value: id, label: TRACKS[id].name })), track.id, v => { S.game.track = v; Game.saveSettings(); this.show('drive', { noHistory: true }); })),
          eraCard(S.game.era || 'e2026', (id) => { Game.setEra(id); this.show('drive', { noHistory: true }); }),
          h('div.card', h('h3', 'Wetter & Tageszeit'),
            chips(WEATHER_ORDER.map(id => ({ value: id, label: WEATHER_TYPES[id].name })), S.game.weather || 'dry', v => { S.game.weather = v; Game.saveSettings(); }),
            h('div', { style: { height: '8px' } }),
            chips([['track', 'Strecken-Standard'], ['morning', 'Vormittag'], ['afternoon', 'Nachmittag'], ['evening', 'Abend'], ['dusk', 'Dämmerung']].map(([value, label]) => ({ value, label })), S.game.timeOfDay || 'track', v => { S.game.timeOfDay = v; Game.saveSettings(); })),
          h('div.card', h('h3', 'Reifenmischung'), chips(COMPOUND_ORDER.slice(0, 5).map(id => ({ value: id, label: COMPOUNDS[id].name, color: COMPOUNDS[id].color })), S.game.compound, v => { S.game.compound = v; Game.saveSettings(); })),
          h('div.card', h('h3', 'Team / Lackierung'), chips(TEAMS.map(t => ({ value: t.id, label: t.name, color: t.colors[0] })), S.game.team, v => { S.game.team = v; Game.saveSettings(); Game.refreshGarageCar(); })),
        ),
        h('div.col', { style: { flex: '0 1 420px' } },
          h('div.card', h('h3', 'Fahrhilfen'),
            fieldRow('Traktionskontrolle', toggle([{ value: 0, label: 'Aus' }, { value: 1, label: 'Mittel' }, { value: 2, label: 'Voll' }], S.aids.tc, v => { S.aids.tc = v; Game.saveSettings(); })),
            fieldRow('ABS', toggle([{ value: false, label: 'Aus' }, { value: true, label: 'An' }], S.aids.abs, v => { S.aids.abs = v; Game.saveSettings(); })),
            fieldRow('Schalten', toggle([{ value: false, label: 'Manuell' }, { value: true, label: 'Automatisch' }], S.aids.autoShift, v => { S.aids.autoShift = v; Game.saveSettings(); })),
            fieldRow('Aktive Aero', toggle([{ value: true, label: 'Automatisch' }, { value: false, label: 'Manuell' }], S.aids.aeroAuto, v => { S.aids.aeroAuto = v; Game.saveSettings(); })),
            fieldRow('Ideallinie', toggle([{ value: 'off', label: 'Aus' }, { value: 'brake', label: 'Nur Bremszonen' }, { value: 'full', label: 'Voll' }], S.aids.idealLine || 'off', v => { S.aids.idealLine = v; Game.saveSettings(); })),
          ),
          h('div.card', h('h3', 'Startkamera'), chips(CAMERA_MODES.filter(m => m !== 'tv').map(m => ({ value: m, label: CAMERA_NAMES[m] })), S.camera.mode, v => { S.camera.mode = v; Game.saveSettings(); })),
          h('div.card', h('h3', 'Ghost'), fieldRow('Bestrunde als Ghost', toggle([{ value: true, label: 'An' }, { value: false, label: 'Aus' }], S.game.ghost !== false, v => { S.game.ghost = v; Game.saveSettings(); })),
            h('p', { style: { fontSize: '12px' } }, (Save.get('bestLaps', {})[trackKey(track.id)] ? `Gespeicherte Bestzeit: ${fmtTime(Save.get('bestLaps', {})[trackKey(track.id)].time)}` : 'Noch keine Bestzeit gespeichert.'))),
          h('div.hint', 'In der Testfahrt ist der ', h('b', 'Überholmodus'), ' einmal pro Runde frei verfügbar (sonst nur innerhalb 1 s hinter dem Vordermann am Erkennungspunkt).'),
          h('div.actions', btn('Losfahren', () => Game.startTestDrive(), 'primary', '▶'), btn('Fahrzeug-Setup', () => this.show('setup')), btn('Zurück', () => this.back(), 'ghost')),
        ),
      ),
    );
  },

  // ---------------------------------------------------------------------------
  //  Pause
  // ---------------------------------------------------------------------------
  scr_pause() {
    if (Net.active && Game.raceMode) return h('section.screen', h('header', h('span.crumb', 'Mehrspieler'), h('h1', 'Menü (das Rennen läuft weiter)')),
      h('div.menu', btn('Weiterfahren', () => Game.resume(), 'primary', 'Esc'), Game.canReplay() ? btn('Wiederholung', () => Game.openReplay('pause')) : null, btn('Einstellungen', () => this.show('settings')), btn('Hilfe & Steuerung', () => this.show('help')),
        btn(Net.session.role === 'host' ? 'Rennen beenden (Lobby schließen)' : 'Rennen verlassen', () => this.confirm(Net.session.role === 'host' ? 'Rennen für alle beenden und die Lobby schließen?' : 'Rennen verlassen?', () => Game.netLeave()), 'ghost')),
      h('p', { style: { marginTop: '18px', color: '#ffb02e' } }, 'Im Mehrspieler läuft das Rennen während des Menüs weiter – dein Auto bremst automatisch.'),
      Game.race && Game.race.track.pit && Game.pitPlan ? h('div.card', { style: { maxWidth: '460px', marginTop: '12px' } }, h('h3', 'Boxenstopp-Plan'),
        chips(COMPOUND_ORDER.map(id => ({ value: id, label: COMPOUNDS[id].name, color: COMPOUNDS[id].color })), Game.pitPlan.compound, v => { Game.pitPlan.compound = v; if (Game.race.player.pitPlan) Game.race.player.pitPlan.compound = v; }),
        fieldRow('Schaden reparieren', toggle([{ value: true, label: 'Ja (+6,5 s)' }, { value: false, label: 'Nein' }], Game.pitPlan.repair, v => { Game.pitPlan.repair = v; })),
        h('div.actions', btn(Game.race.player.pitPlan ? 'Box abbrechen' : 'Box anfordern (Taste B)', () => { Game.race.togglePit(Game.race.player, Game.pitPlan); this.show('pause', { noHistory: true }); }, 'small'))) : null);
    const S = Game.settings, race = Game.mode === 'race', quali = Game.mode === 'quali';
    const reason = Game.pauseReason || '';
    // Hinweis: Esc kam als Tastendruck, obwohl mit dem Lenkrad gefahren wurde → vermutlich Steam Input
    const steamHint = Game.pauseWhileWheel && /^Taste /.test(reason);
    const me = race && Game.race ? Game.race.player : null;
    return h('section.screen',
      h('header', h('span.crumb', 'Pause'), h('h1', race ? `Rennen · P${me ? me.pos : '-'} · Runde ${me ? Math.min(Game.race.laps, Math.max(1, me.timing.lap)) : 1}/${Game.race ? Game.race.laps : '-'}` : quali && Game.session ? `Qualifying · noch ${fmtClock(Game.session.remaining)}` : 'Testfahrt')),
      reason ? h('div.hint', { style: { maxWidth: '640px' } }, 'Pausiert durch: ', h('b', reason),
        steamHint ? h('div', { style: { marginTop: '6px' } }, 'Du bist mit dem Lenkrad gefahren, die Pause kam aber als Tastendruck. Falls du die Taste nicht gedrückt hast, wandelt vermutlich ', h('b', 'Steam Input'), ' Lenkradknöpfe in Tastatureingaben um (unter Bazzite läuft Steam im Hintergrund) – siehe Hilfe.') : null) : null,
      h('div.menu',
        btn('Fortsetzen', () => Game.resume(), 'primary', 'Esc'),
        race ? null : btn('Auto zurücksetzen', () => { Game.resetCar(); Game.resume(); }, '', 'R'),
        race ? null : btn('Fahrzeug-Setup', () => this.show('setup')),
        Game.canReplay() ? btn('Wiederholung', () => Game.openReplay('pause')) : null,
        btn('Telemetrie', () => this.show('telemetry')),
        btn('Einstellungen', () => this.show('settings')),
        btn('Lenkrad kalibrieren', () => this.openWizard()),
        btn('Hilfe & Steuerung', () => this.show('help')),
        quali ? btn('Qualifying beenden → Rennen', () => this.confirm('Qualifying jetzt beenden? Es zählt deine bisher beste Runde.', () => Game.session.finish()), 'ghost') : null,
        race ? btn('Rennen neu starten', () => this.confirm('Rennen neu starten?', () => Game.startRace()), 'ghost') : null,
        btn(race ? 'Rennen aufgeben' : 'Zum Hauptmenü', () => race || quali ? this.confirm(race ? 'Rennen aufgeben und zum Hauptmenü?' : 'Qualifying abbrechen und zum Hauptmenü?', () => Game.toMenu()) : Game.toMenu(), 'ghost'),
      ),
      race ? (me ? h('div.row', { style: { marginTop: '22px', alignItems: 'flex-start' } },
          h('div.card', { style: { maxWidth: '420px' } }, h('h3', 'Fahrzeugzustand'), h('p', 'Schaden: ' + Damage.summary(me.vehicle)),
            h('p', `Reifen: ${COMPOUNDS[me.vehicle.compound].name} · Verschleiß ${Math.round(Math.max(...me.vehicle.wheels.map(w => w.tyre.wear)) * 100)} %`),
            h('p', `Track-Limits-Verwarnungen: ${me.warnings} · Strafen: ${me.penalty ? `${me.penalty} s (offen ${me.penalty - me.penaltyServed} s)` : 'keine'}`),
            Game.race.mandatory ? h('p', `Pflichtstopp: ${me.used.size >= 2 ? 'erfüllt' : 'noch offen'} (gefahren: ${[...me.used].map(c => COMPOUNDS[c].name).join(', ')})`) : null),
          h('div.card', { style: { maxWidth: '460px' } }, h('h3', 'Boxenstopp-Plan'),
            chips(COMPOUND_ORDER.map(id => ({ value: id, label: COMPOUNDS[id].name, color: COMPOUNDS[id].color })), Game.pitPlan.compound, v => { Game.pitPlan.compound = v; if (me.pitPlan) me.pitPlan.compound = v; }),
            fieldRow('Schaden reparieren', toggle([{ value: true, label: 'Ja (+6,5 s)' }, { value: false, label: 'Nein' }], Game.pitPlan.repair, v => { Game.pitPlan.repair = v; if (me.pitPlan) me.pitPlan.repair = v; })),
            h('div.actions', btn(me.pitPlan ? 'Box abbrechen' : 'Box anfordern', () => { Game.race.togglePit(me, Game.pitPlan); this.show('pause', { noHistory: true }); }, me.pitPlan ? 'small ghost' : 'small primary')),
            h('p', { style: { fontSize: '12px' } }, 'Im Rennen Taste B. Ab der Boxeneinfahrt übernimmt der Autopilot (80 km/h, Stopp an deiner Teambox); offene Zeitstrafen werden dabei abgesessen.'))) : null)
        : h('div.card', { style: { marginTop: '22px', maxWidth: '640px' } }, h('h3', 'Neue Reifen aufziehen'),
          chips(COMPOUND_ORDER.map(id => ({ value: id, label: COMPOUNDS[id].name, color: COMPOUNDS[id].color })), Game.vehicle ? Game.vehicle.compound : S.game.compound, v => { S.game.compound = v; Game.saveSettings(); Game.fitTyres(v); this.toast(`Neue Reifen: ${COMPOUNDS[v].name}`); })),
    );
  },

  // ---------------------------------------------------------------------------
  //  Hilfe
  // ---------------------------------------------------------------------------
  scr_help() {
    const K = Game.settings.input.keys;
    const keyRow = (act, label) => h('tr', h('td', label), h('td', (K[act] || []).map(c => h('span.kbd', codeLabel(c)))));
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Hilfe'), h('h1', 'Steuerung & Hinweise')),
      h('div.grid2',
        h('div.card', h('h3', 'Tastatur (Standard, frei belegbar)'), h('table.bind',
          keyRow('throttle', 'Gas'), keyRow('brake', 'Bremse'), keyRow('steerLeft', 'Lenken links'), keyRow('steerRight', 'Lenken rechts'),
          keyRow('shiftUp', 'Hochschalten'), keyRow('shiftDown', 'Runterschalten'), keyRow('overtake', 'Überholmodus'), keyRow('aero', 'Aero-Modus (manuell)'),
          keyRow('bbUp', 'Bremsbalance +'), keyRow('bbDown', 'Bremsbalance −'), keyRow('ersUp', 'Energiemodus +'), keyRow('ersDown', 'Energiemodus −'),
          keyRow('pitLimiter', 'Begrenzer'), keyRow('mfd', 'MFD-Menü'), keyRow('camera', 'Kamera wechseln'), keyRow('lookBack', 'Blick zurück'),
          keyRow('lookLeft', 'Blick links'), keyRow('lookRight', 'Blick rechts'), keyRow('reset', 'Auto zurücksetzen'), keyRow('inputOverlay', 'Eingabe-Overlay / FFB-Graph'),
          keyRow('hud', 'HUD ein/aus'), keyRow('pause', 'Pause'))),
        h('div.col',
          h('div.card', h('h3', 'Rennen & Regeln'),
            h('p', '• ', h('b', 'Start:'), ' Fünf rote Lichter gehen im Sekundentakt an; wenn alle erlöschen, geht es los. Bis dahin hält das Spiel dein Auto über die Kupplung – Gas geben zum Vorbereiten ist erlaubt (mit Traktionskontrolle Vollgas, ohne lieber dosiert).'),
            h('p', '• ', h('b', 'Mehrspieler:'), ' Online-Lobby mit Code (APEX-XXXXX) oder ohne Internet per Einladungs-/Antwort-Code. Der Host-PC ist der Server; jeder fährt sein eigenes Auto ohne Verzögerung. Esc öffnet das Menü, das Rennen läuft dabei weiter. Boxenstopp mit Taste B wie im Einzelspieler; reißt die Verbindung ab, verbindet das Spiel sich automatisch neu (90 s Zeit).'),
            h('p', '• ', h('b', 'Karriere:'), ' Teamziel und Vertragsbedingung stehen in der Übersicht. Kontakte, bei denen du auffährst, verschlechtern die Beziehung zum Gegner stark; faire Duelle und Lob in Social Media verbessern sie. Rivalen (unter −25) machen die Tür öfter zu und greifen härter an, Freunde (ab +25) fahren fairer.'),
            h('p', '• ', h('b', 'Epochen:'), ' 1990–2010 ohne ERS und DRS (Saugmotoren, lange Schaltzeiten, 1990 schwere Lenkung), 2014–2022 Hybrid mit DRS (Heckflügel öffnet in den Zonen nur bei < 1 s Abstand am Erkennungspunkt), 2026 aktive Aero und Überholmodus. Jede Epoche hat ihr eigenes Fahrerfeld; Bestzeiten werden getrennt gespeichert.'),
            h('p', '• ', h('b', 'Wiederholung:'), ' Im Pausemenü (letzte 20 s) und im Ergebnis (ganzes Rennen). Zeitleiste mit Ereignissen (grün = Überholmanöver, gelb = Kontakt, rot = Ausfall), Tempo ¼× bis 4×, alle Kameras plus Helikopter, automatische Regie. Am Lenkrad: Schaltwippen = Auto wechseln, Kamera-Knopf, Pause-Knopf = zurück.'),
            h('p', '• ', h('b', 'Qualifying:'), ' Freie Fahrt gegen die Uhr (5/10/15 min). Nur gültige Runden zählen; läuft die Zeit ab, darfst du die begonnene Runde beenden. Die KI-Zeiten erscheinen nach und nach, das Ergebnis ist die Startaufstellung.'),
            h('p', '• ', h('b', 'Meisterschaft:'), ' Vier Rennen (alle Strecken), Punkte 25-18-15-12-10-8-6-4-2-1 plus 1 für die schnellste Runde in den Top 10. Spielstand wird automatisch gespeichert.'),
            h('p', '• ', h('b', 'Track Limits:'), ' Sind alle vier Räder jenseits der weißen Linie, ist die Runde ungültig. Im Rennen gibt es 3 Verwarnungen, danach je 5 s Zeitstrafe.'),
            h('p', '• ', h('b', 'Windschatten'), ' bis ca. 60 m hinter einem Auto senkt den Luftwiderstand; ', h('b', 'verwirbelte Luft'), ' dicht dahinter kostet Abtrieb. ', h('b', 'Überholmodus'), ' gibt es, wenn du am Erkennungspunkt weniger als 1 s hinter dem Vordermann liegst.'),
            h('p', '• ', h('b', 'Schaden:'), ' Treffer beschädigen Front-/Heckflügel (weniger Abtrieb), Unterboden und Aufhängung (Auto zieht zur Seite). Zustand im MFD.'),
            h('p', '• ', h('b', 'Sektoren:'), ' lila = Allzeit-Bestwert, grün = persönliche Bestzeit der Sitzung, gelb = langsamer.'),
            h('p', '• ', h('b', 'Kameras:'), ' Cockpit, T-Cam, Nase, Verfolger nah/fern, TV-Kamera (Taste für Kamerawechsel).'),
            h('p', '• ', h('b', 'Boxenstopp:'), ' Taste B (Box anfordern), Plan im Pausemenü. Ab der Einfahrt fährt der Autopilot mit 80 km/h zur Teambox (Reifen, Reparatur, offene Strafen), danach übernimmst du wieder. Pflichtstopp: zwei verschiedene Trockenmischungen.'),
            h('p', '• ', h('b', 'Flaggen:'), ' Gelb = Unfall voraus, nicht überholen. Blau = Überrundung, Platz machen. Safety Car: einreihen, nicht überholen; Neustart an der Linie. VSC: Tempolimit wird angezeigt. Überholen unter Gelb/SC/VSC oder zu schnell unter VSC: 5 s Strafe.'),
            h('p', '• ', h('b', 'Energie:'), ' Höchstens 4 MJ Einsatz je Runde (Überholmodus +0,5 MJ) – Restbudget in der Energieanzeige.'),
            h('p', '• ', h('b', 'Ideallinie (Fahrhilfe):'), ' grün = beschleunigen, gelb = Gas weg, rot = bremsen. Die Farben richten sich nach deinem aktuellen Tempo. Einstellbar unter Fahrhilfen (Aus / Nur Bremszonen / Voll).'),
            h('p', '• ', h('b', 'KI-Gegner:'), ' verteidigen die Innenseite vor Bremszonen (ein Spurwechsel), machen auf der Geraden einmal die Tür zu, nutzen den Windschatten und bremsen innen später. Neben dir halten sie seitlich Abstand. Stärke über 100 % = mehr Grip als physikalisch möglich.'),
          ),
          h('div.card', h('h3', 'Lenkrad unter Linux (z. B. Bazzite)'),
            h('p', '• Das Lenkrad muss vom System erkannt werden (Kernel-Treiber, z. B. hid-logitech-hidpp, hid-tmff2, hid-fanatecff bzw. universal-pidff für Direct-Drive-Basen).'),
            h('p', '• Den Rotationsbereich stellst du mit ', h('b', 'Oversteer'), ' (oder der Software des Herstellers) ein – ideal sind ', h('b', '360°'), ' für 1:1-Lenkung. Andernfalls trage den eingestellten Wert im Lenkradprofil ein.'),
            h('p', '• Im Browser einmal einen ', h('b', 'Knopf am Lenkrad drücken'), ', damit das Gerät in der Gamepad-API erscheint.'),
            h('p', '• ', h('b', 'Firefox und Chromium nummerieren Achsen unterschiedlich'), ' – kalibriere deshalb pro Browser (Profile werden pro Browser gespeichert).'),
            h('p', '• Flatpak-Browser benötigen ggf. Zugriff auf Eingabegeräte (z. B. Flatseal: „Alle Geräte“).'),
            h('p', '• ', h('b', 'Steam Input:'), ' Läuft Steam im Hintergrund (unter Bazzite Standard), kann es Lenkradknöpfe in Tastatureingaben umwandeln (z. B. Esc) – dann öffnet sich scheinbar grundlos das Menü. Abhilfe: in Steam unter Einstellungen → Controller die „Desktop-Konfiguration“ für das Lenkrad deaktivieren bzw. Steam Input für generische Controller ausschalten. Das Pausemenü zeigt den Auslöser an.'),
          ),
          h('div.card', h('h3', 'Force Feedback'),
            h('p', 'Echtes Force Feedback per WebHID für ', h('b', 'Logitech G920 und G923 (Xbox/PC)'), ' in Chrome, Chromium, Edge oder Brave: Einstellungen → Lenkrad & Pedale → „Lenkrad verbinden“. Das Moment wird physikalisch berechnet (Rückstellmoment aus Nachlauf, Leichtwerden beim Untersteuern, Fahrbahn, Kerbs, Aufsetzen, Kollisionen). Firefox hat kein WebHID – dort und für andere Lenkräder zeigt das Eingabe-Overlay (Taste I) das Moment als Live-Graph. Controller erhalten Rumble. Bei Pause, Menü, Fehlern und beim Schließen der Seite schaltet das Spiel alle Kräfte ab.'),
          ),
          h('div.card', h('h3', 'Wichtig: Browser-Tastenkürzel'),
            h('p', h('b', 'Strg + W'), ' schließt im Browser den Tab und lässt sich von Webseiten nicht sperren. Während einer Sitzung fragt das Spiel vor dem Schließen nach. Im ', h('b', 'Vollbild'), ' (Chromium) werden Tastenkürzel zusätzlich abgefangen. Alternativ Pfeiltasten statt WASD nutzen oder Schalten umbelegen.'),
          ),
        ),
      ),
      h('div.actions', btn('Zurück', () => this.back(), 'ghost')),
    );
  },

  // ---------------------------------------------------------------------------
  //  Einstellungen
  // ---------------------------------------------------------------------------
  scr_settings(opts) {
    const tabs = [['wheel', 'Lenkrad & Pedale'], ['keys', 'Tastatur'], ['pad', 'Gamepad'], ['camera', 'Kamera & Sicht'], ['gfx', 'Grafik'], ['audio', 'Audio'], ['aids', 'Fahrhilfen'], ['data', 'Allgemein & Daten']];
    this.settingsTab = opts.tab || this.settingsTab || 'wheel';
    const body = h('div.scroll', { style: { flex: '1' } });
    const tabBar = h('div.tabs');
    const render = () => {
      tabBar.innerHTML = '';
      for (const [id, label] of tabs) tabBar.append(h('button' + (id === this.settingsTab ? '.on' : ''), { onclick: () => { this.settingsTab = id; render(); } }, label));
      body.innerHTML = '';
      body.append(this['tab_' + this.settingsTab]());
    };
    render();
    this.rerenderSettings = render;
    return h('section.screen.solid', h('header', h('span.crumb', 'Einstellungen'), h('h1', 'Optionen')), tabBar, body,
      h('div.actions', btn('Zurück', () => { this.rerenderSettings = null; this.liveFns = []; this.back(); }, 'ghost')));
  },

  tab_wheel() {
    const S = Game.settings, prof = Input.profile;
    this.liveFns = [];
    const list = Input.store.list.filter(p => p.browser === BROWSER);
    const others = Input.store.list.filter(p => p.browser !== BROWSER);
    const sel = h('select', { onchange: (e) => { Input.store.activeId = e.target.value; Input.saveProfiles(); this.rerenderSettings(); } },
      list.length ? list.map(p => h('option', { value: p.id, selected: p.id === Input.store.activeId }, p.name)) : h('option', { value: '' }, '– kein Profil –'));
    const top = h('div.card', h('h3', 'Lenkradprofile'),
      h('div.row', { style: { alignItems: 'center' } }, sel,
        btn('Kalibrierungsassistent', () => this.openWizard(), 'small primary'),
        prof ? btn('Umbenennen', () => this.promptText('Profil umbenennen', prof.name, (v) => { prof.name = v || prof.name; Input.saveProfiles(); this.rerenderSettings(); }), 'small') : null,
        prof ? btn('Löschen', () => this.confirm(`Profil „${prof.name}“ löschen?`, () => { Input.deleteProfile(prof.id); this.rerenderSettings(); }), 'small ghost') : null,
        prof ? btn('Export', () => this.showText('Profil exportieren (JSON)', Input.exportProfile(prof.id)), 'small ghost') : null,
        btn('Import', () => this.promptText('Profil importieren – JSON einfügen', '', (v) => { try { const p = Input.importProfile(v); this.toast(`Profil „${p.name}“ importiert`); this.rerenderSettings(); } catch (e) { this.toast('Import fehlgeschlagen: ' + e.message); } }, true), 'small ghost'),
      ),
      others.length ? h('p', { style: { fontSize: '12px' } }, `${others.length} Profil(e) aus einem anderen Browser vorhanden (Achsnummern können abweichen).`) : null,
    );
    const ffb = this.ffbCard();
    if (!prof) return h('div.col', top, ffb, h('div.hint', 'Noch kein Lenkradprofil. Schließe dein Lenkrad an, drücke einen Knopf und starte den ', h('b', 'Kalibrierungsassistenten'), '. Gamepads und Tastatur funktionieren ohne Kalibrierung.'));
    const B = prof.bindings;
    const devName = (key) => { const d = Input.devices.get(key); return d ? d.displayName + (d.connected ? '' : ' (getrennt)') : (prof.devices[key] ? prof.devices[key].name + ' (nicht verbunden)' : key); };
    // Rotation & Lenkung
    const steerCard = h('div.card', h('h3', 'Lenkung'));
    if (B.steer) {
      const b = B.steer;
      steerCard.append(
        h('p', 'Achse ', h('b', String(b.index + 1)), ' · ', devName(b.dev)),
        h('div.field', h('label', 'Rotationsbereich des Geräts (°)'), (() => { const i = h('input', { type: 'number', min: 90, max: 3600, step: 10, value: prof.rotation }); i.addEventListener('change', () => { prof.rotation = clamp(parseFloat(i.value) || 900, 90, 3600); Input.saveProfiles(); }); return i; })(), h('span.val', '°')),
        h('div.hint', 'Stelle in der Software deines Lenkrads (bzw. auf Linux in ', h('b', 'Oversteer'), ') den Rotationsbereich auf ', h('b', '360°'), ' oder trage hier den eingestellten Wert ein. Das Cockpit-Lenkrad dreht dann exakt 1:1 mit (Anschlag bei ±180°).'),
        fieldRow('Invertieren', toggle([{ value: false, label: 'Nein' }, { value: true, label: 'Ja' }], !!b.invert, v => { b.invert = v; Input.saveProfiles(); })),
        slider('Totzone innen', b.deadIn || 0, 0, 0.2, 0.005, v => { b.deadIn = v; Input.saveProfiles(); }, v => fmtNum(v * 100, 1) + '%'),
        slider('Totzone außen', b.deadOut || 0, 0, 0.2, 0.005, v => { b.deadOut = v; Input.saveProfiles(); }, v => fmtNum(v * 100, 1) + '%'),
        slider('Linearität (Gamma)', b.gamma || 1, 0.5, 2.5, 0.05, v => { b.gamma = v; Input.saveProfiles(); }, v => fmtNum(v, 2)),
        slider('Sättigung', b.sat || 1, 0.5, 1, 0.01, v => { b.sat = v; Input.saveProfiles(); }, v => fmtNum(v * 100, 0) + '%'),
        slider('Glättung (Filter)', b.filter || 0, 0, 1, 0.05, v => { b.filter = v; Input.saveProfiles(); }, v => fmtNum(v * 100, 0) + '%'),
      );
      const live = h('div.bar.center', h('i'), h('em')); const txt = h('p', '');
      steerCard.append(h('div', { style: { marginTop: '8px' } }, live, txt));
      this.liveFns.push(() => {
        const n = Input.state.wheelNorm, deg = Input.state.steerDeg;
        const i = live.querySelector('i'); const w = Math.abs(n) * 50; i.style.left = (n < 0 ? 50 - w : 50) + '%'; i.style.width = w + '%';
        live.querySelector('em').style.left = (50 + clamp(deg / 180, -1, 1) * 50) + '%';
        txt.textContent = `Gerät: ${fmtNum(deg, 1)}° · Cockpit-Lenkrad: ${fmtNum(clamp(deg, -180, 180), 1)}° · roh ${fmtNum(Input.state.rawSteer || 0, 3)}`;
      });
    } else steerCard.append(h('p', 'Keine Lenkachse belegt.'));
    // Pedale mit Kurveneditor
    const pedalCards = ['throttle', 'brake', 'clutch'].map(name => {
      const b = B[name], card = h('div.card', h('h3', { throttle: 'Gaspedal', brake: 'Bremspedal', clutch: 'Kupplung' }[name]));
      if (!b) { card.append(h('p', 'Nicht belegt.')); return card; }
      const info = prof.info && prof.info[name];
      card.append(h('p', 'Achse ', h('b', String(b.index + 1)), ' · ', devName(b.dev), info && info.inverted ? h('span.tag.warn', 'invertiert erkannt') : null, b.combined ? h('span.tag', 'kombinierte Achse') : null, info ? h('span.tag', 'Bereich ' + info.range) : null));
      if (!b.curve) b.curve = DEFAULT_CURVE();
      const ed = this.curveEditor(b, () => Input.saveProfiles(), name);
      card.append(h('div.row', ed.canvas, h('div.col', { style: { flex: '1', minWidth: '240px' } },
        fieldRow('Invertieren', toggle([{ value: false, label: 'Nein' }, { value: true, label: 'Ja' }], !!b.invert, v => { b.invert = v; Input.saveProfiles(); })),
        slider('Totzone unten', b.deadIn || 0, 0, 0.25, 0.005, v => { b.deadIn = v; Input.saveProfiles(); }, v => fmtNum(v * 100, 1) + '%'),
        slider('Totzone oben', b.deadOut || 0, 0, 0.25, 0.005, v => { b.deadOut = v; Input.saveProfiles(); }, v => fmtNum(v * 100, 1) + '%'),
        slider('Glättung', b.filter || 0, 0, 1, 0.05, v => { b.filter = v; Input.saveProfiles(); }, v => fmtNum(v * 100, 0) + '%'),
        h('div', btn('Kurve linear', () => { b.curve = DEFAULT_CURVE(); Input.saveProfiles(); this.rerenderSettings(); }, 'small ghost'), ' ', btn('Progressiv', () => { b.curve = [[0, 0], [0.25, 0.12], [0.5, 0.33], [0.75, 0.6], [1, 1]]; Input.saveProfiles(); this.rerenderSettings(); }, 'small ghost')),
      )));
      this.liveFns.push(ed.draw);
      return card;
    });
    // Knopfbelegungen des Profils
    const tbl = h('table.bind');
    for (const [act, label] of BUTTON_ACTIONS) {
      const b = B[act];
      const lab = h('span', b ? (b.label || `${devName(b.dev)} · ${b.kind === 'button' ? 'Knopf ' + (b.index + 1) : 'Achse ' + (b.index + 1)}`) : '–');
      tbl.append(h('tr', h('td', label), h('td', lab), h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
        btn('Belegen', () => { lab.textContent = 'Drücke Knopf … (Esc bricht ab)'; Input.startCapture('button', (r) => { if (r) { B[act] = { dev: r.dev, kind: r.kind, index: r.index, dir: r.dir, rest: r.rest, thresh: r.thresh, value: r.value, label: r.label }; const d = Input.devices.get(r.dev); if (d) prof.devices[r.dev] = { id: d.id, name: d.displayName, type: d.info.type, vendor: d.parsed.vendor, product: d.parsed.product }; Input.saveProfiles(); } this.rerenderSettings(); }); }, 'small'),
        b ? btn('×', () => { delete B[act]; Input.saveProfiles(); this.rerenderSettings(); }, 'small ghost') : null)));
    }
    return h('div.col', top, ffb, h('div.grid2', steerCard, ...pedalCards, h('div.card', h('h3', 'Knöpfe (Lenkrad / Button-Box / Pedale)'), tbl)));
  },

  /** Force Feedback (WebHID, Logitech G920/G923): Verbinden, Test, Stärke, Effekte */
  ffbCard() {
    const C = Game.settings.ffb, save = () => Game.saveSettings();
    const card = h('div.card', h('h3', 'Force Feedback (Lenkrad)'));
    if (!FFB.supported) {
      card.append(h('p', FFB.message || 'WebHID nicht verfügbar.'), h('div.hint', 'Das berechnete FFB-Moment siehst du trotzdem im Eingabe-Overlay (Taste I).'));
      return card;
    }
    const cls = { on: 'ok', error: 'warn', connecting: '' }[FFB.state];
    card.append(h('p', h('span.tag' + (cls ? '.' + cls : ''), { on: 'Aktiv', error: 'Fehler', connecting: 'Verbinde …', off: 'Aus' }[FFB.state] || 'Aus'), ' ', FFB.message || 'Unterstützt: Logitech G920 und G923 (Xbox/PC). Andere Lenkräder folgen.'));
    const run = (fn) => async () => { try { await fn(); } catch (e) { const m = (e && e.message) || String(e); if (e && e.name === 'NotFoundError') FFB._setState(FFB.wheel ? 'on' : 'off', 'Keine Auswahl getroffen'); else FFB._setState(FFB.wheel ? 'on' : 'error', m); } this.rerenderSettings && this.rerenderSettings(); };
    const row = h('div.row', { style: { alignItems: 'center' } });
    if (!FFB.active) row.append(btn('Lenkrad verbinden', run(() => FFB.connect()), 'small primary'));
    else row.append(
      btn('Testkraft (rechts → links)', () => FFB.test(), 'small'),
      btn('Bereich 360° setzen', run(() => FFB.setRange(360)), 'small'),
      btn('900°', run(() => FFB.setRange(900)), 'small ghost'),
      btn('Trennen', run(() => FFB.disconnect()), 'small ghost'));
    card.append(row);
    if (FFB.active) {
      const meter = h('div.bar.center', h('i')), mi = meter.querySelector('i');
      card.append(h('div', { style: { margin: '8px 0' } }, h('p', { style: { fontSize: '12px' } }, 'Ausgegebene Kraft:'), meter));
      this.liveFns.push(() => { const n = FFB.out, w = Math.abs(n) * 50; mi.style.left = (n < 0 ? 50 - w : 50) + '%'; mi.style.width = w + '%'; });
    }
    card.append(
      slider('Stärke', C.strength, 0, 1.5, 0.05, v => { C.strength = v; save(); }, v => fmtNum(v * 100, 0) + '%'),
      slider('Dämpfung', C.damper, 0, 0.6, 0.01, v => { C.damper = v; save(); FFB.setDamper(v); }, v => fmtNum(v * 100, 0) + '%'),
      slider('Fahrbahngefühl', C.road, 0, 1, 0.05, v => { C.road = v; save(); }, v => fmtNum(v * 100, 0) + '%'),
      slider('Vibration (Kerbs, Aufsetzen)', C.vibration, 0, 1, 0.05, v => { C.vibration = v; save(); }, v => fmtNum(v * 100, 0) + '%'),
      fieldRow('Richtung umkehren', toggle([{ value: false, label: 'Nein' }, { value: true, label: 'Ja' }], !!C.invert, v => { C.invert = v; save(); })),
      h('div.hint', 'Prüfe mit der Testkraft: Das Lenkrad muss zuerst nach ', h('b', 'rechts'), ', dann nach links ziehen – sonst „Richtung umkehren“. ',
        'Nach der ersten Freigabe verbindet das Spiel das Lenkrad beim Start automatisch. ',
        h('b', 'Linux/Bazzite:'), ' Meldet der Browser „Zugriff verweigert“, einmalig ', h('b', 'apex-formula-ffb-einrichten.sh'), ' aus dem ZIP ausführen und das Lenkrad neu einstecken. ',
        'Oversteer/Steam dürfen parallel laufen, sollten aber kein eigenes FFB senden.'),
    );
    return card;
  },

  /** Editierbare Pedalkurve mit 5 Stützpunkten (Drag & Drop) und Live-Vorschau */
  curveEditor(b, onChange, name) {
    const W = 220, H = 170, pad = 14;
    const cv = h('canvas.curve-ed', { width: W, height: H });
    const g = cv.getContext('2d');
    const toPx = ([x, y]) => [pad + x * (W - 2 * pad), H - pad - y * (H - 2 * pad)];
    const fromPx = (px, py) => [clamp((px - pad) / (W - 2 * pad), 0, 1), clamp((H - pad - py) / (H - 2 * pad), 0, 1)];
    let drag = -1;
    const draw = () => {
      g.fillStyle = '#07080b'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#1d2430'; g.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const x = pad + i / 4 * (W - 2 * pad), y = pad + i / 4 * (H - 2 * pad); g.beginPath(); g.moveTo(x, pad); g.lineTo(x, H - pad); g.stroke(); g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke(); }
      g.strokeStyle = '#ff3b1f'; g.lineWidth = 2.5; g.beginPath();
      for (let i = 0; i <= 60; i++) { const x = i / 60; const [px, py] = toPx([x, AxisProc.curve(x, b.curve)]); if (i) g.lineTo(px, py); else g.moveTo(px, py); }
      g.stroke();
      b.curve.forEach((p, i) => { const [px, py] = toPx(p); g.fillStyle = i === drag ? '#ffd400' : '#fff'; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill(); });
      // Live-Eingabe
      const d = Input.devices.get(b.dev);
      if (d && d.connected) {
        let raw = d.axes[b.index];
        if (!d.moved[b.index] && raw === 0 && Math.abs(b.rest) > 0.3) raw = b.rest;
        let p = clamp((raw - b.rest) / ((b.full - b.rest) || 1), 0, 1); if (b.invert) p = 1 - p;
        const out = AxisProc.pedal(raw, b);
        const [px, py] = toPx([p, out]);
        g.fillStyle = '#2fe36b'; g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#b9c2cf'; g.font = '11px monospace'; g.fillText(`ein ${Math.round(p * 100)}% → aus ${Math.round(out * 100)}%`, pad + 2, pad + 10);
      }
    };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = pos(e); let best = -1, bd = 14;
      b.curve.forEach((p, i) => { const [px, py] = toPx(p); const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
      drag = best; if (drag >= 0) cv.setPointerCapture(e.pointerId); draw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (drag < 0) return;
      const [x, y] = pos(e); let [cx, cy] = fromPx(x, y);
      const n = b.curve.length;
      if (drag === 0) cx = 0; else if (drag === n - 1) cx = 1; else cx = clamp(cx, b.curve[drag - 1][0] + 0.05, b.curve[drag + 1][0] - 0.05);
      b.curve[drag] = [cx, cy]; draw();
    });
    const end = () => { if (drag >= 0) { drag = -1; onChange(); draw(); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    draw();
    return { canvas: cv, draw };
  },

  tab_keys() {
    const S = Game.settings, K = S.input.keys;
    this.liveFns = [];
    const rows = [['throttle', 'Gas'], ['brake', 'Bremse'], ['steerLeft', 'Lenken links'], ['steerRight', 'Lenken rechts'], ['clutch', 'Kupplung'], ...BUTTON_ACTIONS];
    const tbl = h('table.bind');
    for (const [act, label] of rows) {
      const keys = h('span', (K[act] || []).length ? (K[act] || []).map(c => h('span.kbd', codeLabel(c))) : '–');
      tbl.append(h('tr', h('td', label), h('td', keys), h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
        btn('+ Taste', () => { keys.textContent = 'Taste drücken … (Esc bricht ab)'; Input.startCapture('key', (r) => { if (r && r.code !== 'Escape') { K[act] = [...new Set([...(K[act] || []), r.code])]; Game.saveSettings(); } this.rerenderSettings(); }); }, 'small'),
        btn('Leeren', () => { K[act] = []; Game.saveSettings(); this.rerenderSettings(); }, 'small ghost'))));
    }
    return h('div.col',
      h('div.card', h('h3', 'Tastenbelegung'), tbl, h('div.actions', btn('Standard wiederherstellen', () => { S.input.keys = deepClone(DEFAULT_KEYS); Game.saveSettings(); this.rerenderSettings(); }, 'small ghost'))),
      h('div.card', h('h3', 'Tastaturlenkung (gleitend)'),
        slider('Lenkgeschwindigkeit', S.input.kbSteerRate, 0.8, 6, 0.1, v => { S.input.kbSteerRate = v; Game.saveSettings(); }, v => fmtNum(v, 1) + '/s'),
        slider('Rückstellgeschwindigkeit', S.input.kbSteerReturn, 1, 10, 0.1, v => { S.input.kbSteerReturn = v; Game.saveSettings(); }, v => fmtNum(v, 1) + '/s'),
        slider('Max. Einschlag bei Vmax', S.input.kbSpeedSteer, 0.08, 1, 0.01, v => { S.input.kbSpeedSteer = v; Game.saveSettings(); }, v => fmtNum(v * 100, 0) + '%'),
        h('div.hint', 'Bei Tastatur und Gamepad wird der Lenkeinschlag mit steigender Geschwindigkeit reduziert. Für Lenkräder gibt es keine künstliche Reduzierung.')),
    );
  },

  tab_pad() {
    const S = Game.settings, P = S.input.pad;
    this.liveFns = [];
    const tbl = h('table.bind');
    for (const [act, label] of [['steer', 'Lenkung (Achse)'], ['throttle', 'Gas'], ['brake', 'Bremse'], ...BUTTON_ACTIONS]) {
      const b = P.map[act];
      const lab = h('span', b ? (b.kind === 'axis' ? 'Achse ' + (b.index + 1) : 'Knopf ' + (b.index + 1)) : '–');
      tbl.append(h('tr', h('td', label), h('td', lab), h('td', { style: { textAlign: 'right' } }, act === 'steer' ? null :
        btn('Belegen', () => { lab.textContent = 'Knopf am Gamepad drücken …'; Input.startCapture('button', (r) => { if (r && r.kind === 'button') { P.map[act] = { kind: 'button', index: r.index }; Game.saveSettings(); } this.rerenderSettings(); }); }, 'small'))));
    }
    return h('div.col',
      h('div.card', h('h3', 'Gamepad-Empfindlichkeit'),
        slider('Totzone Stick', P.deadzone, 0, 0.3, 0.01, v => { P.deadzone = v; Game.saveSettings(); }, v => fmtNum(v * 100, 0) + '%'),
        slider('Linearität', P.linearity, 1, 3, 0.05, v => { P.linearity = v; Game.saveSettings(); }, v => fmtNum(v, 2)),
        slider('Lenkung bei Vmax', P.speedSteer, 0.1, 1, 0.01, v => { P.speedSteer = v; Game.saveSettings(); }, v => fmtNum(v * 100, 0) + '%'),
        slider('Trigger-Kurve (Gamma)', P.triggerGamma, 0.5, 2.5, 0.05, v => { P.triggerGamma = v; Game.saveSettings(); }, v => fmtNum(v, 2)),
        slider('Rumble-Stärke', S.input.rumble, 0, 1, 0.05, v => { S.input.rumble = v; Game.saveSettings(); }, v => fmtNum(v * 100, 0) + '%'),
        h('div.actions', btn('Rumble testen', () => { Input.rumbleNext = 0; Input.rumble(0.8, 0.4, 400); }, 'small'))),
      h('div.card', h('h3', 'Belegung (Standard-Gamepad)'), tbl, h('div.actions', btn('Standard wiederherstellen', () => { P.map = deepClone(DEFAULT_PAD); Game.saveSettings(); this.rerenderSettings(); }, 'small ghost'))),
    );
  },

  tab_camera() {
    const S = Game.settings, C = S.camera, CP = C.cockpit;
    this.liveFns = [];
    const fc = C.fovCalc;
    const res = h('b', '');
    const calc = () => {
      const [aw, ah] = fc.aspect.split(':').map(Number);
      const diagCm = fc.diag * 2.54, hCm = diagCm * ah / Math.hypot(aw, ah);
      const fov = 2 * Math.atan((hCm / 2) / fc.dist) * RAD2DEG;
      res.textContent = fmtNum(fov, 1) + '° vertikal';
      return fov;
    };
    const num = (v, min, max, step, on) => { const i = h('input', { type: 'number', min, max, step, value: v }); i.addEventListener('input', () => { on(parseFloat(i.value)); calc(); Game.saveSettings(); }); return i; };
    calc();
    return h('div.grid2',
      h('div.card', h('h3', 'Cockpit'),
        slider('Sichtfeld (vertikal)', CP.fov, 20, 100, 0.5, v => { CP.fov = v; Game.saveSettings(); }, v => fmtNum(v, 1) + '°'),
        slider('Sitz seitlich', CP.x, -0.1, 0.1, 0.005, v => { CP.x = v; Game.saveSettings(); }, v => fmtNum(v * 100, 1) + ' cm'),
        slider('Sitz Höhe', CP.y, -0.1, 0.15, 0.005, v => { CP.y = v; Game.saveSettings(); }, v => fmtNum(v * 100, 1) + ' cm'),
        slider('Sitz vor/zurück', CP.z, -0.15, 0.2, 0.005, v => { CP.z = v; Game.saveSettings(); }, v => fmtNum(v * 100, 1) + ' cm'),
        slider('Blick nach unten', CP.pitch, -5, 20, 0.5, v => { CP.pitch = v; Game.saveSettings(); }, v => fmtNum(v, 1) + '°'),
        slider('Kopfbewegung (G-Kräfte)', CP.headMove, 0, 2, 0.05, v => { CP.headMove = v; Game.saveSettings(); }, v => fmtNum(v * 100, 0) + '%'),
        slider('Kamera-Vibration', CP.shake, 0, 2, 0.05, v => { CP.shake = v; Game.saveSettings(); }, v => fmtNum(v * 100, 0) + '%'),
        fieldRow('Lenkrad im Cockpit', toggle([{ value: false, label: 'Anzeigen' }, { value: true, label: 'Ausblenden' }], C.hideWheel, v => { C.hideWheel = v; Game.saveSettings(); Game.applyCameraOptions(); })),
        fieldRow('Hände', toggle([{ value: false, label: 'Anzeigen' }, { value: true, label: 'Ausblenden' }], C.hideHands, v => { C.hideHands = v; Game.saveSettings(); Game.applyCameraOptions(); })),
      ),
      h('div.col',
        h('div.card', h('h3', 'Sichtfeld-Rechner'),
          h('p', 'Für ein korrektes Sichtfeld Monitorgröße, Seitenverhältnis und Augenabstand eingeben:'),
          h('div.field', h('label', 'Bildschirmdiagonale (Zoll)'), num(fc.diag, 10, 100, 0.5, v => fc.diag = v || 27), h('span.val', '″')),
          h('div.field', h('label', 'Seitenverhältnis'), (() => { const s = h('select', ['16:9', '16:10', '21:9', '32:9', '4:3'].map(a => h('option', { value: a, selected: a === fc.aspect }, a))); s.addEventListener('change', () => { fc.aspect = s.value; calc(); Game.saveSettings(); }); return s; })(), h('span.val', '')),
          h('div.field', h('label', 'Abstand Auge–Bildschirm (cm)'), num(fc.dist, 20, 300, 1, v => fc.dist = v || 70), h('span.val', 'cm')),
          h('div.field.wide', h('label', 'Ergebnis'), res),
          h('div.actions', btn('Als Cockpit-Sichtfeld übernehmen', () => { CP.fov = Math.round(calc() * 2) / 2; Game.saveSettings(); this.rerenderSettings(); this.toast('Sichtfeld übernommen'); }, 'small primary'))),
        h('div.card', h('h3', 'Verfolgerkamera'),
          slider('Sichtfeld', C.chaseFov, 40, 90, 0.5, v => { C.chaseFov = v; Game.saveSettings(); }, v => fmtNum(v, 1) + '°'),
          fieldRow('Standardkamera', toggle(CAMERA_MODES.map(m => ({ value: m, label: CAMERA_NAMES[m] })), C.mode, v => { C.mode = v; Game.saveSettings(); }))),
      ),
    );
  },

  tab_gfx() {
    const S = Game.settings, G = S.graphics;
    this.liveFns = [];
    const q = () => Object.assign({}, QUALITY_PRESETS[G.preset], G.custom);
    const apply = () => { Game.saveSettings(); Render.applyQuality(G); };
    const cur = q();
    return h('div.grid2',
      h('div.card', h('h3', 'Qualität'),
        fieldRow('Voreinstellung', toggle([{ value: 'niedrig', label: 'Niedrig' }, { value: 'mittel', label: 'Mittel' }, { value: 'hoch', label: 'Hoch' }, { value: 'ultra', label: 'Ultra' }], G.preset, v => { G.preset = v; G.custom = {}; apply(); this.rerenderSettings(); this.toast('Baumdichte und Lackmaterial wirken ab der nächsten Sitzung, Kantenglättung nach Neuladen.'); })),
        slider('Auflösungsskalierung', cur.resScale, 0.5, 1.5, 0.05, v => { G.custom.resScale = v; apply(); }, v => fmtNum(v * 100, 0) + '%'),
        fieldRow('Schatten', toggle([{ value: 0, label: 'Aus' }, { value: 1, label: 'Niedrig' }, { value: 2, label: 'Hoch' }, { value: 3, label: 'Ultra' }], cur.shadows, v => { G.custom.shadows = v; apply(); })),
        slider('Sichtweite', cur.viewDist, 800, 5000, 100, v => { G.custom.viewDist = v; apply(); }, v => fmtNum(v, 0) + ' m'),
        slider('Partikelmenge', cur.particles, 0, 1, 0.05, v => { G.custom.particles = v; apply(); }, v => fmtNum(v * 100, 0) + '%'),
        fieldRow('Nachbearbeitung (Bloom, Vignette)', toggle([{ value: 0, label: 'Aus' }, { value: 1, label: 'An' }], cur.post, v => { G.custom.post = v; apply(); })),
        fieldRow('Reifenspuren', toggle([{ value: 0, label: 'Aus' }, { value: 1, label: 'An' }], cur.skid, v => { G.custom.skid = v; apply(); })),
        slider('Detailstufe Gegner (LOD)', cur.carLod, 0.5, 1.6, 0.1, v => { G.custom.carLod = v; apply(); }, v => fmtNum(v * 100, 0) + ' %'),
        fieldRow('Kantenglättung (MSAA)', toggle([{ value: false, label: 'Aus' }, { value: true, label: 'An' }], cur.antialias, v => { G.custom.antialias = v; Game.saveSettings(); this.toast('Kantenglättung wird nach dem Neuladen der Seite wirksam.'); })),
      ),
      h('div.card', h('h3', 'Leistung'),
        fieldRow('FPS-Anzeige', toggle([{ value: false, label: 'Aus' }, { value: true, label: 'An' }], G.showFps, v => { G.showFps = v; Game.saveSettings(); })),
        fieldRow('Frametime-Graph', toggle([{ value: false, label: 'Aus' }, { value: true, label: 'An' }], G.frameGraph, v => { G.frameGraph = v; Game.saveSettings(); })),
        fieldRow('Automatische Qualitätsanpassung', toggle([{ value: false, label: 'Aus' }, { value: true, label: 'An' }], G.autoQuality, v => { G.autoQuality = v; Game.saveSettings(); })),
        h('div.hint', 'Bei aktivierter Anpassung wird zuerst die Nachbearbeitung abgeschaltet, dann die Auflösungsskalierung schrittweise gesenkt, wenn die Bildrate länger als 6 Sekunden unter 50 FPS liegt.'),
        h('p', `Renderer: ${Render.rendererInfo || ''}`)),
    );
  },

  tab_audio() {
    const A = Game.settings.audio;
    this.liveFns = [];
    const s = (label, key) => slider(label, A[key], 0, 1, 0.01, v => { A[key] = v; AudioSys.setVolumes(A); Game.saveSettings(); }, v => fmtNum(v * 100, 0) + '%');
    return h('div.card', { style: { maxWidth: '720px' } }, h('h3', 'Lautstärke'), s('Gesamt', 'master'), s('Motor', 'engine'), s('Effekte', 'effects'), s('Funk', 'radio'), s('Umgebung', 'ambient'),
      fieldRow('Motorklang', toggle([{ value: 'physik', label: 'Physikalisches Modell' }, { value: 'synth', label: 'Einfache Synthese' }], A.engineModel || 'physik', v => { A.engineModel = v; AudioSys.setVolumes(A); Game.saveSettings(); })),
      h('div.hint', 'Das physikalische Modell berechnet den Klang aus Zylindern, Ventilen, Krümmern und Endrohr (Wellenleiter, AudioWorklet). Bei Knacksern auf schwachen Rechnern „Einfache Synthese“ wählen.'),
      fieldRow('Renningenieur (Funk)', toggle([{ value: 'off', label: 'Aus' }, { value: 'text', label: 'Nur Text' }, { value: 'voice', label: 'Text + Stimme' }], A.radioMode || 'voice', v => { A.radioMode = v; Game.saveSettings(); })),
      h('div.hint', 'Der Renningenieur meldet Position, Abstände, Reifenzustand, Schaden, Safety Car und Wetter. Die Stimme nutzt die Sprachausgabe des Systems – unter Linux ggf. „speech-dispatcher“ installieren, sonst bleibt es bei Text.'),
      h('div.actions', btn('Funk-Signal testen', () => { AudioSys.unlock(); AudioSys.radio(); }, 'small'), btn('Renningenieur testen', () => { AudioSys.unlock(); Radio.reset(); Radio.say('Funkcheck. Hörst du mich? Reifen und Bremsen sind im Fenster.', 2); Radio.tick(0); }, 'small')),
      h('p', { style: { fontSize: '12px', marginTop: '14px', opacity: 0.75 } }, 'Motorklang-Modell nach „enginesound“ von DasEtwas (MIT-Lizenz, © 2020 DasEtwas) und dem Paper „Physically informed car engine sound synthesis for virtual and augmented environments“ (Baldan, Lachambre, Delle Monache, Boussard). Alle Klänge werden im Browser erzeugt, es werden keine Aufnahmen verwendet.'));
  },

  tab_aids() {
    const S = Game.settings;
    this.liveFns = [];
    return h('div.card', { style: { maxWidth: '760px' } }, h('h3', 'Fahrhilfen'),
      fieldRow('Traktionskontrolle', toggle([{ value: 0, label: 'Aus' }, { value: 1, label: 'Mittel' }, { value: 2, label: 'Voll' }], S.aids.tc, v => { S.aids.tc = v; Game.saveSettings(); Game.applyAids(); })),
      fieldRow('ABS', toggle([{ value: false, label: 'Aus' }, { value: true, label: 'An' }], S.aids.abs, v => { S.aids.abs = v; Game.saveSettings(); Game.applyAids(); })),
      fieldRow('Ideallinie', toggle([{ value: 'off', label: 'Aus' }, { value: 'brake', label: 'Nur Bremszonen' }, { value: 'full', label: 'Voll' }], S.aids.idealLine || 'off', v => { S.aids.idealLine = v; Game.saveSettings(); })),
      h('p', { style: { fontSize: '12px' } }, 'Ideallinie: grün = beschleunigen, gelb = Gas weg, rot = bremsen – passt sich deinem Tempo an.'),
      fieldRow('Automatisches Schalten', toggle([{ value: false, label: 'Aus' }, { value: true, label: 'An' }], S.aids.autoShift, v => { S.aids.autoShift = v; Game.saveSettings(); Game.applyAids(); })),
      fieldRow('Kupplung', toggle([{ value: true, label: 'Automatisch' }, { value: false, label: 'Manuell (Pedal)' }], S.aids.autoClutch, v => { S.aids.autoClutch = v; Game.saveSettings(); Game.applyAids(); })),
      fieldRow('Aktive Aerodynamik', toggle([{ value: true, label: 'Automatisch' }, { value: false, label: 'Manuell (Taste)' }], S.aids.aeroAuto, v => { S.aids.aeroAuto = v; Game.saveSettings(); Game.applyAids(); })),
      h('div.hint', 'Weitere Fahrhilfen (Lenkhilfe, Bremshilfe, Ideallinie, Boxenautomatik) folgen in Phase 2. Der Geradenmodus der Flügel ist nur in den Aero-Zonen erlaubt und klappt beim Bremsen automatisch zurück.'));
  },

  tab_data() {
    this.liveFns = [];
    const G = Game.settings.game;
    return h('div.col', { style: { maxWidth: '760px' } },
      h('div.card', h('h3', 'Allgemein'),
        fieldRow('Automatisch pausieren, wenn das Fenster verdeckt/gewechselt wird', toggle([{ value: true, label: 'An' }, { value: false, label: 'Aus' }], G.autoPause, v => { G.autoPause = v; Game.saveSettings(); })),
        h('div.hint', 'Das Pausemenü zeigt immer an, wodurch die Pause ausgelöst wurde (Taste, Lenkradknopf oder Fensterwechsel).')),
      h('div.card', h('h3', 'Speicherstand'),
      h('p', Save.available ? `Alle Einstellungen, Lenkradprofile, Bestzeiten, Meisterschaft und Karrieren werden lokal im Browser gespeichert (belegt ≈ ${Save.usageKB()} KB von ≈ 5000 KB). Sichere sie ab und zu als Datei – z. B. vor dem Löschen der Browserdaten oder für einen anderen PC.` : 'localStorage ist nicht verfügbar – Daten gehen beim Neuladen verloren. Nutze die Sicherung als Datei.'),
      h('div.actions',
        btn('Sicherung als Datei speichern', () => Save.download(), 'small primary'),
        btn('Sicherung aus Datei laden', () => Save.upload().then(n => { this.toast(`${n} Einträge geladen – Seite wird neu geladen`); setTimeout(() => location.reload(), 1200); }).catch(e => this.toast('Laden fehlgeschlagen: ' + e.message)), 'small'),
        btn('Als Text exportieren', () => this.showText('Export aller Spieldaten (JSON)', Save.exportAll()), 'small'),
        btn('Text importieren', () => this.promptText('Spieldaten importieren – JSON einfügen', '', (v) => { try { const n = Save.importAll(v); this.toast(`${n} Einträge importiert – Seite wird neu geladen`); setTimeout(() => location.reload(), 1200); } catch (e) { this.toast('Import fehlgeschlagen: ' + e.message); } }, true), 'small'),
        btn('Einstellungen zurücksetzen', () => this.confirm('Alle Einstellungen auf Standard zurücksetzen? (Lenkradprofile bleiben erhalten)', () => { Save.remove('settings'); location.reload(); }), 'small ghost'),
      )));
  },

  // ---------------------------------------------------------------------------
  //  Eingabetest
  // ---------------------------------------------------------------------------
  scr_inputTest() {
    const wrap = h('div.col');
    const stateBox = h('div.card');
    const devBox = h('div.grid2');
    const kbBox = h('div.card', h('h3', 'Tastatur'), h('p', { id: 'itKeys' }, '–'));
    wrap.append(stateBox, devBox, kbBox);
    this.testEl = { stateBox, devBox, built: '' };
    const ffbCv = h('canvas', { width: 420, height: 90, style: { background: '#07080b', border: '1px solid #2a3342' } });
    stateBox.append(h('h3', 'Spieleingaben (verarbeitet)'),
      h('div.axis', h('span', 'Lenk.'), h('div.bar.center', { id: 'itSteer' }, h('i')), h('span', { id: 'itSteerV' }), h('span', { id: 'itSrc' })),
      h('div.axis', h('span', 'Gas'), h('div.bar', { id: 'itThr' }, h('i')), h('span', { id: 'itThrV' }), h('span')),
      h('div.axis', h('span', 'Bremse'), h('div.bar', { id: 'itBrk' }, h('i')), h('span', { id: 'itBrkV' }), h('span')),
      h('div.axis', h('span', 'Kuppl.'), h('div.bar', { id: 'itClu' }, h('i')), h('span', { id: 'itCluV' }), h('span')),
      h('p', { style: { fontSize: '12px' } }, 'Berechnetes FFB-Moment (nur während einer Sitzung, −1…1):'), ffbCv,
      h('div.actions', btn('Rumble testen (Controller)', () => { Input.rumbleNext = 0; Input.rumble(0.9, 0.5, 450); }, 'small'), btn('Kalibrierungsassistent', () => this.openWizard(), 'small')));
    this.testEl.ffbCv = ffbCv;
    return h('section.screen.solid', h('header', h('span.crumb', 'Diagnose'), h('h1', 'Eingabetest')),
      h('div.hint', 'Alle erkannten Geräte mit ID-String, allen Achsen (Rohwert und kalibriert) und Knöpfen – live. Erscheint ein Gerät nicht, drücke einen Knopf daran. Achsnummern können zwischen Firefox und Chromium abweichen.'),
      h('div.scroll', { style: { flex: '1' } }, wrap),
      h('div.actions', btn('Zurück', () => { this.testEl = null; this.back(); }, 'ghost')));
  },
  _updateInputTest() {
    const T = this.testEl; if (!T) return;
    const st = Input.state;
    const setBar = (id, v, center) => { const el = $(id); if (!el) return; const i = el.querySelector('i'); if (center) { const w = Math.abs(v) * 50; i.style.left = (v < 0 ? 50 - w : 50) + '%'; i.style.width = w + '%'; } else i.style.width = (v * 100) + '%'; };
    setBar('itSteer', st.steer, true); setBar('itThr', st.throttle); setBar('itBrk', st.brake); setBar('itClu', st.clutch);
    const t = (id, s) => { const e = $(id); if (e && e.textContent !== s) e.textContent = s; };
    t('itSteerV', fmtNum(st.steer * 180, 1) + '°'); t('itSrc', { keyboard: 'Tast.', pad: 'Pad', wheel: 'Lenkrad' }[st.steerSource] || '');
    t('itThrV', Math.round(st.throttle * 100) + '%'); t('itBrkV', Math.round(st.brake * 100) + '%'); t('itCluV', Math.round(st.clutch * 100) + '%');
    t('itKeys', Input.keys.size ? [...Input.keys].map(codeLabel).join('  ') : '–');
    // FFB-Graph
    const g = T.ffbCv.getContext('2d'), W = T.ffbCv.width, H = T.ffbCv.height;
    g.fillStyle = '#07080b'; g.fillRect(0, 0, W, H); g.strokeStyle = '#2a3342'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    g.strokeStyle = '#ff3b1f'; g.lineWidth = 1.5; g.beginPath();
    const n = this.ffbHist.length;
    for (let i = 0; i < n; i++) { const v = this.ffbHist[(this.ffbI + i) % n]; const x = i / (n - 1) * W, y = H / 2 - v * H * 0.45; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    // Geräte (Struktur nur bei Änderung neu aufbauen)
    const devs = [...Input.devices.values()].filter(d => d.connected);
    const sig = devs.map(d => d.key + d.axes.length + ':' + d.buttons.length).join('|') + (Input.profile ? Input.profile.id : '');
    if (sig !== T.built) {
      T.built = sig; T.devBox.innerHTML = '';
      if (!devs.length) T.devBox.append(h('div.dev', h('h4', 'Keine Geräte erkannt'), h('p', 'Schließe ein Lenkrad oder Gamepad an und drücke einen Knopf daran.')));
      for (const d of devs) {
        const prof = Input.profile; const bound = {};
        if (prof) for (const [k, b] of Object.entries(prof.bindings)) if (b && b.dev === d.key && b.kind === 'axis') bound[b.index] = k;
        const card = h('div.dev', h('h4', d.displayName,
          h('span.tag' + (d.info.known ? '.ok' : ''), { wheel: 'Lenkrad', pedals: 'Pedale', gamepad: 'Gamepad', shifter: 'Schaltung', buttonbox: 'Button-Box', unknown: 'unbekannt' }[d.info.type] || d.info.type),
          d.info.known ? h('span.tag.ok', 'Profil-DB') : null, d.mapping ? h('span.tag', d.mapping) : null, prof && prof.devices[d.key] ? h('span.tag.ok', 'im Profil') : null),
          h('div.id', `ID: ${d.id}`), h('div.id', `Index ${d.index} · Vendor ${d.parsed.vendor || '?'} · Product ${d.parsed.product || '?'} · Schlüssel ${d.key}`));
        d.axes.forEach((_, i) => card.append(h('div.axis', h('span', 'A' + (i + 1) + (bound[i] ? ' ' + ({ steer: 'L', throttle: 'G', brake: 'B', clutch: 'K' }[bound[i]]) : '')), h('div.bar.center', { 'data-ax': d.key + '|' + i }, h('i')), h('span', { 'data-axv': d.key + '|' + i }), h('span', { 'data-axc': d.key + '|' + i }))));
        const bw = h('div.btns'); d.buttons.forEach((_, i) => bw.append(h('span', { 'data-bt': d.key + '|' + i }, String(i + 1))));
        card.append(bw);
        T.devBox.append(card);
      }
    }
    for (const d of devs) {
      const prof = Input.profile;
      d.axes.forEach((v, i) => {
        const bar = T.devBox.querySelector(`[data-ax="${CSS.escape(d.key + '|' + i)}"]`); if (!bar) return;
        const ii = bar.firstChild, vv = clamp(v, -1, 1), w = Math.abs(vv) * 50;
        ii.style.left = (vv < 0 ? 50 - w : 50) + '%'; ii.style.width = w + '%';
        const tv = T.devBox.querySelector(`[data-axv="${CSS.escape(d.key + '|' + i)}"]`); if (tv) tv.textContent = v.toFixed(3);
        const tc = T.devBox.querySelector(`[data-axc="${CSS.escape(d.key + '|' + i)}"]`);
        if (tc && prof) {
          let cal = '';
          for (const [k, b] of Object.entries(prof.bindings)) if (b && b.dev === d.key && b.kind === 'axis' && b.index === i) cal = k === 'steer' ? fmtNum(AxisProc.steer(v, b) * prof.rotation / 2, 0) + '°' : Math.round(AxisProc.pedal(v, b) * 100) + '%';
          tc.textContent = cal;
        }
      });
      d.buttons.forEach((v, i) => { const el = T.devBox.querySelector(`[data-bt="${CSS.escape(d.key + '|' + i)}"]`); if (el) el.classList.toggle('on', !!d.btnDown[i] || v > 0.5); });
    }
  },

  // ---------------------------------------------------------------------------
  //  Kalibrierungsassistent
  // ---------------------------------------------------------------------------
  openWizard() {
    AudioSys.unlock();
    Input.poll();
    this.closeWizard();
    const sess = Input.calibration = new CalibrationSession(Input);
    this.wizard = sess;
    const box = h('div.box');
    this.wizEl = { box, cv: h('canvas', { width: 300, height: 230, style: { background: '#07080b', border: '1px solid #2a3342' } }), autoT: 0, lastStep: -1 };
    const modal = h('div.modal', { id: 'wizModal' }, box);
    $('modalRoot').append(modal);
    this._renderWizard();
  },
  closeWizard() { const m = $('wizModal'); if (m) m.remove(); Input.calibration = null; this.wizard = null; this.wizEl = null; },
  _renderWizard() {
    const sess = this.wizard, E = this.wizEl; if (!sess || !E) return;
    const s = sess.step, box = E.box;
    E.lastStep = sess.i;
    box.innerHTML = '';
    const steps = h('div.wiz-steps', sess.steps.map((_, i) => h('i' + (i < sess.i ? '.done' : (i === sess.i ? '.cur' : '')))));
    const devs = [...Input.devices.values()].filter(d => d.connected);
    box.append(h('h2.ital', 'Lenkrad-Kalibrierung'), h('div', { style: { color: '#7d8898', fontSize: '13px' } }, `Schritt ${sess.i + 1} von ${sess.steps.length} · Geräte: ${devs.length ? devs.map(d => d.displayName).join(', ') : 'keine – drücke einen Knopf am Lenkrad'}`), steps);
    if (s.kind === 'summary') { box.append(this._wizSummary()); return; }
    const right = h('div');
    right.append(h('h3.ital', { style: { margin: '0 0 8px', color: '#ff3b1f' } }, s.title), h('div.wiz-text', s.text));
    if (s.kind === 'steer') {
      right.append(h('div.hint', 'Stelle in der Software deines Lenkrads (bzw. auf Linux in ', h('b', 'Oversteer'), ') den Rotationsbereich auf ', h('b', '360°'), ' oder trage den eingestellten Wert in der Zusammenfassung ein.'));
    }
    E.cand = h('div.wiz-cand', '');
    right.append(E.cand);
    const nav = h('div.actions',
      btn('Abbrechen', () => this.closeWizard(), 'small ghost'),
      sess.i > 0 ? btn('Zurück', () => { sess.back(); this._renderWizard(); }, 'small ghost') : null,
      s.optional ? btn('Überspringen', () => { sess.skip(); this._renderWizard(); }, 'small') : null,
      E.nextBtn = btn(s.kind === 'center' ? 'Weiter' : 'Übernehmen & weiter', () => this._wizNext(), 'small primary'));
    right.append(nav);
    box.append(h('div.wiz-body', E.cv, right));
  },
  _wizNext() {
    const sess = this.wizard; if (!sess) return;
    const s = sess.step;
    if (s.kind === 'center') { if (![...Input.devices.values()].some(d => d.connected)) { this.toast('Kein Gerät erkannt – drücke einen Knopf am Lenkrad.'); return; } sess.confirmCenter(); }
    else { if (!sess.status.candidate) { if (s.optional) sess.skip(); else { this.toast('Noch nichts erkannt.'); return; } } else { if (s.kind === 'pedal' && sess.status.rest === undefined) sess.status.rest = sess.status.candidate.start; sess.accept(); sess.next(); } }
    this._renderWizard();
  },
  _wizFrame(dt) {
    const sess = this.wizard, E = this.wizEl; if (!sess || !E) return;
    if (E.lastStep !== sess.i) this._renderWizard();
    const s = sess.step, st = sess.status;
    if (s.kind === 'summary') return;
    const g = E.cv.getContext('2d'), W = E.cv.width, H = E.cv.height;
    g.fillStyle = '#07080b'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#7d8898'; g.font = '12px sans-serif';
    if (s.kind === 'center' || s.kind === 'steer') {
      let ang = 0;
      if (s.kind === 'steer' && st.candidate) {
        const c = st.candidate, d = Input.devices.get(c.dev);
        const v = d ? d.axes[c.index] : 0, cen = c.center;
        const r = v >= cen ? (c.max - cen) : (cen - c.min);
        ang = r > 0.01 ? (v - cen) / r : 0;
        if (st.left !== undefined && st.left > st.right) ang = -ang;
      }
      g.save(); g.translate(W / 2, H / 2 + 8); g.rotate(ang * Math.PI * 0.75);
      g.strokeStyle = '#e8edf5'; g.lineWidth = 12; g.beginPath(); g.arc(0, 0, 70, Math.PI * 0.15, Math.PI * 0.85, true); g.stroke();
      g.fillStyle = '#1d2430'; g.fillRect(-46, -26, 92, 52); g.fillStyle = '#ff3b1f'; g.fillRect(-6, -84, 12, 18);
      g.restore();
      if (s.kind === 'steer') {
        const msg = st.candidate ? `Achse ${st.candidate.index + 1} · Bereich ${fmtNum(st.range || 0, 2)} · aktuell ${fmtNum(st.live || 0, 3)}` : 'Bewege das Lenkrad …';
        E.cand.textContent = msg + (st.candidate ? `\nGerät: ${(Input.devices.get(st.candidate.dev) || {}).displayName || ''}` : '');
        E.nextBtn.disabled = !st.ready;
        if (st.done) this._wizAuto(`Lenkung: Achse ${st.candidate.index + 1}`);
      } else { E.cand.textContent = 'Lenkrad loslassen, Pedale nicht berühren.'; }
    } else if (s.kind === 'pedal') {
      const c = st.candidate;
      let p = 0;
      if (c) { const span = (c.full - c.base) || 1; p = clamp((c.cur - c.base) / span, 0, 1); }
      g.fillStyle = '#1d2430'; g.fillRect(W / 2 - 30, 20, 60, H - 40);
      g.fillStyle = s.id === 'brake' ? '#ff3b3b' : (s.id === 'clutch' ? '#38c6ff' : '#2fe36b');
      g.fillRect(W / 2 - 30, 20 + (H - 40) * (1 - p), 60, (H - 40) * p);
      E.cand.textContent = c ? `Achse ${c.index + 1} (${(Input.devices.get(c.dev) || {}).displayName || ''})\nRuhe ${fmtNum(c.base, 3)} → voll ${fmtNum(c.full, 3)}${c.full < c.base ? ' · invertiert' : ''}${c.combined ? ' · kombinierte Achse erkannt' : ''}${st.done ? ' · übernommen' : ''}` : 'Warte auf Pedalbewegung …';
      E.nextBtn.disabled = !c;
      if (st.done) this._wizAuto(`${s.title}: Achse ${c.index + 1}${c.full < st.rest ? ' (invertiert)' : ''}`);
    } else if (s.kind === 'button') {
      g.fillStyle = '#1d2430'; g.beginPath(); g.arc(W / 2, H / 2, 46, 0, Math.PI * 2); g.fill();
      g.fillStyle = st.candidate ? '#2fe36b' : '#ff3b1f'; g.beginPath(); g.arc(W / 2, H / 2, 30, 0, Math.PI * 2); g.fill();
      E.cand.textContent = sess.waitRelease ? 'Bitte alle Knöpfe loslassen …' : (st.candidate ? 'Erkannt: ' + st.candidate.label : 'Warte auf Knopfdruck …');
      E.nextBtn.disabled = !st.candidate;
      if (st.done) this._wizAuto(`${s.title}: ${st.candidate.label}`);
    }
  },
  /** Erkannte Eingabe sofort übernehmen (kein Zeitfenster für Fehlzuordnungen) und kurz bestätigen */
  _wizAuto(msg) {
    const sess = this.wizard; if (!sess) return;
    sess.accept(); sess.next(); this._renderWizard();
    this.toast('✓ ' + msg, 1600);
    AudioSys.beep(1400, 0.05, 0.12, 'effects');
  },
  _wizSummary() {
    const sess = this.wizard, R = sess.result, B = R.bindings;
    const firstDev = Object.values(R.devices)[0];
    const nameIn = h('input', { type: 'text', value: (firstDev ? firstDev.name : 'Lenkrad') + ' · ' + (BROWSER === 'firefox' ? 'Firefox' : 'Chromium'), style: { width: '100%' } });
    const rotIn = h('input', { type: 'number', min: 90, max: 3600, step: 10, value: R.rotation });
    const rows = [['steer', 'Lenkung'], ['throttle', 'Gas'], ['brake', 'Bremse'], ['clutch', 'Kupplung'], ...BUTTON_ACTIONS.filter(([a]) => a === 'shiftUp' || a === 'shiftDown' || CAL_FUNCTION_STEPS.includes(a))];
    const tbl = h('table.bind');
    for (const [k, label] of rows) {
      const b = B[k], info = R.info[k];
      let txt = '–';
      if (b) {
        const d = Input.devices.get(b.dev), dn = d ? d.displayName : b.dev;
        txt = b.kind === 'axis' ? `${dn} · Achse ${b.index + 1}` : (b.label || `${dn} · Knopf ${b.index + 1}`);
        if (info && info.inverted) txt += ' · invertiert erkannt';
        if (info && info.combined) txt += ' · kombinierte Achse';
        if (info && info.range) txt += ' · Bereich ' + info.range;
      }
      tbl.append(h('tr', h('td', label), h('td', txt)));
    }
    const ok = B.steer && B.throttle && B.brake;
    const partial = B.steer && (Math.abs(B.steer.left - B.steer.center) < 0.9 || Math.abs(B.steer.right - B.steer.center) < 0.9);
    return h('div',
      h('h3.ital', { style: { color: '#ff3b1f', margin: '0 0 8px' } }, 'Zusammenfassung'),
      tbl,
      h('div.field', h('label', 'Profilname'), nameIn, h('span.val', '')),
      h('div.field', h('label', 'Rotationsbereich des Geräts (°)'), rotIn, h('span.val', '°')),
      h('div.hint', 'Stelle in der Software deines Lenkrads (bzw. auf Linux in ', h('b', 'Oversteer'), ') den Rotationsbereich auf ', h('b', '360°'), ' oder trage hier den eingestellten Wert ein. Dann dreht das Cockpit-Lenkrad exakt 1:1.'),
      ok ? null : h('div.hint', h('b', 'Hinweis: '), 'Lenkung, Gas und Bremse sollten belegt sein.'),
      partial ? h('div.hint', h('b', 'Achtung: '), 'Der Lenkausschlag wurde nicht bis zum Anschlag erfasst. Für exakte 1:1-Lenkung den Schritt wiederholen und das Lenkrad beidseitig bis zum Anschlag drehen.') : null,
      h('div.actions',
        btn('Zurück', () => { sess.back(); this._renderWizard(); }, 'small ghost'),
        btn('Verwerfen', () => this.closeWizard(), 'small ghost'),
        btn('Profil speichern', () => {
          const p = sess.buildProfile(nameIn.value.trim(), parseFloat(rotIn.value));
          Input.addProfile(p);
          this.closeWizard();
          this.toast(`Lenkradprofil „${p.name}“ gespeichert und aktiviert`);
          if (this.rerenderSettings) this.rerenderSettings();
          this._updateDevPill();
        }, 'small primary')));
  },

  /** Neues Gerät angeschlossen → Kalibrierung ist beim ersten Start Pflicht */
  _onDevice(ds) {
    this._updateDevPill();
    if (Input.needsCalibration(ds)) {
      if ($('calPrompt') || this.wizard) return;
      const m = h('div.modal', { id: 'calPrompt' }, h('div.box', { style: { maxWidth: '620px' } },
        h('h2.ital', 'Neues Lenkrad erkannt'),
        h('p', h('b', ds.displayName), ds.info.known ? ' (bekanntes Gerät, ' + ({ dd: 'Direct Drive', belt: 'Riemenantrieb', gear: 'Zahnradantrieb' }[ds.info.drive] || ds.info.type) + ')' : ' (unbekanntes Gerät)'),
        h('p', { style: { color: '#b9c2cf' } }, 'Für Lenkräder und Pedale ist eine einmalige Kalibrierung erforderlich, damit Achsen, Pedalrichtung und Schaltwippen korrekt zugeordnet werden. Bis dahin wird das Gerät nicht zum Fahren verwendet.'),
        h('div.actions', btn('Jetzt kalibrieren', () => { m.remove(); this.openWizard(); }, 'primary'), btn('Später', () => m.remove(), 'ghost'))));
      $('modalRoot').append(m);
    } else {
      Input.autoSelectProfile();
      this.toast(`Gerät verbunden: ${ds.displayName}`);
    }
  },

  // ---------------------------------------------------------------------------
  //  Dialoge
  // ---------------------------------------------------------------------------
  confirm(text, onYes) {
    const m = h('div.modal', h('div.box', { style: { maxWidth: '560px' } }, h('h2.ital', 'Bestätigen'), h('p', text),
      h('div.actions', btn('Ja', () => { m.remove(); onYes(); }, 'primary small'), btn('Abbrechen', () => m.remove(), 'ghost small'))));
    $('modalRoot').append(m);
  },
  promptText(title, value, onOk, multi = false) {
    const inp = multi ? h('textarea', value) : h('input', { type: 'text', value, style: { width: '100%' } });
    const m = h('div.modal', h('div.box', h('h2.ital', title), inp,
      h('div.actions', btn('OK', () => { m.remove(); onOk(inp.value); }, 'primary small'), btn('Abbrechen', () => m.remove(), 'ghost small'))));
    $('modalRoot').append(m); setTimeout(() => inp.focus(), 30);
  },
  showText(title, text) {
    const ta = h('textarea', { readonly: true }, text);
    const m = h('div.modal', h('div.box', h('h2.ital', title), ta,
      h('div.actions', btn('In Zwischenablage kopieren', () => { try { navigator.clipboard.writeText(text).then(() => this.toast('Kopiert')); } catch (e) { ta.select(); } }, 'small'), btn('Schließen', () => m.remove(), 'ghost small'))));
    $('modalRoot').append(m); setTimeout(() => ta.select(), 30);
  },

  // ---------------------------------------------------------------------------
  //  HUD
  // ---------------------------------------------------------------------------
  _buildHud() {
    const rpm = $('hudRpm');
    for (let i = 0; i < 30; i++) rpm.append(h('i'));
    this.rpmCells = [...rpm.children];
    this.mapCtx = $('hudMap').getContext('2d');
    this.ffbCtx = $('ffbCanvas').getContext('2d');
    this.fpsCtx = $('fpsGraph').getContext('2d');
  },
  setHudVisible(on) { $('hud').classList.toggle('hidden', !on); },
  _txt(id, s) { const c = this.hudCache; if (c[id] !== s) { c[id] = s; $(id).textContent = s; } },
  _cls(id, cls, on) { const k = id + '.' + cls; if (this.hudCache[k] !== on) { this.hudCache[k] = on; $(id).classList.toggle(cls, on); } },
  updateHud(dt, veh, sess, minimap) {
    // FFB-Verlauf (für Overlay und Eingabetest)
    this.ffbHist[this.ffbI] = veh.ffb; this.ffbI = (this.ffbI + 1) % this.ffbHist.length;
    this.hudT += dt; this.mapT += dt;
    // Drehzahlanzeige jedes Frame
    const rpm = veh.rpm, lim = veh.spec.engine.limitRpm;
    const n = this.rpmCells.length, lit = Math.round(clamp((rpm - 3000) / (lim - 3000), 0, 1) * n);
    const flash = veh.limiterCut || rpm > lim - 80;
    for (let i = 0; i < n; i++) {
      const on = i < lit;
      const cls = !on ? '' : (i < n * 0.6 ? 'w' : (i < n * 0.75 ? 'g' : (i < n * 0.9 ? 'r' : 'b')));
      const el = this.rpmCells[i]; if (el.className !== cls) el.className = cls;
    }
    this._cls('hudRpm', 'flash', flash);
    if (this.hudT < 1 / 20) return;
    this.hudT = 0;
    this._txt('hudGear', veh.gear === 0 ? 'N' : (veh.gear < 0 ? 'R' : String(veh.gear)));
    this._txt('hudSpeed', String(Math.round(veh.speedKmh)));
    this._txt('hudBB', fmtNum(veh.brakeBias * 100, 1));
    if (Game.weather) { const w = Game.weather; this._txt('hudWx', `${w.rain > 0.05 ? (w.rain > 0.6 ? 'Starkregen' : 'Regen') : w.cloud > 0.6 ? 'Bewölkt' : 'Sonnig'} · Nässe ${Math.round(w.water * 100)} %`); }
    this._txt('hudComp', COMPOUNDS[veh.compound].name);
    this._cls('indTC', 'on', veh.tcActive); this._cls('indABS', 'on', veh.absActive); this._cls('indLim', 'on', veh.pitLimiter);
    // Energie
    const soc = veh.socFrac;
    this._txt('hudSoc', Math.round(soc * 100) + ' %');
    $('hudSocBar').firstChild.style.width = (soc * 100).toFixed(1) + '%';
    this._cls('hudSocBar', 'harv', veh.harvesting); this._cls('hudSocBar', 'boost', veh.overtakeActive);
    const left = Math.max(0, veh.spec.ers.lapDeployMJ - veh.lapDeploy / 1e6);
    this._txt('hudErsMode', `${ERS_NAMES[veh.ersMode]} · ${fmtNum(left, 1)} MJ`);
    const ersOn = veh.spec.ers.maxKW > 0, aMode = veh.spec.aero.mode || 'active';
    if (this.hudCache.ersOn !== ersOn) { this.hudCache.ersOn = ersOn; $('hudSoc').parentElement.style.display = ersOn ? '' : 'none'; $('hudSocBar').style.display = ersOn ? '' : 'none'; }
    if (!ersOn) this._txt('hudErsMode', 'Saugmotor · kein ERS');
    this._txt('indOT', veh.spec.ers.overtake ? 'ÜBERHOL' : (aMode === 'drs' ? 'DRS' : ''));
    this._cls('indOT', 'pink', veh.overtakeActive || (aMode === 'drs' && veh.aeroFlap > 0.5)); this._cls('indOT', 'on', veh.spec.ers.overtake ? (!veh.overtakeActive && veh.overtakeAvailable) : (aMode === 'drs' && veh.drsOK && veh.inAeroZone));
    const aeroTxt = aMode === 'none' ? '' : veh.aeroFlap > 0.5 ? (aMode === 'drs' ? 'DRS OFFEN' : 'GERADE') : (aMode === 'drs' ? 'DRS' : 'KURVE');
    this._txt('indAero', aeroTxt); this._cls('indAero', 'green', veh.aeroFlap > 0.5); this._cls('indAero', 'blue', veh.aeroFlap <= 0.5 && veh.inAeroZone);
    // Reifen
    this._txt('hudTyreName', '· ' + COMPOUNDS[veh.compound].name);
    veh.wheels.forEach((w, i) => {
      const el = $('ty' + i), col = tyreTempColor(w.tyre.tEff, w.tyre.c);
      if (this.hudCache['tyc' + i] !== col) { this.hudCache['tyc' + i] = col; el.style.background = col; }
      const s = `${Math.round(w.tyre.tEff)}°|${Math.round((1 - w.tyre.wear) * 100)}%`;
      if (this.hudCache['tyt' + i] !== s) { this.hudCache['tyt' + i] = s; el.innerHTML = `${Math.round(w.tyre.tEff)}°<small>${Math.round((1 - w.tyre.wear) * 100)}%</small>`; }
    });
    const sF = Math.max(veh.wheels[0].sComb, veh.wheels[1].sComb), sR = Math.max(veh.wheels[2].sComb, veh.wheels[3].sComb);
    const lockF = veh.wheels[0].locked || veh.wheels[1].locked, lockR = veh.wheels[2].locked || veh.wheels[3].locked;
    this._cls('slipF', 'y', sF > 0.85 && sF <= 1.15 && !lockF); this._cls('slipF', 'r', sF > 1.15 || lockF);
    this._cls('slipR', 'y', sR > 0.85 && sR <= 1.15 && !lockR); this._cls('slipR', 'r', sR > 1.15 || lockR);
    // Rundenzeiten
    if (sess) {
      if (sess.kind !== 'race') this._txt('hudLapNo', String(sess.lap));
      this._txt('hudTime', fmtTime(sess.lapTime));
      this._txt('hudLast', fmtTime(sess.lastLap)); this._txt('hudBest', fmtTime(sess.bestLap));
      const d = sess.delta;
      const ds = d === null || !isFinite(d) ? '' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(2);
      this._txt('hudDelta', ds);
      const dc = d === null ? '' : (d <= 0 ? '#2fe36b' : '#ff4b4b');
      if (this.hudCache.dcol !== dc) { this.hudCache.dcol = dc; $('hudDelta').style.color = dc; }
      if (!sess.lapValid && this.hudCache.inv !== true) { this.hudCache.inv = true; $('hudTime').style.color = '#ff6b5b'; }
      else if (sess.lapValid && this.hudCache.inv !== false) { this.hudCache.inv = false; $('hudTime').style.color = ''; }
    }
    // Minikarte
    if (minimap && this.mapT > 1 / 15) { this.mapT = 0; minimap.draw(this.mapCtx, Game.mapCars()); }
    // Eingabe-Overlay
    if (!$('inputOverlay').classList.contains('hidden')) {
      const st = Input.state, set = (id, v, c) => { const i = $(id).firstChild; if (c) { const w = Math.abs(v) * 50; i.style.left = (v < 0 ? 50 - w : 50) + '%'; i.style.width = w + '%'; } else i.style.width = (v * 100) + '%'; };
      set('ioSteer', veh.input.steer, true); set('ioThr', veh.input.throttle); set('ioBrk', veh.input.brake); set('ioClu', veh.input.clutch);
      this._txt('ioSrc', { keyboard: 'Tastatur', pad: 'Gamepad', wheel: 'Lenkrad · ' + fmtNum(st.steerDeg, 0) + '°' }[st.steerSource] || '');
      this._txt('ioFfb', fmtNum(veh.ffb, 2));
      const g = this.ffbCtx, W = 296, H = 70;
      g.clearRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
      g.strokeStyle = '#ff3b1f'; g.lineWidth = 1.5; g.beginPath();
      const L = this.ffbHist.length;
      for (let i = 0; i < L; i++) { const v = this.ffbHist[(this.ffbI + i) % L]; const x = i / (L - 1) * W, y = H / 2 - v * H * 0.46; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    // MFD
    if (this.mfdOpen) this._updateMfd(veh);
  },
  toggleMfd(on = !this.mfdOpen) { this.mfdOpen = on; $('hudMfd').classList.toggle('hidden', !on); },
  _updateMfd(veh) {
    const W = veh.wheels;
    const wear = W.map(w => Math.round((1 - w.tyre.wear) * 100)).join('/') + ' %';
    const html = `<h4>MFD · Fahrzeug</h4>
      ${Game.weather ? `<div class="ln"><span>Wetter</span><b>${Game.weather.describe()}</b></div>` : ''}
      <div class="ln"><span>Energiemodus</span><b>${ERS_NAMES[veh.ersMode]}</b></div>
      <div class="ln"><span>Einsatz diese Runde</span><b>${fmtNum(veh.lapDeploy / 1e6, 1)} / ${fmtNum(veh.spec.ers.lapDeployMJ, 1)} MJ</b></div>${Game.mode === 'race' && Game.pitPlan ? `<div class="ln"><span>Boxenplan</span><b>${COMPOUNDS[Game.pitPlan.compound].name}${Game.pitPlan.repair ? ' + Rep.' : ''} (B)</b></div>` : ''}
      <div class="ln"><span>Batterie</span><b>${Math.round(veh.socFrac * 100)} %</b></div>
      <div class="ln"><span>Bremsbalance</span><b>${fmtNum(veh.brakeBias * 100, 1)} %</b></div>
      <div class="ln"><span>Reifen</span><b>${COMPOUNDS[veh.compound].name}</b></div>
      <div class="ln"><span>Reifenprofil</span><b>${wear}</b></div>
      <div class="ln"><span>Bremsen °C</span><b>${W.map(w => Math.round(w.brakeTemp)).join('/')}</b></div>
      <div class="ln"><span>Fahrhöhe v/h</span><b>${Math.round(veh.rideF * 1000)} / ${Math.round(veh.rideR * 1000)} mm</b></div>
      <div class="ln"><span>TC / ABS</span><b>${['Aus', 'Mittel', 'Voll'][veh.aids.tc]} / ${veh.aids.abs ? 'An' : 'Aus'}</b></div>
      <div class="ln"><span>Schaden</span><b>${Damage.summary(veh)}</b></div>`;
    if (this.hudCache.mfd !== html) { this.hudCache.mfd = html; $('hudMfd').innerHTML = html; }
  },
  updateFps(dt, show, graph) {
    this.frameHist[this.frameI] = dt; this.frameI = (this.frameI + 1) % this.frameHist.length;
    $('fpsBox').classList.toggle('hidden', !show && !graph);
    $('fpsGraph').classList.toggle('hidden', !graph);
    if (!show && !graph) return;
    this.fpsT = (this.fpsT || 0) + dt;
    if (this.fpsT > 0.25) {
      this.fpsT = 0;
      let s = 0, mx = 0; for (const v of this.frameHist) { s += v; mx = Math.max(mx, v); }
      const avg = s / this.frameHist.length;
      $('fpsTxt').textContent = show ? `${Math.round(1 / Math.max(avg, 1e-3))} FPS · ${(avg * 1000).toFixed(1)} ms (max ${(mx * 1000).toFixed(1)})` : '';
    }
    if (graph) {
      const g = this.fpsCtx, W = 160, H = 40;
      g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, H - H * (16.7 / 50), W, 1);
      g.fillStyle = '#2fe36b';
      const n = this.frameHist.length;
      for (let i = 0; i < n; i++) { const v = this.frameHist[(this.frameI + i) % n] * 1000; const hh = clamp(v / 50, 0, 1) * H; g.fillStyle = v > 20 ? '#ff3b3b' : '#2fe36b'; g.fillRect(i, H - hh, 1, hh); }
    }
  },

  /** Pro Frame (auch in Menüs) */
  frame(dt) {
    if (this.wizard) this._wizFrame(dt);
    if (this.testEl) this._updateInputTest();
    if (this.liveFns && this.current === 'settings') for (const f of this.liveFns) f();
    if (this.current === 'main') { this._pillT = (this._pillT || 0) + dt; if (this._pillT > 1) { this._pillT = 0; this._updateDevPill(); } }
  },
};
