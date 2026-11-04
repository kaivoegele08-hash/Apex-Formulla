// ============================================================================
//  MEHRSPIELER – Lobby und Rennen. Der Host rechnet das Rennen (Zeitnahme,
//  Positionen, Flaggen, KI, Kollisionen mit der KI); jeder Spieler fährt sein
//  eigenes Auto mit der vollen Physik auf dem eigenen PC (keine Eingabeverzögerung)
//  und schickt den Zustand 30× pro Sekunde. Der Host verteilt alle Autos 20×/s.
// ============================================================================

const Net = {
  session: null,
  get active() { return !!this.session; },
  leave(reason = '') { const s = this.session; this.session = null; if (s) s.close(reason); },
};

class NetHost {
  constructor() {
    const G = Game.settings.game;
    this.role = 'host'; this.state = 'lobby'; this.code = ''; this.peer = null; this.links = new Map(); this.nextId = 1; this.chat = [];
    this.players = [{ id: 0, name: G.playerName || 'Host', team: G.team, number: G.number, ready: true, host: true, ping: 0 }];
    this.settings = { track: Game.trackId, era: G.era || 'e2026', laps: 5, ai: 9, weather: 'dry', damage: 'reduced', tod: 'track', safetyCar: true };
    this.pendingLan = null; this.sendT = 0; this.sumT = 0; this.pingT = 0;
  }
  get me() { return this.players[0]; }
  /** Lobby-Code über den Vermittlungsdienst öffnen */
  async openCode() {
    for (let k = 0; k < 4; k++) {
      const code = netCode(5);
      try { this.peer = await NetBroker.open(NET_PREFIX + 'l-' + code); this.code = code; break; }
      catch (e) { if (!/vergeben/.test(e.message) || k === 3) throw e; }
    }
    NetBroker.listen(this.peer, (link) => this._incoming(link));
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* egal */ } });
    return this.code;
  }
  /** LAN/manuell: Einladungs-Code für genau einen Mitspieler */
  async lanOffer(lan = true) {
    if (this.pendingLan) this.pendingLan.close();
    const link = this.pendingLan = new RtcLink({ lan });
    link.onOpen = () => { if (this.pendingLan === link) this.pendingLan = null; this._incoming(link); };
    return link.makeOffer();
  }
  async lanAnswer(code) { if (!this.pendingLan) throw new Error('Zuerst einen Einladungs-Code erzeugen'); await this.pendingLan.acceptAnswer(code); }
  _incoming(link) {
    const t = setTimeout(() => { if (!link.joined) link.close(); }, 10000);
    link.onMsg = (m) => { if (m.t === 'hello') { clearTimeout(t); this._join(link, m); } };
  }
  _join(link, m) {
    const refuse = (why) => { link.send({ t: 'refused', why }); setTimeout(() => link.close(), 300); };
    if (m.v !== NET_VER) return refuse('Andere Spielversion – bitte beide die gleiche Datei verwenden.');
    if (this.state !== 'lobby') return refuse('Das Rennen läuft bereits.');
    if (this.players.length >= NET_MAX_PLAYERS) return refuse('Lobby ist voll.');
    let name = String(m.name || 'Spieler').slice(0, 24), k = 2; while (this.players.some(p => p.name === name)) name = String(m.name).slice(0, 21) + ' ' + k++;
    let number = clamp(m.number | 0, 1, 99); while (this.players.some(p => p.number === number)) number = number % 99 + 1;
    const p = { id: this.nextId++, name, team: TEAMS.some(t => t.id === m.team) ? m.team : TEAMS[0].id, number, ready: false, host: false, ping: 0, code: m.code || '' };
    link.joined = true; this.players.push(p); this.links.set(p.id, link);
    link.onMsg = (mm) => this._onMsg(p, mm);
    link.onBin = (buf) => this._onBin(p, buf);
    link.onClose = () => this._left(p);
    link.send({ t: 'welcome', id: p.id });
    this.sys(`${p.name} ist beigetreten`);
    this.broadcastLobby();
  }
  _onMsg(p, m) {
    if (m.t === 'chat') this.say(p.name, String(m.text || '').slice(0, 200));
    else if (m.t === 'ready') { p.ready = !!m.on; this.broadcastLobby(); }
    else if (m.t === 'me') { if (m.team && TEAMS.some(t => t.id === m.team)) p.team = m.team; if (m.number && !this.players.some(o => o !== p && o.number === m.number)) p.number = clamp(m.number | 0, 1, 99); this.broadcastLobby(); }
    else if (m.t === 'leave') { const l = this.links.get(p.id); if (l) l.close(); }
  }
  _onBin(p, buf) {
    if (this.state !== 'race' || !this.race) return;
    const list = NetCodec.decode(buf); if (!list.length) return;
    const e = this.race.entries.find(x => x.netId === p.id); if (!e) return;
    e.vehicle.netApply(list[0].st);
    if (list[0].flags & 1) e.netRetired = true;
  }
  _left(p) {
    if (!this.players.includes(p)) return;
    this.players = this.players.filter(x => x !== p); this.links.delete(p.id);
    this.sys(`${p.name} hat die Lobby verlassen`);
    if (this.race) { const e = this.race.entries.find(x => x.netId === p.id); if (e && !e.retired && !e.finished) { e.netRetired = true; } }
    this.broadcastLobby();
  }
  lobbyMsg() { return { t: 'lobby', code: this.code, state: this.state, settings: this.settings, players: this.players.map(p => ({ id: p.id, name: p.name, team: p.team, number: p.number, ready: p.ready, host: p.host, ping: Math.round(p.ping) })), chat: this.chat.slice(-40) }; }
  broadcast(m) { for (const l of this.links.values()) l.send(m); }
  broadcastLobby() { this.broadcast(this.lobbyMsg()); Events.emit('net:lobby', this.lobbyMsg()); }
  say(name, text) { this.chat.push({ name, text, t: Date.now() }); if (this.chat.length > 80) this.chat.shift(); this.broadcastLobby(); }
  sys(text) { this.say('', text); }
  setSettings(patch) { Object.assign(this.settings, patch); this.broadcastLobby(); }
  setMe(patch) { Object.assign(this.me, patch); this.broadcastLobby(); }
  kick(id) { const l = this.links.get(id); if (l) { l.send({ t: 'refused', why: 'Vom Host entfernt' }); setTimeout(() => l.close(), 200); } }
  allReady() { return this.players.every(p => p.ready); }
  /** Startaufstellung: Menschen zufällig verteilt zwischen den KI-Fahrern (nach Stärke) */
  _grid() {
    const S = this.settings;
    applyEra(S.era);
    const humanTeams = this.players.map(p => p.team);
    let ai = DRIVERS.slice().sort((a, b) => b.rating - a.rating).slice(0, clamp(S.ai | 0, 0, 19 - (this.players.length - 1)));
    const used = new Set(this.players.map(p => p.number));
    const grid = ai.map(d => ({ kind: 'ai', name: d.name, team: d.team, number: used.has(d.num) ? 100 - d.num : d.num, driver: d }));
    for (const p of this.players.slice().sort(() => Math.random() - 0.5)) grid.splice(Math.floor(Math.random() * (grid.length + 1)), 0, { kind: p.host ? 'host' : 'remote', id: p.id, name: p.name, team: p.team, number: p.number });
    return grid;
  }
  start() {
    if (this.state !== 'lobby') return;
    this.state = 'race';
    const grid = this.grid = this._grid();
    const wx = new Weather(this.settings.weather || 'dry');      // Zufall einmal auflösen, alle bekommen denselben Typ
    this.settings.weatherType = wx.type;
    this.broadcast({ t: 'start', settings: this.settings, grid: grid.map(g => ({ kind: g.kind, id: g.id ?? -1, name: g.name, team: g.team, number: g.number })) });
    this.broadcastLobby();
    Game.netStartHost(this);
  }
  /** Vom Spiel nach dem Aufbau des Rennens aufgerufen */
  attachRace(race) {
    this.race = race;
    race.onRemoteHit = (e, sp, lx, lz) => { const l = this.links.get(e.netId); if (l) l.send({ t: 'hit', sp, lx, lz }); };
  }
  /** Pro Frame (Host): Zustände 20 Hz, Rennübersicht 4 Hz, Ping 0,5 Hz */
  tick(dt) {
    this.pingT += dt; if (this.pingT > 2) { this.pingT = 0; for (const [id, l] of this.links) { l.ping(); const p = this.players.find(x => x.id === id); if (p) p.ping = l.rtt; } }
    const race = this.race; if (!race || this.state !== 'race') return;
    this.sendT += dt; this.sumT += dt;
    if (this.sendT >= 0.05) {
      this.sendT = 0;
      const list = race.entries.filter(e => e.active || e.player).map(e => ({ id: e.idx, st: e.vehicle.netState ? e.vehicle.netState() : null, flags: (e.retired ? 1 : 0) | (e.finished ? 2 : 0) | (e.pitting ? 4 : 0) })).filter(x => x.st);
      if (race.sc && race.sc.car) list.push({ id: 99, st: race.sc.car.vehicle.netState(), flags: 8 });
      const buf = NetCodec.encode(list);
      for (const l of this.links.values()) l.sendBin(buf);
    }
    if (this.sumT >= 0.25) { this.sumT = 0; this.broadcast(this.summary()); }
  }
  summary() {
    const race = this.race, order = race.order || race.entries, lead = order[0], wx = race.weather;
    return { t: 'race', state: race.state, lights: race.lights, time: race.time, flag: race.flag, vscMax: race.vscMax || 0, laps: race.laps, over: !!race.over,
      sc: race.sc ? race.sc.kind : null, wx: wx ? [wx.cloud, wx.rain, wx.water] : [0, 0, 0],
      fastest: race.fastest.entry ? [race.fastest.entry.idx, race.fastest.time, race.fastest.lap] : null,
      order: order.map(e => { const g = e === lead ? null : race.gap(lead, e); return [e.idx, e.timing.laps.length, g ? (g.laps ? -g.laps : g.s) : 0, (e.retired ? 1 : 0) | (e.finished ? 2 : 0) | (e.pitting ? 4 : 0), e.penalty - e.penaltyServed, isFinite(e.timing.bestLap) ? e.timing.bestLap : 0, COMPOUND_ORDER.indexOf(e.vehicle.compound)]; }) };
  }
  sendResult() {
    if (!this.race) return;
    const cls = this.race.classification();
    this.broadcast({ t: 'result', rows: cls.map(r => ({ idx: r.e.idx, pos: r.pos, laps: r.laps, best: isFinite(r.best) ? r.best : 0, total: r.total, penalty: r.penalty, retired: r.retired, finished: r.finished, gapTotal: r.gapTotal || null, gap: r.gap || null })), fastest: this.race.fastest.entry ? [this.race.fastest.entry.idx, this.race.fastest.time, this.race.fastest.lap] : null });
  }
  /** Zurück in die Lobby (nach dem Rennen) */
  backToLobby() { this.state = 'lobby'; this.race = null; for (const p of this.players) p.ready = p.host; this.broadcast({ t: 'lobbyAgain' }); this.broadcastLobby(); }
  close(reason) {
    this.broadcast({ t: 'closed', why: reason || 'Host hat die Lobby geschlossen' });
    setTimeout(() => { for (const l of this.links.values()) l.close(); if (this.pendingLan) this.pendingLan.close(); if (this.peer) try { this.peer.destroy(); } catch (e) { /* egal */ } }, 300);
  }
}

