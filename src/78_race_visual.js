// ============================================================================
//  RENDER – Ghost-Fahrzeug, TV-Kamerapositionen, Detailstufen für KI-Autos
// ============================================================================

/** Lackierung des Safety Cars (silber/orange) */
const SC_TEAM = { id: 'sc', name: 'Safety Car', short: 'SC', colors: ['#c9ccd2', '#ff8a00', '#121212'], pattern: 'stripe', sponsors: ['SAFETY', 'CAR'] };

/** Halbtransparentes Fahrzeug, das die Bestrunde nachfährt */
class GhostCar {
  constructor(team, number) {
    this.vis = new CarVisual(team, number, { detail: 'low', physical: false });
    this.vis.root.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material.clone();
      m.transparent = true; m.opacity = 0.32; m.depthWrite = false;
      if (m.emissive) { m.emissive.set(0x1a4a7a); m.emissiveIntensity = 0.6; }
      o.material = m; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 5;
    });
    this.vis.helmet.visible = true;
    this.root = this.vis.root; this.root.visible = false;
    this.pose = {};
  }
  /** t = aktuelle Rundenzeit, data = Ghost-Posen; camPos zum Ausblenden in der Nähe */
  update(data, t, camPos) {
    const p = data ? ghostPose(data, t, this.pose) : null;
    if (!p) { this.root.visible = false; return; }
    this.root.position.set(p.x, p.y, p.z);
    this.root.quaternion.set(p.qx, p.qy, p.qz, p.qw);
    const d = camPos ? camPos.distanceTo(this.root.position) : 99;
    this.root.visible = d > 3.2;
    const op = clamp((d - 3) / 10, 0.08, 0.32);
    if (Math.abs(op - (this._op || 0)) > 0.01) { this._op = op; this.root.traverse(o => { if (o.isMesh) o.material.opacity = op; }); }
  }
}

/**
 * Detailstufe für entfernte Fahrzeuge (Phase 6): Stufe 0 alles, Stufe 1 ohne Kleinteile
 * (Spiegel, Querlenker, Bremsscheiben, Innenraum, Lenkrad), Stufe 2 nur Karosserie, Carbon,
 * Endplatten und Laufflächen (≈ 8 statt ≈ 65 Draw Calls). Schatten nur in Stufe 0.
 * k = Qualitätsfaktor (Grafik → Detailstufe Gegner).
 */
function setCarLod(vis, dist, shadows, k = (Render.quality && Render.quality.carLod) || 1) {
  const lvl = dist < 45 * k ? 0 : dist < 140 * k ? 1 : 2;
  if (vis._lod === lvl && vis._lodSh === shadows) return;
  vis._lod = lvl; vis._lodSh = shadows;
  vis.sw.group.visible = lvl === 0;
  for (const o of vis.lodFine) o.visible = lvl === 0;
  for (const o of vis.lodMid) o.visible = lvl < 2;
  vis.setShadows(shadows && lvl === 0);
}

/** TV-Kameras: hinter der Barriere, abwechselnd links/rechts, alle ≈ 170 m */
function buildTvSpots(track, blocked = []) {
  const spots = [], T = track, step = 170;
  let side = 0;
  for (let s = 40; s < T.length; s += step) {
    const j = Math.floor(s / T.ds) % T.N;
    // Kurvenaußenseite bevorzugen (bessere Sicht), sonst abwechselnd
    const k = T.KS[(j + 25) % T.N];
    side = Math.abs(k) > 0.003 ? (k > 0 ? 0 : 1) : 1 - side;
    const sg = side === 1 ? 1 : -1;
    let off = sg * (Math.min(T.BD[side][j], T.HW[j] + 30) + 4);
    let x = T.X[j] + T.RX[j] * off, z = T.Z[j] + T.RZ[j] * off;
    const inside = (x, z) => blocked.some(b => (b.x - x) ** 2 + (b.z - z) ** 2 < (b.r * 0.8) ** 2);
    if (inside(x, z)) { side = 1 - side; const sg2 = side === 1 ? 1 : -1; off = sg2 * (Math.min(T.BD[side][j], T.HW[j] + 30) + 4); x = T.X[j] + T.RX[j] * off; z = T.Z[j] + T.RZ[j] * off; }
    if (inside(x, z)) continue;
    spots.push({ s, x, y: T.Y[j] + 4.5 + Math.abs(k) * 300, z });
  }
  return spots;
}

