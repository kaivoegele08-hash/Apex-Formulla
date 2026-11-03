// ============================================================================
//  MOTORKLANG – physikalisch informiertes Modell (Wellenleiter), läuft als
//  AudioWorklet im Audio-Thread. Portiert und für einen 1,6-l-V6-Turbo mit
//  15 000 U/min abgestimmt nach „enginesound“ von DasEtwas (MIT-Lizenz,
//  Copyright (c) 2020 DasEtwas), das auf dem Paper „Physically informed car
//  engine sound synthesis for virtual and augmented environments“
//  (Baldan, Lachambre, Delle Monache, Boussard) beruht.
//
//  Prinzip: Jeder Zylinder erzeugt Kolbenbewegung + Zünddruckstoß. Er ist über
//  Wellenleiter (zwei gegenläufige Verzögerungsleitungen mit Reflexion an den
//  Enden) mit Ansaug- und Auspuffsammler verbunden; die Ventile modulieren die
//  Reflexion. Der Auspuffsammler speist das Endrohr. Ausgänge:
//    Kanal 0 = Auspuff (außen) · Kanal 1 = Ansaugung + Motorvibration (Cockpit)
//
//  Lizenz des Originals (gilt für die portierten Teile):
//    MIT License
//
//    Copyright (c) 2020 DasEtwas
//
//    Permission is hereby granted, free of charge, to any person obtaining a copy
//    of this software and associated documentation files (the "Software"), to deal
//    in the Software without restriction, including without limitation the rights
//    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//    copies of the Software, and to permit persons to whom the Software is
//    furnished to do so, subject to the following conditions:
//
//    The above copyright notice and this permission notice shall be included in all
//    copies or substantial portions of the Software.
//
//    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//    SOFTWARE.
// ============================================================================

class EngineModel {
  constructor(sr, cfg) {
    this.sr = sr;
    const lpA = (f) => { const k = 2 * Math.PI / sr * f; return k / (k + 1); };
    const wg = (delaySec, alpha, beta) => {
      const n = Math.max(1, Math.round(delaySec * sr));
      return { c0: new Float32Array(n), c1: new Float32Array(n), n, pos: 0, alpha, beta, o0: 0, o1: 0 };
    };
    this.cyl = cfg.cylinders.map(c => ({
      off: c.offset, cyl: 0, extr: 0,
      ex: wg(c.exhaust, c.exClosed, 0.06), in: wg(c.intake, 1, -0.7576), xt: wg(c.extractor, 0, -0.0008),
      inOpen: 0.0061, inClosed: 1, exOpen: -0.0007, exClosed: c.exClosed,
    }));
    this.pipe = wg(cfg.pipe, 0.0617, 0.00165);
    this.muff = cfg.muffler.map(d => wg(d, 0, -0.142));
    this.piston = cfg.piston; this.ignition = cfg.ignition; this.ignTime = cfg.ignitionTime;
    this.inShift = cfg.intakeShift; this.exShift = cfg.exhaustShift;
    this.fluct = cfg.fluctuation;
    this.aNoise = lpA(cfg.noiseLp); this.aVib = lpA(cfg.vibLp); this.aFl = lpA(cfg.fluctLp); this.aDc = lpA(0.5);
    this.noiseF = cfg.intakeNoise;
    this.vol = cfg.volumes;
    this.crank = 0; this.exColl = 0; this.inColl = 0;
    this.lpN = 0; this.lpV = 0; this.lpF = 0; this.dcE = 0; this.dcI = 0;
    this.seed = 0x9e3779b9 ^ Math.floor(Math.random() * 0xffffffff);
    this.dampened = 0;
  }
  _rnd() { let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; return this.seed / 2147483648 - 1; }
  // Wellenleiter wie im Original: erst pop (beide Enden lesen), dann push (schreiben, weiterrücken)
  _pop(w) {
    let a = w.c1[(w.pos + 1) % w.n], b = w.c0[(w.pos + 1) % w.n];
    if (a > 20 || a < -20) { a = Math.sign(a) * (-1 / (Math.abs(a) - 19) + 21); this.dampened++; }
    if (b > 20 || b < -20) { b = Math.sign(b) * (-1 / (Math.abs(b) - 19) + 21); this.dampened++; }
    w.o1 = a; w.o0 = b;
    return [a * (1 - Math.abs(w.alpha)), b * (1 - Math.abs(w.beta))];
  }
  _push(w, x0, x1) {
    const i = w.pos % w.n;
    w.c0[i] = w.o1 * w.alpha + x0;
    w.c1[i] = w.o0 * w.beta + x1;
    w.pos++;
    if (w.pos > 1e9) w.pos = w.pos % w.n;
  }
  static exValve(c) { return c > 0.75 && c < 1 ? -Math.sin(c * 4 * Math.PI) : 0; }
  static inValve(c) { return c > 0 && c < 0.25 ? Math.sin(c * 4 * Math.PI) : 0; }

