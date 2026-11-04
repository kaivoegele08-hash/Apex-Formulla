// ============================================================================
//  EINSTIEG – Willkommens-Assistent beim ersten Start und Fahrschule
//  (geführte Testfahrt: der Renningenieur erklärt Gas, Bremse, Ideallinie, Kurven, Regeln)
// ============================================================================

const AID_PRESETS = {
  einsteiger: { label: 'Einsteiger', desc: 'Starke Traktionskontrolle, ABS, Automatik, volle Ideallinie. Ideal für Tastatur und Gamepad.', aids: { tc: 2, abs: true, autoShift: true, autoClutch: true, aeroAuto: true, idealLine: 'full' }, strength: 0.9 },
  fortgeschritten: { label: 'Fortgeschritten', desc: 'Leichte Traktionskontrolle, Automatik, Ideallinie nur in Bremszonen.', aids: { tc: 1, abs: true, autoShift: true, autoClutch: true, aeroAuto: true, idealLine: 'brake' }, strength: 1 },
  profi: { label: 'Profi', desc: 'Keine Hilfen: kein ABS, keine Traktionskontrolle, Schalten selbst, keine Ideallinie. Für Lenkrad mit Pedalen.', aids: { tc: 0, abs: false, autoShift: false, autoClutch: true, aeroAuto: true, idealLine: 'off' }, strength: 1.04 },
};

Object.assign(UI, {
  /** Willkommens-Assistent: Name, Nummer, Steuerung, Fahrhilfen → Fahrschule oder Hauptmenü */
  scr_welcome() {
    const S = Game.settings, G = S.game, st = this._wel || (this._wel = { step: 0, preset: 'einsteiger', dev: 'keyboard' });
    const steps = ['Fahrer', 'Steuerung', 'Fahrhilfen', 'Los geht’s'];
    const next = () => { st.step++; this.show('welcome', { noHistory: true }); };
    const back = () => { st.step = Math.max(0, st.step - 1); this.show('welcome', { noHistory: true }); };
    const chip = (on, label, fn) => h('div.chip' + (on ? '.on' : ''), { onclick: () => { AudioSys.uiClick(); fn(); } }, label);
    let body;
    if (st.step === 0) {
      const name = h('input', { type: 'text', value: G.playerName === 'Du' ? '' : G.playerName, placeholder: 'Dein Fahrername', maxlength: 24, style: { fontSize: '20px', padding: '10px 14px', width: '100%', maxWidth: '420px' } });
      const num = h('input', { type: 'number', value: G.number, min: 2, max: 99, style: { fontSize: '20px', padding: '10px 14px', width: '110px' } });
      const save = () => { const v = name.value.trim(); if (v) G.playerName = v.slice(0, 24); const n = Math.round(+num.value); if (n >= 2 && n <= 99) G.number = n; Game.saveSettings(); };
      body = h('div.card', h('h3', 'Wer fährt?'),
        h('p', 'Dein Name erscheint in Rennen, Karriere und Mehrspieler. Du kannst ihn jederzeit oben rechts im Hauptmenü ändern.'),
        fieldRow('Name', name), fieldRow('Startnummer', num),
        h('div.actions', btn('Weiter', () => { save(); next(); }, 'primary')));
    } else if (st.step === 1) {
      const list = [...Input.devices.values()].filter(d => d.connected);
      body = h('div.card', h('h3', 'Womit fährst du?'),
        h('div.chips', chip(st.dev === 'keyboard', 'Tastatur', () => { st.dev = 'keyboard'; st.preset = 'einsteiger'; this.show('welcome', { noHistory: true }); }),
          chip(st.dev === 'pad', 'Gamepad', () => { st.dev = 'pad'; st.preset = 'einsteiger'; this.show('welcome', { noHistory: true }); }),
          chip(st.dev === 'wheel', 'Lenkrad + Pedale', () => { st.dev = 'wheel'; st.preset = 'fortgeschritten'; this.show('welcome', { noHistory: true }); })),
        h('p', list.length ? 'Erkannt: ' + list.map(d => d.displayName).join(', ') : 'Noch kein Gerät erkannt – drücke einen Knopf am Gamepad oder Lenkrad, damit der Browser es meldet.'),
        st.dev === 'keyboard' ? h('p', 'Standard: ', h('span.kbd', 'W/↑'), ' Gas · ', h('span.kbd', 'S/↓'), ' Bremse · ', h('span.kbd', 'A D'), ' lenken · ', h('span.kbd', 'C'), ' Kamera · ', h('span.kbd', 'Esc'), ' Pause. Alles ist in den Einstellungen frei belegbar.') : null,
        st.dev === 'wheel' ? h('p', 'Für Lenkräder (z. B. Logitech G920) gibt es einen Kalibrier-Assistenten: Lenkwinkel, Pedale und Knöpfe in einer Minute eingestellt. Force Feedback lässt sich danach in den Einstellungen verbinden.') : null,
        h('div.actions', btn('Zurück', back), st.dev === 'wheel' ? btn('Lenkrad jetzt kalibrieren', () => this.openWizard()) : null, btn('Weiter', next, 'primary')));
    } else if (st.step === 2) {
      body = h('div.card', h('h3', 'Wie viel Hilfe möchtest du?'),
        h('div.grid3', ...Object.entries(AID_PRESETS).map(([k, p]) => h('div.card' + (st.preset === k ? '.sel' : ''), { style: { cursor: 'pointer', outline: st.preset === k ? '2px solid var(--acc)' : 'none' }, onclick: () => { st.preset = k; AudioSys.uiClick(); this.show('welcome', { noHistory: true }); } },
          h('h3', p.label), h('p', p.desc)))),
        h('p.hint', 'Die Fahrhilfen lassen sich jederzeit unter Einstellungen → Fahrhilfen einzeln ändern.'),
        h('div.actions', btn('Zurück', back), btn('Weiter', () => { const p = AID_PRESETS[st.preset]; Object.assign(S.aids, p.aids); S.race.strength = p.strength; Game.saveSettings(); next(); }, 'primary')));
    } else {
      body = h('div.card', h('h3', `Bereit, ${G.playerName || 'Fahrer'}?`),
        h('p', 'In der ', h('b', 'Fahrschule'), ' fährst du allein auf dem Kurstadt-Ringpark. Dein Renningenieur erklärt über Funk Schritt für Schritt Gas, Bremse, Ideallinie, Kurven und die Regeln. Eine Runde dauert etwa anderthalb Minuten.'),
        h('p', 'Danach empfehlen wir ein ', h('b', 'Schnelles Rennen'), ' mit wenigen Gegnern oder direkt die ', h('b', 'Karriere'), '.'),
        h('div.actions', btn('Zurück', back), btn('Zum Hauptmenü', () => this.finishWelcome(false)), btn('Fahrschule starten', () => this.finishWelcome(true), 'primary')));
    }
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Willkommen · Schritt ' + (st.step + 1) + ' von ' + steps.length), h('h1', 'Willkommen bei Apex Formula')),
      h('div.chips', { style: { marginBottom: '14px', pointerEvents: 'none' } }, ...steps.map((s, i) => h('div.chip' + (i === st.step ? '.on' : ''), (i + 1) + ' · ' + s))),
      body);
  },
  finishWelcome(school) {
    Game.settings.game.onboarded = true; Game.saveSettings(); this._wel = null;
    if (school) Game.startDrivingSchool(); else this.show('main', { noHistory: true });
  },
});

