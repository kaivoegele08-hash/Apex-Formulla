// ============================================================================
//  RENDER – Grundlagen: Renderer & Qualitätsstufen, prozedurale Texturen,
//  Himmel (Preetham) + PMREM-Umgebung, Licht/Schatten, Partikel, Kameras
// ============================================================================

const QUALITY_PRESETS = {
  niedrig: { resScale: 0.75, shadows: 0, antialias: false, viewDist: 1300, particles: 0.35, trees: 0.45, physicalPaint: false, maxDpr: 1, post: 0, skid: 0, carLod: 0.6 },
  mittel:  { resScale: 0.9,  shadows: 1, antialias: true,  viewDist: 1900, particles: 0.65, trees: 0.7,  physicalPaint: false, maxDpr: 1, post: 0, skid: 1, carLod: 0.8 },
  hoch:    { resScale: 1.0,  shadows: 2, antialias: true,  viewDist: 2600, particles: 1.0,  trees: 1.0,  physicalPaint: true,  maxDpr: 1.5, post: 1, skid: 1, carLod: 1 },
  ultra:   { resScale: 1.0,  shadows: 3, antialias: true,  viewDist: 4000, particles: 1.0,  trees: 1.3,  physicalPaint: true,  maxDpr: 2, post: 1, skid: 1, carLod: 1.4 },
};
const SHADOW_SIZES = [0, 1024, 2048, 4096];

