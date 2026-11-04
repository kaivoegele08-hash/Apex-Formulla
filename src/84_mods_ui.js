// ============================================================================
//  MODS – Ordnerauswahl (File System Access API, Chrome/Edge) und Menü „Mods“.
//  Ohne Ordnerauswahl gilt die Liste in mods/mods.js (wird beim Start geladen).
// ============================================================================

const ModFolder = {
  supported: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
  handle: null, status: '',
  _db() { return new Promise((res, rej) => { const r = indexedDB.open('apexformula', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async _put(k, v) { const db = await this._db(); return new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); }); },
  async _get(k) { const db = await this._db(); return new Promise((res) => { const t = db.transaction('kv', 'readonly'), q = t.objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); },
  /** Beim Start: gespeicherten Ordner ohne Nachfrage laden, wenn die Berechtigung noch gilt */
  async autoload() {
    if (!this.supported) return null;
    try {
      const h = await this._get('modsDir'); if (!h) return null;
      this.handle = h;
      if ((await h.queryPermission({ mode: 'read' })) === 'granted') return this.readDir(h);
      this.status = 'reconnect';
    } catch (e) { console.info('[Mods] gespeicherter Ordner nicht verfügbar', e && e.message); }
    return null;
  },
  async pick() {
    const dir = await window.showDirectoryPicker({ id: 'apex-mods', mode: 'read' });
    this.handle = dir; this.status = '';
    try { await this._put('modsDir', dir); } catch (e) { /* Speichern optional */ }
    return this.readDir(dir);
  },
  async reconnect() {
    if (!this.handle) return null;
    if ((await this.handle.requestPermission({ mode: 'read' })) !== 'granted') return null;
    this.status = ''; return this.readDir(this.handle);
  },
  /** Alle .js/.json-Dateien des Ordners (ohne mods.js) ausführen bzw. einlesen */
  async readDir(dir) {
    const files = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file' || !/\.(js|json)$/i.test(name) || name.toLowerCase() === 'mods.js') continue;
      files.push([name, await (await h.getFile()).text()]);
    }
    files.sort((a, b) => a[0].localeCompare(b[0]));
    const known = new Set(window.ApexMods.list.map(m => m.source));
    for (const [name, txt] of files) if (!known.has(name)) this.run(name, txt);
    const rep = applyMods(window.ApexMods.list);
    Events.emit('mods:changed', rep);
    return rep;
  },
  run(name, txt) {
    const A = window.ApexMods; A._src = name;
    try { if (/\.json$/i.test(name)) A.register(JSON.parse(txt)); else new Function('ApexMods', txt)(A); }
    catch (e) { MOD_REPORT.push({ id: name, name, source: name, ok: false, msg: 'Fehler beim Ausführen: ' + (e.message || e), items: [] }); }
    A._src = null;
  },
};

Object.assign(UI, {
  scr_mods() {
    const A = window.ApexMods || { list: [], missing: [] };
    const list = h('div');
    const render = () => {
      list.innerHTML = '';
      const tbl = h('table.res', h('tr', h('th', 'Mod'), h('th', 'Datei'), h('th', 'Inhalt'), h('th', 'Status')));
      for (const r of MOD_REPORT) tbl.append(h('tr', h('td', h('b', r.name), r.author ? h('small', { style: { color: '#7d8898' } }, ' von ' + r.author + (r.version ? ' · ' + r.version : '')) : null), h('td', r.source), h('td', r.items.join(', ') || '–'),
        h('td', { style: { color: r.ok ? '#2fe36b' : '#ff6b5b', fontWeight: 800 } }, r.ok ? 'geladen' : 'Fehler: ' + r.msg)));
      for (const f of A.missing || []) tbl.append(h('tr', h('td', '–'), h('td', f), h('td', '–'), h('td', { style: { color: '#ff6b5b', fontWeight: 800 } }, 'Datei nicht gefunden (in mods.js eingetragen)')));
      list.append(MOD_REPORT.length || (A.missing || []).length ? tbl : h('p', 'Keine Mods geladen.'));
    };
    render();
    const pickBtn = ModFolder.supported ? btn('Mod-Ordner wählen', async () => { try { await ModFolder.pick(); render(); this.toast('Mod-Ordner geladen – neue Strecken/Epochen stehen in den Menüs.'); } catch (e) { if (e && e.name !== 'AbortError') this.toast('Ordner konnte nicht gelesen werden: ' + e.message); } }, 'primary') : null;
    const reBtn = ModFolder.status === 'reconnect' ? btn('Gespeicherten Mod-Ordner erneut verbinden', async () => { await ModFolder.reconnect(); render(); this.show('mods', { noHistory: true }); }) : null;
    return h('section.screen.solid',
      h('header', h('span.crumb', 'Mods'), h('h1', 'Mods'), h('span', { style: { color: '#7d8898' } }, `${MOD_REPORT.filter(r => r.ok).length} geladen · Strecken ${TRACK_ORDER.length} · Epochen ${ERA_ORDER.length} · Teams ${TEAMS.length}`)),
      h('div.row', { style: { alignItems: 'flex-start' } },
        h('div.col', { style: { flex: '1 1 640px' } }, h('div.card', h('h3', 'Geladene Mods'), list)),
        h('div.col', { style: { flex: '0 1 440px' } },
          h('div.card', h('h3', 'So funktioniert es'),
            h('p', 'Im Ordner ', h('b', 'mods'), ' neben der Datei apex-formula.html liegen die Mods (je eine .js-Datei) und die Liste ', h('b', 'mods.js'), '. Neue Mod-Datei hineinlegen und in mods.js eine Zeile ', h('code', "ApexMods.load('datei.js');"), ' ergänzen – beim nächsten Start ist sie da.'),
            h('p', 'Anleitung, alle Formate und fertige KI-Prompts (Strecke, Fahrer, Team, Auto/Epoche, komplette Saison) stehen in ', h('b', 'mods/README.txt'), ' und im Unterordner ', h('b', 'mods/vorlagen'), '.'),
            ModFolder.supported ? h('p', 'In Chrome/Edge kannst du stattdessen den Ordner wählen: dann werden alle .js- und .json-Dateien darin automatisch geladen (ohne mods.js). Der Ordner wird gemerkt.') : h('p', { style: { color: '#ffb02e' } }, 'Ordnerauswahl wird von diesem Browser nicht unterstützt – nutze mods/mods.js.'),
            h('p', { style: { fontSize: '12px', color: '#7d8898' } }, 'Mods sind Programmcode: nur Dateien aus vertrauenswürdigen Quellen verwenden.')),
          h('div.actions', pickBtn, reBtn, btn('Zurück', () => this.back(), 'ghost')),
        ),
      ),
    );
  },
});
