// ============================================================================
//  GAME – Ablaufsteuerung: Start, Hauptmenü, Testfahrt-Session, Pause,
//  Verknüpfung von Eingabe → Physik → Grafik/Audio/HUD
// ============================================================================

const DEFAULT_SETTINGS = {
  graphics: { preset: 'hoch', custom: {}, showFps: false, frameGraph: false, autoQuality: true },
  audio: { master: 0.8, engine: 0.85, effects: 0.8, radio: 0.8, ambient: 0.5, engineModel: 'physik', radioMode: 'voice' },
  aids: { tc: 1, abs: false, autoShift: false, autoClutch: true, aeroAuto: true, idealLine: 'full' },
  camera: {
    mode: 'chaseNear', chaseFov: 62, hideWheel: false, hideHands: false,
    cockpit: { fov: 62, x: 0, y: 0, z: 0, pitch: 8, headMove: 1, shake: 1 },
    fovCalc: { diag: 27, aspect: '16:9', dist: 70 },
  },
  input: {
    keys: DEFAULT_KEYS,
    pad: { map: DEFAULT_PAD, deadzone: 0.08, linearity: 1.6, speedSteer: 0.32, triggerGamma: 1.0 },
    kbSteerRate: 2.6, kbSteerReturn: 4.5, kbSpeedSteer: 0.22, rumble: 0.8,
  },
  game: { team: 'aurora', number: 77, compound: 'medium', hud: true, autoPause: true, ghost: true, playerName: 'Du', track: 'ringpark', weather: 'dry', timeOfDay: 'track', era: 'e2026' },
  race: { laps: 5, opponents: 19, strength: 1.0, grid: 'random', playerGrid: 'back', damage: 'full', safetyCar: true, mandatory: 'auto', quali: false, qualiMin: 10, podium: true },
  ffb: { enabled: false, strength: 0.7, invert: false, damper: 0.15, road: 0.5, vibration: 0.6 },
};

