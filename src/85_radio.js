// ============================================================================
//  FUNK – Renningenieur: Abstände, Position, Reifen, Schaden, Flaggen, Wetter
//  Anzeige als Funkzeile im HUD, optional gesprochen (Web Speech API, offline je nach System)
//  Modus: settings.audio.radioMode = 'off' | 'text' | 'voice'
// ============================================================================

const ENGINEER_NAMES = ['Mara Lindholm', 'Jonas Reuter', 'Elif Kaya', 'Tomás Vidal', 'Hanna Brecht', 'Pieter de Wit', 'Aiko Mori', 'Rui Salgado', 'Greta Holm', 'Nils Ahrend'];

const Radio = {
  q: [], cur: null, curT: 0, el: null, voice: null, st: null,
  mode() { return (Game.settings.audio && Game.settings.audio.radioMode) || 'voice'; },
  /** Name der Renningenieurin/des Renningenieurs je Team (fest, frei erfunden) */
  engineerFor(teamId) { let hsh = 0; for (const c of String(teamId || 'x')) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0; return ENGINEER_NAMES[hsh % ENGINEER_NAMES.length]; },
  /** Nachricht einreihen; prio 2 = sofort (verdrängt Routine), 0 = nur wenn frei */
  say(text, prio = 1) {
    if (this.mode() === 'off') return;
    if (prio === 0 && (this.cur || this.q.length)) return;
    if (prio >= 2) { this.q = this.q.filter(m => m.prio >= 2); if (this.cur && this.cur.prio < 2) this.curT = 0; }
    if (this.q.some(m => m.text === text)) return;
    this.q.push({ text, prio });
    if (this.q.length > 4) this.q.shift();
  },
  reset() { this.q = []; this.cur = null; this.curT = 0; this.st = null; if (this.el) this.el.style.display = 'none'; try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* keine Sprachausgabe */ } },
  _show(m) {
    if (!this.el) {
      this.el = h('div#hudRadio', { style: { position: 'absolute', left: '24px', bottom: '150px', maxWidth: '460px', background: 'rgba(10,12,16,0.86)', borderLeft: '4px solid #2fe3c6', padding: '8px 14px', font: '700 15px/1.35 system-ui, sans-serif', color: '#fff', display: 'none', zIndex: 5 } });
      const hud = $('hudMsg'); (hud && hud.parentNode ? hud.parentNode : document.body).append(this.el);
    }
    const who = this.engineerFor(Game.team && Game.team.id);
    this.el.innerHTML = '';
    this.el.append(h('div', { style: { fontSize: '11px', letterSpacing: '0.12em', color: '#2fe3c6', textTransform: 'uppercase', marginBottom: '2px' } }, '◉ Funk · ' + who), h('div', m.text));
    this.el.style.display = 'block';
    if (typeof AudioSys !== 'undefined' && AudioSys.radio) AudioSys.radio();
    if (this.mode() === 'voice') this._speak(m.text);
  },
  _speak(text) {
    try {
      const S = window.speechSynthesis; if (!S) return;
      if (!this.voice) { const vs = S.getVoices(); this.voice = vs.find(v => /^de/i.test(v.lang)) || null; }
      const u = new SpeechSynthesisUtterance(text.replace(/–/g, ',')); u.lang = 'de-DE'; if (this.voice) u.voice = this.voice;
      const A = Game.settings.audio; u.volume = clamp((A.master ?? 0.8) * (A.radio ?? 0.8) * 1.2, 0, 1); u.rate = 1.12; u.pitch = 0.95;
      S.cancel(); S.speak(u);
    } catch (e) { /* Sprachausgabe nicht verfügbar → nur Text */ }
  },
  /** Pro Bild: Anzeige weiterschalten */
  tick(dt) {
    if (this.cur) { this.curT -= dt; if (this.curT > 0) return; this.cur = null; if (this.el) this.el.style.display = 'none'; }
    const m = this.q.shift(); if (!m) return;
    this.cur = m; this.curT = 2.2 + m.text.length * 0.055;
    this._show(m);
  },

  // ---------------------------------------------------------------------------
  //  Rennbeobachtung (nur für den Spieler; im Mehrspieler-Gast ohne Abstandsrechnung)
  // ---------------------------------------------------------------------------
  watch(race, dt) {
    if (!race || !race.player || this.mode() === 'off') return;
    const me = race.player, st = this.st || (this.st = { laps: me.timing.laps.length, pos: me.pos, posT: 0, wear: 0, close: 0, closeT: 0, t: 0, last: false, team: 0 });
    st.t += dt; if (st.t < 0.25) return; const step = st.t; st.t = 0;
    if (race.state !== 'race' || me.finished || me.retired) return;
    const order = race.order || race.entries, n = me.timing.laps.length, rem = race.laps - n;
    const gapOf = (a, b) => { if (typeof race.gap !== 'function') return null; const g = race.gap(a, b); return g && g.s != null && g.s > 0 ? g.s : null; };
    // Position verändert (erst melden, wenn sie 2 s hält)
    if (me.pos !== st.pos) { st.posT += step; if (st.posT > 2) { const up = me.pos < st.pos; this.say(up ? (me.pos === 1 ? 'Du führst das Rennen! Sauber bleiben.' : `Stark, P${me.pos}!`) : `P${me.pos}. Dranbleiben, das holen wir zurück.`, 1); st.pos = me.pos; st.posT = 0; } }
    else st.posT = 0;
    // Rundenmeldung: Position und Abstände
    if (n > st.laps) {
      st.laps = n;
      if (rem === 1) this.say('Letzte Runde! Bring es nach Hause.', 2);
      else if (n >= 1 && rem > 1) {
        const ahead = order[me.pos - 2], behind = order[me.pos];
        const ga = ahead ? gapOf(ahead, me) : null, gb = behind && !behind.retired ? gapOf(me, behind) : null;
        let t = `P${me.pos}.`;
        if (ga != null) t += ` Vorne ${fmtNum(ga, 1)} Sekunden`;
        if (gb != null) t += (ga != null ? ',' : '') + ` hinten ${fmtNum(gb, 1)}`;
        if (ga != null && ga < 1) t += ' – Überholmodus ist frei!';
        else if (gb != null && gb < 0.8) t += ' – verteidigen!';
        this.say(t + (rem <= 5 ? ` Noch ${rem} Runden.` : ''), 0);
      }
    }
    // Hintermann sitzt im Getriebe
    const behind = order[me.pos];
    const gb = behind && !behind.retired ? gapOf(me, behind) : null;
    if (gb != null && gb < 0.5) { st.closeT += step; if (st.closeT > 8 && st.close !== behind) { st.close = behind; this.say(`Achtung, ${behind.name} ist direkt hinter dir.`, 1); } }
    else st.closeT = 0;
    // Reifen
    const W = me.vehicle.wheels, wear = Math.max(...W.map(w => w.tyre.wear || 0));
    if (wear > 0.55 && st.wear < 1) { st.wear = 1; this.say('Die Reifen bauen ab – schone die Hinterräder.', 1); }
    if (wear > 0.72 && st.wear < 2 && rem > 2) { st.wear = 2; this.say('Reifen sind am Ende. Box, Box – diese Runde reinkommen!', 2); }
    if (wear < 0.2) st.wear = 0;
  },
  /** Ereignisse aus Rennen und Wetter */
  init() {
    Events.on('race:start', () => { this.reset(); this.say('Grün! Guter Start, sauber durch die erste Kurve.', 1); });
    Events.on('race:damage', (parts, sum) => {
      const v = Game.vehicle, H = v && v.health;
      const box = H && (H.fw < 0.6 || H.rw < 0.55 || H.susp.some(x => x < 0.6));
      this.say(`Schaden: ${sum}.${box ? ' Box, neue Teile!' : ' Wir können weiterfahren.'}`, 2);
    });
    Events.on('race:sc', (kind, phase) => {
      if (phase === 'deploy') this.say(kind === 'vsc' ? 'Virtuelles Safety Car – Delta einhalten.' : 'Safety Car! Nicht überholen, Abstand halten.', 2);
      else if (phase === 'in') this.say('Safety Car kommt rein. Reifen warm halten, bereit machen.', 2);
      else if (phase === 'ending') this.say('VSC endet – gleich wieder Gas.', 2);
      else if (phase === 'green') this.say('Grün, grün, grün!', 2);
    });
    Events.on('race:flag', (f) => { if (f === 'blue') this.say('Blaue Flagge – lass die Führenden vorbei.', 1); });
    Events.on('race:msg', (text, entry, kind) => { if (kind === 'fastest' && entry && entry.player) this.say('Schnellste Runde! Sehr stark.', 1); });
    Events.on('race:pitdone', (e) => { if (e && e.player) this.say('Guter Stopp. Reifen erst aufwärmen.', 1); });
    Events.on('race:finished', (e) => {
      if (!e || !e.player) return;
      const p = e.pos || (Game.race && Game.race.player && Game.race.player.pos) || 0;
      this.say(`Zielflagge! P${p}. ${p === 1 ? 'Wir haben gewonnen! Unglaublich!' : p <= 3 ? 'Podium! Klasse gefahren.' : p <= 10 ? 'Punkte! Gute Arbeit.' : 'Danke dir, wir schauen uns das an.'}`, 2);
    });
  },
};

