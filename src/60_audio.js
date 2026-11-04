// ============================================================================
//  AUDIO – vollständig synthetisiert (Web Audio API), keine Sample-Dateien.
//  Busse: Motor, Effekte, Funk, Umgebung → Master.
// ============================================================================

const AudioSys = {
  ctx: null, ready: false, failed: false,
  master: null, bus: {}, noiseBuf: null, pinkBuf: null,
  engine: null, fx: null, vols: null, interiorMix: 0,

  /** Muss nach einer Nutzergeste aufgerufen werden (Autoplay-Richtlinie) */
  unlock() {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.failed = true; return; }
        this.ctx = new AC({ latencyHint: 'interactive' });
        this._build();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { });
      this.ready = true;
    } catch (e) { console.warn('[Audio] nicht verfügbar', e); this.failed = true; }
  },

  _build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    for (const b of ['engine', 'effects', 'radio', 'ambient']) { this.bus[b] = c.createGain(); this.bus[b].connect(this.master); }
    // Rauschpuffer (weiß und rosa)
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.pinkBuf = c.createBuffer(1, len, c.sampleRate);
    const p = this.pinkBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
    }
    this.engine = new EngineVoice(c, this.bus.engine, this.noiseBuf);
    if (!this.vols || this.vols.engineModel !== 'synth') this.engine.initModel();
    this.fx = new FxVoices(c, this.bus.effects, this.bus.ambient, this.noiseBuf, this.pinkBuf);
    this.opp = new OpponentVoices(c, this.bus.engine);
    if (this.vols) this.setVolumes(this.vols);
  },

  setVolumes(v) {
    this.vols = v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.master, t, 0.05);
    this.bus.engine.gain.setTargetAtTime(v.engine, t, 0.05);
    this.bus.effects.gain.setTargetAtTime(v.effects, t, 0.05);
    this.bus.radio.gain.setTargetAtTime(v.radio, t, 0.05);
    this.bus.ambient.gain.setTargetAtTime(v.ambient, t, 0.05);
    if (this.engine) this.engine.setModel(v.engineModel !== 'synth');
  },

  /** Gegnerische Motoren: list = [{ rpm, dist, pan, vrel, load }] (nächste zuerst) */
  updateOpponents(list) { if (this.ready && this.opp && this.ctx.state === 'running') this.opp.update(list, this.active !== false); },
  /** Pro Frame mit Fahrzeugzustand aufrufen */
  update(dt, car, opts) {
    if (!this.ready || !this.ctx || this.ctx.state !== 'running') return;
    const interior = opts.interior ? 1 : 0;
    this.interiorMix = damp(this.interiorMix, interior, 10, dt);
    this.engine.update(dt, car, this.interiorMix, opts);
    this.fx.update(dt, car, this.interiorMix, opts);
  },
  /** Motor/Effekte stumm (Menü/Pause) */
  setActive(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engine) this.engine.out.gain.setTargetAtTime(on ? 1 : 0, t, 0.08);
    if (this.fx) this.fx.setActive(on);
    if (this.opp && !on) this.opp.update([], false);
    this.active = on;
  },

  // --- kurze Klänge ---
  _burst(bus, { dur = 0.06, freq = 1200, q = 1.5, gain = 0.4, type = 'bandpass', tone = 0, toneGain = 0, toneDecay = 0.08 }) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    if (tone > 0) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(tone, t); o.frequency.exponentialRampToValueAtTime(tone * 0.5, t + toneDecay);
      const og = c.createGain(); og.gain.setValueAtTime(toneGain, t); og.gain.exponentialRampToValueAtTime(0.0008, t + toneDecay);
      o.connect(og); og.connect(bus); o.start(t); o.stop(t + toneDecay + 0.05);
    }
  },
  shift(up) { this._burst(this.bus.engine, { dur: 0.05, freq: up ? 1400 : 900, q: 2.2, gain: 0.35, tone: up ? 140 : 110, toneGain: 0.35, toneDecay: 0.06 }); },
  pop() { this._burst(this.bus.engine, { dur: 0.04 + Math.random() * 0.04, freq: 600 + Math.random() * 900, q: 0.9, gain: 0.25 + Math.random() * 0.25, tone: 70 + Math.random() * 40, toneGain: 0.2, toneDecay: 0.05 }); },
  impact(strength) { const s = clamp(strength / 15, 0.1, 1); this._burst(this.bus.effects, { dur: 0.25 + s * 0.3, freq: 500, q: 0.6, gain: 0.6 * s, type: 'lowpass', tone: 60, toneGain: 0.8 * s, toneDecay: 0.25 }); },
  /** Funk-/UI-Signal (Rauschen + Piepton) */
  beep(freq = 1000, dur = 0.08, gain = 0.25, bus = 'radio') {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 3;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.setValueAtTime(gain, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    o.connect(f); f.connect(g); g.connect(this.bus[bus]); o.start(t); o.stop(t + dur + 0.05);
  },
  radio() { this._burst(this.bus.radio, { dur: 0.12, freq: 2200, q: 0.8, gain: 0.18 }); setTimeout(() => this.beep(1250, 0.07, 0.15), 60); },
  uiClick() { this.beep(1800, 0.018, 0.05, 'effects'); },
};