/**
 * Fahrhilfe „Ideallinie“: Band auf der Fahrbahn entlang der Ideallinie, pro Bild nach dem
 * aktuellen Tempo eingefärbt – grün = beschleunigen, gelb = Gas weg, rot = bremsen.
 * Grundlage ist das Tempoprofil (Bremsweg-Kurve) mit leicht vorsichtigem Griff.
 */
class IdealLineVisual {
  constructor(track, line, grip = 0.96) {
    this.track = track; this.line = line; this.prof = line.profile(grip);
    const T = track, N = T.N, W = 0.32;
    const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 4), idx = [];
    for (let j = 0; j < N; j++) {
      const d = line.off[j], x = line.X[j], z = line.Z[j];
      const y = T.visualHeight(j, d) + 0.03;
      const rx = T.RX[j], rz = T.RZ[j];
      pos.set([x - rx * W, y, z - rz * W, x + rx * W, y, z + rz * W], j * 6);
      const a = j * 2, b = ((j + 1) % N) * 2;
      // kurze Lücke alle 4 Samples → gestrichelte Optik
      if (j % 4 !== 3) idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.col = new THREE.BufferAttribute(col, 4); this.col.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', this.col);
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    this.lastJ = -1; this.mode = 'full';
  }
  /** v = Spielerfahrzeug, mode = 'off' | 'brake' | 'full' */
  update(v, mode) {
    this.mesh.visible = mode !== 'off';
    if (mode === 'off' || !v || v.trackIdx < 0) return;
    const T = this.track, N = T.N, c = this.col.array, P = this.prof;
    const spd = Math.max(0, v.vLong), j0 = v.trackIdx, ahead = Math.round(520 / T.ds), behind = 6;
    // alten Bereich ausblenden
    if (this.lastJ >= 0) for (let q = -behind; q <= ahead; q++) { const k = (this.lastJ + q + N) % N; c[k * 8 + 3] = 0; c[k * 8 + 7] = 0; }
    for (let q = -behind; q <= ahead; q++) {
      const k = (j0 + q + N) % N, vp = P[k];
      let r, g, b;
      if (spd > vp * 1.03) { r = 1.0; g = 0.12; b = 0.08; }            // bremsen
      else if (spd > vp * 0.93) { r = 1.0; g = 0.82; b = 0.05; }       // Gas weg / rollen
      else { r = 0.15; g = 0.95; b = 0.35; }                            // beschleunigen
      let a = q < 0 ? 0.25 : 0.85 * (1 - smoothstep(ahead * 0.55, ahead, q));
      if (mode === 'brake' && g > 0.9) a = 0;                           // nur Brems- und Rollzonen
      c[k * 8] = r; c[k * 8 + 1] = g; c[k * 8 + 2] = b; c[k * 8 + 3] = a;
      c[k * 8 + 4] = r; c[k * 8 + 5] = g; c[k * 8 + 6] = b; c[k * 8 + 7] = a;
    }
    this.lastJ = j0;
    this.col.needsUpdate = true;
  }
}

/**
 * Wiedergabe: „Fahrzeug“-Attrappe aus einer Aufzeichnungsprobe, damit CarVisual, Kamera und
 * Lenkrad-Display unverändert funktionieren. Statische Werte (Radpositionen, Federweg in Ruhe,
 * Energieanzeige) kommen vom echten Fahrzeug der Quelle.
 */
