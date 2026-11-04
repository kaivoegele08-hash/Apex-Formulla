// ============================================================================
//  VISIER – Regentropfen auf Visier/Linse in Cockpit-, T-Cam- und Nasenkamera
//  (2D-Überlagerung: Tropfen sammeln sich, werden mit dem Fahrtwind seitlich/nach oben weggeblasen)
// ============================================================================

const VisorRain = {
  el: null, g: null, drops: [], t: 0, w: 0, h: 0,
  _init() {
    this.el = document.createElement('canvas'); this.el.id = 'visorRain';
    Object.assign(this.el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2, display: 'none' });
    const hud = document.getElementById('hudMsg'); (hud && hud.parentNode ? hud.parentNode : document.body).prepend(this.el);
    this.g = this.el.getContext('2d');
  },
  hide() { if (this.el) this.el.style.display = 'none'; this.drops.length = 0; },
  /** rain 0…1, speed m/s, on = Kamera am/im Auto */
  update(dt, rain, speed, on) {
    if (!on || rain < 0.03) { if (this.el && this.el.style.display !== 'none') this.hide(); return; }
    if (!this.el) this._init();
    this.t += dt; if (this.t < 1 / 30) return; const h = this.t; this.t = 0;
    const W = Math.round(innerWidth / 2), H = Math.round(innerHeight / 2);
    if (W !== this.w || H !== this.h) { this.el.width = this.w = W; this.el.height = this.h = H; }
    this.el.style.display = 'block';
    // neue Tropfen (bei Tempo weniger, der Fahrtwind hält das Visier frei)
    const rate = rain * 60 * (1 - 0.6 * smoothstep(20, 70, speed));
    for (let n = rate * h; n > 0; n--) if (n >= 1 || Math.random() < n) this.drops.push({ x: Math.random() * W, y: Math.random() * H, r: (2.2 + Math.random() * 4.5) * (H / 540), life: 0, vx: 0, vy: 0 });
    if (this.drops.length > 260) this.drops.splice(0, this.drops.length - 260);
    // Fahrtwind: Tropfen wandern von der Mitte nach außen und oben
    const wind = smoothstep(8, 60, speed);
    const g = this.g; g.clearRect(0, 0, W, H);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.life += h;
      const dx = d.x - W / 2, dy = d.y - H * 0.55;
      d.vx = lerp(d.vx, dx * 0.9 * wind, 0.2); d.vy = lerp(d.vy, (dy * 0.5 - H * 0.6) * wind + (1 - wind) * 6 * d.r, 0.2);
      d.x += d.vx * h; d.y += d.vy * h;
      if (d.life > 6 || d.x < -10 || d.x > W + 10 || d.y < -10 || d.y > H + 10) { this.drops.splice(i, 1); continue; }
      const sp = Math.hypot(d.vx, d.vy), ang = Math.atan2(d.vy, d.vx), st = 1 + Math.min(4, sp * 0.02);
      g.save(); g.translate(d.x, d.y); g.rotate(ang); g.scale(st, 1);
      const gr = g.createRadialGradient(-d.r * 0.3, -d.r * 0.3, 0, 0, 0, d.r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.55, 'rgba(190,205,220,0.18)'); gr.addColorStop(1, 'rgba(20,30,40,0.35)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, d.r, 0, Math.PI * 2); g.fill(); g.restore();
    }
    // leichter Nässeschleier am Rand
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    v.addColorStop(0, 'rgba(180,195,210,0)'); v.addColorStop(1, `rgba(180,195,210,${0.12 * rain})`);
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  },
};