/** Motorstimme: Obertonbank an Zünd-/Arbeitsspielfrequenz gekoppelt + pulsierendes Rauschen */
class EngineVoice {
  constructor(c, out, noiseBuf) {
    this.c = c;
    this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(out);
    // Begrenzer-Modulation (Rechteck-LFO auf Verstärkung)
    this.limGain = c.createGain(); this.limGain.gain.value = 1;
    this.limLfo = c.createOscillator(); this.limLfo.type = 'square'; this.limLfo.frequency.value = 24;
    this.limDepth = c.createGain(); this.limDepth.gain.value = 0;
    this.limLfo.connect(this.limDepth); this.limDepth.connect(this.limGain.gain); this.limLfo.start();
    // Pfade innen/außen
    this.mix = c.createGain(); this.mix.gain.value = 0.5;
    this.shaper = c.createWaveShaper(); this.shaper.curve = EngineVoice.curve(2.2); this.shaper.oversample = '2x';
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.8;
    this.peak = c.createBiquadFilter(); this.peak.type = 'peaking'; this.peak.frequency.value = 380; this.peak.Q.value = 1.1; this.peak.gain.value = 5;
    this.mix.connect(this.shaper); this.shaper.connect(this.lp); this.lp.connect(this.peak); this.peak.connect(this.limGain);
    this.extF = c.createBiquadFilter(); this.extF.type = 'highshelf'; this.extF.frequency.value = 2500; this.extF.gain.value = 4;
    this.intF = c.createBiquadFilter(); this.intF.type = 'lowpass'; this.intF.frequency.value = 2400; this.intF.Q.value = 0.5;
    this.intLow = c.createBiquadFilter(); this.intLow.type = 'lowshelf'; this.intLow.frequency.value = 220; this.intLow.gain.value = 6;
    this.extG = c.createGain(); this.intG = c.createGain();
    this.limGain.connect(this.extF); this.extF.connect(this.extG); this.extG.connect(this.out);
    this.limGain.connect(this.intF); this.intF.connect(this.intLow); this.intLow.connect(this.intG); this.intG.connect(this.out);
    // Obertöne relativ zur Zündfrequenz (V6, 4-Takt: 3 Zündungen je Umdrehung)
    this.partials = [[0.5, 0.16, 'sine'], [1, 0.9, 'sawtooth'], [1.5, 0.2, 'sine'], [2, 0.45, 'sine'], [3, 0.28, 'sine'], [4, 0.17, 'triangle'], [5, 0.1, 'sine'], [6, 0.07, 'sine'], [0.25, 0.08, 'sine']];
    this.osc = []; this.og = [];
    for (const [ord, amp, type] of this.partials) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = 200 * ord;
      const g = c.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(this.mix); o.start();
      this.osc.push(o); this.og.push(g);
    }
    // Verbrennungsrauschen, mit Zündfrequenz moduliert
    this.nsrc = c.createBufferSource(); this.nsrc.buffer = noiseBuf; this.nsrc.loop = true;
    this.nbp = c.createBiquadFilter(); this.nbp.type = 'bandpass'; this.nbp.Q.value = 1.3;
    this.ng = c.createGain(); this.ng.gain.value = 0;
    this.nmod = c.createOscillator(); this.nmod.type = 'sine';
    this.nmodDepth = c.createGain(); this.nmodDepth.gain.value = 0;
    this.nmod.connect(this.nmodDepth); this.nmodDepth.connect(this.ng.gain);
    this.nsrc.connect(this.nbp); this.nbp.connect(this.ng); this.ng.connect(this.mix);
    this.nsrc.start(); this.nmod.start();
    // Turbolader-Pfeifen und MGU-K-Surren
    this.turbo = c.createOscillator(); this.turbo.type = 'sine'; this.turboG = c.createGain(); this.turboG.gain.value = 0;
    this.turbo.connect(this.turboG); this.turboG.connect(this.out); this.turbo.start();
    this.mguk = c.createOscillator(); this.mguk.type = 'triangle'; this.mgukG = c.createGain(); this.mgukG.gain.value = 0;
    this.mguk2 = c.createOscillator(); this.mguk2.type = 'sine';
    this.mguk.connect(this.mgukG); this.mguk2.connect(this.mgukG); this.mgukG.connect(this.out); this.mguk.start(); this.mguk2.start();
    this.popT = 0; this.jitter = 0;
  }
  /** Physikalisches Motormodell (AudioWorklet) laden; bei Fehlern bleibt die Oszillator-Synthese aktiv */
  async initModel() {
    const c = this.c;
    if (this.model || this.modelLoading) return;
    this.modelLoading = true;
    try {
      let n = null;
      // file:// (Doppelklick) hat einen „opaken“ Ursprung: Chromium lädt Worklets dort nur aus data:-URLs, nicht aus Blobs
      if (c.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        const code = engineWorkletSource();
        const urls = ['data:application/javascript;charset=utf-8,' + encodeURIComponent(code)];
        try { urls.push(URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))); } catch (e) { /* ignorieren */ }
        for (const url of urls) {
          try { await c.audioWorklet.addModule(url); n = new AudioWorkletNode(c, 'apex-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] }); break; }
          catch (e) { console.info('[Audio] Worklet-Variante fehlgeschlagen:', url.slice(0, 5), e && e.message); }
        }
        for (const url of urls) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      }
      if (n) {
        this.modelKind = 'worklet';
        this.pRpm = n.parameters.get('rpm'); this.pIgn = n.parameters.get('ignition');
      } else if (c.createScriptProcessor) {
        // Notlösung ohne Worklet: gleiches Modell im Hauptthread (kann bei Last knacksen)
        const m = new EngineModel(c.sampleRate, ENGINE_V6), st = { rpm: 4000, ign: 0.3, r0: 4000, i0: 0.3 };
        n = c.createScriptProcessor(1024, 0, 2);
        n.onaudioprocess = (e) => { const a = e.outputBuffer.getChannelData(0), b = e.outputBuffer.getChannelData(1); m.render(a, b, a.length, st.r0, st.rpm, st.i0, st.ign); st.r0 = st.rpm; st.i0 = st.ign; };
        const prm = (k) => ({ setTargetAtTime: (v) => { st[k] = v; }, get value() { return st[k]; } });
        this.pRpm = prm('rpm'); this.pIgn = prm('ign');
        this.modelKind = 'script';
      } else throw new Error('weder AudioWorklet noch ScriptProcessor');
      n.onprocessorerror = () => { console.warn('[Audio] Motormodell abgestürzt – Oszillator-Synthese'); this.setModel(false); this.modelDead = true; };
      this.mLevel = c.createGain(); this.mLevel.gain.value = 0.7;
      const sp = c.createChannelSplitter(2);
      n.connect(this.mLevel); this.mLevel.connect(sp);
      // Außen: Auspuff + etwas Ansaugung · Cockpit: Airbox über dem Kopf + gedämpfter Auspuff
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 45; hp.Q.value = 0.7;
      const toExt = c.createGain(), toInt = c.createGain();
      const g = (src, ch, dst, v) => { const x = c.createGain(); x.gain.value = v; src.connect(x, ch); x.connect(dst); };
      g(sp, 0, toExt, 1.0); g(sp, 1, toExt, 0.22);
      g(sp, 1, toInt, 1.0); g(sp, 0, toInt, 0.45);
      this.mExt = c.createGain(); this.mInt = c.createGain();
      toExt.connect(hp); hp.connect(this.mExt); this.mExt.connect(this.extF);
      toInt.connect(this.mInt); this.mInt.connect(this.intF);
      this.mExt.gain.value = 0; this.mInt.gain.value = 0;
      this.model = n;
      this.setModel(!AudioSys.vols || AudioSys.vols.engineModel !== 'synth');
    } catch (e) {
      console.warn('[Audio] Motormodell nicht verfügbar – Oszillator-Synthese', e);
    } finally { this.modelLoading = false; }
  }
  setModel(on) {
    if (on && !this.model) { this.initModel(); return; }
    this.useModel = !!(on && this.model && !this.modelDead);
    if (!this.model) return;
    const t = this.c.currentTime;
    this.mExt.gain.setTargetAtTime(this.useModel ? 1 : 0, t, 0.05);
    this.mInt.gain.setTargetAtTime(this.useModel ? 1 : 0, t, 0.05);
  }
  static curve(k) {
    const n = 1024, a = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; a[i] = Math.tanh(k * x) / Math.tanh(k); }
    return a;
  }
  update(dt, car, inter, opts) {
    const c = this.c, t = c.currentTime, T = 0.012;
    const rpm = car.rpm;
    this.jitter = this.jitter * 0.9 + (Math.random() - 0.5) * 0.1;
    const fire = Math.max(40, rpm / 20) * (1 + this.jitter * 0.004);
    const load = clamp(Math.max(car.throttleEff || 0, car.iceTorque / 340), 0, 1);
    const over = (car.throttleEff || 0) < 0.05 && rpm > 6000;
    const rn = clamp(rpm / 15000, 0, 1.1);
    const M = this.useModel;
    if (this.model) {
      // Zündstärke: Last (Gaspedal/Moment), im Schiebebetrieb kaum, beim Begrenzer Zündunterbrechung
      const ign = car.limiterCut ? 0 : over ? 0.06 : 0.1 + 0.9 * load;
      this.pRpm.setTargetAtTime(Math.max(600, rpm), t, 0.006);
      this.pIgn.setTargetAtTime(ign, t, 0.004);
      this.mLevel.gain.setTargetAtTime(lerp(0.5, 0.85, load) * lerp(0.75, 1, rn), t, 0.03);
    }
    for (let i = 0; i < this.partials.length; i++) {
      const [ord, amp] = this.partials[i];
      this.osc[i].frequency.setTargetAtTime(fire * ord, t, T);
      const bright = ord <= 1 ? 1 : lerp(0.35, 1.25, load) * lerp(0.7, 1.1, rn);
      let g = amp * bright * (0.35 + 0.65 * load) * lerp(0.55, 1, rn);
      if (over) g *= ord <= 1 ? 0.55 : 0.35;
      this.og[i].gain.setTargetAtTime(M ? 0 : g * 0.22, t, T * 2);
    }
    this.lp.frequency.setTargetAtTime(700 + fire * 4.5 + load * 4200, t, T);
    this.nbp.frequency.setTargetAtTime(fire * 2.3 + 400, t, T);
    this.nmod.frequency.setTargetAtTime(fire, t, T);
    const ng = (0.02 + 0.09 * load) * lerp(0.6, 1, rn);
    this.ng.gain.setTargetAtTime(M ? 0 : ng * 0.5, t, T * 3); this.nmodDepth.gain.setTargetAtTime(M ? 0 : ng * 0.5, t, T * 3);
    // Begrenzer-Stottern
    this.limDepth.gain.setTargetAtTime(car.limiterCut && !M ? 0.42 : 0, t, 0.005);
    // Innen/außen
    this.extG.gain.setTargetAtTime((1 - inter) * 0.9, t, 0.05);
    this.intG.gain.setTargetAtTime(inter * 1.05, t, 0.05);
    // Turbo (mit Ladedruck), Abblasen beim Gaswegnehmen
    this.turbo.frequency.setTargetAtTime(1600 + car.boost * 5200 + rpm * 0.08, t, 0.03);
    this.turboG.gain.setTargetAtTime(car.boost * 0.018 * (0.5 + 0.5 * rn) * (1 - inter * 0.4), t, 0.05);
    // MGU-K: Surren proportional zur elektrischen Leistung
    const pk = Math.abs(car.ersPower || 0) / 350000;
    const sp = Math.abs(car.vLong);
    this.mguk.frequency.setTargetAtTime(380 + sp * 38, t, 0.03); this.mguk2.frequency.setTargetAtTime(760 + sp * 76.5, t, 0.03);
    this.mgukG.gain.setTargetAtTime(clamp(pk, 0, 1) * 0.016 * (car.harvesting ? 1.3 : 1), t, 0.05);
    // Fehlzündungen im Schiebebetrieb
    if (over && opts.allowPops) {
      this.popT -= dt;
      if (this.popT <= 0) { if (Math.random() < 0.35 * rn) AudioSys.pop(); this.popT = 0.05 + Math.random() * 0.12; }
    }
  }
}

