// ============================================================================
//  UI – Mehrspieler: Profil & Freunde, Lobby erstellen/beitreten (Code oder
//  LAN-Einladung), Lobby mit Spielern, Einstellungen, Chat und Start
// ============================================================================

function copyBtn(getText, label = 'Kopieren') { return btn(label, () => { const t = getText(); try { navigator.clipboard.writeText(t).then(() => UI.toast('In die Zwischenablage kopiert')); } catch (e) { UI.showText('Code', t); } }, 'small'); }
function codeBox(text) { return h('textarea', { readonly: true, style: { width: '100%', height: '70px', fontSize: '11px', fontFamily: 'monospace', background: '#0e1117', color: '#cfe0ff', border: '1px solid #2a3342' } }, text); }

Object.assign(UI, {
  scr_multi() {
    const G = Game.settings.game, prof = NetProfile.get();
    const nameIn = h('input', { type: 'text', value: G.playerName || '', maxlength: 24, placeholder: 'Benutzername', style: { width: '100%', fontSize: '17px', padding: '7px' } });
    nameIn.addEventListener('change', () => { const v = nameIn.value.trim(); if (v) { G.playerName = v.slice(0, 24); Game.saveSettings(); } });
    const status = h('span', { style: { fontWeight: 800 } });
    const showStatus = () => { const s = NetPresence.status; status.textContent = s === 'online' ? '● online (Freunde können dich sehen)' : s === 'verbinde' ? '… verbinde' : s === 'offline' ? '● offline – ' + (NetPresence.err || '') : '○ aus'; status.style.color = s === 'online' ? '#2fe36b' : s === 'offline' ? '#ff6b5b' : '#9aa3ad'; };
    showStatus();
    if (NetPresence.status === 'aus') NetPresence.start().then(() => { showStatus(); if (this.current === 'multi') renderFriends(); });
    const busy = (b, label) => { b.disabled = true; b.querySelector('span').textContent = label; };
    // Erstellen
    const hostOnline = btn('Online-Lobby erstellen', async (e) => {
      const b = e.currentTarget; busy(b, 'Lobby wird erstellt …');
      const host = new NetHost();
      try { await host.openCode(); Net.session = host; this.show('lobby', { noHistory: true }); }
      catch (err) { this.toast('Lobby konnte nicht erstellt werden: ' + err.message + ' – für LAN „Lobby ohne Internet“ nutzen.', 7000); this.show('multi', { noHistory: true }); }
    }, 'primary');
    const hostLan = btn('Lobby ohne Internet (LAN)', () => { Net.session = new NetHost(); this.show('lobby', { noHistory: true, lan: true }); });
    // Beitreten
    const codeIn = h('input', { type: 'text', placeholder: 'APEX-XXXXX', maxlength: 12, style: { width: '160px', fontSize: '18px', padding: '7px', textTransform: 'uppercase', letterSpacing: '0.1em' } });
    const join = async (code, b) => {
      if (b) busy(b, 'Verbinde …');
      const cl = new NetClient();
      try { Net.session = cl; await cl.joinCode(code); this.show('lobby', { noHistory: true }); }
      catch (err) { Net.session = null; this.toast('Beitreten fehlgeschlagen: ' + err.message, 6000); this.show('multi', { noHistory: true }); }
    };
    const joinBtn = btn('Beitreten', (e) => join(codeIn.value, e.currentTarget), 'primary');
    // LAN-Beitritt
    const lanArea = h('div');
    const lanJoin = btn('Mit Einladungs-Code (LAN)', () => {
      const inp = h('textarea', { placeholder: 'Einladungs-Code des Hosts hier einfügen', style: { width: '100%', height: '70px', fontSize: '11px', fontFamily: 'monospace' } });
      lanArea.innerHTML = '';
      lanArea.append(h('p', { style: { fontSize: '12px' } }, '1. Einladungs-Code vom Host einfügen  2. Antwort-Code erzeugen und dem Host schicken  3. warten, bis der Host ihn eingetragen hat.'), inp,
        h('div.actions', btn('Antwort-Code erzeugen', async (e) => {
          const b = e.currentTarget; busy(b, 'Erzeuge …');
          const cl = new NetClient();
          try {
            const ans = await cl.lanAnswer(inp.value, true);
            Net.session = cl;
            lanArea.innerHTML = '';
            lanArea.append(h('p', 'Diesen Antwort-Code an den Host schicken:'), codeBox(ans), h('div.actions', copyBtn(() => ans, 'Antwort-Code kopieren')), h('p', { style: { color: '#9aa3ad' } }, 'Warte auf den Host …'));
            const wait = setInterval(() => { if (cl.state === 'lobby') { clearInterval(wait); this.show('lobby', { noHistory: true }); } if (Net.session !== cl) clearInterval(wait); }, 300);
          } catch (err) { this.toast('Code ungültig: ' + err.message, 5000); b.disabled = false; b.querySelector('span').textContent = 'Antwort-Code erzeugen'; }
        }, 'small primary')));
    });
    // Freunde
    const friends = h('div');
    const renderFriends = () => {
      friends.innerHTML = '';
      const P = NetProfile.get();
      if (!P.friends.length) friends.append(h('p', { style: { color: '#7d8898' } }, 'Noch keine Freunde. Tauscht eure Freundescodes aus.'));
      for (const f of P.friends) {
        const st = NetPresence.online[f.code];
        const row = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid #1d2430' } },
          h('span', { style: { color: st ? '#2fe36b' : st === null ? '#7d8898' : '#4a5363', fontSize: '18px' } }, '●'),
          h('div', { style: { flex: '1' } }, h('b', st && st.name ? st.name : f.name), h('small', { style: { color: '#7d8898', display: 'block' } }, `APEX-${f.code}${st ? (st.lobby ? ' · hostet Lobby APEX-' + st.lobby : ' · online') : st === null ? ' · offline' : ''}`)),
          st && st.lobby ? btn('Beitreten', (e) => join(st.lobby, e.currentTarget), 'small primary') : null,
          Net.session && Net.session.role === 'host' && Net.session.code && st ? btn('Einladen', async () => { const r = await NetPresence.ask(f.code, { t: 'invite', name: G.playerName || 'Spieler', lobby: Net.session.code }); this.toast(r ? 'Einladung geschickt' : 'Freund nicht erreichbar'); }, 'small') : null,
          btn('Prüfen', async () => { await NetPresence.check(f.code); renderFriends(); }, 'small ghost'),
          btn('✕', () => this.confirm(`${f.name} aus der Freundesliste entfernen?`, () => { NetProfile.removeFriend(f.code); renderFriends(); }), 'small ghost'));
        friends.append(row);
      }
    };
    renderFriends();
    if (NetPresence.status === 'online') Promise.all(NetProfile.get().friends.map(f => NetPresence.check(f.code))).then(() => { if (this.current === 'multi') renderFriends(); });
    const fName = h('input', { type: 'text', placeholder: 'Name', style: { width: '120px', padding: '6px' } }), fCode = h('input', { type: 'text', placeholder: 'APEX-XXXXXX', style: { width: '140px', padding: '6px', textTransform: 'uppercase' } });
    const addFriend = btn('Hinzufügen', async () => {
      const code = normCode(fCode.value); if (code.length !== 6) { this.toast('Freundescode hat 6 Zeichen (APEX-XXXXXX)'); return; }
      if (!NetProfile.addFriend(fName.value.trim(), code)) { this.toast('Schon in der Liste oder eigener Code'); return; }
      NetPresence.ask(code, { t: 'friend', name: G.playerName || 'Spieler', code: prof.code });
      renderFriends(); NetPresence.check(code).then(() => this.current === 'multi' && renderFriends());
    }, 'small primary');
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Mehrspieler'), h('h1', 'Mehrspieler'), h('span', { style: { color: '#7d8898' } }, 'Peer-to-Peer: der PC des Hosts ist der Server – kein eigener Server nötig')),
      h('div.row', { style: { alignItems: 'flex-start' } },
        h('div.col', { style: { flex: '1 1 520px', maxWidth: '720px' } },
          h('div.card', h('h3', 'Spiel erstellen'),
            h('p', 'Online-Lobby: Du bekommst einen kurzen Code (z. B. APEX-7K3QX), den deine Freunde eingeben. Bis zu 8 Spieler, freie Plätze füllt die KI.'),
            h('div.actions', hostOnline, hostLan),
            h('p', { style: { fontSize: '12px', color: '#7d8898' } }, 'Ohne Internet (LAN) oder wenn der Code-Dienst nicht erreichbar ist: Einladungs-Codes zum Kopieren – je Mitspieler ein Code, die Verbindung bleibt direkt im Heimnetz.')),
          h('div.card', h('h3', 'Beitreten'),
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, codeIn, joinBtn),
            h('div.actions', lanJoin), lanArea),
          h('div.card', h('h3', 'So funktioniert es'),
            h('p', '• Der Code-Dienst (öffentlicher, kostenloser PeerJS-Vermittler) bringt euch nur zusammen; danach fahren die Daten direkt zwischen euren PCs.'),
            h('p', '• Jeder fährt sein eigenes Auto mit der vollen Physik auf dem eigenen PC – keine Eingabeverzögerung. Der Host rechnet Zeiten, Positionen, Flaggen und die KI.'),
            h('p', '• Alle brauchen dieselbe Spieldatei (Version) und dieselben Mod-Strecken, wenn eine gewählt wird.'),
            h('p', '• Klappt die Verbindung über das Internet nicht (strenge Router/Firmennetz), hilft oft die LAN-Einladung oder ein anderer Host.'))),
        h('div.col', { style: { flex: '0 1 460px' } },
          h('div.card', h('h3', 'Dein Profil'), fieldRow('Benutzername', nameIn),
            h('p', 'Dein Freundescode: ', h('b', { style: { fontSize: '20px', letterSpacing: '0.08em' } }, 'APEX-' + prof.code), ' ', copyBtn(() => 'APEX-' + prof.code)),
            h('p', 'Status: ', status)),
          h('div.card', h('h3', 'Freunde'), friends,
            h('div', { style: { display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' } }, fName, fCode, addFriend)),
          h('div.card', h('h3', 'Erweitert: eigener TURN-Server'),
            h('p', { style: { fontSize: '12px', color: '#7d8898' } }, 'Nur nötig, wenn Verbindungen über das Internet trotz Code scheitern (strenge Router, Mobilfunk, Firmennetz). Ein TURN-Server leitet die Daten weiter – Adresse z. B. turn:mein-server.de:3478.'),
            (() => { const N = Game.settings.net = Game.settings.net || {}; const T = N.turn = N.turn || {}; const mk = (k, ph, type = 'text') => { const i = h('input', { type, placeholder: ph, value: T[k] || '', style: { width: '100%', padding: '6px', marginBottom: '4px' } }); i.addEventListener('change', () => { T[k] = i.value.trim(); Game.saveSettings(); }); return i; }; return h('div', mk('urls', 'turn:server:3478'), mk('username', 'Benutzer'), mk('credential', 'Passwort', 'password')); })()),
          h('div.actions', btn('Zurück', () => this.show('main', { noHistory: true }), 'ghost'))),
      ),
    );
  },

  scr_lobby(opts = {}) {
    const S = Net.session;
    if (!S) return this.scr_multi();
    const isHost = S.role === 'host';
    const L = isHost ? S.lobbyMsg() : (S.lobby || { players: [], settings: {}, chat: [], code: '' });
    const set = L.settings || {};
    const me = isHost ? S.me : S.me || {};
    const players = h('table.res', h('tr', h('th', 'Spieler'), h('th', 'Team'), h('th', 'Nr.'), h('th', 'Ping'), h('th', 'Status'), isHost ? h('th', '') : null));
    for (const p of L.players) players.append(h('tr' + (p.id === (isHost ? 0 : S.id) ? '.me' : ''), h('td', h('b', p.name), p.host ? h('small', { style: { color: '#ffd400' } }, ' Host') : null), h('td', teamSw(p.team), Career.teamName(p.team)), h('td.num', String(p.number)), h('td.num', p.host ? '–' : `${p.ping} ms`),
      h('td', { style: { color: p.ready ? '#2fe36b' : '#ffb02e', fontWeight: 800 } }, p.ready ? 'bereit' : 'nicht bereit'), isHost ? h('td', p.host ? '' : btn('Entfernen', () => S.kick(p.id), 'small ghost')) : null));
    const st = (k, v) => { if (isHost) { S.setSettings({ [k]: v }); } };
    const ro = !isHost;
    const opt = (label, ctrl, txt) => fieldRow(label, ro ? h('b', txt) : ctrl);
    const lapsOpts = [3, 5, 8, 10, 15, 20];
    const settingsCard = h('div.card', h('h3', isHost ? 'Einstellungen (Host)' : 'Einstellungen des Hosts'),
      opt('Strecke', chips(TRACK_ORDER.map(id => ({ value: id, label: TRACKS[id].name })), set.track, v => st('track', v)), TRACKS[set.track] ? TRACKS[set.track].name : (set.track + ' (fehlt bei dir!)')),
      opt('Epoche', chips(ERA_ORDER.map(id => ({ value: id, label: ERAS[id].name })), set.era, v => st('era', v)), eraOf(set.era).title),
      opt('Runden', toggle(lapsOpts.map(n => ({ value: n, label: String(n) })), set.laps, v => st('laps', v)), String(set.laps)),
      opt('Qualifying', toggle([{ value: 0, label: 'Aus' }, { value: 3, label: '3 min' }, { value: 5, label: '5 min' }, { value: 10, label: '10 min' }], set.quali || 0, v => st('quali', v)), set.quali ? set.quali + ' min' : 'aus'),
      opt('KI-Gegner', toggle([0, 5, 9, 13, 19].map(n => ({ value: n, label: String(n) })), set.ai, v => st('ai', v)), String(set.ai)),
      opt('Wetter', chips(WEATHER_ORDER.map(id => ({ value: id, label: WEATHER_TYPES[id].name })), set.weather, v => st('weather', v)), (WEATHER_TYPES[set.weather] || {}).name || set.weather),
      opt('Tageszeit', toggle([['track', 'Standard'], ['morning', 'Vormittag'], ['afternoon', 'Nachmittag'], ['evening', 'Abend'], ['dusk', 'Dämmerung']].map(([value, label]) => ({ value, label })), set.tod, v => st('tod', v)), set.tod),
      opt('Schaden', toggle([{ value: 'off', label: 'Aus' }, { value: 'reduced', label: 'Reduziert' }, { value: 'full', label: 'Voll' }], set.damage, v => st('damage', v)), set.damage),
      opt('Safety Car', toggle([{ value: true, label: 'An' }, { value: false, label: 'Aus' }], set.safetyCar !== false, v => st('safetyCar', v)), set.safetyCar !== false ? 'an' : 'aus'));
    const myCar = h('div.card', h('h3', 'Dein Auto'),
      chips(TEAMS.map(t => ({ value: t.id, label: t.name, color: t.colors[0] })), me.team, v => { Game.settings.game.team = v; Game.saveSettings(); S.setMe({ team: v }); }));
    const chatBox = h('div', { style: { height: '200px', overflow: 'auto', background: '#0e1117', padding: '8px', fontSize: '13px', border: '1px solid #1d2430' } },
      (L.chat || []).map(c => h('div', c.name ? [h('b', c.name + ': '), c.text] : h('i', { style: { color: '#7d8898' } }, c.text))));
    setTimeout(() => { chatBox.scrollTop = 1e6; }, 0);
    const chatIn = h('input', { type: 'text', placeholder: 'Nachricht …', maxlength: 200, style: { flex: '1', padding: '7px' }, value: this._chatDraft || '' });
    chatIn.addEventListener('input', () => { this._chatDraft = chatIn.value; });
    const sendChat = () => { const t = chatIn.value.trim(); if (!t) return; this._chatDraft = ''; if (isHost) S.say(S.me.name, t); else S.chat(t); chatIn.value = ''; };
    chatIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); e.stopPropagation(); });
    // LAN-Einladungen (Host)
    const lan = h('div');
    if (isHost) {
      const mk = btn('Einladungs-Code erzeugen', async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          const code = await S.lanOffer(true);
          const ans = h('textarea', { placeholder: 'Antwort-Code des Mitspielers hier einfügen', style: { width: '100%', height: '60px', fontSize: '11px', fontFamily: 'monospace' } });
          lan.innerHTML = '';
          lan.append(h('p', { style: { fontSize: '12px' } }, '1. Diesen Code dem Mitspieler schicken (Chat, Messenger …)'), codeBox(code), h('div.actions', copyBtn(() => code, 'Einladungs-Code kopieren')),
            h('p', { style: { fontSize: '12px' } }, '2. Seinen Antwort-Code hier eintragen:'), ans,
            h('div.actions', btn('Verbinden', async () => { try { await S.lanAnswer(ans.value); this.toast('Verbinde …'); } catch (err) { this.toast('Antwort-Code ungültig: ' + err.message, 5000); } }, 'small primary')));
        } catch (err) { this.toast('Fehler: ' + err.message); b.disabled = false; }
      }, 'small');
      lan.append(h('p', { style: { fontSize: '12px', color: '#7d8898' } }, 'Ohne Internet / LAN: für jeden Mitspieler einen Einladungs-Code erzeugen.'), mk);
    }
    const ready = !isHost ? (me.ready ? btn('Nicht bereit', () => S.ready(false), '') : btn('Bereit', () => S.ready(true), 'primary', '✔')) : null;
    const start = isHost ? btn(S.allReady() ? 'Rennen starten' : 'Rennen starten (nicht alle bereit)', () => { const go = () => S.start(); if (!S.allReady()) this.confirm('Nicht alle Spieler sind bereit. Trotzdem starten?', go); else go(); }, 'primary', '▶') : null;
    const codeTxt = L.code ? 'APEX-' + L.code : '';
    return h('section.screen.solid', { id: 'lobbyScreen' },
      h('header', h('span.crumb', 'Mehrspieler · Lobby'), h('h1', codeTxt || (isHost ? 'LAN-Lobby' : 'Lobby')), codeTxt ? copyBtn(() => codeTxt, 'Code kopieren') : null,
        h('span', { style: { color: '#7d8898' } }, `${L.players.length}/${NET_MAX_PLAYERS} Spieler · ${L.state === 'race' ? 'Rennen läuft' : 'wartet'}`)),
      h('div.row', { style: { alignItems: 'flex-start' } },
        h('div.col', { style: { flex: '1 1 560px' } },
          h('div.card', h('h3', 'Spieler'), players),
          myCar,
          h('div.card', h('h3', 'Chat'), chatBox, h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } }, chatIn, btn('Senden', sendChat, 'small')))),
        h('div.col', { style: { flex: '0 1 480px' } }, settingsCard, isHost ? h('div.card', h('h3', 'Mitspieler einladen'), codeTxt ? h('p', 'Code ', h('b', codeTxt), ' weitergeben – oder in der Freundesliste „Einladen“.') : null, lan) : null)),
      h('div.actions', start, ready, btn('Lobby verlassen', () => this.confirm(isHost ? 'Lobby schließen? Alle Mitspieler werden getrennt.' : 'Lobby verlassen?', () => { Net.leave(); this.show('multi', { noHistory: true }); }), 'ghost')),
    );
  },
});

