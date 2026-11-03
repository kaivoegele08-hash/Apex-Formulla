// ============================================================================
//  GAME – Ablaufsteuerung: Start, Hauptmenü, Testfahrt-Session, Pause,
//  Verknüpfung von Eingabe → Physik → Grafik/Audio/HUD
// ============================================================================

const DEFAULT_SETTINGS = {
  graphics: { preset: 'hoch', custom: {}, showFps: false, frameGraph: false, autoQuality: true },
  audio: { master: 0.8, engine: 0.85, effects: 0.8, radio: 0.8, ambient: 0.5, engineModel: 'physik' },
  aids: { tc: 1, abs: false, autoShift: false, autoClutch: true, aeroAuto: true },
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
  game: { team: 'aurora', number: 77, compound: 'medium', hud: true, autoPause: true, ghost: true, playerName: 'Du' },
  race: { laps: 5, opponents: 19, strength: 0.96, grid: 'random', playerGrid: 'back', damage: 'full' },
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
    this.settings = deepMerge(DEFAULT_SETTINGS, Save.get('settings', {}));
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
    Events.on('lap:done', (t, valid) => { UI.hudMsg(`Runde ${fmtTime(t)}${valid ? '' : ' (ungültig)'}`, 2600); AudioSys.radio(); });
    Events.on('lap:best', (t) => UI.hudMsg(`Neue Bestzeit ${fmtTime(t)}`, 3000));
    Events.on('lap:limits', (n) => { UI.hudMsg('Track Limits – Runde ungültig', 1800); AudioSys.beep(520, 0.1, 0.2); });
    this._raceEvents();
    if (Input.repairNotes.length) setTimeout(() => UI.toast('Fehlerhafte Knopfbelegung entfernt (Lenk-/Pedalachse als Knopf): ' + Input.repairNotes.join(' · ') + ' – bitte bei Bedarf neu belegen.', 9000), 800);
    this.state = 'menu';
    UI.show('main');
    $('boot').classList.add('hidden');
    window.__apexReady = true;
    this.loop.start();
    Input.poll(); Input.autoSelectProfile();
    // Bereits freigegebenes Force-Feedback-Lenkrad ohne Klick wieder verbinden
    FFB.reconnect().then(() => { if (FFB.active) UI.toast('Force Feedback: ' + FFB.message, 4000); });
  },

  saveSettings() { Save.set('settings', this.settings); },
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
  getLine(id) { if (!this.lines[id]) this.lines[id] = new RacingLine(this.getTrackModel(id)); return this.lines[id]; },
  setupFor(id) { return Object.assign({}, DEFAULT_SETUP, Save.get('setups', {})[id] || {}); },
  saveSetup(id, setup) { const all = Save.get('setups', {}); all[id] = Object.assign({}, setup); Save.set('setups', all); },
  /** Setup sofort übernehmen (Testfahrt): Parameter neu berechnen und Auto an die Strecke setzen */
  applySetupLive(setup) {
    const v = this.vehicle; if (!v) return;
    v.setup = Object.assign({}, DEFAULT_SETUP, setup); v.applySetup(v.setup);
    this.resetCar();
  },
  get recorder() { return this.mode === 'race' ? this.raceRec : (this.session && this.session.rec); },

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
    const key = track.id + '|' + Render.quality.trees;
    if (this.builtFor !== key) {
      if (Render.scene) Render.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      Render.createWorld(track.def.timeOfDay);
      this.trackVisual = new TrackVisual(track, Render.quality);
      Render.scene.add(this.trackVisual.group);
      this.minimap = new Minimap(track, 220);
      this.builtFor = key;
    }
    this.tvSpots = buildTvSpots(track);
    return track;
  },
  _playerVisual() {
    this.carVis = new CarVisual(this.team, this.settings.game.number, { detail: 'high', physical: Render.quality.physicalPaint });
    this.carVis.root.traverse(o => { if (o.isMesh) o.castShadow = Render.quality.shadows > 0; });
    Render.scene.add(this.carVis.root);
  },
  /** Alles entfernen, was zu einer Sitzung gehört */
  _teardown() {
    const sc = Render.scene;
    if (sc) {
      if (this.carVis) sc.remove(this.carVis.root);
      for (const r of this.raceVis) sc.remove(r.vis.root);
      if (this.ghost) sc.remove(this.ghost.root);
    }
    this.vehicle = null; this.carVis = null; this.session = null; this.race = null; this.raceVis = []; this.ghost = null; this.raceRec = null;
    this.resultsShown = false; this.playerDoneT = null;
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
    $('hudMode').textContent = this.mode === 'race' ? 'Rennen' : 'Testfahrt';
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

  async startTestDrive() {
    await this._begin('Strecke wird aufgebaut …');
    try {
      const track = await this._prepareTrack('ringpark');
      $('bootMsg').textContent = 'Fahrzeug wird vorbereitet …';
      await nextFrame();
      this.mode = 'test';
      const v = this.vehicle = new Vehicle(CAR_SPEC, this.setupFor(track.id));
      v.setCompound(this.settings.game.compound, 70);
      v.placeOnTrack(track, track.length - 30, -track.HW[track.N - 15] * 0.42);
      v.gear = 1;
      this.applyAids();
      this._playerVisual();
      this.session = new PracticeSession(track);
      if (this.settings.game.ghost !== false) { this.ghost = new GhostCar(this.team, this.settings.game.number); Render.scene.add(this.ghost.root); }
      this._go('Testfahrt – ' + track.name);
    } catch (err) { this._fail(err); }
  },

  async startRace() {
    await this._begin('Startaufstellung wird vorbereitet …');
    try {
      const track = await this._prepareTrack('ringpark');
      $('bootMsg').textContent = 'Ideallinie und Gegner werden berechnet …';
      await nextFrame();
      const line = this.getLine(track.id), R = this.settings.race, G = this.settings.game;
      const field = buildField({ playerTeam: G.team, playerName: G.playerName || 'Du', playerNumber: G.number, size: R.opponents + 1, gridMode: R.grid, playerGrid: R.playerGrid });
      for (const e of field) { e.compound = e.player ? G.compound : 'medium'; if (e.player) e.setup = this.setupFor(track.id); }
      this.mode = 'race';
      const race = this.race = new RaceSession({ track, line, laps: R.laps, entries: field, damage: R.damage, aiStrength: R.strength });
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
      this._go(`${track.name} · ${R.laps} ${R.laps === 1 ? 'Runde' : 'Runden'}`);
      setTimeout(() => { if (this.race === race && race.state !== 'race') UI.hudMsg('Startaufstellung – Gas zum Vorbereiten, das Auto wird gehalten, bis die Ampel erlischt', 3600); }, 1200);
    } catch (err) { this._fail(err); }
  },

  /** Ereignisse des Rennens → HUD, Funk, Ergebnis */
  _raceEvents() {
    Events.on('race:lights', (n) => { UI.setLights(n); if (n > 0) AudioSys.beep(n === 5 ? 880 : 660, 0.12, 0.2, 'effects'); });
    Events.on('race:start', () => { UI.hudMsg('Los!', 1400); AudioSys.beep(1320, 0.25, 0.25, 'effects'); if (this.raceRec) this.raceRec.begin(1); });
    Events.on('race:msg', (text, entry, kind) => { if (kind === 'win' || kind === 'out' || kind === 'fastest' || (entry && entry.player)) UI.hudMsg(text, 3200); });
    Events.on('race:limits', (n, text) => { UI.hudMsg(n ? `Track Limits – ${text}` : text, 2600); AudioSys.radio(); });
    Events.on('race:damage', (parts) => UI.hudMsg('Schaden: ' + parts.join(', '), 2600));
    Events.on('race:sector', (d) => { this.raceSectors[d.k] = !this.race.player.timing.valid ? 'invalid' : d.overall ? 'purple' : d.pb ? 'green' : 'yellow'; });
    Events.on('race:contact', (sp) => { if (sp > 6) UI.hudMsg('Kontakt!', 900); });
    Events.on('race:finished', (e) => { if (e.player) this._playerDone(`Zielflagge – Platz ${e.pos}`); });
    Events.on('race:retired', (e) => { if (e.player) this._playerDone('Ausgeschieden'); });
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
    if (this.mode === 'race') { const me = this.race.player; me.ghostT = 3; me.timing.prevS = v.trackS; }
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
    this.state = 'paused'; this.loop.paused = true;
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
    this.state = 'menu'; this.loop.paused = false;
    Input.gameActive = false;
    AudioSys.setActive(false);
    UI.setHudVisible(false); UI.toggleMfd(false);
    this._teardown();
    UI.prev = [];
    UI.show('main', { noHistory: true });
  },

  // ---------------------------------------------------------------------------
  //  Schleife
  // ---------------------------------------------------------------------------
  /** Vor den Physikschritten: Eingaben abfragen und anwenden */
  pre(dt) {
    const v = this.vehicle;
    Input.update(dt, v ? v.speedKmh : 0);
    const autoDrive = this.mode === 'race' && this.race && this.race.player && this.race.player.ai;
    if (this.state === 'driving' && v) {
      if (!autoDrive) { const st = Input.state, inp = v.input; inp.steer = st.steer; inp.throttle = st.throttle; inp.brake = st.brake; inp.clutch = st.clutch; inp.steerSource = st.steerSource; }
      this._actions();
    } else if ((this.state === 'menu' || this.state === 'paused' || (this.state === 'finished' && UI.current !== 'results')) && Input.pressed('pause') && !UI.wizard && !$('modalRoot').children.length) {
      if (UI.current === 'pause') this.resume();
      else if (UI.current && UI.current !== 'main') UI.back();
    }
  },
  _actions() {
    const v = this.vehicle, I = Input;
    // Entprellung: ein Knopf, der gerade „Fortsetzen“ ausgelöst hat, darf nicht sofort wieder pausieren
    if (I.pressed('pause') && performance.now() - (this.resumeT || 0) > 400) { this.pause(I.sourceOf('pause') || 'Pause-Taste'); return; }
    if (I.pressed('shiftUp')) v.requestShift(1);
    if (I.pressed('shiftDown')) v.requestShift(-1);
    if (I.pressed('overtake')) {
      if (v.overtakeActive) { v.overtakeActive = false; UI.hudMsg('Überholmodus aus'); }
      else if (v.overtakeAvailable) { v.overtakeActive = true; v.overtakeAvailable = false; UI.hudMsg('Überholmodus aktiv'); AudioSys.beep(1500, 0.06, 0.18); }
      else UI.hudMsg('Überholmodus nicht verfügbar');
    }
    if (I.pressed('aero')) {
      if (v.aeroAuto) UI.hudMsg('Aero automatisch (Fahrhilfen)');
      else if (v.inAeroZone) { v.aeroManual = !v.aeroManual; UI.hudMsg(v.aeroManual ? 'Geradenmodus' : 'Kurvenmodus'); }
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
    if ((this.state !== 'driving' && this.state !== 'finished') || !this.vehicle) return;
    if (this.mode === 'race' && this.race) {
      const race = this.race, me = race.player;
      race.step(h);
      if (this.raceRec && me.timing.started && !me.finished) this.raceRec.sample(me.vehicle, me.timing.lapTime, me.timing.progress);
    } else {
      this.vehicle.step(h);
      this.session.step(h, this.vehicle);
    }
  },
  /** Punkte für die Minikarte */
  mapCars() {
    const col = this.team.colors[0];
    if (this.mode === 'race' && this.race) {
      return this.race.entries.filter(e => e.active || e.player).map(e => ({ x: e.vehicle.pos.x, z: e.vehicle.pos.z, color: TEAMS.find(t => t.id === e.team).colors[0], player: e.player }))
        .sort((a, b) => a.player - b.player);
    }
    const out = [];
    if (this.ghost && this.ghost.root.visible) out.push({ x: this.ghost.root.position.x, z: this.ghost.root.position.z, color: 'rgba(160,200,255,0.8)' });
    if (this.vehicle) out.push({ x: this.vehicle.pos.x, z: this.vehicle.pos.z, color: col, player: true });
    return out;
  },
  frame(dt, alpha) {
    UI.frame(dt);
    const G = this.settings.graphics;
    if (this.state === 'menu' || this.state === 'boot') {
      if (this.garage) { this.garage.update(dt, Render.width / Render.height); Render.render(this.garage.scene, this.garage.camera); }
    } else if ((this.state === 'driving' || this.state === 'paused' || this.state === 'finished') && this.vehicle) {
      this._updateVisuals(dt, alpha);
      FFB.update(dt, this.vehicle, this.state === 'driving' && !(this.race && this.race.player.ai));
      Render.render();
      this._autoQuality(dt);
    }
    if (this.state !== 'driving' && this.state !== 'paused' && this.state !== 'finished') FFB.update(dt, null, false);   // Menü: keine Kraft (außer Testkraft)
    UI.updateFps(dt, G.showFps, G.frameGraph);
  },
  _updateVisuals(dt, alpha) {
    const v = this.vehicle, S = this.settings, now = performance.now() / 1000;
    const driving = this.state === 'driving' || this.state === 'finished';
    // Ereignisse aus der Physik
    for (const e of v.events) {
      if (e.type === 'shift') AudioSys.shift(e.value > 0);
      else if (e.type === 'impact') { AudioSys.impact(e.value); if (e.value > 3 && !e.car) UI.hudMsg('Einschlag!', 900); if (this.mode === 'test') this.session.invalidate(); }
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
    if (driving) { this._particles(dt); Render.updateParticles(dt); }
    // Audio
    AudioSys.update(dt, v, { interior: this.camMode === 'cockpit' || this.camMode === 'tcam', allowPops: true, crowd: this.trackVisual ? this.trackVisual.crowdLevel(v.pos.x, v.pos.z) : 0 });
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
      if (this.mode === 'race' && this.race) {
        this._raceHudT = (this._raceHudT || 0) + dt;
        if (this._raceHudT > 0.25) { this._raceHudT = 0; UI.updateRaceHud(this.race); }
        UI.setSectors(this.raceSectors, this.race.player.timing.started ? this.race.player.timing.sector : -1);
      } else if (this.session && this.session.sectorState) UI.setSectors(this.session.sectorState, this.session.started ? this.session.timing.sector : -1);
    }
  },
  /** KI-Fahrzeuge, Ghost und Gegner-Motorklang */
  _otherCars(dt, alpha, now) {
    const cam = Render.camera, cp = cam.position;
    if (this.ghost) {
      const S = this.session, show = S && S.started && S.ghost && this.state !== 'finished';
      this.ghost.update(show ? S.ghost.data : null, S ? S.lapTime : 0, cp);
    }
    if (this.mode !== 'race' || !this.race) return;
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
        if (cur > 0.6) { G.custom.resScale = Math.round((cur - 0.1) * 100) / 100; Render.applyQuality(G); this.saveSettings(); UI.toast(`Automatische Anpassung: Auflösung ${Math.round(G.custom.resScale * 100)} %`); }
      }
      this.perfT = 0; this.perfLow = 0;
    }
  },
};

function nextFrame() { return new Promise(r => requestAnimationFrame(() => r())); }

// Debug-Zugriff für die Browser-Konsole (z. B. ApexDebug.vehicle.rpm)
window.ApexDebug = { get game() { return Game; }, get vehicle() { return Game.vehicle; }, get input() { return Input; }, FFB, AIDriver, Damage, UI, Render, AudioSys, TrackModel, Vehicle };

Game.boot().catch(err => {
  console.error(err);
  if (window.__apexShowError) window.__apexShowError('Start fehlgeschlagen: ' + (err && err.message || err));
});