/** Effekt-Stimmen: Reifen, Wind, Randsteine, Kies/Gras, Aufsetzen, Publikum */
class FxVoices {
  constructor(c, out, amb, noiseBuf, pinkBuf) {
    this.c = c; this.out = out;
    this.gate = c.createGain(); this.gate.gain.value = 0; this.gate.connect(out);
    this.ambGate = c.createGain(); this.ambGate.gain.value = 0; this.ambGate.connect(amb);
    const noise = (buf, rate = 1) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * 1.9); return s; };
    const chain = (src, type, f, q, dest = this.gate) => { const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; src.connect(fl); fl.connect(g); g.connect(dest); return { f: fl, g }; };
    // Reifenquietschen: tonaler Anteil + gefiltertes Rauschen
    this.sqOsc = c.createOscillator(); this.sqOsc.type = 'sawtooth'; this.sqOsc.frequency.value = 820;
    this.sqVib = c.createOscillator(); this.sqVib.frequency.value = 9; this.sqVibG = c.createGain(); this.sqVibG.gain.value = 18;
    this.sqVib.connect(this.sqVibG); this.sqVibG.connect(this.sqOsc.frequency); this.sqVib.start();
    this.sqTone = chain(this.sqOsc, 'bandpass', 900, 8); this.sqOsc.start();
    this.sqNoise = chain(noise(noiseBuf), 'bandpass', 1100, 5);
    // Wind
    this.wind = chain(noise(pinkBuf), 'lowpass', 400, 0.7);
    // Randstein-Rattern: tiefes Rauschen mit Rechteck-Modulation
    this.kerbSrc = chain(noise(noiseBuf, 0.6), 'lowpass', 220, 1.0);
    this.kerbMod = c.createOscillator(); this.kerbMod.type = 'square'; this.kerbMod.frequency.value = 30;
    this.kerbModG = c.createGain(); this.kerbModG.gain.value = 0;
    this.kerbMod.connect(this.kerbModG); this.kerbModG.connect(this.kerbSrc.g.gain); this.kerbMod.start();
    this.kerbTone = c.createOscillator(); this.kerbTone.type = 'triangle'; this.kerbToneG = c.createGain(); this.kerbToneG.gain.value = 0;
    this.kerbTone.connect(this.kerbToneG); this.kerbToneG.connect(this.gate); this.kerbTone.start();
    // Kies (Prasseln) und Gras (Rumpeln)
    this.gravel = chain(noise(noiseBuf, 1.3), 'bandpass', 2600, 0.9);
    this.gravelMod = c.createOscillator(); this.gravelMod.type = 'square'; this.gravelMod.frequency.value = 47;
    this.gravelModG = c.createGain(); this.gravelModG.gain.value = 0; this.gravelMod.connect(this.gravelModG); this.gravelModG.connect(this.gravel.g.gain); this.gravelMod.start();
    this.grass = chain(noise(pinkBuf, 0.5), 'lowpass', 160, 0.8);
    // Aufsetzen (Titan-Kufen)
    this.scrape = chain(noise(noiseBuf), 'bandpass', 5200, 2.5);
    // Fahrwerk/Straße (tiefes Rollgeräusch)
    this.road = chain(noise(pinkBuf, 0.7), 'lowpass', 120, 0.7);
    // Publikum / Umgebung
    this.crowd = chain(noise(pinkBuf, 1.0), 'bandpass', 900, 0.6, this.ambGate);
    this.crowdLfo = c.createOscillator(); this.crowdLfo.frequency.value = 0.17; this.crowdLfoG = c.createGain(); this.crowdLfoG.gain.value = 0;
    this.crowdLfo.connect(this.crowdLfoG); this.crowdLfoG.connect(this.crowd.g.gain); this.crowdLfo.start();
    this.birds = chain(noise(pinkBuf, 0.9), 'highpass', 3000, 0.5, this.ambGate);
    // Regen (Rauschen) und Reifenzischen auf nasser Fahrbahn
    this.rainN = chain(noise(noiseBuf, 0.8), 'highpass', 900, 0.5, this.ambGate);
    this.hiss = chain(noise(noiseBuf, 1.1), 'bandpass', 3200, 0.8);
  }
  setActive(on) { const t = this.c.currentTime; this.gate.gain.setTargetAtTime(on ? 1 : 0, t, 0.08); this.ambGate.gain.setTargetAtTime(on ? 1 : 0, t, 0.3); }
  update(dt, car, inter, opts) {
    const t = this.c.currentTime, T = 0.03;
    const W = car.wheels, spd = car.speed;
    // Reifen: Schlupf jenseits des Haftmaximums
    let sq = 0, lock = 0, sqLoad = 0;
    for (const w of W) {
      if (!w.contact || SURFACES[w.surf].offTrack && w.surf !== SURF.SAUSAGE) continue;
      const s = smoothstep(0.92, 1.7, w.sComb) * smoothstep(3, 12, Math.max(Math.abs(w.vx), w.slipVel));
      sq = Math.max(sq, s); sqLoad += s * w.Fz;
      if (w.locked) lock = Math.max(lock, 1);
    }
    const sqv = sq * (0.6 + 0.4 * clamp(sqLoad / 12000, 0, 1));
    const sqF = lock ? 1500 : 760 + sq * 260;
    this.sqOsc.frequency.setTargetAtTime(sqF, t, 0.05);
    this.sqTone.f.frequency.setTargetAtTime(sqF * 1.05, t, 0.05);
    this.sqTone.g.gain.setTargetAtTime(sqv * 0.05, t, T);
    this.sqNoise.f.frequency.setTargetAtTime(sqF * 1.3, t, 0.05);
    this.sqNoise.g.gain.setTargetAtTime(sqv * 0.16, t, T);
    // Wind (im Cockpit stärker: Helm)
    const wv = clamp(spd / 95, 0, 1.2);
    this.wind.f.frequency.setTargetAtTime(250 + spd * 14, t, 0.1);
    this.wind.g.gain.setTargetAtTime(wv * wv * (0.10 + inter * 0.10), t, 0.08);
    // Randsteine
    let kerb = 0, saw = 0, gravel = 0, grass = 0;
    for (const w of W) {
      if (!w.contact) continue;
      if (w.surf === SURF.KERB || w.surf === SURF.SAUSAGE) kerb = Math.max(kerb, 1);
      if (w.surf === SURF.KERB_SAW) saw = 1;
      if (w.surf === SURF.GRAVEL) gravel += 0.25;
      if (w.surf === SURF.GRASS || w.surf === SURF.ASTRO) grass += 0.25;
    }
    const sv = smoothstep(2, 25, spd);
    const kf = Math.max(8, spd / (saw ? 0.42 : 1.0));
    this.kerbMod.frequency.setTargetAtTime(Math.min(kf, 260), t, 0.02);
    const kl = Math.max(kerb * 0.5, saw) * sv;
    this.kerbSrc.g.gain.setTargetAtTime(kl * 0.18, t, 0.02); this.kerbModG.gain.setTargetAtTime(kl * 0.16, t, 0.02);
    this.kerbTone.frequency.setTargetAtTime(Math.min(kf, 260), t, 0.02);
    this.kerbToneG.gain.setTargetAtTime(saw * sv * 0.06, t, 0.02);
    this.gravel.g.gain.setTargetAtTime(gravel * sv * 0.22, t, 0.03); this.gravelModG.gain.setTargetAtTime(gravel * sv * 0.15, t, 0.03);
    this.grass.g.gain.setTargetAtTime(grass * sv * 0.35, t, 0.05);
    this.scrape.g.gain.setTargetAtTime(car.scrapeIntensity * 0.28, t, 0.01);
    this.road.g.gain.setTargetAtTime(smoothstep(0, 60, spd) * (0.12 + car.surfVib * 0.25), t, 0.05);
    // Umgebung
    const crowd = opts.crowd || 0;
    this.crowd.g.gain.setTargetAtTime(0.03 + crowd * 0.12, t, 0.5); this.crowdLfoG.gain.setTargetAtTime(0.02 + crowd * 0.04, t, 0.5);
    this.birds.g.gain.setTargetAtTime(0.004 * (1 - smoothstep(0, 40, spd)) * (1 - (opts.rain || 0)), t, 0.5);
    this.rainN.g.gain.setTargetAtTime((opts.rain || 0) * (0.06 + 0.05 * (1 - inter)), t, 0.4);
    this.hiss.g.gain.setTargetAtTime((car.water || 0) * smoothstep(5, 60, spd) * 0.07, t, 0.1);
  }
}