// ---------------------------------------------------------------------------
//  Prozedurale Texturen (Canvas)
// ---------------------------------------------------------------------------
const Tex = {
  renderer: null, cache: new Map(), maxAniso: 4,
  canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
  /** Textur aus Zeichenfunktion erzeugen und zwischenspeichern */
  make(key, w, h, draw, { repeat = true, srgb = true, aniso = true, mips = true } = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    const c = this.canvas(w, h), g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
    if (aniso) t.anisotropy = this.maxAniso;
    if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    this.cache.set(key, t);
    return t;
  },
  noiseFill(g, w, h, base, amp, n = 9000, size = 1.6, rng = Math.random) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const v = (rng() - 0.5) * amp;
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      const s = size * (0.5 + rng());
      g.fillRect(rng() * w, rng() * h, s, s);
    }
  },
  asphalt() {
    return this.make('asphalt', 512, 512, (g, w, h) => {
      const r = makeRng(11);
      this.noiseFill(g, w, h, '#3b3c3e', 0.22, 26000, 1.8, r);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${150 + r() * 60},${150 + r() * 60},${150 + r() * 60},${0.15 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
      g.globalAlpha = 0.06; for (let i = 0; i < 40; i++) { g.fillStyle = r() > 0.5 ? '#000' : '#fff'; g.fillRect(0, r() * h, w, 2 + r() * 6); } g.globalAlpha = 1;
    });
  },
  asphaltBump() {
    return this.make('asphaltBump', 256, 256, (g, w, h) => { this.noiseFill(g, w, h, '#808080', 0.9, 14000, 1.4, makeRng(12)); }, { srgb: false });
  },
  runoff() {
    return this.make('runoff', 256, 256, (g, w, h) => { this.noiseFill(g, w, h, '#4a4c50', 0.18, 8000, 1.6, makeRng(13)); });
  },
  kerb(type) {
    return this.make('kerb' + type, 256, 64, (g, w, h) => {
      if (type === 4) {   // Wurst-Randstein: gelb/schwarz
        g.fillStyle = '#e8c21a'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#1a1a1a'; for (let x = -64; x < w; x += 64) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 56, 0); g.lineTo(x + 32, 0); g.fill(); }
        return;
      }
      for (let i = 0; i < 2; i++) { g.fillStyle = i ? '#f2f2f2' : '#d2171d'; g.fillRect(i * w / 2, 0, w / 2, h); }
      if (type === 2) { g.fillStyle = 'rgba(0,0,0,0.28)'; for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 8, 0); g.lineTo(x + 12, 0); g.lineTo(x + 4, h); g.fill(); } }
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
      this.noiseFill2(g, w, h, 0.08);
    });
  },
  noiseFill2(g, w, h, a) { const r = makeRng(7); for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(0,0,0,${r() * a})`; g.fillRect(r() * w, r() * h, 2, 2); } },
  sand() {
    return this.make('sand', 512, 512, (g, w, h) => {
      const r = makeRng(23);
      this.noiseFill(g, w, h, '#c9a76c', 0.16, 30000, 2.2, r);
      for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${150 + r() * 40},${115 + r() * 30},${70 + r() * 20},0.25)`; g.lineWidth = 2; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 30, w * 0.6, y + (r() - 0.5) * 30, w, y); g.stroke(); }
    });
  },
  grass() {
    return this.make('grass', 512, 512, (g, w, h) => {
      const r = makeRng(21);
      this.noiseFill(g, w, h, '#4f7a32', 0.2, 30000, 2.2, r);
      for (let i = 0; i < 6000; i++) { g.strokeStyle = `rgba(${40 + r() * 50},${90 + r() * 60},${20 + r() * 30},0.35)`; g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4); g.stroke(); }
    });
  },
  grassStripes() {
    return this.make('grassStripes', 64, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8e8d0'; g.fillRect(0, 0, w / 2, h); });
  },
  gravel() {
    return this.make('gravel', 256, 256, (g, w, h) => {
      const r = makeRng(31);
      this.noiseFill(g, w, h, '#a89a80', 0.3, 9000, 2.4, r);
      for (let i = 0; i < 2500; i++) { const c = 120 + r() * 100; g.fillStyle = `rgb(${c},${c * 0.93},${c * 0.8})`; g.beginPath(); g.arc(r() * w, r() * h, 0.8 + r() * 1.8, 0, Math.PI * 2); g.fill(); }
    });
  },
  astro() {
    return this.make('astro', 128, 128, (g, w, h) => {
      g.fillStyle = '#2f8f52'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2a7fa0'; g.fillRect(0, 0, w, h / 2);
      this.noiseFill(g, w, h, 'rgba(0,0,0,0)', 0.15, 3000, 1.2, makeRng(41));
    });
  },
  concrete() {
    return this.make('concrete', 512, 128, (g, w, h) => {
      const r = makeRng(51);
      this.noiseFill(g, w, h, '#c9c9c4', 0.1, 6000, 1.5, r);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 2, h);
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, h - 10, w, 10);
    });
  },
  adsWall() {
    return this.make('ads', 2048, 128, (g, w, h) => {
      const names = TEAMS.flatMap(t => t.sponsors);
      const cols = ['#0c2b5e', '#c4122f', '#111', '#00a39b', '#ff7a00', '#5c2b88', '#0f7d3c', '#d8a31a'];
      const seg = w / 8;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = cols[i % cols.length]; g.fillRect(i * seg, 0, seg, h);
        g.fillStyle = '#fff'; g.font = 'italic 900 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(names[(i * 3) % names.length], i * seg + seg / 2, h / 2 + 4, seg - 30);
      }
    });
  },
  tyreWall() {
    return this.make('tyreWall', 256, 128, (g, w, h) => {
      g.fillStyle = '#1b1b1d'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d2171d'; g.fillRect(0, h * 0.34, w, h * 0.32);
      g.fillStyle = '#f2f2f2'; for (let x = 0; x < w; x += 64) g.fillRect(x, h * 0.34, 32, h * 0.32);
      g.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = 0; y < h; y += 10) g.fillRect(0, y, w, 2);
    });
  },
  fence() {
    return this.make('fence', 128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(210,210,210,0.9)'; g.lineWidth = 1.6;
      for (let i = -w; i < w * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); }
      g.fillStyle = 'rgba(90,90,90,1)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
    });
  },
  crowd() {
    return this.make('crowd', 512, 256, (g, w, h) => {
      const r = makeRng(61);
      g.fillStyle = '#2c3440'; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 16; row++) {
        const y = row * 16;
        g.fillStyle = row % 2 ? '#3a4656' : '#334050'; g.fillRect(0, y, w, 16);
        for (let x = 2; x < w; x += 6) {
          if (r() < 0.12) continue;
          const c = [`hsl(${r() * 360},70%,55%)`, '#f2f2f2', '#d32', '#24c', '#fc2', '#222'][Math.floor(r() * 6)];
          g.fillStyle = c; g.fillRect(x, y + 5, 4, 8);
          g.fillStyle = `hsl(25,${30 + r() * 30}%,${45 + r() * 30}%)`; g.fillRect(x + 0.5, y + 1.5, 3, 3.5);
        }
      }
    });
  },
  facade() {
    return this.make('facade', 512, 256, (g, w, h) => {
      g.fillStyle = '#e6e3dc'; g.fillRect(0, 0, w, h);
      for (let x = 12; x < w; x += 48) for (let y = 20; y < h - 20; y += 60) { g.fillStyle = '#5a7088'; g.fillRect(x, y, 28, 38); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, y, 28, 6); }
      g.fillStyle = '#b8b2a6'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 14, w, 14);
    });
  },
  garageFront() {
    return this.make('garageFront', 1024, 256, (g, w, h) => {
      g.fillStyle = '#2a2f36'; g.fillRect(0, 0, w, h);
      const n = 8, seg = w / n;
      for (let i = 0; i < n; i++) {
        const t = TEAMS[i % TEAMS.length];
        g.fillStyle = '#15181c'; g.fillRect(i * seg + 10, 60, seg - 20, h - 60);
        g.fillStyle = t.colors[0]; g.fillRect(i * seg + 10, 20, seg - 20, 34);
        g.fillStyle = '#fff'; g.font = 'italic 800 22px Arial'; g.textAlign = 'center'; g.fillText(t.name.toUpperCase(), i * seg + seg / 2, 45, seg - 30);
        g.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 70; y < h; y += 14) g.fillRect(i * seg + 10, y, seg - 20, 3);
      }
    });
  },
  carbon() {
    return this.make('carbon', 128, 128, (g, w, h) => {
      g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { const o = ((x + y) / 8) % 2; g.fillStyle = o ? '#232529' : '#1b1c20'; g.fillRect(x, y, 8, 4); g.fillStyle = o ? '#1b1c20' : '#26282c'; g.fillRect(x, y + 4, 8, 4); }
    });
  },
  tyreSide(color, blur) {
    return this.make('tyre' + color + (blur ? 'b' : ''), 256, 256, (g, w, h) => {
      const cx = w / 2, cy = h / 2;
      g.fillStyle = '#18181a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = color; g.lineWidth = blur ? 7 : 9; g.globalAlpha = blur ? 0.9 : 1;
      g.beginPath(); g.arc(cx, cy, w * 0.43, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
      if (!blur) {
        g.fillStyle = '#e8e8e8'; g.font = 'italic 900 22px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const a of [0, Math.PI]) { g.save(); g.translate(cx, cy); g.rotate(a); g.fillText('VULKAR', 0, -w * 0.37); g.restore(); }
        g.fillStyle = color; for (const a of [Math.PI / 2, -Math.PI / 2]) { g.save(); g.translate(cx, cy); g.rotate(a); g.fillRect(-14, -w * 0.385, 28, 8); g.restore(); }
      } else { g.strokeStyle = 'rgba(220,220,220,0.25)'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, w * 0.37, 0, Math.PI * 2); g.stroke(); }
    }, { repeat: false });
  },
  rim(blur) {
    return this.make('rim' + (blur ? 'b' : ''), 256, 256, (g, w, h) => {
      const cx = w / 2, cy = h / 2;
      g.clearRect(0, 0, w, h);
      const grad = g.createRadialGradient(cx, cy, 10, cx, cy, w / 2);
      grad.addColorStop(0, '#3a3c40'); grad.addColorStop(0.75, '#1e2024'); grad.addColorStop(1, '#5a5d62');
      if (blur) { g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, w / 2, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(150,150,155,0.25)'; g.beginPath(); g.arc(cx, cy, w * 0.42, 0, Math.PI * 2); g.fill(); }
      else {
        // Felgenhorn als Ring, Speichen dazwischen transparent (Bremsscheibe sichtbar)
        g.strokeStyle = '#5a5d62'; g.lineWidth = w * 0.06; g.beginPath(); g.arc(cx, cy, w * 0.47, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(cx, cy, w * 0.13, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#4b4e54';
        for (let i = 0; i < 10; i++) { g.save(); g.translate(cx, cy); g.rotate(i * Math.PI / 5); g.beginPath(); g.moveTo(-6, w * 0.08); g.lineTo(6, w * 0.08); g.lineTo(11, w * 0.45); g.lineTo(-11, w * 0.45); g.fill(); g.restore(); }
      }
      g.fillStyle = '#b9bcc2'; g.beginPath(); g.arc(cx, cy, w * 0.07, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d2171d'; g.beginPath(); g.arc(cx, cy, w * 0.035, 0, Math.PI * 2); g.fill();
    }, { repeat: false });
  },
  checker() {
    return this.make('checker', 128, 32, (g, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * 8, y * 8, 8, 8); } });
  },
  sign(text, bg = '#f4f4f4', fg = '#111') {
    return this.make('sign' + text + bg, 256, 128, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = fg; g.font = '900 84px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
    }, { repeat: false });
  },
  banner(text, sub) {
    return this.make('banner' + text, 1024, 128, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, 0); grad.addColorStop(0, '#0d0f14'); grad.addColorStop(0.5, '#1a1f2a'); grad.addColorStop(1, '#0d0f14');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff3b1f'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
      g.fillStyle = '#fff'; g.font = 'italic 900 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 - (sub ? 10 : 0));
      if (sub) { g.font = 'italic 700 24px Arial'; g.fillStyle = '#ffb199'; g.fillText(sub, w / 2, h / 2 + 34); }
    }, { repeat: false });
  },
  softDot() {
    return this.make('softDot', 64, 64, (g, w, h) => {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    }, { repeat: false, srgb: false });
  },
  /** Teamlackierung (Abwicklung: u = Fahrzeuglänge vorne→hinten, v = Umfang unten→rechts→oben→links) */
  livery(team, number) {
    return this.make('livery' + team.id + number, 1024, 512, (g, w, h) => {
      const [c0, c1, c2] = team.colors;
      g.fillStyle = c0; g.fillRect(0, 0, w, h);
      const vY = (v) => h - v * h;       // Canvas-y für v
      // Grundmuster
      g.fillStyle = c1;
      if (team.pattern === 'stripe') { g.fillRect(0, vY(0.56), w, 0.12 * h); g.fillStyle = c2; g.fillRect(0, vY(0.52), w, 0.04 * h); }
      else if (team.pattern === 'split') { g.fillRect(0, vY(0.25), w, 0.25 * h); g.fillRect(0, vY(1.0), w, 0.25 * h); g.fillStyle = c2; g.fillRect(0, vY(0.51), w, 0.02 * h); }
      else { g.beginPath(); for (const vc of [0.25, 0.75]) { g.moveTo(w * 0.3, vY(vc - 0.2)); g.lineTo(w * 0.62, vY(vc)); g.lineTo(w * 0.3, vY(vc + 0.2)); g.lineTo(w * 0.42, vY(vc)); g.closePath(); } g.fill(); g.fillStyle = c2; g.fillRect(0, vY(0.53), w, 0.06 * h); }
      // Unterseite dunkel
      g.fillStyle = 'rgba(10,10,12,0.85)'; g.fillRect(0, vY(0.08), w, 0.08 * h); g.fillRect(0, vY(1.0), w, 0.08 * h);
      const text = (str, u, v, size, side, color, font = 'italic 900') => {
        g.save(); g.translate(u * w, vY(v));
        if (side === 'R') g.scale(-1, 1); else if (side === 'L') g.scale(1, -1);
        g.fillStyle = color; g.font = `${font} ${size}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(str, 0, 0); g.restore();
      };
      // Startnummer auf Seitenkasten/Motorabdeckung und Nase
      for (const side of ['R', 'L']) {
        const v = side === 'R' ? 0.27 : 0.73;
        g.save(); g.fillStyle = c1; g.globalAlpha = 0.95; g.beginPath(); g.arc(0.70 * w, vY(v), 40, 0, Math.PI * 2); g.fill(); g.restore();
        text(String(number), 0.70, v, 58, side, c0);
        text(team.sponsors[0], 0.53, v - (side === 'R' ? 0.02 : -0.02), 46, side, c1 === c0 ? '#fff' : c1);
        text(team.sponsors[1], 0.30, v, 30, side, c2);
        text(team.short, 0.13, v, 26, side, c1);
      }
      text(String(number), 0.06, 0.5, 44, 'T', c1);
      text(team.sponsors[0], 0.44, 0.5, 36, 'T', c2);
    }, { repeat: false });
  },
};

// ---------------------------------------------------------------------------
//  Partikel (Rauch, Funken, Staub) – Points mit eigenem Shader
// ---------------------------------------------------------------------------
/** Regen: Tropfen als kurze Striche in einem Kasten um die Kamera */
class RainSystem {
  constructor(max = 3000) {
    this.max = max;
    this.pos = new Float32Array(max * 6); this.vel = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3); this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr); g.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8c4d0, transparent: true, opacity: 0.38, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 6;
    this.inited = false; this.R = 26; this.Hh = 18;
  }
  _spawn(i, cx, cy, cz, top) {
    const R = this.R, x = cx + (Math.random() - 0.5) * 2 * R, z = cz + (Math.random() - 0.5) * 2 * R;
    const y = top ? cy + this.Hh * (0.5 + Math.random() * 0.5) : cy + (Math.random() - 0.3) * this.Hh;
    const p = this.pos, k = i * 6; p[k] = x; p[k + 1] = y; p[k + 2] = z; p[k + 3] = x; p[k + 4] = y - 0.55; p[k + 5] = z;
    this.vel[i] = 9 + Math.random() * 3;
  }
  /** intensity 0…1, cam = Kamera, carVel = Fahrzeuggeschwindigkeit (Fahrtwind neigt die Tropfen) */
  update(dt, intensity, cam, carVel) {
    const n = Math.floor(this.max * clamp(intensity, 0, 1));
    this.lines.visible = n > 0;
    if (!n) { this.inited = false; return; }
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, R = this.R, p = this.pos;
    if (!this.inited) { for (let i = 0; i < this.max; i++) this._spawn(i, cx, cy, cz, false); this.inited = true; }
    const wx = carVel ? -carVel.x * 0.06 : 0, wz = carVel ? -carVel.z * 0.06 : 0;
    for (let i = 0; i < n; i++) {
      const k = i * 6, vy = this.vel[i] * dt;
      p[k] += wx * dt * 10; p[k + 2] += wz * dt * 10; p[k + 1] -= vy;
      p[k + 3] = p[k] - wx * 0.05; p[k + 5] = p[k + 2] - wz * 0.05; p[k + 4] = p[k + 1] - 0.55;
      if (p[k + 1] < cy - this.Hh * 0.5 || Math.abs(p[k] - cx) > R || Math.abs(p[k + 2] - cz) > R) this._spawn(i, cx, cy, cz, true);
    }
    this.lines.geometry.setDrawRange(0, n * 2);
    this.attr.needsUpdate = true;
  }
}

class ParticleSystem {
  constructor(max, { additive = false, texture, sizeScale = 1 } = {}) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grow = new Float32Array(max);
    this.alpha0 = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4); this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1); this.aSize.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aColor', this.aCol); geo.setAttribute('aSize', this.aSize);
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, scale: { value: 600 * sizeScale } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float scale; varying vec4 vC;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * scale / max(0.1, -mv.z), 1.0, 256.0); }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb * t.rgb, a);
        #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.budget = 1;
  }
  spawn(x, y, z, vx, vy, vz, life, size, grow, r, g, b, a, drag = 1.5, grav = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const p = i * 3, c = i * 4;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
    this.col[c] = r; this.col[c + 1] = g; this.col[c + 2] = b; this.col[c + 3] = a;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grow[i] = grow; this.alpha0[i] = a; this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._kill(i); continue; }
      const p = i * 3, c = i * 4;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[p] *= dr; this.vel[p + 1] = this.vel[p + 1] * dr - this.grav[i] * dt; this.vel[p + 2] *= dr;
      this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.col[c + 3] = this.alpha0[i] * Math.min(1, t * 2.2) * Math.min(1, (1 - t) * 8 + 0.2);
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[j * 3 + k]; this.vel[i * 3 + k] = this.vel[j * 3 + k]; }
    for (let k = 0; k < 4; k++) this.col[i * 4 + k] = this.col[j * 4 + k];
    this.size[i] = this.size[j]; this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.grow[i] = this.grow[j];
    this.alpha0[i] = this.alpha0[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}

// ---------------------------------------------------------------------------
//  Renderer, Szene, Umgebung
// ---------------------------------------------------------------------------
const Render = {
  renderer: null, canvas: null, scene: null, camera: null, sky: null, sun: null, hemi: null,
  quality: null, sunDir: new THREE.Vector3(), lightDir: new THREE.Vector3(), night: false, envRT: null, pmrem: null,
  fx: null, width: 1, height: 1, gfx: null,

  init(canvas, gfx) {
    this.canvas = canvas; this.gfx = gfx;
    const q = this.quality = Object.assign({}, QUALITY_PRESETS[gfx.preset] || QUALITY_PRESETS.hoch, gfx.custom || {});
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !!q.antialias, powerPreference: 'high-performance', stencil: false });
    } catch (e) {
      throw new Error('WebGL konnte nicht initialisiert werden. Bitte Hardwarebeschleunigung im Browser aktivieren.');
    }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.62;
    renderer.shadowMap.enabled = q.shadows > 0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    Tex.renderer = renderer; Tex.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, q.viewDist);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    const q = this.quality;
    const dpr = Math.min(window.devicePixelRatio || 1, q.maxDpr || 2);
    this.renderer.setPixelRatio(clamp(dpr * q.resScale, 0.4, 2));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    Events.emit('render:resize', w, h);
  },

  /** Qualitätsstufe anwenden (Antialiasing erst nach Neuladen) */
  applyQuality(gfx) {
    this.gfx = gfx;
    const q = this.quality = Object.assign({}, QUALITY_PRESETS[gfx.preset] || QUALITY_PRESETS.hoch, gfx.custom || {});
    this.renderer.shadowMap.enabled = q.shadows > 0;
    if (this.sun) {
      this.sun.castShadow = q.shadows > 0;
      const s = SHADOW_SIZES[q.shadows] || 1024;
      if (this.sun.shadow.mapSize.x !== s) { this.sun.shadow.mapSize.set(s, s); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    }
    this.camera.far = q.viewDist; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.dispose(); this.composer = null; }   // Neuaufbau mit aktueller Kantenglättung/Größe
    if (this.scene && this.scene.fog) { this.scene.fog.far = q.viewDist * 0.95; this.scene.fog.near = Math.min(400, q.viewDist * 0.2); }
    this.resize();
  },

  /** Spielszene mit Himmel, Sonne und Umgebungslicht anlegen */
  createWorld(timeOfDay = 'afternoon') {
    const scene = this.scene = new THREE.Scene();
    const tod = TIME_OF_DAY[timeOfDay] || TIME_OF_DAY.afternoon;
    // Himmel
    const sky = this.sky = new Sky(); sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = tod.turbidity; u.rayleigh.value = tod.rayleigh; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    const phi = (90 - tod.elevation) * DEG, theta = tod.azimuth * DEG;
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);
    scene.add(sky);
    // Lichtrichtung (bei Nacht steil von oben wie Flutlicht, sonst = Sonne)
    this.night = !!tod.night;
    this.lightDir.copy(this.sunDir); if (tod.lightElev) this.lightDir.setFromSphericalCoords(1, (90 - tod.lightElev) * DEG, theta);
    if (this.night) { sky.visible = false; scene.background = new THREE.Color(0x04060c); }
    // Umgebungs-Map aus dem prozeduralen Himmel (PMREM)
    const envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(1000); sky2.material.uniforms.sunPosition.value.copy(this.sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
    envScene.add(sky2);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshBasicMaterial({ color: tod.groundColor }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -2; envScene.add(ground);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0.035);
    scene.environment = this.envRT.texture;
    sky2.geometry.dispose(); sky2.material.dispose(); ground.geometry.dispose(); ground.material.dispose();
    // Licht
    this.hemi = new THREE.HemisphereLight(tod.skyColor, tod.groundColor, tod.hemi);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(tod.sunColor, tod.sun);
    sun.castShadow = this.quality.shadows > 0;
    const s = SHADOW_SIZES[this.quality.shadows] || 1024;
    sun.shadow.mapSize.set(s, s);
    const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.035;
    scene.add(sun); scene.add(sun.target);
    scene.fog = new THREE.Fog(tod.fog, Math.min(400, this.quality.viewDist * 0.2), this.quality.viewDist * 0.95);
    // Ausgangswerte für das Wetter (Bewölkung/Regen verändern Licht, Himmel und Nebel)
    this.todBase = { tod, sun: tod.sun, hemi: tod.hemi, fog: new THREE.Color(tod.fog), near: scene.fog.near, far: scene.fog.far, turb: tod.turbidity, ray: tod.rayleigh, exp: this.renderer.toneMappingExposure };
    this.wx = null;
    this.rain = new RainSystem(Math.round(3200 * (this.quality.particles || 1)));
    scene.add(this.rain.lines);
    // Partikel
    const dot = Tex.softDot();
    this.fx = {
      smoke: new ParticleSystem(700, { texture: dot, sizeScale: 1 }),
      dust: new ParticleSystem(500, { texture: dot, sizeScale: 1 }),
      sparks: new ParticleSystem(500, { additive: true, texture: dot, sizeScale: 0.35 }),
    };
    for (const k in this.fx) scene.add(this.fx[k].points);
    return scene;
  },

  /** Schattenfrustum mit dem Spielerauto mitführen (texelgenau gerastert) */
  updateSun(focus) {
    if (!this.sun) return;
    const s = this.sun, size = 90, res = s.shadow.mapSize.x || 1024, step = size / res;
    const fx = Math.round(focus.x / step) * step, fz = Math.round(focus.z / step) * step;
    s.target.position.set(fx, focus.y, fz);
    s.position.set(fx + this.lightDir.x * 200, focus.y + this.lightDir.y * 200, fz + this.lightDir.z * 200);
    s.target.updateMatrixWorld();
  },

  /** Wetter anwenden: cloud/rain 0…1 (nur bei Änderung) */
  setWeather(cloud, rain) {
    const B = this.todBase; if (!B || !this.scene) return;
    const key = Math.round(cloud * 50) + '|' + Math.round(rain * 50);
    if (this.wx === key) return; this.wx = key;
    const grey = new THREE.Color(0x8d969f);
    this.sun.intensity = B.sun * (1 - 0.78 * cloud);
    this.hemi.intensity = B.hemi * (1 + 0.25 * cloud);
    const u = this.sky.material.uniforms;
    u.turbidity.value = lerp(B.turb, 20, cloud); u.rayleigh.value = lerp(B.ray, 0.4, cloud);
    this.scene.fog.color.copy(B.fog).lerp(grey, cloud * 0.85);
    this.scene.fog.near = lerp(B.near, 30, rain); this.scene.fog.far = lerp(B.far, Math.min(B.far, 520), rain);
    this.renderer.toneMappingExposure = B.exp * (1 - 0.12 * cloud);
  },
  updateParticles(dt) { if (this.fx) for (const k in this.fx) this.fx[k].update(dt); },
  clearParticles() { if (this.fx) for (const k in this.fx) this.fx[k].clear(); },

  /**
   * Nachbearbeitung (Phase 6): dezentes Bloom (Bremsscheiben, Rücklicht, Sonne auf Lack),
   * Vignette und leichte Farbkorrektur; Kantenglättung per MSAA-Renderziel. Nur für die Spielszene.
   */
  _post() {
    const q = this.quality, want = q.post > 0 && this.renderer.capabilities.isWebGL2;
    if (!want) { if (this.composer) { this.composer.dispose(); this.composer = null; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; } return null; }
    const pr = this.renderer.getPixelRatio(), w = Math.round(this.width * pr), h = Math.round(this.height * pr);
    if (!this.composer) {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.antialias ? 4 : 0 });
      const c = this.composer = new EffectComposer(this.renderer, rt);
      this.postRender = new RenderPass(this.scene, this.camera); c.addPass(this.postRender);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.3, 0.5, 2.4); c.addPass(this.bloom);   // Schwelle im linearen HDR (vor Belichtung 0,62)
      this.grade = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, vig: { value: 0.32 }, sat: { value: 1.06 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D tDiffuse; uniform float vig; uniform float sat; varying vec2 vUv;
          void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
            c.rgb = mix(vec3(l), c.rgb, sat); vec2 d = vUv - 0.5; float v = 1.0 - vig * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
            gl_FragColor = vec4(c.rgb * v, c.a); }`,
      });
      c.addPass(this.grade);
      c.addPass(new OutputPass());
      this._postSize = '';
    }
    const key = w + 'x' + h;
    if (this._postSize !== key) { this._postSize = key; this.composer.setPixelRatio(1); this.composer.setSize(w, h); }
    this.postRender.scene = this.scene; this.postRender.camera = this.camera;
    return this.composer;
  },
  render(scene = this.scene, camera = this.camera) {
    const c = scene === this.scene && camera === this.camera && this.scene ? this._post() : null;
    if (c) c.render(); else this.renderer.render(scene, camera);
  },
};

