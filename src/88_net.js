// ============================================================================
//  MEHRSPIELER – Peer-to-Peer über WebRTC (kein eigener Server):
//  • Lobby-Code: kostenloser öffentlicher Vermittler (PeerJS) nur für das
//    Kennenlernen; danach direkte Verbindung, der PC des Hosts ist der Server.
//  • LAN/ohne Internet: manueller Verbindungscode (Angebot/Antwort kopieren).
//  Zwei Kanäle je Verbindung: zuverlässig (JSON: Lobby, Ereignisse, Chat) und
//  schnell/unzuverlässig (binär: Fahrzeugzustände 20–30 Hz).
// ============================================================================

const NET_VER = 1;
const NET_MAX_PLAYERS = 8;
const NET_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NET_PREFIX = 'apexformula-v1-';
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const STUN_BASE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
/** ICE-Server: öffentliche STUN-Server, optional ein eigener TURN-Server (Einstellungen → Mehrspieler → Erweitert) */
function iceServers() { const t = typeof Game !== 'undefined' && Game.settings && Game.settings.net && Game.settings.net.turn; return t && t.urls ? STUN_BASE.concat([{ urls: t.urls.split(/[\s,]+/).filter(Boolean), username: t.username || undefined, credential: t.credential || undefined }]) : STUN_BASE; }
function netCode(n = 5) { let s = ''; const a = new Uint32Array(n); crypto.getRandomValues(a); for (const x of a) s += NET_ALPHA[x % NET_ALPHA.length]; return s; }
function normCode(s) { return String(s || '').toUpperCase().replace(/^APEX-?/, '').replace(/[^A-Z0-9]/g, ''); }

// --- Binärformat Fahrzeugzustand (Float32 je Auto) ---------------------------------------------
// [id, x, y, z, qx, qy, qz, qw, vx, vy, vz, steer, rpm, thr, brk, gear, cpd, flap, flags]
const NET_F = 19;
const NetCodec = {
  encode(list) {   // list: [{ id, st, flags }]
    const a = new Float32Array(1 + list.length * NET_F); a[0] = list.length;
    list.forEach((c, i) => { const s = c.st, o = 1 + i * NET_F; a.set([c.id, s.x, s.y, s.z, s.qx, s.qy, s.qz, s.qw, s.vx, s.vy, s.vz, s.steer, s.rpm, s.thr, s.brk, s.gear, s.cpd, s.flap, c.flags || 0], o); });
    return a.buffer;
  },
  decode(buf) {
    const a = new Float32Array(buf), n = a[0] | 0, out = [];
    for (let i = 0; i < n; i++) { const o = 1 + i * NET_F; out.push({ id: a[o] | 0, flags: a[o + 18] | 0, st: { x: a[o + 1], y: a[o + 2], z: a[o + 3], qx: a[o + 4], qy: a[o + 5], qz: a[o + 6], qw: a[o + 7], vx: a[o + 8], vy: a[o + 9], vz: a[o + 10], steer: a[o + 11], rpm: a[o + 12], thr: a[o + 13], brk: a[o + 14], gear: a[o + 15] | 0, cpd: a[o + 16] | 0, flap: a[o + 17] } }); }
    return out;
  },
};

// --- Verbindung (abstrakt) -----------------------------------------------------------------------
class NetLink {
  constructor() { this.onMsg = null; this.onBin = null; this.onClose = null; this.open = false; this.rtt = 0; this.closed = false; }
  _msg(data) {
    if (typeof data === 'string') { let m; try { m = JSON.parse(data); } catch (e) { return; } if (m && m.t === 'ping') { this.send({ t: 'pong', c: m.c }); return; } if (m && m.t === 'pong') { this.rtt = performance.now() - m.c; return; } if (this.onMsg) this.onMsg(m); }
    else if (data instanceof ArrayBuffer) { if (this.onBin) this.onBin(data); }
    else if (data && data.buffer instanceof ArrayBuffer) { if (this.onBin) this.onBin(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)); }
  }
  _closed() { if (this.closed) return; this.closed = true; this.open = false; if (this.onClose) this.onClose(); }
  ping() { this.send({ t: 'ping', c: performance.now() }); }
}