const Game = {
  settings: null, state: 'boot', loop: null, garage: null,
  trackModels: {}, track: null, trackVisual: null, builtFor: null,
  vehicle: null, carVis: null, rig: null, minimap: null, session: null,
  mode: 'test', race: null, raceVis: [], ghost: null, raceRec: null, lines: {}, tvSpots: null, raceSectors: [null, null, null],
  perfT: 0, perfLow: 0, camMode: 'chaseNear', overlay: false, hudOn: true,

  async boot() {
    const msg = (t) => { const e = $('bootMsg'); if (e) e.textContent = t; };
    msg('Initialisiere …');
    Save.init();
    const migrated = Save.migrate();
    Save.onFull = () => UI.toast('Speicher des Browsers ist voll – bitte unter Einstellungen → Allgemein eine Sicherung als Datei speichern.', 8000);
    this._firstRun = !Save.get('settings', null);
    this.settings = deepMerge(DEFAULT_SETTINGS, Save.get('settings', {}));
    this.season = Save.get('season', null);
    this.careerSlot = clamp(Save.get('careerSlot', 1) | 0, 1, 3);
    this.career = this.loadCareer(this.careerSlot);
    if (migrated.length) setTimeout(() => UI.toast('Spielstände aktualisiert: ' + migrated.join(', '), 6000), 1500);
    // Mods aus mods/mods.js (vor dem Modul geladen) übernehmen, danach die gewählte Epoche aktivieren
    try { applyMods((window.ApexMods && window.ApexMods.list) || []); } catch (e) { console.warn('[Mods]', e); }
    applyEra(this.settings.game.era || 'e2026');
    ModFolder.autoload().then(rep => { if (rep && rep.length) UI.toast(`Mods aus dem gespeicherten Ordner: ${rep.filter(r => r.ok).length} geladen`); }).catch(() => { });
    Input.init(this.settings.input);
    FFB.init(this.settings.ffb);
    Events.on('ffb:changed', () => this.saveSettings());
    Render.init($('gl'), this.settings.graphics);
    try { const gl = Render.renderer.getContext(); Render.rendererInfo = `${gl.getParameter(gl.RENDERER)} · ${gl.getParameter(gl.VERSION)}`; } catch (e) { Render.rendererInfo = 'WebGL'; }
    AudioSys.vols = this.settings.audio;
    UI.init();
    msg('Baue Garage …');
    await nextFrame();
    this.garage = new GarageScene(Render.renderer);
    this.refreshGarageCar();
    this.loop = new GameLoop(PHYS_DT, 48);
    this.loop.onPre = (dt) => this.pre(dt);
    this.loop.onStep = (h) => this.step(h);
    this.loop.onFrame = (dt, a) => this.frame(dt, a);
    const unlock = () => { AudioSys.unlock(); AudioSys.setVolumes(this.settings.audio); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    window.addEventListener('beforeunload', (e) => { if (this.state === 'driving' || this.state === 'paused') { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'driving' && this.settings.game.autoPause) this.pause('Fenster bzw. Tab wurde verdeckt oder gewechselt (automatische Pause)');
    });
    Radio.init();
    Events.on('lap:done', (t, valid) => {
      if (this.careerPractice && valid && this.career) { const n = Career.practiceLap(this.career); if (n) { this.saveCareer(); Radio.say(n >= 3 ? 'Drei Runden im Kasten. Das Setup passt – im Rennen bist du etwas schneller.' : `Runde ${n} von 3 – gute Daten, weiter so.`, 1); } } UI.hudMsg(`Runde ${fmtTime(t)}${valid ? '' : ' (ungültig)'}`, 2600); AudioSys.radio(); });
    Events.on('lap:best', (t) => UI.hudMsg(`Neue Bestzeit ${fmtTime(t)}`, 3000));
    Events.on('quali:best', (t, pos) => { if (Net.session && Net.session.role === 'client') Net.session.qualiLap(t); UI.hudMsg(`Qualifying: ${fmtTime(t)} – vorläufig P${pos}`, 3200); AudioSys.radio(); });
    Events.on('quali:last', () => { UI.hudMsg('Zeit abgelaufen – laufende Runde zu Ende fahren', 3200); AudioSys.radio(); });
    Events.on('quali:end', () => { UI.hudMsg('Qualifying beendet', 2000); this._qualiDone(); });
    Events.on('lap:limits', (n) => { UI.hudMsg('Track Limits – Runde ungültig', 1800); AudioSys.beep(520, 0.1, 0.2); });
    this._raceEvents();
    if (Input.repairNotes.length) setTimeout(() => UI.toast('Fehlerhafte Knopfbelegung entfernt (Lenk-/Pedalachse als Knopf): ' + Input.repairNotes.join(' · ') + ' – bitte bei Bedarf neu belegen.', 9000), 800);
    this.state = 'menu';
    // Erster Start (oder ?welcome): Willkommens-Assistent; in automatisierten Tests nicht
    const first = !this.settings.game.onboarded && this._firstRun;
    if (/[?&]welcome/.test(location.search) || (first && !navigator.webdriver)) UI.show('welcome'); else UI.show('main');
    $('boot').classList.add('hidden');
    window.__apexReady = true;
    this.loop.start();
    Input.poll(); Input.autoSelectProfile();
    // Bereits freigegebenes Force-Feedback-Lenkrad ohne Klick wieder verbinden
    FFB.reconnect().then(() => { if (FFB.active) UI.toast('Force Feedback: ' + FFB.message, 4000); });
  },

  saveSettings() { Save.set('settings', this.settings); },
  /** Epoche für die nächste Sitzung aktivieren (Fahrzeugdaten, KI-Grenzen, Fahrerfeld, Motorklang) */
  _useEra(id) {
    if (applyEra(id || 'e2026')) for (const k in this.lines) this.lines[k].profiles.clear();
    if (AudioSys.engine && AudioSys.engine.setCylinders) AudioSys.engine.setCylinders(CAR_SPEC.cylinders || 6);
  },
  /** Auswahl im Menü: sofort umschalten, damit Garage und Fahrerliste passen */
  setEra(id) { this.settings.game.era = id; this.saveSettings(); this._useEra(id); this.refreshGarageCar(); },
  // ---------------------------------------------------------------------------
  //  Meisterschaft
  // ---------------------------------------------------------------------------
  newSeason(opts) {
    const G = this.settings.game;
    this.season = Season.create(Object.assign({ team: G.team, playerName: G.playerName || 'Du', number: G.number, strength: this.settings.race.strength, era: G.era || 'e2026' }, opts));
    Save.set('season', this.season);
  },
  endSeason() { this.season = null; this.seasonRound = false; Save.set('season', null); },
  startSeasonRound() { if (!this.season || Season.done(this.season)) return; this.seasonRound = true; this.startEvent(); },
  startQuickRace() { this.seasonRound = false; this.careerRound = false; this.startEvent(); },
  // ---------------------------------------------------------------------------
  //  Karriere
  // ---------------------------------------------------------------------------
  /** Karriere-Speicherplätze 1–3; jede Saisonende-Version wird zusätzlich als .bak gesichert */
  loadCareer(slot) { const c = Save.get('career.' + slot, null); return c && c.v === CAREER_V ? c : null; },
  careerInfo(slot) { const c = Save.get('career.' + slot, null); if (!c || c.v !== CAREER_V) return null; return { name: c.me.name, team: Career.teamName(c.team), season: c.seasonNo, year: c.year, era: eraOf(c.era).title, round: c.season ? c.season.round : 0, rounds: c.season ? c.season.tracks.length : 0, titles: c.stats.titles, hasBak: !!Save.get('career.' + slot + '.bak', null) }; },
  useCareerSlot(slot) { this.careerSlot = slot; Save.set('careerSlot', slot); this.career = this.loadCareer(slot); this.careerRound = false; },
  saveCareer() {
    if (!this.career) return;
    Save.set('career.' + this.careerSlot, this.career);
    if (this.career.phase === 'offseason' && this._bakFor !== this.career.history.length) { this._bakFor = this.career.history.length; Save.set('career.' + this.careerSlot + '.bak', this.career); }
  },
  restoreCareerBackup(slot) { const b = Save.get('career.' + slot + '.bak', null); if (!b) return false; Save.set('career.' + slot, b); if (slot === this.careerSlot) this.career = b; return true; },
  newCareer(opts) { this.career = Career.create(opts); this.saveCareer(); },
  endCareer(slot = this.careerSlot) { if (slot === this.careerSlot) { this.career = null; this.careerRound = false; } Save.remove('career.' + slot); Save.remove('career.' + slot + '.bak'); },
  closeCareer() { this.career = null; this.careerRound = false; },
  startCareerRound() {
    const c = this.career; if (!c || c.phase !== 'season') return;
    this.seasonRound = false; this.careerRound = true; this.careerLog = { contacts: [], passes: [], pole: false };
    this.startEvent();
  },
  /** Ergebnis in die Karriere übernehmen (einmal je Rennen) → Rückgabe: Zusammenfassung für die Anzeige */
  finishCareerRace() {
    const race = this.race, c = this.career;
    if (!race || !c || !this.careerRound || race.careerScored) return null;
    race.careerScored = true;
    const log = this.careerLog || { contacts: [], passes: [] };
    const sum = Career.afterRace(c, race.classification(), race.fastest, log, race.track.name);
    this.saveCareer(); this.pendingGrid = null; this.careerRound = false;
    return sum;
  },
  /** Rennergebnis in die Saisonwertung übernehmen (einmal je Rennen) */
  scoreSeasonRace() {
    const race = this.race, S = this.season;
    if (!race || !S || !this.seasonRound || race.seasonScored) return null;
    race.seasonScored = true;
    const order = Season.award(S, race.track.id, race.classification(), race.fastest);
    Save.set('season', S);
    this.pendingGrid = null;
    return order;
  },
  getTrackModel(id) { if (!this.trackModels[id]) this.trackModels[id] = new TrackModel(TRACKS[id]); return this.trackModels[id]; },
  get team() { return TEAMS.find(t => t.id === this.settings.game.team) || TEAMS[0]; },
  refreshGarageCar() { if (this.garage) this.garage.setCar(this.team, this.settings.game.number); },
  toggleFullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => { }); return; }
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().then(() => {
      // Tastenkürzel (z. B. Strg+W) im Vollbild abfangen – nur Chromium
      if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().catch(() => { });
      if (UI.current === 'main') UI.show('main', { noHistory: true });
    }).catch(() => UI.toast('Vollbild wurde vom Browser abgelehnt.'));
  },

  // ---------------------------------------------------------------------------
  //  Sitzung
  // ---------------------------------------------------------------------------
  get trackId() { const t = this.settings.game.track; return TRACKS[t] ? t : 'ringpark'; },
  /** Startreifen: bei nasser Strecke automatisch Intermediate/Regenreifen */
  _startCompound(want) {
    const best = this.weather && Weather.bestFor(this.weather.water);
    if (best && want !== 'inter' && want !== 'wet') { setTimeout(() => UI.hudMsg(`Nasse Strecke – ${COMPOUNDS[best].name}-Reifen aufgezogen`, 3000), 2800); return best; }
    return want;
  },
  getLine(id) { if (!this.lines[id]) this.lines[id] = new RacingLine(this.getTrackModel(id)); return this.lines[id]; },
  // Setup je Strecke und Epoche (Standardauto: wie bisher nur Strecke); Grundwerte kann ein Mod-Auto mitbringen (spec.setup)
  setupFor(id) { return Object.assign({}, DEFAULT_SETUP, CAR_SPEC.setup || {}, Save.get('setups', {})[trackKey(id)] || {}); },
  saveSetup(id, setup) { const all = Save.get('setups', {}); all[trackKey(id)] = Object.assign({}, setup); Save.set('setups', all); },
  /** Setup sofort übernehmen (Testfahrt): Parameter neu berechnen und Auto an die Strecke setzen */
  applySetupLive(setup) {
    const v = this.vehicle; if (!v) return;
    v.setup = Object.assign({}, DEFAULT_SETUP, setup); v.applySetup(v.setup);
    this.resetCar();
  },
  get raceMode() { return this.mode === 'race' || this.mode === 'netclient'; },
  get recorder() { return this.raceMode ? this.raceRec : (this.session && this.session.rec); },

  /** Ladebildschirm zeigen, laufende Sitzung abbauen */
  async _begin(text) {
    AudioSys.unlock();
    this._teardown();
    this.state = 'loading'; this.loop.paused = false;
    UI.hideScreens();
    const boot = $('boot'); boot.classList.remove('hidden'); $('bootMsg').textContent = text;
    await nextFrame(); await nextFrame();
  },
  /** Strecke (Welt, Grafik, Minikarte) nur bei Bedarf neu aufbauen */
  async _prepareTrack(id) {
    const track = this.track = this.getTrackModel(id);
    const todSet = this._todOverride || this.settings.game.timeOfDay;
    const tod = todSet && todSet !== 'track' ? todSet : track.def.timeOfDay;
    const key = track.id + '|' + Render.quality.trees + '|' + tod;
    if (this.builtFor !== key) {
      if (Render.scene) Render.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      Render.createWorld(tod);
      this.trackVisual = new TrackVisual(track, Render.quality);
      Render.scene.add(this.trackVisual.group);
      this.minimap = new Minimap(track, 220);
      this.builtFor = key;
    }
    this.tvSpots = buildTvSpots(track, (this.trackVisual && this.trackVisual.blocked) || []);
    this.idealLine = new IdealLineVisual(track, this.getLine(track.id));
    Render.scene.add(this.idealLine.mesh);
    this.skids = new SkidMarks(); this.skids.ground = (x, z, hint) => track.heightAt(x, z, hint); Render.scene.add(this.skids.mesh);
    CarDebris.clear(); CarDebris.ground = (x, z) => track.heightAt(x, z);
    return track;
  },
  _playerVisual() {
    this.carVis = new CarVisual(this.team, this.settings.game.number, { detail: 'high', physical: Render.quality.physicalPaint });
    this.carVis.setShadows(Render.quality.shadows > 0);
    Render.scene.add(this.carVis.root);
  },
  /** Alles entfernen, was zu einer Sitzung gehört */
  _teardown() {
    CarDebris.clear(); VisorRain.hide(); Radio.reset(); TeamOrders.reset(); if (this.school) { this.school.dispose(); this.school = null; }
    const sc = Render.scene;
    if (sc) {
      if (this.carVis) sc.remove(this.carVis.root);
      for (const r of this.raceVis) sc.remove(r.vis.root);
      if (this.ghost) sc.remove(this.ghost.root);
      if (this.idealLine) { sc.remove(this.idealLine.mesh); this.idealLine.mesh.geometry.dispose(); }
      if (this.skids) { sc.remove(this.skids.mesh); this.skids.geo.dispose(); this.skids = null; }
      if (this.scVis) sc.remove(this.scVis.root);
    }
    this.scVis = null;
    if (this.podium) { this.podium.dispose(); this.podium = null; }
    this.idealLine = null;
    this.vehicle = null; this.carVis = null; this.session = null; this.race = null; this.raceVis = []; this.ghost = null; this.raceRec = null;
    this.resultsShown = false; this.playerDoneT = null; this.replay = null; this.rp = null; UI.showReplay && UI.showReplay(false);
    if (AudioSys.opp) AudioSys.updateOpponents([]);
    UI.setRaceHud(false);
  },
  /** Gemeinsamer Abschluss beim Start: Kamera, Shader vorkompilieren, HUD an */
  _go(msg) {
    this.rig = new CameraRig(Render.camera);
    this.setCamera(this.settings.camera.mode === 'tv' ? 'chaseNear' : this.settings.camera.mode);
    Render.clearParticles();
    Render.applyQuality(this.settings.graphics);
    this._updateVisuals(0, 1);
    Render.renderer.compile(Render.scene, Render.camera);
    $('boot').classList.add('hidden');
    $('hudMode').textContent = this.mode === 'netclient' || (this.mode === 'race' && this.netHost) ? 'Mehrspieler' : this.mode === 'race' ? 'Rennen' : this.mode === 'quali' ? 'Qualifying' : 'Testfahrt';
    UI.setHudVisible(this.hudOn);
    Input.gameActive = true; Input.flush();
    AudioSys.setActive(true);
    this.state = 'driving';
    this.loop.paused = false; this.loop.acc = 0;
    UI.hudMsg(msg, 2500);
  },
  _fail(err) {
    console.error(err);
    $('boot').classList.remove('hidden');
    window.__apexShowError && window.__apexShowError('Fehler beim Aufbau der Sitzung: ' + err.message);
    this.state = 'menu';
  },

  /** Fahrschule: Testfahrt auf dem Ringpark (heute, trocken) mit geführten Funk-Hinweisen */
  async startDrivingSchool() {
    this.settings.game.track = 'ringpark'; this.settings.game.weather = 'dry';
    await this.startTestDrive();
    if (this.mode === 'test') this.school = new DrivingSchool();
  },
  async startTestDrive(o = {}) {
    this.netHost = null;
    await this._begin('Strecke wird aufgebaut …');
    try {
      this._useEra(o.era || this.settings.game.era);
      const track = await this._prepareTrack(this.trackId);
      $('bootMsg').textContent = 'Fahrzeug wird vorbereitet …';
      await nextFrame();
      this.mode = 'test';
      const v = this.vehicle = new Vehicle(CAR_SPEC, this.setupFor(track.id));
      this.weather = new Weather(this.settings.game.weather || 'dry', { duration: 1500 });
      v.water = this.weather.water;
      v.setCompound(this._startCompound(this.settings.game.compound), 70);
      v.placeOnTrack(track, track.length - 30, -track.HW[track.N - 15] * 0.42);
      v.gear = 1;
      this.applyAids();
      this._playerVisual();
      this.session = new PracticeSession(track);
      this._wxState = null;
      if (this.settings.game.ghost !== false) { this.ghost = new GhostCar(this.team, this.settings.game.number); Render.scene.add(this.ghost.root); }
      this._startRecording();
      this._go('Testfahrt – ' + track.name);
    } catch (err) { this._fail(err); }
  },

  /** Rennen-Parameter: Schnelles Rennen aus den Einstellungen, in der Meisterschaft aus der Saison */
  raceParams() {
    const R = this.settings.race, G = this.settings.game, C = this.careerRound && this.career ? this.career : null;
    const NH = this.netHost;
    if (NH) { const s = NH.settings; return { era: s.era, trackId: TRACKS[s.track] ? s.track : 'ringpark', laps: s.laps, opponents: NH.grid.length - 1, strength: 1, weather: s.weatherType || 'dry', quali: s.quali > 0, qualiMin: s.quali || 0, team: NH.me.team, name: NH.me.name, number: NH.me.number, net: true, tod: s.tod, raceOverride: { damage: s.damage, safetyCar: s.safetyCar, mandatory: 'off' } }; }
    const S = C ? C.season : this.season && this.seasonRound ? this.season : null;
    if (!S) return { era: G.era || 'e2026', trackId: this.trackId, laps: R.laps, opponents: R.opponents, strength: R.strength, weather: G.weather || 'dry', quali: !!R.quali, qualiMin: R.qualiMin || 10, team: G.team, name: G.playerName || 'Du', number: G.number };
    const trackId = TRACKS[S.tracks[S.round]] ? S.tracks[S.round] : 'ringpark';
    if (C) return { era: C.era, trackId, laps: Season.lapsFor(S, this.getTrackModel(trackId)), opponents: 19, strength: C.settings.strength, weather: C.settings.weather, quali: C.settings.quali, qualiMin: C.settings.qualiMin, team: C.team, name: C.me.name, number: C.me.number, season: true, career: true };
    return { era: S.era || 'e2026', trackId, laps: Season.lapsFor(S, this.getTrackModel(trackId)), opponents: 19, strength: S.strength, weather: S.weather, quali: S.quali, qualiMin: S.qualiMin, team: S.team, name: S.playerName || 'Du', number: S.number, season: true };
  },
  _field(P) {
    const R = this.settings.race;
    if (P.net) return this.netHost.grid.map(g => g.kind === 'host' ? { driver: { name: g.name, nat: '', num: g.number, team: g.team, rating: 1 }, team: g.team, number: g.number, player: true } : g.kind === 'remote' ? { driver: { name: g.name, nat: '', num: g.number, team: g.team, rating: 1 }, team: g.team, number: g.number, remote: true, netId: g.id } : { driver: g.driver, team: g.team, number: g.number });
    if (P.career) { const c = this.career, f = buildField({ playerTeam: c.team, playerName: c.me.name, playerNumber: c.me.number, drivers: Career.raceDrivers(c) }); f.find(e => e.player).trackGrip = Career.grip(c, c.team); return f; }
    return buildField({ playerTeam: P.team, playerName: P.name, playerNumber: P.number, size: P.opponents + 1, gridMode: P.season ? 'rating' : R.grid, playerGrid: P.season ? 'middle' : R.playerGrid }); },
  /** Nächster Schritt: mit Qualifying zuerst die Qualifikation, sonst direkt das Rennen */
  startEvent() { this.netHost = null; const P = this.raceParams(); this.pendingGrid = null; if (P.quali) this.startQualifying(); else this.startRace(); },

  /** Qualifying: freie Fahrt gegen die Uhr, KI-Zeiten werden geschätzt (QualiSession) */
  /** o (Mehrspieler-Gast): { P, field, qopts } statt Einstellungen/Feld/Sitzungsoptionen aus der Spielerwahl */
  async startQualifying(o = {}) {
    await this._begin('Qualifying wird vorbereitet …');
    try {
      const P = o.P || this.raceParams();
      this._useEra(P.era);
      this.settings.game.track = P.trackId;
      this._todOverride = P.tod || null;
      const track = await this._prepareTrack(P.trackId);
      this._todOverride = null;
      $('bootMsg').textContent = 'Fahrzeug wird vorbereitet …';
      await nextFrame();
      this.mode = 'quali';
      const wx = this.weather = new Weather(P.weather, { duration: P.qualiMin * 60 + 600 });
      this.eventWeather = wx.type;
      const field = o.field || this._field(P);
      const v = this.vehicle = new Vehicle(CAR_SPEC, this.setupFor(track.id));
      v.water = wx.water;
      v.setCompound(this._startCompound(qualiCompound(0)), 70);
      if (P.career) v.trackGrip = Career.grip(this.career, this.career.team);
      v.placeOnTrack(track, track.length - 30, -track.HW[track.N - 15] * 0.42);
      v.gear = 1;
      this.applyAids();
      this._playerVisual();
      this.session = new QualiSession(track, field, Object.assign({ line: this.getLine(track.id), minutes: P.qualiMin, strength: P.strength, water: wx.water }, this.netHost ? { remoteTime: (id) => this.netHost.qTimes.get(id) ?? Infinity } : {}, o.qopts || {}));
      this._wxState = null;
      if (this.settings.game.ghost !== false) { this.ghost = new GhostCar(this.team, this.settings.game.number); Render.scene.add(this.ghost.root); }
      UI.setRaceHud(true, field.length, 'quali');
      this._go(`Qualifying – ${track.name} · ${P.qualiMin} min`);
    } catch (err) { this._fail(err); }
  },
  /** Qualifying vorbei → Ergebnis, danach Rennen mit dieser Startaufstellung */
  _qualiDone() {
    if (this.mode !== 'quali' || this.state === 'finished') return;
    const q = this.session;
    this.pendingGrid = q.grid();
    if (this.careerLog) this.careerLog.pole = !!(this.pendingGrid[0] && this.pendingGrid[0].player);
    setTimeout(() => {
      if (this.session !== q) return;
      if (this.state === 'paused') UI.hideScreens();
      this.state = 'finished'; Input.gameActive = false; this.loop.paused = !Net.active;
      if (Net.session && Net.session.role === 'client') Net.session.qualiDone();
      AudioSys.setActive(false);
      UI.setHudVisible(false); UI.toggleMfd(false);
      UI.show('qualiResults', { noHistory: true });
    }, this.state === 'paused' ? 0 : 1800);
  },

  async startRace() {
    await this._begin('Startaufstellung wird vorbereitet …');
    try {
      const P = this.raceParams();
      this._useEra(P.era);
      this.settings.game.track = P.trackId;
      this._todOverride = P.tod || null;
      const track = await this._prepareTrack(P.trackId);
      this._todOverride = null;
      $('bootMsg').textContent = 'Ideallinie und Gegner werden berechnet …';
      await nextFrame();
      const line = this.getLine(track.id), R = Object.assign({}, this.settings.race, { laps: P.laps, strength: P.strength }, P.raceOverride || {}), G = this.settings.game;
      const lapT = refLapTime(track, line);
      const wx = this.weather = new Weather(this.pendingGrid && this.eventWeather ? this.eventWeather : P.weather, { duration: R.laps * lapT });
      let field;
      if (this.pendingGrid) field = this.pendingGrid;
      else if (P.season) field = simulatedGrid(track, line, this._field(P), { strength: P.strength, water: wx.water, playerGrid: 'middle' });
      else field = this._field(P);
      const wetStart = Weather.bestFor(wx.water);
      field = field.map(e => Object.assign({}, e));
      const mix = ['medium', 'medium', 'soft', 'hard'];
      for (const e of field) { e.compound = e.player ? this._startCompound(G.compound) : (wetStart || (R.laps < 10 ? 'soft' : mix[Math.floor(Math.random() * mix.length)])); if (e.player) e.setup = this.setupFor(track.id); }
      const mandatory = R.mandatory === 'auto' ? R.laps >= 10 : R.mandatory === 'on';
      this.mode = 'race';
      const race = this.race = new RaceSession({ track, line, laps: R.laps, entries: field, damage: R.damage, aiStrength: R.strength, mandatory, safetyCar: R.safetyCar !== false, weather: wx });
      this.pitPlan = { compound: G.compound === 'medium' ? 'hard' : 'medium', repair: true };
      const me = race.player;
      this.vehicle = me.vehicle;
      this.applyAids();
      this._playerVisual();
      $('bootMsg').textContent = 'Fahrzeuge werden lackiert …';
      await nextFrame();
      for (const e of race.entries) {
        if (e.player) continue;
        const team = TEAMS.find(t => t.id === e.team);
        const vis = new CarVisual(team, e.number, { detail: 'low', physical: false });
        Render.scene.add(vis.root);
        this.raceVis.push({ e, vis });
      }
      if (this.netHost) this.netHost.attachRace(race);
      this.session = {
        kind: 'race', delta: null, invalidate() { },
        get lap() { return Math.max(1, me.timing.lap); }, get lapTime() { return me.timing.lapTime; },
        get lastLap() { return me.timing.lastLap; }, get bestLap() { return me.timing.bestLap; }, get lapValid() { return me.timing.valid; },
      };
      this.raceRec = new LapRecorder(track, { ghost: false });
      this.raceSectors = [null, null, null];
      me.timing.on((type, data) => {
        if (type === 'lap') { this.raceRec.end(data); this.raceSectors = [null, null, null]; if (!me.finished) this.raceRec.begin(data.lap + 1); }
        else if (type === 'invalid') this.raceSectors = this.raceSectors.map(x => x && 'invalid');
      });
      UI.setRaceHud(true, race.entries.length);
      this._startRecording();
      if (P.career) {
        // Karriere: Kontakte mit dem Spieler protokollieren – Schuld hat, wer von hinten kommt
        this.careerLog = this.careerLog || { contacts: [], passes: [], pole: false };
        this.careerLog.contacts = []; this.careerLog.passes = [];
        const lastHit = new Map();
        race.onContact = (a, b, sp) => {
          if (!(a.player || b.player) || race.state !== 'race') return;
          const me = a.player ? a : b, o = a.player ? b : a, t = race.time;
          if (t - (lastHit.get(o) || -9) < 1.5) return; lastHit.set(o, t);
          const d = me.distance - o.distance, fault = d < -1.0 ? 'player' : d > 1.0 ? 'other' : 'none';
          this.careerLog.contacts.push({ name: o.name, sp, fault });
        };
      }
      this._go(`${track.name} · ${R.laps} ${R.laps === 1 ? 'Runde' : 'Runden'}`);
      setTimeout(() => { if (this.race === race && race.state !== 'race') UI.hudMsg('Startaufstellung – Gas zum Vorbereiten, das Auto wird gehalten, bis die Ampel erlischt', 3600); }, 1200);
    } catch (err) { this._fail(err); }
  },

  /** Ereignisse des Rennens → HUD, Funk, Ergebnis */
  _raceEvents() {
    Events.on('race:lights', (n) => { UI.setLights(n); if (n > 0) AudioSys.beep(n === 5 ? 880 : 660, 0.12, 0.2, 'effects'); });
    Events.on('race:start', () => { UI.hudMsg('Los!', 1400); AudioSys.beep(1320, 0.25, 0.25, 'effects'); if (this.raceRec) this.raceRec.begin(1); });
    Events.on('race:msg', (text, entry, kind) => { if (kind === 'win' || kind === 'out' || kind === 'fastest' || kind === 'sc' || kind === 'green' || (entry && entry.player && kind !== 'pit')) UI.hudMsg(text, 3200); });
    Events.on('race:limits', (n, text) => { UI.hudMsg(n ? `Track Limits – ${text}` : text, 2600); AudioSys.radio(); });
    Events.on('race:damage', (parts) => UI.hudMsg('Schaden: ' + parts.join(', '), 2600));
    Events.on('race:sector', (d) => { this.raceSectors[d.k] = !this.race.player.timing.valid ? 'invalid' : d.overall ? 'purple' : d.pb ? 'green' : 'yellow'; });
    Events.on('race:contact', (sp) => { if (sp > 6) UI.hudMsg('Kontakt!', 900); });
    Events.on('race:flag', (f) => { UI.setFlag(f); if (f !== 'green' && f !== 'chequered') AudioSys.radio(); });
    Events.on('race:sc', (kind, phase) => { if (phase === 'deploy') AudioSys.beep(700, 0.3, 0.25, 'effects'); });
    Events.on('race:pitentry', () => UI.hudMsg('Boxengasse – Autopilot übernimmt', 2200));
    Events.on('race:pitmissed', () => UI.hudMsg('Boxeneinfahrt verpasst – nächste Runde', 2400));
    Events.on('race:service', (e, t, info) => { if (e.player) UI.hudMsg(`Boxenstopp ${t.toFixed(1).replace('.', ',')} s · ${COMPOUNDS[info.plan.compound].name}${info.repair ? ' · repariert' : ''}`, 3000); });
    Events.on('race:pitdone', (e) => { if (e.player) UI.hudMsg('Zurück auf der Strecke – du fährst', 2200); });
    Events.on('race:finished', (e) => { if (e.player) this._playerDone(`Zielflagge – Platz ${e.pos}`); });
    Events.on('race:retired', (e) => { if (e.player) this._playerDone('Ausgeschieden'); });
    Events.on('race:over', () => { if (this.netHost && Net.session === this.netHost) this.netHost.sendResult(); });
    Events.on('net:closed', (why) => { this.netHost = null; if (this.mode === 'netclient' || (this.state !== 'menu' && this.raceMode && Net.active === false && this.netView)) { this.toMenu(); } UI.toast('Mehrspieler: ' + (why || 'Verbindung beendet'), 5000); if (UI.current === 'lobby') UI.show('multi', { noHistory: true }); });
    Events.on('net:lobbyAgain', () => { if (this.mode === 'netclient') { this.toMenu(); UI.show('lobby', { noHistory: true }); } });
    Events.on('race:over', () => { if (this.state === 'finished' && UI.current === 'results') UI.show('results', { noHistory: true }); });
  },
  /** Spieler im Ziel oder ausgeschieden: Auslaufrunde übernimmt die KI, TV-Kamera, Ergebnis nach kurzer Pause */
  _playerDone(msg) {
    const race = this.race, me = race && race.player; if (!me || this.playerDoneT) return;
    this.playerDoneT = performance.now();
    UI.hudMsg(msg, 4000);
    AudioSys.radio();
    if (!me.retired) { me.ai = new AIDriver(me.vehicle, race.line, { skill: 0.9, aggression: 0, consistency: 1, reaction: 0 }, 99); }
    else { me.active = false; }
    setTimeout(() => {
      if (!this.race || this.race !== race) return;
      if (this.state === 'driving') { this.state = 'finished'; Input.gameActive = false; }
      this.setCamera('tv');
      UI.setHudVisible(false); UI.toggleMfd(false);
      if (this.settings.race.podium !== false && this.openPodium()) return;
      UI.show('results', { noHistory: true });
    }, 5000);
  },
  applyAids() {
    const v = this.vehicle; if (!v) return;
    const A = this.settings.aids;
    v.aids.tc = A.tc; v.aids.abs = A.abs; v.aids.autoShift = A.autoShift;
    v.aids.autoClutch = A.autoClutch; v.aids.manualClutch = !A.autoClutch;
    v.aeroAuto = A.aeroAuto;
  },
  applyCameraOptions() { if (this.carVis) this.carVis.setCockpitView(this.camMode === 'cockpit', { hideWheel: this.settings.camera.hideWheel, hideHands: this.settings.camera.hideHands }); },
  setCamera(mode) {
    this.camMode = mode;
    if (this.rig) this.rig.setMode(mode);
    this.applyCameraOptions();
  },
  resetCar() {
    const v = this.vehicle, T = this.track; if (!v || !T) return;
    const s = v.trackS;
    const comp = v.compound, tyres = v.wheels.map(w => w.tyre), soc = v.soc, ers = v.ersMode, bb = v.brakeBias;
    v.placeOnTrack(T, s, 0);
    v.wheels.forEach((w, i) => { w.tyre = tyres[i]; });
    v.soc = soc; v.ersMode = ers; v.brakeBias = bb;
    v.gear = 1;
    this.applyAids();
    if (this.raceMode) { const me = this.race.player; me.ghostT = 3; me.timing.prevS = v.trackS; }
    else { this.session.invalidate(); this.session.timing.prevS = v.trackS; }
    if (this.rig) this.rig.init = false;
    Render.clearParticles();
    UI.hudMsg('Fahrzeug zurückgesetzt', 1500);
  },
  fitTyres(id) { if (this.vehicle) { this.vehicle.setCompound(id, 70); this.session && this.session.invalidate(); } },
  /** Pausieren; reason = Auslöser (wird im Pausemenü angezeigt, hilft bei ungewollten Pausen) */
  pause(reason = '') {
    if (this.state !== 'driving') return;
    this.pauseReason = reason;
    this.pauseWhileWheel = Input.state.steerSource === 'wheel';
    this.netPaused = Net.active && this.raceMode;
    this.state = 'paused'; this.loop.paused = !this.netPaused;
    AudioSys.setActive(false);
    Input.gameActive = false;
    UI.show('pause');
  },
  resume() {
    if (this.state !== 'paused') return;
    UI.hideScreens();
    this.state = 'driving'; this.loop.paused = false; this.loop.acc = 0;
    Input.gameActive = true; Input.flush();
    this.resumeT = performance.now();
    AudioSys.setActive(true);
  },
  toMenu() {
    this.state = 'menu'; this.loop.paused = false; this.netPaused = false;
    this.netView = null;
    Input.gameActive = false;
    AudioSys.setActive(false);
    UI.setHudVisible(false); UI.toggleMfd(false);
    this._teardown();
    UI.prev = [];
    if (this.careerPractice) { this.careerPractice = false; this.saveCareer(); UI.show('career', { noHistory: true }); return; }
    UI.show('main', { noHistory: true });
  },
  /** Karriere: Freies Training auf der Strecke des nächsten Rennens (3 Runden → Entwicklungspunkte, Setup-Bonus) */
  async startCareerPractice() {
    const c = this.career; if (!c || !c.season) return;
    this.settings.game.track = c.season.tracks[c.season.round];
    this.careerRound = false;
    await this.startTestDrive({ era: c.era });
    if (this.mode !== 'test') return;
    this.careerPractice = true;
    Radio.say(`Freies Training. Fahr bis zu drei saubere Runden – jede bringt uns Daten für das Setup.`, 2);
  },

  // ---------------------------------------------------------------------------
  //  Mehrspieler
  // ---------------------------------------------------------------------------
  /** Host: Rennen aus der Lobby starten (Feld = Lobby-Spieler + KI) */
  netStartHost(host) { this.netHost = host; this.seasonRound = false; this.careerRound = false; this.pendingGrid = null; this.startRace(); },
  /** Client: Rennen nach der Startnachricht des Hosts aufbauen */
  async netStartClient(cl, m) {
    await this._begin('Mehrspieler-Rennen wird geladen …');
    try {
      const S = m.settings;
      this.netHost = null; this.seasonRound = false; this.careerRound = false;
      this._useEra(S.era);
      this._todOverride = S.tod || null;
      const track = await this._prepareTrack(TRACKS[S.track] ? S.track : 'ringpark');
      this._todOverride = null;
      const line = this.getLine(track.id);
      const wx = this.weather = new Weather(S.weatherType || 'dry');
      const v = this.vehicle = new Vehicle(CAR_SPEC, this.setupFor(track.id));
      v.setCompound(this._startCompound(this.settings.game.compound || 'medium'), 75);
      this.mode = 'netclient';
      const view = this.netView = this.race = new NetView(cl, m, track, line, v, wx);
      this.pitPlan = { compound: v.compound === 'medium' ? 'hard' : 'medium', repair: true };
      if (m.rejoin) {
        // Wiederverbunden: Auto dort weiterfahren lassen, wo es der Host zuletzt hatte
        const r = m.rejoin, me = view.player, st = r.st;
        v.placeAt(st.x, st.y + 0.05, st.z, 0); v.q.set(st.qx, st.qy, st.qz, st.qw); v.vel.set(st.vx, st.vy, st.vz); v.gear = Math.max(1, st.gear);
        if (COMPOUND_ORDER[r.cpd]) v.setCompound(COMPOUND_ORDER[r.cpd], 85);
        me.timing.startRace(0, v.trackS); me.timing.laps = Array.from({ length: r.laps }, () => ({ time: 0, valid: true })); me.timing.lap = r.laps + 1; me.timing.progress = r.progress; me.timing.prevS = null;
        view.state = 'race'; view.greenAt = 0;
      }
      this.applyAids();
      this._playerVisual();
      for (const e of view.entries) {
        if (e.player) continue;
        const team = TEAMS.find(t => t.id === e.team) || TEAMS[0];
        const vis = new CarVisual(team, e.number, { detail: 'low', physical: false });
        Render.scene.add(vis.root); this.raceVis.push({ e, vis });
      }
      const me = view.player;
      this.session = { kind: 'race', delta: null, invalidate() { }, get lap() { return Math.max(1, me.timing.lap); }, get lapTime() { return me.timing.lapTime; }, get lastLap() { return me.timing.lastLap; }, get bestLap() { return me.timing.bestLap; }, get lapValid() { return me.timing.valid; } };
      this.raceRec = new LapRecorder(track, { ghost: false });
      this.raceSectors = [null, null, null];
      me.timing.on((type, data) => {
        if (type === 'lap') { this.raceRec.end(data); this.raceSectors = [null, null, null]; if (!me.finished) this.raceRec.begin(data.lap + 1); }
        else if (type === 'sector') { this.raceSectors[data.k] = !me.timing.valid ? 'invalid' : data.pb ? 'green' : 'yellow'; }
        else if (type === 'invalid') this.raceSectors = this.raceSectors.map(x => x && 'invalid');
      });
      UI.setRaceHud(true, view.entries.length);
      this._startRecording();
      this._go(`Mehrspieler · ${track.name} · ${S.laps} ${S.laps === 1 ? 'Runde' : 'Runden'}`);
      setTimeout(() => { if (this.race === view && view.state !== 'race') UI.hudMsg('Startaufstellung – warte auf die Ampel', 3000); }, 1200);
    } catch (err) { this._fail(err); }
  },
  /** Gast: Qualifying (allein auf der Strecke, Rangliste kommt vom Host) */
  netStartClientQuali(cl, m) {
    const S = m.settings, me = m.grid.find(g => g.kind === 'remote' && g.id === cl.id) || { name: this.settings.game.playerName, team: this.settings.game.team, number: this.settings.game.number };
    this.netHost = null; this.seasonRound = false; this.careerRound = false; this.pendingGrid = null;
    this._todOverride = S.tod || null;
    const P = { era: S.era, trackId: TRACKS[S.track] ? S.track : 'ringpark', laps: S.laps, opponents: 0, strength: 1, weather: S.weatherType || 'dry', quali: true, qualiMin: S.quali, team: me.team, name: me.name, number: me.number, tod: S.tod };
    const field = [{ driver: { name: me.name, nat: '', num: me.number, team: me.team, rating: 1 }, team: me.team, number: me.number, player: true }];
    const standingsFn = (q) => {
      const rows = (cl.qRows || []).map(r => ({ e: { number: (m.grid.find(g => g.name === r.name) || {}).number || 0 }, name: r.name, team: r.team, time: r.time || Infinity, player: r.id === cl.id }));
      const mine = rows.find(r => r.player); if (mine) mine.time = Math.min(mine.time, q.playerBest); else rows.push({ e: { number: me.number }, name: me.name, team: me.team, time: q.playerBest, player: true });
      return rows.sort((a, b) => a.time - b.time);
    };
    this.startQualifying({ P, field, qopts: { standingsFn } });
  },
  /** Nach dem Rennen: zurück in die Lobby (Host lädt alle ein, Client wartet) */
  netBackToLobby() {
    const s = Net.session; this.toMenu(); this.netHost = null;
    if (s && s.role === 'host') s.backToLobby();
    UI.show(s ? 'lobby' : 'multi', { noHistory: true });
  },
  netLeave() { Net.leave(); this.netHost = null; this.toMenu(); UI.show('multi', { noHistory: true }); },

  // ---------------------------------------------------------------------------
  //  Siegerehrung
  // ---------------------------------------------------------------------------
  /** Podest mit den ersten Drei des Rennens; false, wenn (noch) nicht drei Fahrer gewertet sind */
  openPodium() {
    const race = this.race; if (!race || this.state === 'podium') return false;
    const top = race.classification().filter(r => !r.retired).slice(0, 3);
    if (top.length < 3) return false;
    const list = top.map(r => ({ team: TEAMS.find(t => t.id === r.team) || TEAMS[0], number: r.number, name: r.e.player ? (this.settings.game.playerName || 'Du') : r.name, player: r.e.player }));
    this.podium = new PodiumScene(Render.renderer, list, { track: race.track.name });
    this.podiumPrev = { state: this.state, paused: this.loop.paused };
    this.state = 'podium'; this.loop.paused = !Net.active; Input.gameActive = false;
    AudioSys.setActive(false);
    UI.setHudVisible(false); UI.toggleMfd(false);
    UI.show('podium', { noHistory: true, list });
    for (let k = 0; k < 6; k++) setTimeout(() => AudioSys._burst && AudioSys.ready && AudioSys._burst(AudioSys.bus.ambient, { dur: 0.9, freq: 900 + k * 120, q: 0.4, gain: 0.12 }), 400 + k * 700);
    return true;
  },
  closePodium() {
    if (!this.podium) return;
    this.podium.dispose(); this.podium = null;
    const p = this.podiumPrev || { state: 'finished', paused: false };
    this.state = p.state === 'podium' || p.state === 'driving' ? 'finished' : p.state; this.loop.paused = p.paused; this.loop.acc = 0;
    UI.show('results', { noHistory: true });
  },

  // ---------------------------------------------------------------------------
  //  Wiederholung (Phase 6)
  // ---------------------------------------------------------------------------
  _startRecording() {
    const G = this.settings.game;
    if (this.raceMode && this.race) {
      const race = this.race;
      const src = race.entries.map(e => ({ vehicle: e.vehicle, team: e.team, number: e.number, name: e.player ? (G.playerName || 'Du') : e.name, player: e.player, entry: e, dist: () => e.distance, visible: () => e.active || e.player }));
      src.push({ get: () => (race.sc && race.sc.car ? race.sc.car.vehicle : null), sc: true, name: 'Safety Car', team: 'sc', number: 0, noFocus: true });
      this.replay = new ReplayRecorder(src);
      race.onMark = (type, idx, text) => this.replay && this.replay.mark(type, idx, text);
    } else {
      const v = this.vehicle;
      this.replay = new ReplayRecorder([{ vehicle: v, team: G.team, number: G.number, name: G.playerName || 'Du', player: true }], { maxSec: 1200 });
    }
    this.replay.wx = []; this._recWxT = 0; this._recOrdT = 0; this._recOrder = null;
  },
  /** Nebenbei: Wetter (1 Hz) und Überholmanöver für die Zeitleiste aufzeichnen */
  _recordExtras(dt) {
    const R = this.replay; if (!R || this.state === 'replay') return;
    this._recWxT += dt;
    if (this._recWxT > 1 && this.weather) { this._recWxT = 0; R.wx.push([R.t, this.weather.cloud, this.weather.rain, this.weather.water]); if (R.wx.length > 3000) R.wx.shift(); }
    const race = this.race; if (!race || race.state !== 'race') return;
    this._recOrdT += dt; if (this._recOrdT < 0.5) return; this._recOrdT = 0;
    const order = race.order || race.entries, prev = this._recOrder;
    if (prev) order.forEach((e, i) => {
      const was = prev.get(e);
      if (was != null && i < was && !e.pitting && !e.retired) {
        const passed = order[i + 1];
        if (passed && prev.get(passed) === i && !passed.pitting && !passed.retired && Math.abs(e.distance - passed.distance) < 40) {
          R.mark('pass', e.idx, `${e.player ? 'Du' : e.name} überholt ${passed.player ? 'dich' : passed.name}`);
          if (this.careerLog && (e.player || passed.player)) this.careerLog.passes.push({ by: e.name, on: passed.name });
        }
      }
    });
    this._recOrder = new Map(order.map((e, i) => [e, i]));
  },
  canReplay() { return !!(this.replay && this.replay.length > 3); },
  /** from: 'results' | 'pause' */
  openReplay(from = 'pause') {
    if (!this.canReplay() || this.state === 'replay') return;
    const R = this.replay, pi = R.src.findIndex(s => s.player);
    const vis = R.src.map(s => {
      if (s.player) return this.carVis;
      if (s.sc) { if (!this.scVis) { this.scVis = new CarVisual(SC_TEAM, 0, { detail: 'low', physical: false }); Render.scene.add(this.scVis.root); } return this.scVis; }
      const r = this.raceVis.find(x => x.e === s.entry); return r ? r.vis : null;
    });
    const startMark = this.race && this.race.greenAt != null ? this.race.greenAt - 2 : R.start;
    const t0 = from === 'results' ? Math.max(R.start, startMark) : Math.max(R.start, R.end - 20);
    this.rp = { from, prevState: this.state, prevPaused: this.loop.paused, prevCam: this.camMode, t: t0, speed: 1, playing: true, follow: Math.max(0, pi), auto: from === 'results',
      cars: R.src.map(s => new ReplayCar(s)), vis, dir: new ReplayDirector(R, { playerIdx: pi }), tmp: {}, uiT: 0 };
    if (this.ghost) this.ghost.root.visible = false;
    this.state = 'replay'; this.loop.paused = !Net.active; Input.gameActive = false;
    AudioSys.setReplay(true);
    UI.hideScreens(); UI.setHudVisible(false); UI.toggleMfd(false);
    this.setCamera('tv');
    UI.showReplay(true);
  },
  closeReplay() {
    const rp = this.rp; if (!rp) return;
    this.replayClosedT = performance.now();
    this.rp = null; this.state = rp.prevState; this.loop.paused = rp.prevPaused; this.loop.acc = 0;
    this.setCamera(rp.prevCam);
    UI.showReplay(false);
    AudioSys.setReplay(false);
    if (this.weather && this.trackVisual) this.trackVisual.setWet(this.weather.water);
    if (rp.prevState === 'paused') { AudioSys.setActive(false); UI.show('pause', { noHistory: true }); }
    else if (rp.prevState === 'finished') { AudioSys.setActive(false); UI.show(this.mode === 'quali' ? 'qualiResults' : 'results', { noHistory: true }); }
    else { UI.setHudVisible(this.hudOn); }
  },
  replaySeek(d) { const rp = this.rp, R = this.replay; if (!rp) return; rp.t = clamp(rp.t + d, R.start, R.end); rp.dir.reset(rp.t); if (this.rig) this.rig.init = false; Render.clearParticles(); },
  replaySeekTo(t) { this.replaySeek(t - (this.rp ? this.rp.t : 0)); },
  replayToggle() { const rp = this.rp; if (!rp) return; if (!rp.playing && rp.t >= this.replay.end - 0.05) rp.t = this.replay.start; rp.playing = !rp.playing; },
  replaySpeed(x) { if (this.rp) this.rp.speed = x; },
  replayFollow(d) {
    const rp = this.rp; if (!rp) return;
    const R = this.replay, n = R.n; rp.auto = false;
    for (let k = 1; k <= n; k++) { const i = (rp.follow + d * k + n * 4) % n; if (!R.src[i].noFocus && R.sample(rp.t, i, {}).visible) { rp.follow = i; break; } }
    if (this.rig) this.rig.init = false;
  },
  replayFocus(i) { if (this.rp) { this.rp.follow = i; this.rp.auto = false; if (this.rig) this.rig.init = false; } },
  replayAuto(on) { if (this.rp) { this.rp.auto = on ?? !this.rp.auto; this.rp.dir.reset(this.rp.t); } },
  replayCam() { const modes = REPLAY_CAMS, i = (modes.indexOf(this.camMode) + 1) % modes.length; this.setCamera(modes[i]); UI.hudMsg(CAMERA_NAMES[modes[i]], 900); },
  /** Nächstes/vorheriges Ereignis der Zeitleiste */
  replayEvent(d) {
    const rp = this.rp, R = this.replay; if (!rp) return;
    const list = R.events.filter(e => e.type !== 'start');
    const e = d > 0 ? list.find(x => x.t > rp.t + 3.5) : [...list].reverse().find(x => x.t < rp.t - 1);
    if (!e) return;
    this.replaySeekTo(e.t - 3);
    if (e.idx >= 0) { rp.follow = e.idx; rp.auto = false; }
    UI.hudMsg(e.text || e.type, 2200);
  },
  _replayFrame(dt) {
    const rp = this.rp, R = this.replay, S = this.settings, now = performance.now() / 1000;
    if (rp.playing) { rp.t += dt * rp.speed; if (rp.t >= R.end) { rp.t = R.end; rp.playing = false; } }
    const sdt = rp.playing ? dt * rp.speed : 0;
    if (rp.auto) { const f = rp.dir.pick(rp.t); if (f !== rp.follow) { rp.follow = f; if (this.rig) this.rig.init = false; } }
    // Wetter zum Zeitpunkt
    if (R.wx && R.wx.length && this.weather) {
      let w = R.wx[0]; for (const x of R.wx) { if (x[0] > rp.t) break; w = x; }
      Render.setWeather(w[1], w[2]); if (this.trackVisual) this.trackVisual.setWet(w[3]);
      if (Render.rain) Render.rain.update(dt, w[2] * (Render.quality.particles > 0 ? 1 : 0.4), Render.camera, { x: 0, y: 0, z: 0 });
      rp.water = w[3];
    }
    const cam = Render.camera, cp = cam.position, shadows = Render.quality.shadows > 0, opp = [];
    const right = this._camRight || (this._camRight = new THREE.Vector3());
    right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const ratio = CAR_SPEC.steerLockDeg;
    for (let i = 0; i < R.n; i++) {
      const vis = rp.vis[i]; if (!vis) continue;
      const p = R.sample(rp.t, i, rp.tmp);
      vis.root.visible = p.visible; if (!p.visible) continue;
      const rc = rp.cars[i]; rc.apply(p, sdt); rc.trackIdx = Math.floor(rc.trackS / this.track.ds) % this.track.N;
      vis.update(rc, 1, rc.input.steer * ratio, null, now);
      const dx = p.x - cp.x, dy = p.y - cp.y, dz = p.z - cp.z, dist = Math.hypot(dx, dy, dz);
      if (vis !== this.carVis) setCarLod(vis, i === rp.follow ? 0 : dist, shadows);
      if (sdt > 0 && rp.water > 0.12 && dist < 90) this._spray(rc, sdt, rp.water);
      if (dist < 250 && rp.playing && Math.abs(rp.speed - 1) < 0.01) {
        const inv = 1 / Math.max(0.1, dist), vrel = -(rc.vel.x * dx + rc.vel.z * dz) * inv;
        opp.push({ rpm: rc.rpm, dist, pan: (dx * right.x + dy * right.y + dz * right.z) * inv, vrel, load: rc.input.throttle });
      }
    }
    opp.sort((a, b) => a.dist - b.dist);
    AudioSys.updateOpponents(opp.slice(0, 3));
    const fv = rp.vis[rp.follow] || this.carVis, fc = rp.cars[rp.follow];
    const C = S.camera;
    this.rig.update(dt, { position: fv.root.position, quaternion: fv.root.quaternion, vehicle: fc }, { cockpit: C.cockpit, chaseFov: C.chaseFov, tvSpots: this.tvSpots, trackLength: this.track.length });
    if (this.camMode === 'chaseNear' || this.camMode === 'chaseFar') {
      const gh = this.track.heightAt(cam.position.x, cam.position.z, fc.trackIdx);
      if (cam.position.y < gh + 0.45) cam.position.y = gh + 0.45;
    }
    if (this.carVis) this.carVis.setCockpitView(fv === this.carVis && (this.camMode === 'cockpit' || this.camMode === 'tcam'), { hideWheel: C.hideWheel, hideHands: C.hideHands });
    Render.updateSun(fv.root.position);
    Render.updateParticles(sdt);
    rp.uiT += dt; if (rp.uiT > 0.1) { rp.uiT = 0; UI.updateReplay(rp, R); }
    Render.render();
  },

  // ---------------------------------------------------------------------------
  //  Schleife
  // ---------------------------------------------------------------------------
  /** Vor den Physikschritten: Eingaben abfragen und anwenden */
  pre(dt) {
    const v = this.vehicle;
    Input.update(dt, v ? v.speedKmh : 0);
    const autoDrive = this.raceMode && this.race && this.race.player && (this.race.player.ai || this.race.player.pitPilot);
    if (this.state === 'driving' && v) {
      if (!autoDrive) { const st = Input.state, inp = v.input; inp.steer = st.steer; inp.throttle = st.throttle; inp.brake = st.brake; inp.clutch = st.clutch; inp.steerSource = st.steerSource; }
      this._actions();
    } else if (this.state === 'podium') {
      if (Input.pressed('pause')) this.closePodium();
    } else if (this.state === 'replay') {
      if (Input.pressed('pause')) this.closeReplay();
      else if (Input.pressed('camera')) this.replayCam();
      else if (Input.pressed('shiftUp')) this.replayFollow(1);
      else if (Input.pressed('shiftDown')) this.replayFollow(-1);
      else if (Input.pressed('overtake')) this.replayToggle();
      else if (Input.pressed('aero')) this.replayAuto();
      else if (Input.pressed('ersUp') || Input.pressed('ersDown')) { const L = REPLAY_SPEEDS, i = clamp(L.indexOf(this.rp.speed) + (Input.pressed('ersUp') ? 1 : -1), 0, L.length - 1); this.replaySpeed(L[i]); }
      else if (Input.pressed('bbUp')) this.replayEvent(1);
      else if (Input.pressed('bbDown')) this.replayEvent(-1);
    } else if ((this.state === 'menu' || this.state === 'paused' || (this.state === 'finished' && UI.current !== 'results')) && Input.pressed('pause') && !UI.wizard && !$('modalRoot').children.length) {
      if (UI.current === 'pause') { if (performance.now() - (this.replayClosedT || 0) > 400) this.resume(); }
      else if (UI.current && UI.current !== 'main') UI.back();
    }
  },
  _actions() {
    const v = this.vehicle, I = Input;
    // Entprellung: ein Knopf, der gerade „Fortsetzen“ ausgelöst hat, darf nicht sofort wieder pausieren
    if (I.pressed('pause') && performance.now() - (this.resumeT || 0) > 400) { this.pause(I.sourceOf('pause') || 'Pause-Taste'); return; }
    if (I.pressed('pitRequest')) {
      if (this.raceMode && this.race && this.race.track.pit) {
        const r = this.race.togglePit(this.race.player, this.pitPlan);
        UI.hudMsg(r === 'angefordert' ? `Box angefordert – ${COMPOUNDS[this.pitPlan.compound].name}${this.pitPlan.repair ? ' · Reparatur' : ''}` : r === 'abgebrochen' ? 'Box abgebrochen' : 'Boxenstopp läuft', 2200);
        AudioSys.radio();
      } else UI.hudMsg('Boxenstopp nur im Rennen – in der Testfahrt: Pause → Neue Reifen', 2200);
    }
    if (I.pressed('shiftUp')) v.requestShift(1);
    if (I.pressed('shiftDown')) v.requestShift(-1);
    if (I.pressed('overtake') && !v.spec.ers.overtake) UI.hudMsg(v.spec.aero.mode === 'drs' ? 'DRS öffnet automatisch in den Zonen (oder Aero-Taste)' : 'In dieser Epoche gibt es keinen Überholmodus');
    else if (I.pressed('overtake')) {
      if (v.overtakeActive) { v.overtakeActive = false; UI.hudMsg('Überholmodus aus'); }
      else if (v.overtakeAvailable) { v.overtakeActive = true; v.overtakeAvailable = false; UI.hudMsg('Überholmodus aktiv'); AudioSys.beep(1500, 0.06, 0.18); }
      else UI.hudMsg('Überholmodus nicht verfügbar');
    }
    if (I.pressed('aero')) {
      if (v.aeroAuto) UI.hudMsg('Aero automatisch (Fahrhilfen)');
      else if (v.spec.aero.mode === 'none') UI.hudMsg('Keine verstellbare Aerodynamik in dieser Epoche');
      else if (v.spec.aero.mode === 'drs' && !v.drsOK) UI.hudMsg('DRS nicht freigegeben (nur < 1 s hinter dem Vordermann)');
      else if (v.inAeroZone) { v.aeroManual = !v.aeroManual; UI.hudMsg(v.spec.aero.mode === 'drs' ? (v.aeroManual ? 'DRS offen' : 'DRS zu') : (v.aeroManual ? 'Geradenmodus' : 'Kurvenmodus')); }
      else UI.hudMsg('Geradenmodus nur in Aero-Zonen');
    }
    if (I.pressed('pitLimiter')) { v.pitLimiter = !v.pitLimiter; UI.hudMsg(v.pitLimiter ? 'Begrenzer 80 km/h AN' : 'Begrenzer AUS'); AudioSys.beep(900, 0.05, 0.15); }
    if (I.pressed('bbUp') || I.pressed('bbDown')) {
      v.brakeBias = clamp(Math.round((v.brakeBias + (I.pressed('bbUp') ? 0.005 : -0.005)) * 1000) / 1000, 0.50, 0.65);
      UI.hudMsg(`Bremsbalance ${fmtNum(v.brakeBias * 100, 1)} % vorne`, 1100);
    }
    if (I.pressed('ersUp') || I.pressed('ersDown')) {
      const i = clamp(ERS_MODES.indexOf(v.ersMode) + (I.pressed('ersUp') ? 1 : -1), 0, ERS_MODES.length - 1);
      v.ersMode = ERS_MODES[i]; UI.hudMsg(`Energiemodus: ${ERS_NAMES[v.ersMode]}`, 1200);
    }
    if (I.pressed('mfd')) UI.toggleMfd();
    if (I.pressed('camera')) { const i = (CAMERA_MODES.indexOf(this.camMode) + 1) % CAMERA_MODES.length; this.setCamera(CAMERA_MODES[i]); UI.hudMsg(CAMERA_NAMES[CAMERA_MODES[i]], 900); }
    if (I.pressed('reset')) this.resetCar();
    if (I.pressed('inputOverlay')) { this.overlay = !this.overlay; $('inputOverlay').classList.toggle('hidden', !this.overlay); }
    if (I.pressed('hud')) { this.hudOn = !this.hudOn; UI.setHudVisible(this.hudOn); }
  },
  step(h) {
    // Mehrspieler: Pause, Wiederholung und Siegerehrung halten das Rennen nicht an
    const netRun = Net.active && this.raceMode && (this.state === 'paused' || this.state === 'replay' || this.state === 'podium');
    if ((this.state !== 'driving' && this.state !== 'finished' && !netRun) || !this.vehicle) return;
    if (netRun && this.state !== 'podium' && !(this.race && this.race.player && this.race.player.ai)) { const i = this.vehicle.input; i.throttle = 0; i.brake = 0.5; i.steer *= 0.98; }
    if (this.raceMode && this.race) {
      const race = this.race, me = race.player;
      race.step(h);
      if (this.replay) this.replay.step(h);
      if (this.raceRec && me.timing.started && !me.finished) this.raceRec.sample(me.vehicle, me.timing.lapTime, me.timing.progress);
    } else {
      if (this.weather) { this.weather.step(h); this.vehicle.water = this.weather.water; }
      this.vehicle.step(h);
      this.session.step(h, this.vehicle);
      if (this.replay) this.replay.step(h);
    }
  },
  /** Punkte für die Minikarte */
  mapCars() {
    const col = this.team.colors[0];
    if (this.raceMode && this.race) {
      const list = this.race.entries.filter(e => e.active || e.player).map(e => ({ x: e.vehicle.pos.x, z: e.vehicle.pos.z, color: TEAMS.find(t => t.id === e.team).colors[0], player: e.player }));
      const scc = this.race.sc && this.race.sc.car; if (scc) list.push({ x: scc.vehicle.pos.x, z: scc.vehicle.pos.z, color: '#ff8a00' });
      return list.sort((a, b) => a.player - b.player);
    }
    const out = [];
    if (this.ghost && this.ghost.root.visible) out.push({ x: this.ghost.root.position.x, z: this.ghost.root.position.z, color: 'rgba(160,200,255,0.8)' });
    if (this.vehicle) out.push({ x: this.vehicle.pos.x, z: this.vehicle.pos.z, color: col, player: true });
    return out;
  },
  frame(dt, alpha) {
    UI.frame(dt);
    if (Net.session && Net.session.tick) Net.session.tick(dt);
    const G = this.settings.graphics;
    if (this.state === 'replay' && this.rp) { this._replayFrame(dt); }
    else if (this.state === 'podium' && this.podium) { this.podium.update(dt, Render.width / Render.height); Render.render(this.podium.scene, this.podium.camera); }
    else if (this.state === 'menu' || this.state === 'boot') {
      if (this.garage) { this.garage.update(dt, Render.width / Render.height); Render.render(this.garage.scene, this.garage.camera); }
    } else if ((this.state === 'driving' || this.state === 'paused' || this.state === 'finished') && this.vehicle) {
      this._updateVisuals(dt, alpha);
      FFB.update(dt, this.vehicle, this.state === 'driving' && !(this.race && (this.race.player.ai || this.race.player.pitPilot)));
      Render.render();
      this._autoQuality(dt);
    }
    if (this.state !== 'driving' && this.state !== 'paused' && this.state !== 'finished') FFB.update(dt, null, false);   // Menü: keine Kraft (außer Testkraft)
    UI.updateFps(dt, G.showFps, G.frameGraph);
  },
  _updateVisuals(dt, alpha) {
    const v = this.vehicle, S = this.settings, now = performance.now() / 1000;
    if (this.state !== 'paused') this._recordExtras(dt);
    const driving = this.state === 'driving' || this.state === 'finished';
    // Ereignisse aus der Physik
    for (const e of v.events) {
      if (e.type === 'shift') AudioSys.shift(e.value > 0);
      else if (e.type === 'impact') { AudioSys.impact(e.value); if (e.value > 3 && !e.car) UI.hudMsg('Einschlag!', 900); if (this.mode !== 'race') this.session.invalidate(); }
      else if (e.type === 'shiftDenied') { AudioSys.beep(420, 0.08, 0.2); UI.hudMsg('Schaltsperre – Drehzahl zu hoch', 1000); }
    }
    v.events.length = 0;
    if (v.shiftDenied > 0) v.shiftDenied -= dt;
    const steerDeg = Input.state.steerSource === 'wheel' ? Input.state.steerDeg : v.input.steer * CAR_SPEC.steerLockDeg;
    this.carVis.update(v, alpha, steerDeg, { delta: this.session ? this.session.delta : null }, now);
    const C = S.camera;
    this.rig.update(dt, { position: this.carVis.root.position, quaternion: this.carVis.root.quaternion, vehicle: v }, {
      cockpit: C.cockpit, chaseFov: C.chaseFov, tvSpots: this.tvSpots, trackLength: this.track.length,
      lookBack: driving && Input.isHeld('lookBack'), lookLeft: driving && Input.isHeld('lookLeft'), lookRight: driving && Input.isHeld('lookRight'),
    });
    // Kamera nicht unter den Boden
    if (this.camMode === 'chaseNear' || this.camMode === 'chaseFar') {
      const cam = Render.camera, gh = this.track.heightAt(cam.position.x, cam.position.z, v.trackIdx);
      if (cam.position.y < gh + 0.45) cam.position.y = gh + 0.45;
    }
    Render.updateSun(this.carVis.root.position);
    this._otherCars(dt, alpha, now);
    if (this.idealLine) this.idealLine.update(v, this.state === 'finished' || (this.race && (this.race.player.ai || this.race.player.pitPilot)) ? 'off' : (S.aids.idealLine || 'off'));
    const wx = this.weather;
    if (wx) {
      Render.setWeather(wx.cloud, wx.rain);
      if (this.trackVisual) this.trackVisual.setWet(wx.water);
      if (Render.rain) Render.rain.update(dt, wx.rain * (Render.quality.particles > 0 ? 1 : 0.4), Render.camera, v.vel);
      VisorRain.update(dt, wx.rain, v.speed, driving && (this.camMode === 'cockpit' || this.camMode === 'tcam' || this.camMode === 'nose'));
      this._weatherRadio(dt);
    }
    if (this.skids && driving && this.state !== 'paused') {
      const water = wx ? wx.water : 0, on = Render.quality.skid > 0;
      this.skids.mesh.visible = on;
      if (on) { this.skids.fromVehicle(0, v, water); if (this.race) for (const { e } of this.raceVis) if (e.active && e.vehicle.speed > 6) { const d = Math.hypot(e.vehicle.pos.x - v.pos.x, e.vehicle.pos.z - v.pos.z); if (d < 260) this.skids.fromVehicle(e.idx + 1, e.vehicle, water); } }
      this.skids.flush();
    }
    if (driving) { this._particles(dt); if (wx && wx.water > 0.12) this._spray(v, dt, wx.water); Render.updateParticles(dt); }
    if (this.state !== 'paused') CarDebris.update(dt);
    if (driving) { if (this.race) Radio.watch(this.race, dt); if (this.race && this.careerRound && this.career && this.mode === 'race') TeamOrders.watch(this.race, dt, this.career); if (this.school && this.state === 'driving') this.school.update(dt, this.vehicle); Radio.tick(dt); }
    // Audio
    AudioSys.update(dt, v, { rain: wx ? wx.rain : 0, interior: this.camMode === 'cockpit' || this.camMode === 'tcam', allowPops: true, crowd: this.trackVisual ? this.trackVisual.crowdLevel(v.pos.x, v.pos.z) : 0 });
    // Rumble (Controller): Kerbs/Aufsetzen/Einschlag stark, Schlupf/Blockieren schwach
    if (driving && Input.state.steerSource === 'pad') {
      const W = v.wheels;
      const slip = Math.max(...W.map(w => smoothstep(1.0, 1.8, w.sComb))) * smoothstep(3, 15, v.speed);
      const lock = W.some(w => w.locked) ? 0.7 : 0;
      const dI = v.time - v.impactTime;
      const imp = dI < 0.3 ? Math.min(1, v.impact / 8) : 0;
      Input.rumble(Math.max(v.kerbVib * 0.55, v.scrapeIntensity * 0.6, imp), Math.max(slip * 0.5, lock, v.surfVib * 0.4), 90);
    }
    if (this.hudOn) {
      UI.updateHud(dt, v, this.session, this.minimap);
      if (this.raceMode && this.race) {
        this._raceHudT = (this._raceHudT || 0) + dt;
        if (this._raceHudT > 0.25) { this._raceHudT = 0; UI.updateRaceHud(this.race); }
        UI.setSectors(this.raceSectors, this.race.player.timing.started ? this.race.player.timing.sector : -1);
      } else if (this.mode === 'quali' && this.session) {
        this._raceHudT = (this._raceHudT || 0) + dt;
        if (this._raceHudT > 0.25) { this._raceHudT = 0; UI.updateQualiHud(this.session); }
        UI.setSectors(this.session.sectorState, this.session.started ? this.session.timing.sector : -1);
      } else if (this.session && this.session.sectorState) UI.setSectors(this.session.sectorState, this.session.started ? this.session.timing.sector : -1);
    }
  },
  /** Gischt hinter den Hinterrädern auf nasser Strecke */
  _spray(v, dt, water) {
    const fx = Render.fx, q = Render.quality.particles; if (!fx || q <= 0 || v.speed < 14) return;
    const n = 60 * water * q * smoothstep(14, 60, v.speed) * dt, R = Math.random;
    let k = n; while (k > 0) { if (k >= 1 || R() < k) { const w = v.wheels[2 + (R() < 0.5 ? 0 : 1)];
      fx.smoke.spawn(w.cx + (R() - 0.5) * 0.4, w.cy + 0.25, w.cz + (R() - 0.5) * 0.4, v.vel.x * 0.55 + (R() - 0.5) * 2, 0.6 + R(), v.vel.z * 0.55 + (R() - 0.5) * 2, 0.7 + R() * 0.5, 1.2, 3.2, 0.82, 0.86, 0.9, 0.22 * water, 2.2, 0.2); } k -= 1; }
  },
  /** Funk bei Wetterwechsel */
  _weatherRadio(dt) {
    const wx = this.weather; this._wxT = (this._wxT || 0) + dt; if (this._wxT < 1) return; this._wxT = 0;
    const st = wx.rain > 0.05 ? 'rain' : wx.water > 0.3 ? 'wet' : wx.cloud > 0.8 ? 'clouds' : 'dry';
    if (this._wxState && st !== this._wxState && (this.state === 'driving')) {
      const txt = { rain: 'Funk: Regen setzt ein!', wet: 'Funk: Regen hört auf – Strecke trocknet ab', clouds: 'Funk: Regen in wenigen Minuten erwartet', dry: 'Funk: Strecke ist trocken – Slicks!' }[st];
      if (txt) { if (Radio.mode() === 'off') { UI.hudMsg(txt, 3200); AudioSys.radio(); } else Radio.say(txt.replace('Funk: ', ''), 2); }
    }
    this._wxState = st;
  },
  /** KI-Fahrzeuge, Ghost und Gegner-Motorklang */
  _otherCars(dt, alpha, now) {
    const cam = Render.camera, cp = cam.position;
    if (this.ghost) {
      const S = this.session, show = S && S.started && S.ghost && this.state !== 'finished';
      this.ghost.update(show ? S.ghost.data : null, S ? S.lapTime : 0, cp);
    }
    if (!this.raceMode || !this.race) return;
    const scCar = this.race.sc && this.race.sc.car;
    if (scCar && !this.scVis) { this.scVis = new CarVisual(SC_TEAM, 0, { detail: 'low', physical: false }); Render.scene.add(this.scVis.root); }
    if (this.scVis) {
      this.scVis.root.visible = !!scCar;
      if (scCar) this.scVis.update(scCar.vehicle, alpha, scCar.vehicle.input.steer * CAR_SPEC.steerLockDeg, null, now);
    }
    const shadows = Render.quality.shadows > 0, opp = [];
    const right = this._camRight || (this._camRight = new THREE.Vector3());
    right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    for (const { e, vis } of this.raceVis) {
      if (!e.active) { vis.root.visible = false; continue; }
      vis.root.visible = true;
      const v = e.vehicle;
      vis.update(v, alpha, v.input.steer * CAR_SPEC.steerLockDeg, null, now);
      const dx = v.pos.x - cp.x, dy = v.pos.y - cp.y, dz = v.pos.z - cp.z, dist = Math.hypot(dx, dy, dz);
      setCarLod(vis, dist, shadows);
      if (this.weather && this.weather.water > 0.12 && dist < 90 && this.state !== 'paused') this._spray(v, dt, this.weather.water);
      if (dist < 250) {
        const inv = 1 / Math.max(0.1, dist);
        // Annäherungsgeschwindigkeit entlang der Sichtlinie (für Doppler)
        const pv = this.vehicle.vel, vrel = -((v.vel.x - pv.x) * dx + (v.vel.y - pv.y) * dy + (v.vel.z - pv.z) * dz) * inv;
        opp.push({ rpm: v.rpm, dist, pan: (dx * right.x + dy * right.y + dz * right.z) * inv, vrel, load: v.input.throttle });
      }
    }
    opp.sort((a, b) => a.dist - b.dist);
    AudioSys.updateOpponents(this.state === 'paused' ? [] : opp.slice(0, 3));
  },
  _particles(dt) {
    const v = this.vehicle, fx = Render.fx, q = Render.quality.particles;
    if (!fx || q <= 0) return;
    const R = Math.random, vx = v.vel.x, vy = v.vel.y, vz = v.vel.z;
    const emit = (rate, fn) => { let n = rate * dt; while (n > 0) { if (n >= 1 || R() < n) fn(); n -= 1; } };
    for (const w of v.wheels) {
      if (!w.contact) continue;
      const sd = SURFACES[w.surf], spd = Math.max(Math.abs(w.vx), w.slipVel);
      if (sd.dirt && spd > 3) {
        const gravel = w.surf === SURF.GRAVEL;
        emit((gravel ? 110 : 45) * q * smoothstep(3, 30, spd), () => fx.dust.spawn(w.cx + (R() - 0.5) * 0.3, w.cy + 0.1, w.cz + (R() - 0.5) * 0.3,
          vx * 0.35 + (R() - 0.5) * 3, 1.2 + R() * 2.2, vz * 0.35 + (R() - 0.5) * 3, 0.9 + R() * 0.9, 0.5, 1.9,
          gravel ? 0.74 : 0.42, gravel ? 0.66 : 0.5, gravel ? 0.52 : 0.3, gravel ? 0.45 : 0.32, 1.6, 0.8));
      } else if (!sd.dirt && w.sComb > 1.15 && w.slipVel > 4) {
        emit(70 * q * smoothstep(1.15, 2.6, w.sComb) * smoothstep(4, 20, w.slipVel), () => fx.smoke.spawn(w.cx + (R() - 0.5) * 0.2, w.cy + 0.15, w.cz + (R() - 0.5) * 0.2,
          vx * 0.2 + (R() - 0.5) * 1.5, 0.5 + R() * 0.8, vz * 0.2 + (R() - 0.5) * 1.5, 1.6 + R() * 1.4, 0.7, 2.4, 0.85, 0.85, 0.88, 0.3, 1.1, -0.1));
      }
    }
    if (v.scrapeIntensity > 0.04) {
      const R3 = v.R, p = v.pos, t = v._v;
      for (const z of [CAR_SPEC.plankZ[0], CAR_SPEC.plankZ[1]]) {
        R3.mulXYZ(0, CAR_SPEC.floorY, z, t);
        emit(260 * q * v.scrapeIntensity, () => fx.sparks.spawn(p.x + t.x + (R() - 0.5) * 0.4, p.y + t.y, p.z + t.z + (R() - 0.5) * 0.3,
          vx * 0.8 + (R() - 0.5) * 3, vy + 0.8 + R() * 2.2, vz * 0.8 + (R() - 0.5) * 3, 0.2 + R() * 0.3, 0.32, 0, 1, 0.68 + R() * 0.2, 0.3, 1, 0.6, 9.81));
      }
    }
  },
  /** Automatische Qualitätsanpassung bei dauerhaft < 50 FPS */
  _autoQuality(dt) {
    const G = this.settings.graphics; if (!G.autoQuality || this.state !== 'driving') return;
    this.perfT += dt;
    if (dt > 1 / 50) this.perfLow += dt;
    if (this.perfT > 6) {
      if (this.perfLow / this.perfT > 0.7) {
        const cur = Render.quality.resScale;
        if (Render.quality.post > 0) { G.custom.post = 0; Render.applyQuality(G); this.saveSettings(); UI.toast('Automatische Anpassung: Nachbearbeitung aus'); }
        else if (cur > 0.6) { G.custom.resScale = Math.round((cur - 0.1) * 100) / 100; Render.applyQuality(G); this.saveSettings(); UI.toast(`Automatische Anpassung: Auflösung ${Math.round(G.custom.resScale * 100)} %`); }
      }
      this.perfT = 0; this.perfLow = 0;
    }
  },
};

function nextFrame() { return new Promise(r => requestAnimationFrame(() => r())); }

// Debug-Zugriff für die Browser-Konsole (z. B. ApexDebug.vehicle.rpm)
window.ApexDebug = { ModFolder, applyMods, applyEra, Net, NetHost, NetClient, NetProfile, NetPresence, AIDriverRef: AIDriver, get game() { return Game; }, get vehicle() { return Game.vehicle; }, get input() { return Input; }, FFB, AIDriver, Damage, CarDebris, UI, events: Events, Render, AudioSys, TrackModel, Vehicle };

Game.boot().catch(err => {
  console.error(err);
  if (window.__apexShowError) window.__apexShowError('Start fehlgeschlagen: ' + (err && err.message || err));
});