const TIME_OF_DAY = {
  afternoon: { elevation: 34, azimuth: 205, turbidity: 5.5, rayleigh: 1.4, sun: 3.4, sunColor: 0xfff1de, hemi: 0.85, skyColor: 0xbcd4f0, groundColor: 0x5b6b45, fog: 0xb9c9d9 },
  morning: { elevation: 20, azimuth: 115, turbidity: 4.0, rayleigh: 1.2, sun: 3.0, sunColor: 0xffe9cf, hemi: 0.78, skyColor: 0xc6dbf2, groundColor: 0x55663f, fog: 0xc8d4de },
  dusk: { elevation: 3.5, azimuth: 262, turbidity: 9, rayleigh: 3.2, sun: 2.2, sunColor: 0xff9a55, hemi: 0.45, skyColor: 0xb59a8a, groundColor: 0x3c4230, fog: 0xb08f78 },
  // Nacht unter Flutlicht: dunkler Himmel, „Sonne“ = steiles, neutralweißes Flutlicht (kurze Schatten), bläuliches Umgebungslicht
  night: { elevation: -7, lightElev: 68, azimuth: 225, turbidity: 2, rayleigh: 0.3, sun: 2.6, sunColor: 0xf3f1ea, hemi: 0.62, skyColor: 0x5a6a90, groundColor: 0x2a2c26, fog: 0x0a0d16, night: true },
  evening: { elevation: 13, azimuth: 248, turbidity: 7.5, rayleigh: 2.4, sun: 3.0, sunColor: 0xffc78a, hemi: 0.68, skyColor: 0xd7c3a8, groundColor: 0x4f5a38, fog: 0xd6bf9f },
};