class NetClient {
  constructor() { this.role = 'client'; this.state = 'connecting'; this.id = -1; this.lobby = null; this.link = null; this.peer = null; this.sendT = 0; this.ownPeer = false; }
  async joinCode(code) {
    code = normCode(code); if (code.length < 4) throw new Error('Bitte den Lobby-Code eingeben');
    this.peer = NetPresence.peer && !NetPresence.peer.destroyed ? NetPresence.peer : null;
    if (!this.peer) { this.peer = await NetBroker.open(NET_PREFIX + 'c-' + netCode(10)); this.ownPeer = true; }
    const link = await NetBroker.connect(this.peer, NET_PREFIX + 'l-' + code);
    this._attach(link);
  }
  /** LAN/manuell: Einladungs-Code des Hosts → Antwort-Code für den Host */
  async lanAnswer(offerCode, lan = true) {
    const link = new RtcLink({ lan });
    const ans = await link.acceptOffer(offerCode);
    link.onOpen = () => this._attach(link);
    this.link = link;
    return ans;
  }
  _attach(link) {
    this.link = link; this.state = 'lobby';
    const G = Game.settings.game, me = NetProfile.get();
    link.send({ t: 'hello', v: NET_VER, name: G.playerName || 'Spieler', team: G.team, number: G.number, code: me.code });
    link.onMsg = (m) => this._onMsg(m);
    link.onBin = (buf) => { if (Game.netView) Game.netView.applySnap(NetCodec.decode(buf)); };
    link.onClose = () => { if (Net.session === this) { Net.session = null; Events.emit('net:closed', this.closedWhy || 'Verbindung zum Host getrennt'); } };
    setInterval(() => { if (this.link && this.link.open) this.link.ping(); }, 2000);
  }
  _onMsg(m) {
    if (m.t === 'welcome') { this.id = m.id; Events.emit('net:joined', m); }
    else if (m.t === 'refused' || m.t === 'closed') { this.closedWhy = m.why; Events.emit('net:closed', m.why); if (Net.session === this) Net.session = null; this.link.close(); }
    else if (m.t === 'lobby') { this.lobby = m; Events.emit('net:lobby', m); }
    else if (m.t === 'start') { this.state = 'race'; Game.netStartClient(this, m); }
    else if (m.t === 'race') { if (Game.netView) Game.netView.applySummary(m); }
    else if (m.t === 'hit') { if (Game.netView) Game.netView.applyHit(m); }
    else if (m.t === 'result') { if (Game.netView) Game.netView.applyResult(m); }
    else if (m.t === 'lobbyAgain') { this.state = 'lobby'; Events.emit('net:lobbyAgain'); }
  }
  get me() { return this.lobby ? this.lobby.players.find(p => p.id === this.id) : null; }
  chat(text) { this.link.send({ t: 'chat', text }); }
  ready(on) { this.link.send({ t: 'ready', on }); }
  setMe(patch) { this.link.send(Object.assign({ t: 'me' }, patch)); }
  sendCar(v, flags) { if (this.link) this.link.sendBin(NetCodec.encode([{ id: this.id, st: v.netState(), flags }])); }
  close() { try { this.link && this.link.send({ t: 'leave' }); } catch (e) { /* egal */ } setTimeout(() => { if (this.link) this.link.close(); if (this.ownPeer && this.peer) try { this.peer.destroy(); } catch (e) { /* egal */ } }, 200); }
}

