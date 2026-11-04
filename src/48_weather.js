// ============================================================================
//  WETTER – Bewölkung, Regenstärke, Streckennässe (ohne Grafik → Node-testbar)
//  Nässe: dW/dt = a·r·(1−W) − b·(1−r)·W − c·W  → Gleichgewicht ≈ 0,5 bei
//  leichtem, ≈ 0,85 bei starkem Regen; ohne Regen trocknet die Strecke in Minuten.
// ============================================================================

const WEATHER_TYPES = {
  dry:        { name: 'Sonnig',          cloud: 0.08, rain: 0 },
  cloudy:     { name: 'Bewölkt',         cloud: 0.75, rain: 0 },
  light:      { name: 'Leichter Regen',  cloud: 0.92, rain: 0.45 },
  heavy:      { name: 'Starker Regen',   cloud: 1.0,  rain: 1.0 },
  changeable: { name: 'Wechselhaft (Regen setzt ein)' },
  random:     { name: 'Zufällig' },
};
const WEATHER_ORDER = ['dry', 'cloudy', 'light', 'heavy', 'changeable', 'random'];
const WET_A = 0.010, WET_B = 0.0051, WET_C = 0.0017;

class Weather {
  /** type: Schlüssel aus WEATHER_TYPES; duration = erwartete Sitzungsdauer (s) */
  constructor(type = 'dry', { duration = 600, rng = Math.random } = {}) {
    if (type === 'random') { const r = rng(); type = r < 0.45 ? 'dry' : r < 0.65 ? 'cloudy' : r < 0.78 ? 'light' : r < 0.86 ? 'heavy' : 'changeable'; }
    this.type = type; this.t = 0; this.rng = rng;
    if (type === 'changeable') {
      const s = duration * (0.25 + rng() * 0.25);
      this.plan = { cloudAt: s - 90, rainAt: s, peakAt: s + 60, endAt: s + duration * (0.22 + rng() * 0.2), peak: 0.5 + rng() * 0.45 };
      this.cloud = 0.35; this.rain = 0; this.water = 0;
    } else {
      const d = WEATHER_TYPES[type] || WEATHER_TYPES.dry;
      this.cloud = d.cloud; this.rain = d.rain;
      this.water = this.equilibrium(d.rain);     // Strecke ist bereits nass bzw. trocken
    }
    this.wetEver = this.water > 0.3;
  }
  get name() { return (WEATHER_TYPES[this.type] || {}).name || this.type; }
  equilibrium(r) { return r <= 0 ? 0 : WET_A * r / (WET_A * r + WET_B * (1 - r) + WET_C); }
  /** Zielwerte aus dem Ablaufplan (wechselhaft) */
  _schedule() {
    const p = this.plan, t = this.t;
    if (!p) return;
    this.cloud = t < p.cloudAt ? 0.35 : t < p.rainAt ? lerp(0.35, 0.95, (t - p.cloudAt) / 90) : t < p.endAt ? 0.95 : Math.max(0.45, 0.95 - (t - p.endAt) / 200);
    this.rain = t < p.rainAt ? 0 : t < p.peakAt ? p.peak * (t - p.rainAt) / (p.peakAt - p.rainAt) : t < p.endAt ? p.peak : Math.max(0, p.peak * (1 - (t - p.endAt) / 40));
  }
  step(dt) {
    this.t += dt;
    this._schedule();
    const r = this.rain, W = this.water;
    this.water = clamp(W + (WET_A * r * (1 - W) - WET_B * (1 - r) * W - WET_C * W) * dt, 0, 1);
    if (this.water > 0.3) this.wetEver = true;
  }
  /** Beste Mischung für die aktuelle Nässe (Übergänge aus dem Reifenmodell) */
  static bestFor(water) { return water > 0.64 ? 'wet' : water > 0.42 ? 'inter' : null; }
  /** Kurztext für HUD/Funk */
  describe() {
    const w = this.water, r = this.rain;
    const state = w < 0.08 ? 'trocken' : w < 0.3 ? 'feucht' : w < 0.6 ? 'nass' : 'sehr nass';
    const sky = r > 0.6 ? 'starker Regen' : r > 0.05 ? 'Regen' : this.cloud > 0.6 ? 'bewölkt' : 'sonnig';
    return `${sky} · Strecke ${state} (${Math.round(w * 100)} %)`;
  }
}