// ---------------------------------------------------------------------------
//  Kameras: Cockpit (Kopfbewegung, Shake, Blick links/rechts/zurück), Verfolger nah/fern
// ---------------------------------------------------------------------------
const CAMERA_MODES = ['cockpit', 'tcam', 'nose', 'chaseNear', 'chaseFar', 'tv'];
const CAMERA_NAMES = { cockpit: 'Cockpit', tcam: 'T-Cam', nose: 'Nasenkamera', chaseNear: 'Verfolger nah', chaseFar: 'Verfolger fern', tv: 'TV-Kamera', heli: 'Helikopter' };
/** Kameras in der Wiederholung (zusätzlich Helikopter) */
const REPLAY_CAMS = ['tv', 'heli', 'chaseNear', 'chaseFar', 'tcam', 'cockpit', 'nose'];

class CameraRig {
  constructor(camera) {
    this.cam = camera; this.mode = 'chaseNear';
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.yaw = 0; this.headLat = 0; this.headLong = 0; this.headVert = 0; this.lookYaw = 0;
    this.shake = new THREE.Vector3(); this.t = 0; this.init = false;
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._m = new THREE.Matrix4();
    this._fwd = new THREE.Vector3(); this._up = new THREE.Vector3(); this._right = new THREE.Vector3();
  }
  setMode(m) { this.mode = m; this.init = false; this._heliInit = false; }
  /** car: { position (Vector3), quaternion, vehicle } */
  update(dt, car, opts) {
    const cam = this.cam, q = car.quaternion, p = car.position, veh = car.vehicle;
    this.t += dt;
    const fwd = this._fwd.set(0, 0, -1).applyQuaternion(q), up = this._up.set(0, 1, 0).applyQuaternion(q), right = this._right.set(1, 0, 0).applyQuaternion(q);
    // Blickrichtung (zurück / links / rechts)
    let wantLook = 0;
    if (opts.lookBack) wantLook = Math.PI; else if (opts.lookLeft) wantLook = Math.PI * 0.42; else if (opts.lookRight) wantLook = -Math.PI * 0.42;
    this.lookYaw = opts.lookBack ? wantLook : damp(this.lookYaw, wantLook, 12, dt);
    if (this.mode === 'tv' && opts.tvSpots && opts.tvSpots.length && veh) {
      // TV-Regie: nächste Kamera vor dem Auto, Umschalten kurz nachdem es vorbeigefahren ist
      const S = opts.tvSpots, L = opts.trackLength, s = veh.trackS;
      const rel = (sp) => { let d = sp.s - s; if (d < -L / 2) d += L; if (d > L / 2) d -= L; return d; };
      if (this.tvIdx == null || rel(S[this.tvIdx]) < -45 || rel(S[this.tvIdx]) > 260) {
        let best = 0, bd = 1e9;
        S.forEach((sp, i) => { const d = rel(sp); if (d > -40 && d < bd) { bd = d; best = i; } });
        this.tvIdx = best;
      }
      const sp = S[this.tvIdx];
      cam.position.set(sp.x, sp.y, sp.z);
      cam.up.set(0, 1, 0);
      this.look.set(p.x, p.y + 0.4, p.z);
      cam.lookAt(this.look);
      const dist = cam.position.distanceTo(p);
      cam.fov = clamp(2 * Math.atan(9 / Math.max(1, dist)) / DEG, 6, 55);
      cam.near = 0.5;
    } else if (this.mode === 'heli') {
      // Helikopter: hoch hinter dem Auto, ruhig nachgeführt, Blick schräg nach unten
      const carYaw = Math.atan2(-fwd.x, -fwd.z);
      if (!this.init) { this.yaw = carYaw; this.init = true; }
      this.yaw += wrapAngle(carYaw - this.yaw) * (1 - Math.exp(-dt * 1.2));
      const tx = p.x + Math.sin(this.yaw) * 34, tz = p.z + Math.cos(this.yaw) * 34, ty = p.y + 30;
      if (!this._heliInit) { this.pos.set(tx, ty, tz); this._heliInit = true; }
      const k = 1 - Math.exp(-dt * 2.5);
      this.pos.x += (tx - this.pos.x) * k; this.pos.y += (ty - this.pos.y) * k; this.pos.z += (tz - this.pos.z) * k;
      if (this.pos.distanceTo(p) > 120) this.pos.set(tx, ty, tz);
      cam.position.copy(this.pos); cam.up.set(0, 1, 0);
      this.look.set(p.x - fwd.x * 12, p.y, p.z - fwd.z * 12); cam.lookAt(this.look);
      cam.fov = 40; cam.near = 0.5;
    } else if (this.mode === 'nose') {
      const eye = this._v.set(0, 0.27, -2.38);   // vor der Vorderachse, über dem Frontflügel
      cam.position.copy(eye).applyQuaternion(q).add(p);
      this._e.set(-3 * DEG, this.lookYaw, 0, 'YXZ'); this._q.setFromEuler(this._e);
      cam.quaternion.copy(q).multiply(this._q);
      cam.fov = 74; cam.near = 0.05;
    } else if (this.mode === 'cockpit' || this.mode === 'tcam') {
      const c = opts.cockpit;
      // Kopfbewegung durch Beschleunigungen (gedämpft)
      const aL = veh ? clamp(veh.accelLat / G0, -5, 5) : 0, aX = veh ? clamp(veh.accelLong / G0, -6, 6) : 0;
      this.headLat = damp(this.headLat, -aL * 0.006 * c.headMove, 6, dt);
      this.headLong = damp(this.headLong, -aX * 0.005 * c.headMove, 6, dt);
      // Vibration (Ersatz-Feedback): Kerbs, Aufsetzen, Kollision
      let sh = 0;
      if (veh) {
        const flat = Math.max(veh.wheels[0].tyre.flat, veh.wheels[1].tyre.flat) * smoothstep(3, 20, veh.speed);
        sh = (veh.kerbVib * 0.0028 + veh.surfVib * 0.0016 + veh.scrapeIntensity * 0.002 + flat * 0.004 * Math.abs(Math.sin(veh.wheels[0].spin))) * c.shake;
        const dtI = veh.time - veh.impactTime;
        if (dtI < 0.4) sh += Math.min(1, veh.impact / 10) * 0.02 * Math.exp(-dtI * 9) * c.shake;
      }
      this.shake.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh * 0.5);
      const eye = this.mode === 'cockpit'
        ? this._v.set(c.x + this.headLat, 0.515 + c.y, -0.24 + c.z + this.headLong)
        : this._v.set(0, 0.86, 0.32);
      eye.add(this.shake);
      cam.position.copy(eye).applyQuaternion(q).add(p);
      // Ausrichtung: Fahrzeugausrichtung + Neigung nach unten + Blick
      const pitch = (this.mode === 'cockpit' ? -c.pitch : -5) * DEG;
      this._e.set(pitch, this.lookYaw, 0, 'YXZ');
      this._q.setFromEuler(this._e);
      cam.quaternion.copy(q).multiply(this._q);
      cam.fov = this.mode === 'cockpit' ? c.fov : 62;
      cam.near = this.mode === 'cockpit' ? 0.03 : 0.08;
    } else {
      const far = this.mode === 'chaseFar';
      const dist = far ? 9.5 : 6.2, height = far ? 2.6 : 1.75;
      const carYaw = Math.atan2(-fwd.x, -fwd.z);
      if (!this.init) { this.yaw = carYaw; this.init = true; this.pos.copy(p); }
      // Gierwinkel nachführen (kritisch gedämpft) – etwas Fahrtrichtung einmischen
      let tgtYaw = carYaw;
      if (veh && veh.speed > 3) { const vy = Math.atan2(-veh.vel.x, -veh.vel.z); tgtYaw = carYaw + wrapAngle(vy - carYaw) * 0.35; }
      this.yaw += wrapAngle(tgtYaw - this.yaw) * (1 - Math.exp(-dt * (far ? 4.5 : 6)));
      const yaw = this.yaw + this.lookYaw;
      const bx = Math.sin(yaw) * dist, bz = Math.cos(yaw) * dist;
      const tx = p.x + bx, tz = p.z + bz, ty = p.y + height;
      this.pos.set(tx, ty, tz);
      cam.position.copy(this.pos);
      this.look.set(p.x - Math.sin(yaw) * 4, p.y + 0.55, p.z - Math.cos(yaw) * 4);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
      cam.fov = opts.chaseFov;
      cam.near = 0.1;
    }
    cam.updateProjectionMatrix();
  }
}