class ReplayCar {
  constructor(src) {
    const v = src.get ? null : src.vehicle;
    this.spec = CAR_SPEC; this.src = src;
    this.pos = { x: 0, y: 0, z: 0 }; this.prevPos = this.pos; this.q = { x: 0, y: 0, z: 0, w: 1 }; this.prevQ = this.q;
    this.vel = { x: 0, y: 0, z: 0 };
    this.wheels = [0, 1, 2, 3].map(i => {
      const w = v ? v.wheels[i] : null;
      return { lx: w ? w.lx : (i % 2 ? 0.8 : -0.8), lz: w ? w.lz : (i < 2 ? -1.8 : 1.8), yTop: w ? w.yTop : 0, L: w ? w.L : 0.3, steer: 0, spin: 0, omega: 0, brakeTemp: 300, tyre: w ? w.tyre : { flat: 0, tEff: 90, c: 0.5 }, locked: false };
    });
    this.rest = this.wheels.map(w => w.yTop - w.L);
    this.compound = 'medium'; this.aeroFlap = 0; this.harvesting = false; this.pitLimiter = false; this.limiterCut = false;
    this.speed = 0; this.speedKmh = 0; this.rpm = 4000; this.gear = 1; this.trackS = 0; this.trackIdx = 0;
    this.accelLat = 0; this.accelLong = 0; this.kerbVib = 0; this.surfVib = 0; this.scrapeIntensity = 0; this.time = 0; this.impactTime = -10; this.impact = 0;
    this.input = { throttle: 0, brake: 0, steer: 0 }; this.shiftDenied = 0; this.overtakeActive = false;
    this._v = v;
  }
  get brakeBias() { return this._v ? this._v.brakeBias : 0.56; }
  get socFrac() { return this._v ? this._v.socFrac : 0.8; }
  get ersMode() { return this._v ? this._v.ersMode : ERS_MODES[1]; }
  /** p = ReplayRecorder.sample(...), dt = Wiedergabe-Zeitschritt (für Raddrehung, Beschleunigung) */
  apply(p, dt) {
    const px = this.pos.x, pz = this.pos.z;
    this.pos = { x: p.x, y: p.y, z: p.z }; this.prevPos = this.pos;
    this.q = { x: p.qx, y: p.qy, z: p.qz, w: p.qw }; this.prevQ = this.q;
    if (dt > 0) { this.vel = { x: (p.x - px) / dt, y: 0, z: (p.z - pz) / dt }; if (Math.hypot(this.vel.x, this.vel.z) > 150) this.vel = { x: 0, y: 0, z: 0 }; }
    const prevSp = this.speed;
    this.speed = p.speed; this.speedKmh = p.speed * 3.6; this.rpm = p.rpm; this.gear = p.gear; this.trackS = p.trackS;
    if (dt > 0) this.accelLong = clamp(this.accelLong * 0.8 + 0.2 * (p.speed - prevSp) / dt, -60, 40);
    this.compound = p.compound; this.aeroFlap = p.flap; this.pitLimiter = p.inPit;
    this.input.throttle = p.throttle; this.input.brake = p.brake; this.input.steer = p.steer / ((CAR_SPEC.maxWheelAngleDeg || 20) * DEG);
    this.time += dt;
    const R = CAR_SPEC.rR || 0.36;
    this.wheels.forEach((w, i) => {
      w.steer = i < 2 ? p.steer : 0;
      w.omega = p.locked && p.brake > 0.5 && i < 2 ? 0 : p.speed / R;
      w.spin += w.omega * dt;
      w.brakeTemp = 300 + p.brake * Math.min(1, p.speed / 40) * 700;
      // Aufstandspunkt in Weltkoordinaten (für Gischt/Reifenspuren): q · (lx, Federweg − r, lz)
      const vx = w.lx, vy = this.rest[i] - R, vz = w.lz, { x: qx, y: qy, z: qz, w: qw } = this.q;
      const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
      w.cx = p.x + vx + qw * tx + (qy * tz - qz * ty); w.cy = p.y + vy + qw * ty + (qz * tx - qx * tz); w.cz = p.z + vz + qw * tz + (qx * ty - qy * tx);
    });
  }
}

/**
 * Reifenspuren: dunkle Streifen auf Asphalt bei blockierenden oder stark rutschenden Rädern.
 * Ringpuffer aus Vierecken (ältestes wird überschrieben), nur geänderte Bereiche werden hochgeladen.
 */