/** Geführte Testfahrt: Schritte mit Bedingung, gesprochen vom Renningenieur, Hinweis bleibt im HUD */
class DrivingSchool {
  constructor() {
    const K = Game.settings.input.keys, key = (a) => ((K[a] || [])[0] ? codeLabel(K[a][0]) : '–');
    const auto = Game.settings.aids.autoShift;
    this.steps = [
      { say: `Willkommen in der Fahrschule! Gib Gas – Pedal oder Taste ${key('throttle')} – und beschleunige auf 150 km/h.`, done: (v) => v.speedKmh > 150 },
      auto ? { say: 'Die Automatik schaltet für dich. Achte auf die Schaltlichter am Lenkrad.', done: (v, t) => t > 5 }
        : { say: `Schalte hoch mit ${key('shiftUp')}, sobald die Schaltlichter rot werden. Bring das Auto in den 4. Gang.`, done: (v) => v.gear >= 4 },
      { say: 'Die farbige Linie ist die Ideallinie: grün heißt Gas, gelb lupfen, rot bremsen.', done: (v, t) => t > 7 },
      { say: `Vor der Kurve kräftig und gerade bremsen – Taste ${key('brake')}. Die Schilder am Rand zeigen 150, 100 und 50 Meter.`, done: (v, t, s) => s.braked },
      { say: 'Jetzt einlenken, am Scheitelpunkt innen ans Kurvenende und dann langsam wieder ans Gas.', done: (v, t) => t > 9 },
      { say: 'Bleib mit mindestens einem Rad innerhalb der weißen Linien – sonst wird die Runde ungültig.', done: (v, t) => t > 9 },
      { say: `Mit ${key('camera')} wechselst du die Kamera, mit ${key('reset')} setzt du das Auto nach einem Ausritt zurück.`, done: (v, t) => t > 9 },
      { say: 'Fahr die Runde zu Ende. Über die Ziellinie, dann zeige ich dir deine Zeit.', done: (v, t, s) => s.lap },
      { say: 'Erste Runde geschafft! Du bist bereit fürs Rennen. Esc öffnet das Menü – viel Spaß!', done: () => false },
    ];
    this.i = -1; this.t = 0; this.flags = { braked: false, lap: false };
    this._lap = () => { this.flags.lap = true; };
    Events.on('lap:done', this._lap);
  }
  update(dt, v) {
    if (!v) return;
    if (v.input && v.input.brake > 0.5 && v.speedKmh > 100) this.flags.braked = true;
    this.t += dt;
    if (this.i < 0 || (this.steps[this.i].done(v, this.t, this.flags) && this.t > 3)) {
      if (this.i >= this.steps.length - 1) return;
      this.i++; this.t = 0;
      const s = this.steps[this.i];
      Radio.say(s.say, 2);
      this._hint(s.say);
    }
  }
  _hint(text) {
    let el = $('schoolHint');
    if (!el) { el = h('div#schoolHint', { style: { position: 'absolute', top: '150px', left: '50%', transform: 'translateX(-50%)', maxWidth: '640px', textAlign: 'center', background: 'rgba(10,12,16,0.8)', border: '1px solid rgba(47,227,198,0.6)', borderRadius: '6px', padding: '8px 16px', font: '700 15px system-ui, sans-serif', color: '#fff', zIndex: 5 } }); const hud = $('hudMsg'); (hud && hud.parentNode ? hud.parentNode : document.body).append(el); }
    el.textContent = `Fahrschule ${this.i + 1}/${this.steps.length}: ${text}`;
    el.style.display = 'block';
  }
  dispose() { const el = $('schoolHint'); if (el) el.remove(); if (Events.off) Events.off('lap:done', this._lap); }
}