/**
 * Client-Rennen: ersetzt RaceSession für HUD, Minikarte, Wiedergabe und Grafik. Das eigene Auto wird
 * lokal simuliert; alle anderen sind Netz-Fahrzeuge (Vehicle.netStep). Kollisionen mit ihnen werden
 * lokal aufgelöst (nur das eigene Auto wird dabei verändert, die anderen kommen vom Host).
 */
class NetView {
  constructor(client, start, track, line, vehicle, weather) {
    this.client = client; this.track = track; this.line = line; this.weather = weather;
    this.laps = start.settings.laps; this.state = 'grid'; this.lights = 0; this.flag = 'green'; this.playerFlag = 'green'; this.vscMax = 0;
    this.mandatory = false; this.sc = null; this.time = 0; this.greenAt = null; this.over = false; this.fastest = { time: Infinity, entry: null, lap: 0 };
    this.damage = start.settings.damage || 'reduced';
    const L = track.length;
    this.entries = start.grid.map((g, k) => {
      const mine = g.kind === 'remote' && g.id === client.id;
      const v = mine ? vehicle : new Vehicle(CAR_SPEC, {});
      const slot = gridSlot(track, k);
      v.placeOnTrack(track, slot.s, slot.lat); v.gear = 1;
      if (!mine) { v.netApply(v.netState()); }
      return { idx: k, name: g.name, team: g.team, number: g.number, player: mine, netId: g.id, kind: g.kind, vehicle: v, active: true, retired: false, finished: false, pitting: false, penalty: 0, penaltyServed: 0,
        pitStops: 0, used: new Set([v.compound]), pos: k + 1, distance: slot.s - L, gap: 0, lapsDone: 0, best: Infinity, ghostT: 0, ai: null, pitPlan: null,
        timing: mine ? new LapTiming(track, { mode: 'race' }) : { lap: 1, laps: [], bestLap: Infinity, lastLap: Infinity, lapTime: 0, started: false, progress: 0, valid: true, sector: 0, on() { }, step() { } } };
    });
    this.player = this.entries.find(e => e.player);
    this.player.timing.prevS = vehicle.trackS;
    this.player.timing.on((type, data) => { if (type === 'lap') Events.emit('lap:done', data.time, data.valid); });
    this.order = this.entries.slice();
    this.byIdx = new Map(this.entries.map(e => [e.idx, e]));
    this.contacts = this.entries.map(e => ({ active: true, ghostT: 0, vehicle: e.vehicle, e }));
    vehicle.onImpact = (sp, nx, nz) => { if (this.state === 'race') this._hurt(sp, ...localDir(vehicle, -nx, -nz)); };
  }
  _hurt(sp, lx, lz) {
    const v = this.player.vehicle, r = Damage.apply(v, sp, lx, lz, this.damage);
    if (r && r.amt > 0.08) Events.emit('race:damage', r.parts, Damage.summary(v));
    if (Damage.terminal(v) && !this.player.retired) { this.player.retired = true; this.player.myRetired = true; Events.emit('race:retired', this.player, 'Unfall'); }
  }
  step(h) {
    this.time += h;
    const me = this.player, v = me.vehicle;
    if (this.state !== 'race' && !me.ai) { v.input.clutch = 1; if (this.state === 'grid') v.input.brake = Math.max(v.input.brake, 0.3); }
    if (me.ai) me.ai.control(h, { cars: this.entries, me, state: 'race', time: this.time });
    if (!me.myRetired) v.step(h); else { v.input.throttle = 0; v.input.brake = 1; v.step(h); }
    me.timing.step(h, v);
    for (const e of this.entries) if (!e.player) e.vehicle.netStep(h);
    CarContacts.resolve(this.contacts.filter(c => c.e.active), this.track.length, (a, b, sp, cx, cz) => {
      const mine = a.e.player ? a : b.e.player ? b : null; if (!mine) return;
      const [lx, lz] = localDir(v, cx - v.pos.x, cz - v.pos.z);
      if (this.state === 'race') this._hurt(sp * 0.8, lx, lz);
      if (sp > 3) Events.emit('race:contact', sp);
    });
    me.distance = me.timing.started ? me.timing.laps.length * this.track.length + me.timing.progress : v.trackS - this.track.length;
    this.sendT = (this.sendT || 0) + h;
    if (this.sendT >= 1 / 30) { this.sendT = 0; this.client.sendCar(v, me.myRetired ? 1 : 0); }
  }
  applySnap(list) {
    for (const c of list) {
      if (c.id === 99) continue;    // Safety Car: nur auf dem Host dargestellt
      const e = this.byIdx.get(c.id); if (!e || e.player) continue;
      e.vehicle.netApply(c.st);
      e.pitting = !!(c.flags & 4);
    }
  }
  applySummary(m) {
    const prevState = this.state;
    if (m.lights !== this.lights) { this.lights = m.lights; Events.emit('race:lights', m.lights); }
    this.state = m.state; this.flag = m.flag; this.playerFlag = m.sc ? m.sc : m.flag; this.vscMax = m.vscMax; this.laps = m.laps;
    if (prevState !== 'race' && m.state === 'race') {
      this.greenAt = this.time;
      this.player.timing.startRace(this.player.timing.time, this.player.vehicle.trackS);
      Events.emit('race:start');
    }
    if (this.weather && m.wx) { this.weather.cloud = m.wx[0]; this.weather.rain = m.wx[1]; this.weather.water = m.wx[2]; this.player.vehicle.water = m.wx[2]; for (const e of this.entries) e.vehicle.water = m.wx[2]; }
    this.fastest = m.fastest ? { entry: this.byIdx.get(m.fastest[0]), time: m.fastest[1], lap: m.fastest[2] } : this.fastest;
    const order = [];
    m.order.forEach((o, i) => {
      const e = this.byIdx.get(o[0]); if (!e) return;
      e.pos = i + 1; e.lapsDone = o[1]; e.gap = o[2]; const f = o[3];
      if (!e.player || !e.myRetired) e.retired = !!(f & 1);
      const wasFin = e.finished; e.finished = !!(f & 2); e.pitting = !!(f & 4); e.penalty = o[4]; e.best = o[5] || Infinity;
      if (!e.player && e.retired) e.active = false;
      if (e.player && e.finished && !wasFin) Events.emit('race:finished', e);
      order.push(e);
    });
    this.order = order;
    if (m.over && !this.over) { this.over = true; Events.emit('race:over'); }
  }
  applyHit(m) { if (this.state === 'race') { this._hurt(m.sp, m.lx, m.lz); const v = this.player.vehicle; v.impact = Math.max(v.impact, m.sp); v.impactTime = v.time; } }
  applyResult(m) { this.result = m; if (m.fastest) this.fastest = { entry: this.byIdx.get(m.fastest[0]), time: m.fastest[1], lap: m.fastest[2] }; Events.emit('race:over'); }
  /** Abstand b hinter a: aus den Host-Daten (Abstand zum Führenden) */
  gap(a, b) {
    if (!a || !b) return null;
    if (b.gap < 0 || a.gap < 0) { const la = a.gap < 0 ? -a.gap : 0, lb = b.gap < 0 ? -b.gap : 0; if (lb - la >= 1) return { laps: Math.round(lb - la) }; }
    return { s: Math.max(0, (b.gap > 0 ? b.gap : 0) - (a.gap > 0 ? a.gap : 0)) };
  }
  togglePit() { return 'nicht verfügbar'; }
  classification() {
    const rows = this.result ? this.result.rows : this.order.map((e, i) => ({ idx: e.idx, pos: i + 1, laps: e.lapsDone, best: e.best, total: null, penalty: e.penalty, retired: e.retired, finished: e.finished, gap: i ? this.gap(this.order[0], e) : null }));
    return rows.map(r => { const e = this.byIdx.get(r.idx); return { e, pos: r.pos, name: e.name, team: e.team, number: e.number, laps: r.laps, best: r.best || Infinity, total: r.total, penalty: r.penalty, retired: r.retired, finished: r.finished, gap: r.gap, gapTotal: r.gapTotal }; });
  }
}