class SkidMarks {
  constructor(max = 5000) {
    this.max = max; this.next = 0; this.count = 0;
    const pos = this.pos = new Float32Array(max * 4 * 3), col = this.col = new Float32Array(max * 4 * 4);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) { const a = i * 4; idx.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], i * 6); }
    const g = this.geo = new THREE.BufferGeometry();
    this.pA = new THREE.BufferAttribute(pos, 3); this.pA.setUsage(THREE.DynamicDrawUsage);
    this.cA = new THREE.BufferAttribute(col, 4); this.cA.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pA); g.setAttribute('color', this.cA); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.last = new Map(); this.dirty = [];
  }
  /** key = Rad-Kennung; x,y,z = Aufstandspunkt; hx,hz = Fahrtrichtung (normiert); w = Breite; a = Deckkraft 0…1 (0 = keine Spur) */
  add(key, x, y, z, hx, hz, w, a) {
    const L = this.last.get(key);
    if (a <= 0.02) { if (L) this.last.delete(key); return; }
    if (!L) { this.last.set(key, { x, y, z, hx, hz, w, a }); return; }
    const dx = x - L.x, dz = z - L.z, d2 = dx * dx + dz * dz;
    if (d2 < 0.6 * 0.6) return;
    if (d2 > 144) { this.last.set(key, { x, y, z, hx, hz, w, a }); return; }    // Sprung (Zurücksetzen); bis 12 m je Bild ist normal (300 km/h bei 30 FPS)
    const i = this.next; this.next = (this.next + 1) % this.max; this.count = Math.min(this.max, this.count + 1);
    const P = this.pos, C = this.col, o = i * 12, oc = i * 16;
    const px0 = -L.hz * L.w * 0.5, pz0 = L.hx * L.w * 0.5, px1 = -hz * w * 0.5, pz1 = hx * w * 0.5;
    P.set([L.x - px0, L.y + 0.025, L.z - pz0, L.x + px0, L.y + 0.025, L.z + pz0, x - px1, y + 0.025, z - pz1, x + px1, y + 0.025, z + pz1], o);
    const a0 = L.a * 0.55, a1 = a * 0.55;
    C.set([0.04, 0.04, 0.045, a0, 0.04, 0.04, 0.045, a0, 0.04, 0.04, 0.045, a1, 0.04, 0.04, 0.045, a1], oc);
    this.dirty.push(i);
    L.x = x; L.y = y; L.z = z; L.hx = hx; L.hz = hz; L.w = w; L.a = a;
  }
  /** Fahrzeug auswerten (echtes Vehicle oder ReplayCar ohne Schlupfdaten → nichts) */
  fromVehicle(id, v, water = 0) {
    if (!v.wheels[0].sComb && v.wheels[0].sComb !== 0) return;
    const sp = v.speed; if (sp < 6 || water > 0.35) { for (let k = 0; k < 4; k++) this.add(id * 4 + k, 0, 0, 0, 0, 1, 0, 0); return; }
    const hl = Math.hypot(v.vel.x, v.vel.z) || 1, hx = v.vel.x / hl, hz = v.vel.z / hl;
    for (let k = 0; k < 4; k++) {
      const w = v.wheels[k];
      let a = 0;
      if (w.contact && !SURFACES[w.surf].offTrack && !SURFACES[w.surf].dirt) {
        if (w.locked) a = 0.9;
        else a = smoothstep(1.25, 2.6, w.sComb) * smoothstep(4, 14, w.slipVel);
        a *= 1 - water * 2;
      }
      this.add(id * 4 + k, w.cx, w.cy, w.cz, hx, hz, k < 2 ? CAR_SPEC.tyreWidthF : CAR_SPEC.tyreWidthR, a);
    }
  }
  /** Einmal pro Bild: geänderte Bereiche hochladen */
  flush() {
    if (!this.dirty.length) return;
    this.dirty.sort((a, b) => a - b);
    let s = this.dirty[0], e = s;
    const push = () => { this.pA.addUpdateRange(s * 12, (e - s + 1) * 12); this.cA.addUpdateRange(s * 16, (e - s + 1) * 16); };
    for (let k = 1; k < this.dirty.length; k++) { const i = this.dirty[k]; if (i === e + 1) e = i; else { push(); s = e = i; } }
    push();
    this.pA.needsUpdate = true; this.cA.needsUpdate = true;
    this.dirty.length = 0;
    this.geo.setDrawRange(0, this.count * 6);
  }
  clear() { this.next = 0; this.count = 0; this.last.clear(); this.dirty.length = 0; this.geo.setDrawRange(0, 0); }
}