/** Motoren der nächsten Gegner: einfache Synthese, Entfernungsdämpfung, Stereo, Doppler */
class OpponentVoices {
  constructor(c, out) {
    this.c = c; this.voices = [];
    for (let i = 0; i < 3; i++) {
      const o1 = c.createOscillator(); o1.type = 'sawtooth';
      const o2 = c.createOscillator(); o2.type = 'square';
      const g2 = c.createGain(); g2.gain.value = 0.3;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8; lp.frequency.value = 1200;
      const g = c.createGain(); g.gain.value = 0;
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
      if (pan) { g.connect(pan); pan.connect(out); } else g.connect(out);
      o1.start(); o2.start();
      this.voices.push({ o1, o2, lp, g, pan });
    }
  }
  update(list, active) {
    const t = this.c.currentTime;
    this.voices.forEach((v, i) => {
      const d = active ? list[i] : null;
      if (!d) { v.g.gain.setTargetAtTime(0, t, 0.08); return; }
      const dop = clamp(343 / (343 - clamp(d.vrel, -120, 120)), 0.7, 1.4);
      const f = Math.max(40, d.rpm / 20) * dop;
      v.o1.frequency.setTargetAtTime(f, t, 0.02); v.o2.frequency.setTargetAtTime(f * 0.5, t, 0.02);
      v.lp.frequency.setTargetAtTime(500 + 3800 * Math.exp(-d.dist / 70) + d.load * 1200, t, 0.05);
      v.g.gain.setTargetAtTime(0.16 * (0.4 + 0.6 * d.load) / Math.pow(1 + d.dist / 10, 1.25), t, 0.05);
      if (v.pan) v.pan.pan.setTargetAtTime(clamp(d.pan, -0.9, 0.9), t, 0.05);
    });
  }
}