  /**
   * Füllt out0 (Auspuff) und out1 (Ansaugung/Cockpit) für n Samples.
   * rpm0→rpm1 wird linear über den Block interpoliert; ign = Zündstärke 0…1 (Last, 0 = Schnitt).
   */
  render(out0, out1, n, rpm0, rpm1, ign0, ign1) {
    const C = this.cyl, NC = C.length, frac = (x) => x - Math.floor(x);
    const V = this.vol;
    for (let s = 0; s < n; s++) {
      const k = n > 1 ? s / (n - 1) : 1;
      const rpm = rpm0 + (rpm1 - rpm0) * k, ign = (ign0 + (ign1 - ign0) * k) * this.ignition;
      this.crank = frac(this.crank + rpm / (this.sr * 120));     // ein Arbeitsspiel = 2 Umdrehungen
      this.lpN += (this._rnd() - this.lpN) * this.aNoise;
      const noise = this.lpN * this.noiseF;
      this.lpF += (this._rnd() - this.lpF) * this.aFl;
      const crank = this.crank + this.fluct * this.lpF;
      const lastEx = this.exColl / NC;
      this.exColl = 0; this.inColl = 0;
      let vib = 0;
      for (let i = 0; i < NC; i++) {
        const c = C[i], cp = frac(crank + c.off);
        let ig = 0;
        if (cp > 0.5 && cp < this.ignTime / 2 + 0.5) ig = Math.sin(2 * Math.PI * ((cp - 0.5) / this.ignTime));
        c.cyl = Math.cos(cp * 4 * Math.PI) * this.piston + ig * ign;
        const ev = EngineModel.exValve(frac(cp + this.exShift)), iv = EngineModel.inValve(frac(cp + this.inShift));
        c.ex.alpha = c.exClosed + (c.exOpen - c.exClosed) * ev;
        c.in.alpha = c.inClosed + (c.inOpen - c.inClosed) * iv;
        const exR = this._pop(c.ex), inR = this._pop(c.in), xtR = this._pop(c.xt);
        c.extr = xtR[0];
        this._push(c.xt, exR[1], lastEx);
        this.inColl += inR[1]; this.exColl += xtR[1]; vib += c.cyl;
      }
      const pR = this._pop(this.pipe);
      let m0 = 0, m1 = 0;
      for (const m of this.muff) { const r = this._pop(m); m0 += r[0]; m1 += r[1]; }
      for (let i = 0; i < NC; i++) {
        const c = C[i];
        const intake = this.inColl / NC + noise * EngineModel.inValve(frac(this.crank + c.off));
        this._push(c.ex, (1 - Math.abs(c.ex.alpha)) * c.cyl * 0.5, c.extr);
        this._push(c.in, (1 - Math.abs(c.in.alpha)) * c.cyl * 0.5, intake);
      }
      this._push(this.pipe, this.exColl, m0);
      this.exColl += pR[0];
      const nm = this.muff.length;
      for (const m of this.muff) this._push(m, pR[1] / nm, 0);
      this.lpV += (vib - this.lpV) * this.aVib;
      // Gleichanteil entfernen (wie im Original: Tiefpass 0,5 Hz abziehen)
      const e = m1 * V.exhaust, it = this.inColl * V.intake + this.lpV * V.vibration;
      this.dcE += (e - this.dcE) * this.aDc; this.dcI += (it - this.dcI) * this.aDc;
      out0[s] = (e - this.dcE) * V.gainE;
      out1[s] = (it - this.dcI) * V.gainI;
    }
  }
}

/** Abstimmung: 1,6-l-V6 (90°), Zündfolge 1-4-2-5-3-6 im 120°-Abstand, kurze Krümmer, ein Endrohr hinter dem Turbo */
const ENGINE_V6 = {
  // Kurbelversatz in Arbeitsspielen (1 = 720°); kleine Abweichungen der Rohrlängen machen den Klang lebendig
  cylinders: [
    { offset: 0 / 6, exhaust: 0.00072, intake: 0.000135, extractor: 0.00062, exClosed: 0.71 },
    { offset: 4 / 6, exhaust: 0.00081, intake: 0.000125, extractor: 0.00055, exClosed: 0.69 },
    { offset: 2 / 6, exhaust: 0.00066, intake: 0.000146, extractor: 0.00071, exClosed: 0.72 },
    { offset: 5 / 6, exhaust: 0.00077, intake: 0.000130, extractor: 0.00058, exClosed: 0.70 },
    { offset: 3 / 6, exhaust: 0.00085, intake: 0.000140, extractor: 0.00049, exClosed: 0.71 },
    { offset: 1 / 6, exhaust: 0.00069, intake: 0.000120, extractor: 0.00066, exClosed: 0.70 },
  ],
  pipe: 0.0019, muffler: [0.00011, 0.00015, 0.00019, 0.00024],
  piston: 2.43, ignition: 5, ignitionTime: 0.075,
  intakeShift: -0.043, exhaustShift: -0.0035,
  fluctuation: 0.06, fluctLp: 57, noiseLp: 10900, vibLp: 92, intakeNoise: 0.18,
  volumes: { exhaust: 0.64, intake: 0.33, vibration: 0.036, gainE: 0.75, gainI: 5.5 },
};

/** Quelltext des AudioWorklets (wird als Blob geladen – die Spieldatei bleibt eine einzige HTML-Datei) */
function engineWorkletSource() {
  return `${EngineModel.toString()}
const ENGINE_CFG = ${JSON.stringify(ENGINE_V6)};
class ApexEngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'rpm', defaultValue: 4000, minValue: 0, maxValue: 20000, automationRate: 'k-rate' },
            { name: 'ignition', defaultValue: 0.3, minValue: 0, maxValue: 1.5, automationRate: 'k-rate' }];
  }
  constructor() { super(); this.m = new EngineModel(sampleRate, ENGINE_CFG); this.rpm = 4000; this.ign = 0.3; this.alive = true;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.alive = false; }; }
  process(inputs, outputs, params) {
    const o = outputs[0]; if (!o || !o[0]) return this.alive;
    const a = o[0], b = o[1] || new Float32Array(a.length);
    const r = params.rpm[0], g = params.ignition[0];
    this.m.render(a, b, a.length, this.rpm, r, this.ign, g);
    this.rpm = r; this.ign = g;
    return this.alive;
  }
}
registerProcessor('apex-engine', ApexEngineProcessor);`;
}