/** Teamorder in Karriererennen: der Schnellere bzw. die Nummer 1 soll vorbei */
const TeamOrders = {
  st: null,
  reset() { this.st = null; },
  watch(race, dt, c) {
    if (!race || !race.player || !c || race.state !== 'race') return;
    const st = this.st || (this.st = { t: 0, behindT: 0, aheadT: 0, done: false, ask: null });
    st.t += dt; if (st.t < 0.5) return; const step = st.t; st.t = 0;
    const me = race.player, mate = race.entries.find(e => !e.player && e.team === c.team && !e.retired);
    if (!mate || me.finished || me.retired || st.done) return;
    const rem = race.laps - me.timing.laps.length; if (rem < 1) return;
    const g = (a, b) => { const x = race.gap(a, b); return x && x.s != null && x.s > 0 ? x.s : null; };
    const table = Season.driverTable(c.season), myPts = (table.find(d => d.player) || { pts: 0 }).pts, matePts = (table.find(d => d.name === mate.name) || { pts: 0 }).pts;
    const iAmLead = c.contract && c.contract.lead, mateLead = !iAmLead && matePts > myPts + 10 && c.season.round >= 2;
    // Offene Anweisung an den Spieler auswerten
    if (st.ask) {
      if (mate.pos < me.pos) { Career.teamOrder(c, mate.name, true); Radio.say('Danke dir. Das hilft dem Team.', 2); st.done = true; return; }
      if (race.time > st.ask) { Career.teamOrder(c, mate.name, false); Radio.say('Das war eine klare Anweisung … darüber reden wir nach dem Rennen.', 2); st.done = true; return; }
      return;
    }
    // Teamkollege direkt vor mir, ich bin Nummer 1 bzw. vorne in der WM → er lässt mich vorbei
    if (mate.pos === me.pos - 1 && g(mate, me) != null && g(mate, me) < 1.2 && (iAmLead || myPts > matePts + 10)) { st.aheadT += step; if (st.aheadT > 25 && mate.ai) { mate.ai.letByUntil = race.time + 25; Radio.say(`Teamorder: ${mate.name} lässt dich vorbei.`, 2); st.done = true; } }
    else st.aheadT = 0;
    // Teamkollege direkt hinter mir und er ist die Nummer 1 bzw. klar vorne in der WM → ich soll Platz machen
    if (me.pos === mate.pos - 1 && g(me, mate) != null && g(me, mate) < 1.0 && mateLead) { st.behindT += step; if (st.behindT > 20) { st.ask = race.time + 60; Radio.say(`Teamorder: Lass ${mate.name} vorbei. Er kämpft um mehr Punkte.`, 2); } }
    else st.behindT = 0;
  },
};