// Lobby live aktualisieren; Einladungen und Freundschaftsanfragen anzeigen
Events.on('net:lobby', () => { if (UI.current === 'lobby') { const a = document.activeElement, chat = a && a.placeholder === 'Nachricht …'; UI.show('lobby', { noHistory: true }); if (chat) { const i = document.querySelector('input[placeholder="Nachricht …"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } } });
Events.on('net:qdone', () => { if (UI.current === 'qualiResults') UI.show('qualiResults', { noHistory: true }); });
Events.on('net:reconnecting', () => UI.hudMsg('Verbindung zum Host verloren – verbinde neu …', 5000));
Events.on('net:invite', (m) => { if (Game.state !== 'menu') { UI.toast(`${m.name} lädt dich in die Lobby APEX-${m.lobby} ein`, 6000); return; } UI.confirm(`${m.name} lädt dich in die Lobby APEX-${m.lobby} ein. Beitreten?`, async () => { const cl = new NetClient(); try { Net.session = cl; await cl.joinCode(m.lobby); UI.show('lobby', { noHistory: true }); } catch (e) { Net.session = null; UI.toast('Beitreten fehlgeschlagen: ' + e.message); } }); });
Events.on('net:friendReq', (m) => { const code = normCode(m.code); if (NetProfile.get().friends.some(f => f.code === code)) return; UI.confirm(`${m.name} (APEX-${code}) möchte dich als Freund hinzufügen. Annehmen?`, () => { NetProfile.addFriend(m.name, code); if (UI.current === 'multi') UI.show('multi', { noHistory: true }); }); });