/** Direktes WebRTC mit manuellem Code (LAN ohne Internet oder als Notlösung) */
class RtcLink extends NetLink {
  constructor({ lan = false } = {}) {
    super();
    this.pc = new RTCPeerConnection({ iceServers: lan ? [] : iceServers() });
    this.rel = this.pc.createDataChannel('rel', { negotiated: true, id: 0 });
    this.fast = this.pc.createDataChannel('fast', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    this.rel.binaryType = this.fast.binaryType = 'arraybuffer';
    let n = 0; const up = () => { if (++n === 2) { this.open = true; if (this.onOpen) this.onOpen(); } };
    this.rel.onopen = up; this.fast.onopen = up;
    this.rel.onmessage = (e) => this._msg(e.data); this.fast.onmessage = (e) => this._msg(e.data);
    this.rel.onclose = () => this._closed();
    this.pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(this.pc.connectionState)) setTimeout(() => { if (this.pc.connectionState !== 'connected') this._closed(); }, this.pc.connectionState === 'disconnected' ? 4000 : 0); };
  }
  send(obj) { if (this.rel.readyState === 'open') this.rel.send(JSON.stringify(obj)); }
  sendBin(buf) { if (this.fast.readyState === 'open' && this.fast.bufferedAmount < 64000) this.fast.send(buf); }
  close() { try { this.pc.close(); } catch (e) { /* egal */ } this._closed(); }
  async _gather() {
    if (this.pc.iceGatheringState === 'complete') return;
    await new Promise(res => { const t = setTimeout(res, 3500); this.pc.addEventListener('icegatheringstatechange', () => { if (this.pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
  }
  /** Host: Angebots-Code erzeugen */
  async makeOffer() { await this.pc.setLocalDescription(await this.pc.createOffer()); await this._gather(); return RtcLink.pack('o', this.pc.localDescription.sdp); }
  /** Client: Angebot annehmen → Antwort-Code */
  async acceptOffer(code) { const m = await RtcLink.unpack(code); if (m.t !== 'o') throw new Error('Das ist kein Einladungs-Code'); await this.pc.setRemoteDescription({ type: 'offer', sdp: m.s }); await this.pc.setLocalDescription(await this.pc.createAnswer()); await this._gather(); return RtcLink.pack('a', this.pc.localDescription.sdp); }
  /** Host: Antwort-Code eintragen */
  async acceptAnswer(code) { const m = await RtcLink.unpack(code); if (m.t !== 'a') throw new Error('Das ist kein Antwort-Code'); await this.pc.setRemoteDescription({ type: 'answer', sdp: m.s }); }
  static async pack(t, sdp) {
    const raw = new TextEncoder().encode(JSON.stringify({ t, s: sdp }));
    let bytes = raw;
    if (typeof CompressionStream !== 'undefined') { const cs = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw')); bytes = new Uint8Array(await new Response(cs).arrayBuffer()); }
    let b = ''; for (const x of bytes) b += String.fromCharCode(x);
    return (typeof CompressionStream !== 'undefined' ? 'AF1' : 'AF0') + btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  static async unpack(code) {
    code = String(code || '').trim().replace(/\s+/g, '');
    const kind = code.slice(0, 3); if (kind !== 'AF1' && kind !== 'AF0') throw new Error('Unbekannter Code – bitte vollständig kopieren');
    const b = atob(code.slice(3).replace(/-/g, '+').replace(/_/g, '/')); const bytes = Uint8Array.from(b, ch => ch.charCodeAt(0));
    let txt;
    if (kind === 'AF1') { const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); txt = await new Response(ds).text(); }
    else txt = new TextDecoder().decode(bytes);
    return JSON.parse(txt);
  }
}

/** Verbindung über PeerJS (zwei DataConnections: zuverlässig + schnell) */
class PeerLink extends NetLink {
  constructor(relConn, fastConn) {
    super();
    this.relC = relConn; this.fastC = fastConn;
    const bind = (c) => { c.on('data', (d) => this._msg(d)); c.on('close', () => this._closed()); c.on('error', () => this._closed()); };
    bind(relConn); if (fastConn) bind(fastConn);
    this.open = true;
  }
  send(obj) { if (this.relC.open) this.relC.send(JSON.stringify(obj)); }
  sendBin(buf) { const c = this.fastC && this.fastC.open ? this.fastC : null; if (c) { const dc = c.dataChannel; if (!dc || dc.bufferedAmount < 64000) c.send(buf); } }
  close() { try { this.relC.close(); if (this.fastC) this.fastC.close(); } catch (e) { /* egal */ } this._closed(); }
}

/** PeerJS laden und einen Peer mit fester ID anmelden (Lobby- oder Freundes-ID) */
const NetBroker = {
  loading: null,
  cfg() { const c = (typeof Game !== 'undefined' && Game.settings && Game.settings.net && Game.settings.net.broker) || window.APEX_NET_BROKER; return c ? Object.assign({ debug: 0 }, c) : { debug: 0 }; },
  load() {
    if (window.Peer) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = PEERJS_URL; s.onload = () => res(); s.onerror = () => { this.loading = null; rej(new Error('Vermittlungsdienst nicht erreichbar (keine Internetverbindung?) – nutze den LAN-Code.')); }; document.head.append(s); });
    return this.loading;
  },
  /** Peer mit ID öffnen; Ergebnis: Peer-Objekt (wirft bei belegter ID oder ohne Netz) */
  async open(id) {
    await this.load();
    return new Promise((res, rej) => {
      const p = new window.Peer(id, Object.assign({ config: { iceServers: iceServers() } }, this.cfg()));
      const t = setTimeout(() => { rej(new Error('Vermittlungsdienst antwortet nicht')); try { p.destroy(); } catch (e) { /* egal */ } }, 9000);
      p.on('open', () => { clearTimeout(t); res(p); });
      p.on('error', (e) => { clearTimeout(t); rej(new Error(e && e.type === 'unavailable-id' ? 'Code ist schon vergeben' : e && e.type === 'peer-unavailable' ? 'Lobby nicht gefunden' : 'Vermittlung: ' + ((e && e.type) || e))); });
    });
  },
  /** Ausgehende Verbindung (zwei Kanäle) zu einer ID */
  connect(peer, id, meta = {}) {
    return new Promise((res, rej) => {
      const uid = netCode(8);
      const rel = peer.connect(id, { reliable: true, serialization: 'raw', metadata: Object.assign({ k: 'rel', uid }, meta) });
      const fast = peer.connect(id, { reliable: false, serialization: 'raw', metadata: Object.assign({ k: 'fast', uid }, meta) });
      let n = 0; const t = setTimeout(() => rej(new Error('Keine direkte Verbindung möglich (Router/Firewall blockiert?) – probiere die LAN-Einladung, einen anderen Host oder einen eigenen TURN-Server unter „Erweitert“')), 12000);
      const up = () => { if (++n === 2) { clearTimeout(t); res(new PeerLink(rel, fast)); } };
      rel.on('open', up); fast.on('open', up);
      const fail = (e) => { clearTimeout(t); rej(new Error('Verbindung fehlgeschlagen: ' + ((e && e.type) || e))); };
      rel.on('error', fail);
      peer.on('error', (e) => { if (e && e.type === 'peer-unavailable') fail({ type: 'Lobby/Freund nicht online' }); });
    });
  },
  /** Eingehende Verbindungen paaren (rel + fast mit gleicher uid) → onLink(link, metadata) */
  listen(peer, onLink) {
    const pend = new Map();
    peer.on('connection', (c) => {
      const m = c.metadata || {};
      const go = () => {
        const p = pend.get(m.uid) || {}; p[m.k] = c; pend.set(m.uid, p);
        if (p.rel && (p.fast || m.single)) { pend.delete(m.uid); onLink(new PeerLink(p.rel, p.fast), m); }
      };
      if (c.open) go(); else c.on('open', go);
    });
  },
};

// --- Profil & Freunde ----------------------------------------------------------------------------
const NetProfile = {
  get() {
    let p = Save.get('netProfile', null);
    if (!p || !p.code) { p = { code: netCode(6), friends: [] }; Save.set('netProfile', p); }
    return p;
  },
  save(p) { Save.set('netProfile', p); },
  addFriend(name, code) { const p = this.get(); code = normCode(code); if (!code || code === p.code || p.friends.some(f => f.code === code)) return false; p.friends.push({ name: name || code, code, added: Date.now() }); this.save(p); return true; },
  removeFriend(code) { const p = this.get(); p.friends = p.friends.filter(f => f.code !== code); this.save(p); },
};

/**
 * Anwesenheit: eigener Peer unter der Freundes-ID. Freunde fragen „online?“, schicken Einladungen
 * oder Freundschaftsanfragen; Antworten enthalten den Lobby-Code, falls man gerade hostet.
 */
const NetPresence = {
  peer: null, status: 'aus', online: {}, err: '',
  async start() {
    if (this.peer && !this.peer.destroyed) return;
    const me = NetProfile.get();
    this.status = 'verbinde';
    try {
      this.peer = await NetBroker.open(NET_PREFIX + 'u-' + me.code);
      this.status = 'online'; this.err = '';
      NetBroker.listen(this.peer, (link, meta) => {
        link.onMsg = (m) => {
          if (m.t === 'who') link.send({ t: 'me', name: Game.settings.game.playerName || 'Spieler', lobby: Net.session && Net.session.role === 'host' && Net.session.state === 'lobby' ? Net.session.code : null });
          else if (m.t === 'invite') { Events.emit('net:invite', m); link.send({ t: 'ok' }); }
          else if (m.t === 'friend') { Events.emit('net:friendReq', m); link.send({ t: 'ok' }); }
        };
        meta.single = true;
      });
    } catch (e) { this.status = 'offline'; this.err = e.message; }
  },
  stop() { if (this.peer) { try { this.peer.destroy(); } catch (e) { /* egal */ } } this.peer = null; this.status = 'aus'; },
  /** Kurze Anfrage an einen Freund: Antwort-Nachricht oder null */
  async ask(code, msg) {
    if (!this.peer) await this.start();
    if (!this.peer) return null;
    return new Promise((res) => {
      const c = this.peer.connect(NET_PREFIX + 'u-' + code, { reliable: true, serialization: 'raw', metadata: { k: 'rel', uid: netCode(8), single: true } });
      const t = setTimeout(() => { try { c.close(); } catch (e) { /* egal */ } res(null); }, 6000);
      c.on('open', () => c.send(JSON.stringify(msg)));
      c.on('data', (d) => { clearTimeout(t); let m = null; try { m = JSON.parse(d); } catch (e) { /* egal */ } try { c.close(); } catch (e) { /* egal */ } res(m); });
      c.on('error', () => { clearTimeout(t); res(null); });
    });
  },
  async check(code) { const r = await this.ask(code, { t: 'who' }); this.online[code] = r ? { name: r.name, lobby: r.lobby, t: Date.now() } : null; return this.online[code]; },
};
