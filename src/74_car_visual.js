// ============================================================================
//  RENDER – Prozedurales Fahrzeugmodell (Formelwagen-Konzept „AF-26“)
//  Lokales System wie Physik: vorwärts = −Z, rechts = +X, oben = +Y, Ursprung = SP
// ============================================================================

const CAR_Z0 = -2.95, CAR_Z1 = 2.6;      // Längenbereich für die Lackierungs-Abwicklung

function superXY(t, w, h, n) {
  const c = Math.cos(t), s = Math.sin(t);
  return [w / 2 * sgn(c) * Math.pow(Math.abs(c), 2 / n), h / 2 * sgn(s) * Math.pow(Math.abs(s), 2 / n)];
}
function crScalar(a, b, c, d, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); }
function crSection(p0, p1, p2, p3, t) {
  const o = {};
  for (const k of ['z', 'w', 'h', 'y', 'n', 'x']) o[k] = crScalar(p0[k] ?? 0, p1[k] ?? 0, p2[k] ?? 0, p3[k] ?? 0, t);
  o.w = Math.max(0.001, o.w); o.h = Math.max(0.001, o.h); o.n = Math.max(1.2, o.n);
  return o;
}
/** Loft entlang z durch Superellipsen-Querschnitte {z,w,h,y,n,x}; v0..v1 erlaubt offene Formen */
function loftGeometry(sections, { radial = 28, sub = 4, v0 = 0, v1 = 1, capStart = false, capEnd = false, mirrorX = false } = {}) {
  const S = sections.map(s => Object.assign({ n: 2.5, x: 0 }, s));
  const dense = [];
  for (let i = 0; i < S.length - 1; i++) {
    const p0 = S[Math.max(0, i - 1)], p1 = S[i], p2 = S[i + 1], p3 = S[Math.min(S.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) dense.push(crSection(p0, p1, p2, p3, k / sub));
  }
  dense.push(S[S.length - 1]);
  const pos = [], uv = [], idx = [], ringN = radial + 1;
  for (const R of dense) {
    const u = (R.z - CAR_Z0) / (CAR_Z1 - CAR_Z0);
    for (let k = 0; k <= radial; k++) {
      const v = v0 + (v1 - v0) * k / radial;
      const [x, y] = superXY(-Math.PI / 2 + v * Math.PI * 2, R.w, R.h, R.n);
      pos.push(R.x + (mirrorX ? -x : x), R.y + y, R.z); uv.push(u, v > 1 ? v - 1 : v);
    }
  }
  for (let i = 0; i < dense.length - 1; i++) for (let k = 0; k < radial; k++) {
    const a = i * ringN + k, b = a + 1, c = a + ringN, d = c + 1;
    if (mirrorX) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const addCap = (ri, front) => {
    const R = dense[ri], ci = pos.length / 3;
    pos.push(R.x, R.y, R.z); uv.push((R.z - CAR_Z0) / (CAR_Z1 - CAR_Z0), 0.5);
    for (let k = 0; k < radial; k++) {
      const a = ri * ringN + k, b = a + 1;
      if (front !== mirrorX) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  if (capStart) addCap(0, true);
  if (capEnd) addCap(dense.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Flügelprofil (invertiert gewölbt) als Extrusion entlang der Spannweite (x) */
function wingGeometry(chord, thick, span, camber = 0.05) {
  const n = 16, up = [], lo = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos(i / n * Math.PI)) / 2;
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = -camber * 4 * x * (1 - x);
    up.push([x * chord, (yc + yt) * chord]); lo.push([x * chord, (yc - yt) * chord]);
  }
  const sh = new THREE.Shape();
  sh.moveTo(up[0][0], up[0][1]);
  for (let i = 1; i <= n; i++) sh.lineTo(up[i][0], up[i][1]);
  for (let i = n; i >= 0; i--) sh.lineTo(lo[i][0], lo[i][1]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, steps: 1, curveSegments: 4 });
  g.rotateY(-Math.PI / 2); g.translate(span / 2, 0, 0);
  return g;
}
function roundedBox(w, h, d, r = 0.01, seg = 3) {
  const sh = new THREE.Shape(), x = -w / 2, y = -h / 2;
  sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r); sh.lineTo(x + w, y + h - r);
  sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h); sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
  sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: r * 0.6, bevelSize: r * 0.6, bevelSegments: seg, curveSegments: seg });
  g.translate(0, 0, -d / 2);
  return g;
}
/** Geometrie in Liste nicht-indiziert machen (für mergeGeometries) */
function ni(g) { return g.index ? g.toNonIndexed() : g; }
function mergeNI(list) { return mergeGeometries(list.map(g => { const n = ni(g); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; })); }

/** Gemeinsame (geteilte) Geometrien aller Fahrzeuge */
const CarGeo = {
  ready: false,
  build() {
    if (this.ready) return;
    const spec = CAR_SPEC;
    const fy = spec.floorY;
    // --- Lackierte Karosserie ---
    const body = [];
    // Nase bis Cockpit-Vorderkante
    body.push(loftGeometry([
      { z: -2.68, w: 0.09, h: 0.07, y: -0.105, n: 2.2 }, { z: -2.48, w: 0.20, h: 0.12, y: -0.088, n: 2.5 },
      { z: -2.08, w: 0.29, h: 0.19, y: -0.045, n: 2.8 }, { z: -1.62, w: 0.37, h: 0.29, y: 0.025, n: 3.0 },
      { z: -1.16, w: 0.47, h: 0.39, y: 0.075, n: 3.3 }, { z: -0.82, w: 0.60, h: 0.47, y: 0.085, n: 3.6 },
    ], { radial: 30, sub: 4, capStart: true }));
    // Cockpitseiten (oben offen)
    this.cockpitSides = loftGeometry([
      { z: -0.82, w: 0.60, h: 0.47, y: 0.085, n: 3.6 }, { z: -0.45, w: 0.70, h: 0.47, y: 0.08, n: 3.8 },
      { z: -0.05, w: 0.78, h: 0.47, y: 0.075, n: 3.8 }, { z: 0.16, w: 0.78, h: 0.50, y: 0.09, n: 3.6 },
    ], { radial: 30, sub: 3, v0: 0.585, v1: 1.415 });
    // Motorabdeckung / Kopfstütze
    body.push(loftGeometry([
      { z: 0.12, w: 0.74, h: 0.50, y: 0.09, n: 3.4 }, { z: 0.45, w: 0.62, h: 0.52, y: 0.15, n: 3.0 },
      { z: 0.95, w: 0.44, h: 0.42, y: 0.13, n: 2.8 }, { z: 1.45, w: 0.26, h: 0.30, y: 0.09, n: 2.6 },
      { z: 1.95, w: 0.12, h: 0.16, y: 0.07, n: 2.4 },
    ], { radial: 28, sub: 4, capEnd: true }));
    // Airbox über dem Fahrerkopf
    body.push(loftGeometry([
      { z: 0.06, w: 0.20, h: 0.20, y: 0.55, n: 2.6 }, { z: 0.25, w: 0.27, h: 0.30, y: 0.54, n: 2.8 },
      { z: 0.6, w: 0.24, h: 0.30, y: 0.47, n: 2.6 }, { z: 1.05, w: 0.12, h: 0.18, y: 0.34, n: 2.4 }, { z: 1.4, w: 0.04, h: 0.05, y: 0.27, n: 2.2 },
    ], { radial: 22, sub: 4, capStart: true, capEnd: true }));
    // Seitenkästen (beidseitig)
    for (const sx of [-1, 1]) {
      body.push(loftGeometry([
        { z: -0.52, w: 0.34, h: 0.34, y: -0.02, n: 3.6, x: sx * 0.50 }, { z: -0.30, w: 0.42, h: 0.40, y: 0.0, n: 3.8, x: sx * 0.50 },
        { z: 0.30, w: 0.40, h: 0.36, y: -0.03, n: 3.4, x: sx * 0.47 }, { z: 0.90, w: 0.28, h: 0.26, y: -0.08, n: 3.0, x: sx * 0.40 },
        { z: 1.40, w: 0.12, h: 0.15, y: -0.12, n: 2.6, x: sx * 0.30 },
      ], { radial: 24, sub: 4, capEnd: true }));
    }
    this.body = mergeNI(body);
    // --- Karbon: Boden, Diffusor, Haifischflosse, Flügel, Halo, Spiegel ---
    const carbon = [];
    const floorShape = new THREE.Shape();
    const fp = [[-0.30, -1.35], [-0.62, -0.95], [-0.74, -0.55], [-0.76, 0.95], [-0.62, 1.30], [-0.52, 1.42], [0.52, 1.42], [0.62, 1.30], [0.76, 0.95], [0.74, -0.55], [0.62, -0.95], [0.30, -1.35]];
    floorShape.moveTo(fp[0][0], fp[0][1]); for (const p of fp.slice(1)) floorShape.lineTo(p[0], p[1]);
    const floor = new THREE.ExtrudeGeometry(floorShape, { depth: 0.028, bevelEnabled: false });
    floor.rotateX(Math.PI / 2); floor.translate(0, fy + 0.028, 0); carbon.push(floor);
    // Diffusor (ansteigende Platte + Finnen)
    const dif = new THREE.BoxGeometry(1.0, 0.012, 0.78); dif.rotateX(-0.30); dif.translate(0, fy + 0.11, 1.78); carbon.push(dif);
    for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) { const f = new THREE.BoxGeometry(0.008, 0.2, 0.7); f.translate(x, fy + 0.1, 1.78); carbon.push(f); }
    // Haifischflosse
    const fin = new THREE.Shape(); fin.moveTo(0.55, 0.36); fin.lineTo(2.06, 0.66); fin.lineTo(2.1, 0.28); fin.lineTo(0.9, 0.24); fin.lineTo(0.55, 0.36);
    const fing = new THREE.ExtrudeGeometry(fin, { depth: 0.012, bevelEnabled: false }); fing.rotateY(-Math.PI / 2); fing.translate(0.006, 0, 0); carbon.push(fing);
    // Frontflügel-Hauptblatt
    const fw = wingGeometry(0.30, 0.07, 1.82, 0.06); fw.rotateX(0.05); fw.translate(0, -0.165, -2.86); carbon.push(fw);
    // Pylonen Nase → Frontflügel
    for (const x of [-0.07, 0.07]) { const p = new THREE.BoxGeometry(0.012, 0.09, 0.22); p.translate(x, -0.13, -2.58); carbon.push(p); }
    // Heckflügel-Hauptblatt, Beam-Wing, Schwanenhals
    const rw = wingGeometry(0.26, 0.09, 1.0, 0.07); rw.rotateX(0.12); rw.translate(0, 0.50, 2.08); carbon.push(rw);
    const bw = wingGeometry(0.16, 0.08, 0.86, 0.05); bw.rotateX(0.18); bw.translate(0, 0.13, 2.12); carbon.push(bw);
    const swan = new THREE.BoxGeometry(0.03, 0.42, 0.06); swan.translate(0, 0.33, 2.22); carbon.push(swan);
    // Crash-Struktur hinten
    const crash = new THREE.BoxGeometry(0.16, 0.12, 0.42); crash.translate(0, 0.04, 2.16); carbon.push(crash);
    // Halo
    const haloPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.31, 0.33, 0.08), new THREE.Vector3(-0.31, 0.50, -0.04), new THREE.Vector3(-0.25, 0.62, -0.34),
      new THREE.Vector3(0, 0.648, -0.62), new THREE.Vector3(0.25, 0.62, -0.34), new THREE.Vector3(0.31, 0.50, -0.04), new THREE.Vector3(0.31, 0.33, 0.08),
    ]);
    this.halo = new THREE.TubeGeometry(haloPath, 48, 0.024, 10, false);
    const pillar = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.30, -0.92), new THREE.Vector3(0, 0.48, -0.82), new THREE.Vector3(0, 0.64, -0.64)]), 12, 0.021, 8, false);
    this.halo = mergeNI([this.halo, pillar]);
    // Spiegel (Gehäuse) + Stiele
    for (const sx of [-1, 1]) {
      const m = roundedBox(0.13, 0.06, 0.05, 0.012, 2); m.translate(sx * 0.44, 0.40, -0.50); carbon.push(m);
      const st = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6); st.rotateZ(Math.PI / 2 * 0.6 * sx); st.translate(sx * 0.37, 0.35, -0.50); carbon.push(st);
    }
    this.carbon = mergeNI(carbon);
    this.mirrorGlass = new THREE.PlaneGeometry(0.115, 0.048);
    // Endplatten (lackiert)
    const endp = [];
    for (const sx of [-1, 1]) {
      const ef = new THREE.BoxGeometry(0.012, 0.17, 0.48); ef.translate(sx * 0.915, -0.105, -2.66); endp.push(ef);
      const er = new THREE.BoxGeometry(0.012, 0.44, 0.52); er.translate(sx * 0.505, 0.50, 2.24); endp.push(er);
    }
    this.endplates = mergeNI(endp);
    // Bewegliche Elemente: Frontflügel-Klappen (2) und Heckflügel-Klappe – Drehpunkt an der Vorderkante
    this.fwFlap1 = wingGeometry(0.17, 0.08, 1.80, 0.07);
    this.fwFlap2 = wingGeometry(0.13, 0.09, 1.78, 0.08);
    this.rwFlap = wingGeometry(0.19, 0.10, 0.99, 0.08);
    // Cockpit-Innenraum (dunkel) und Polster
    const inner = loftGeometry([
      { z: -0.80, w: 0.56, h: 0.42, y: 0.08, n: 3.4 }, { z: -0.05, w: 0.72, h: 0.42, y: 0.07, n: 3.6 }, { z: 0.14, w: 0.72, h: 0.44, y: 0.08, n: 3.4 },
    ], { radial: 24, sub: 2, mirrorX: true });
    this.interior = inner;
    const rimPts = [];
    for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2; rimPts.push(new THREE.Vector3(Math.sin(a) * 0.205, 0.315, -0.33 + Math.cos(a) * 0.46)); }
    this.rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 48, 0.022, 8, true);
    // Rücklicht
    this.rainLight = new THREE.BoxGeometry(0.09, 0.05, 0.02);
    // Helm
    this.helmet = new THREE.SphereGeometry(0.135, 24, 16);
    this.visor = new THREE.SphereGeometry(0.137, 24, 8, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.33, Math.PI * 0.2);
    // Räder
    this.wheel = {};
    for (const [key, R, W] of [['F', spec.rF, spec.tyreWidthF], ['R', spec.rR, spec.tyreWidthR]]) {
      const rimR = 0.229;
      const tread = new THREE.CylinderGeometry(R - 0.004, R - 0.004, W - 0.05, 40, 1, true); tread.rotateZ(Math.PI / 2);
      const shoulders = [];
      for (const s of [-1, 1]) { const t = new THREE.TorusGeometry(R - 0.028, 0.026, 8, 40); t.rotateY(Math.PI / 2); t.translate(s * (W / 2 - 0.026), 0, 0); shoulders.push(t); }
      const side = new THREE.RingGeometry(rimR, R - 0.03, 40, 1);
      const rimFace = new THREE.CircleGeometry(rimR, 32);
      const barrel = new THREE.CylinderGeometry(rimR - 0.005, rimR - 0.005, W * 0.86, 28, 1, true); barrel.rotateZ(Math.PI / 2);
      const disc = new THREE.CylinderGeometry(0.165, 0.165, 0.032, 28); disc.rotateZ(Math.PI / 2);
      this.wheel[key] = { tread: mergeNI([tread, ...shoulders]), side, rimFace, barrel, disc, R, W, rimR };
    }
    // Querlenker-Stab (Einheitslänge entlang y)
    this.rod = new THREE.CylinderGeometry(0.011, 0.011, 1, 6); this.rod.translate(0, 0.5, 0);
    this.ready = true;
  },
};

/** Lenkrad mit Display, Schaltblitz-LEDs und Händen */
class SteeringWheelModel {
  constructor(team) {
    this.group = new THREE.Group();
    const carbon = new THREE.MeshStandardMaterial({ map: Tex.carbon(), roughness: 0.4, metalness: 0.3 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.95 });
    const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(team.colors[0]), roughness: 0.5 });
    const body = roundedBox(0.205, 0.105, 0.03, 0.018, 3);
    this.group.add(new THREE.Mesh(body, carbon));
    for (const s of [-1, 1]) {
      const grip = new THREE.CapsuleGeometry(0.023, 0.085, 6, 12); grip.rotateZ(s * 0.12); grip.translate(s * 0.128, -0.006, 0);
      this.group.add(new THREE.Mesh(grip, rubber));
      const horn = new THREE.BoxGeometry(0.05, 0.016, 0.022); horn.rotateZ(s * -0.5); horn.translate(s * 0.105, 0.05, 0);
      this.group.add(new THREE.Mesh(horn, carbon));
      const pad = new THREE.Mesh(paddleGeo(), carbon); pad.position.set(s * 0.075, 0.018, -0.03); pad.scale.x = s; this.group.add(pad);
      // Drehregler
      const knob = new THREE.CylinderGeometry(0.0105, 0.0105, 0.012, 14); knob.rotateX(Math.PI / 2); knob.translate(s * 0.075, -0.03, 0.03);
      this.group.add(new THREE.Mesh(knob, accent));
    }
    // Knöpfe
    const cols = [0xd8262c, 0xf2c200, 0x2e7de1, 0xf2f2f2, 0x29b34a, 0xf07a1a];
    cols.forEach((c, i) => {
      const b = new THREE.CylinderGeometry(0.0062, 0.0062, 0.006, 10); b.rotateX(Math.PI / 2);
      const x = (i % 3 - 1) * 0.022 + (i < 3 ? -0.0 : 0), y = i < 3 ? -0.03 : -0.045;
      b.translate((i < 3 ? -1 : 1) * (0.045 + (i % 3) * 0.012), y + (i % 3) * 0.006, 0.028);
      this.group.add(new THREE.Mesh(b, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 })));
    });
    // Display
    this.canvas = document.createElement('canvas'); this.canvas.width = 256; this.canvas.height = 144;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.098, 0.055), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    disp.position.set(0, 0.008, 0.0275); this.group.add(disp);
    // LEDs (5 grün, 5 rot, 5 blau)
    this.leds = []; this.ledCols = []; this.ledDim = [];
    const ledGeo = new THREE.BoxGeometry(0.0075, 0.006, 0.004);
    for (let i = 0; i < 15; i++) {
      const col = i < 5 ? 0x22ff44 : (i < 10 ? 0xff2222 : 0x3377ff);
      const m = new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false });
      const led = new THREE.Mesh(ledGeo, m); led.position.set(-0.063 + i * 0.009, 0.0445, 0.0285);
      this.group.add(led); this.leds.push(m); this.ledCols.push(new THREE.Color(col)); this.ledDim.push(new THREE.Color(col).multiplyScalar(0.08));
    }
    // Hände (Handschuhe in Teamfarben)
    this.hands = new THREE.Group();
    const glove = new THREE.MeshStandardMaterial({ color: new THREE.Color(team.colors[0]).lerp(new THREE.Color(0x101010), 0.45), roughness: 0.85 });
    const glove2 = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.9 });
    for (const s of [-1, 1]) {
      const palm = new THREE.CapsuleGeometry(0.026, 0.046, 6, 10); palm.rotateZ(s * 0.12); palm.scale(1.05, 1, 0.85);
      const mp = new THREE.Mesh(palm, glove); mp.position.set(s * 0.131, -0.004, -0.002); this.hands.add(mp);
      const thumb = new THREE.CapsuleGeometry(0.0095, 0.03, 4, 8); thumb.rotateZ(s * 1.1);
      const mt = new THREE.Mesh(thumb, glove); mt.position.set(s * 0.109, 0.018, 0.02); this.hands.add(mt);
      const cuff = new THREE.CylinderGeometry(0.024, 0.028, 0.05, 10); cuff.rotateX(Math.PI / 2 - 1.05);
      const mc = new THREE.Mesh(cuff, glove2); mc.position.set(s * 0.137, -0.042, 0.03); this.hands.add(mc);
    }
    this.group.add(this.hands);
    this.lastDraw = 0;
  }
  /** Display und LEDs aktualisieren */
  update(veh, info, now) {
    const rpm = veh.rpm, lim = veh.spec.engine.limitRpm;
    const blink = veh.limiterCut || rpm > lim - 60 ? (Math.floor(now * 12) % 2) : 1;
    const start = lim * 0.707, step = (lim - 250 - start) / 15;
    for (let i = 0; i < 15; i++) {
      const on = rpm > start + i * step && blink;
      this.leds[i].color.copy(on ? this.ledCols[i] : this.ledDim[i]);
    }
    if (now - this.lastDraw < 1 / 12) return;
    this.lastDraw = now;
    const g = this.ctx, w = 256, h = 144;
    g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h);
    // Reifentemperaturen (oben)
    veh.wheels.forEach((wh, i) => { g.fillStyle = tyreTempColor(wh.tyre.tEff, wh.tyre.c); g.fillRect(8 + (i % 2) * 22, 8 + Math.floor(i / 2) * 26, 18, 22); });
    g.fillStyle = '#9aa3ad'; g.font = '700 15px Arial'; g.textAlign = 'left';
    g.fillText(fmtNum(veh.brakeBias * 100, 1), 58, 24); g.fillText('BB', 58, 42);
    // Gang
    g.textAlign = 'center'; g.fillStyle = veh.shiftDenied > 0 ? '#ff4040' : '#ffffff'; g.font = '900 78px Arial';
    const gear = veh.gear === 0 ? 'N' : (veh.gear < 0 ? 'R' : String(veh.gear));
    g.fillText(gear, w / 2, 92);
    // Geschwindigkeit, Delta
    g.font = '800 26px Arial'; g.textAlign = 'right'; g.fillStyle = '#fff'; g.fillText(String(Math.round(veh.speedKmh)), w - 10, 34);
    g.font = '700 13px Arial'; g.fillStyle = '#9aa3ad'; g.fillText('KM/H', w - 10, 50);
    if (info && info.delta !== null && info.delta !== undefined && isFinite(info.delta)) {
      g.font = '800 22px Arial'; g.fillStyle = info.delta <= 0 ? '#2fe36b' : '#ff4b4b';
      g.fillText((info.delta > 0 ? '+' : '−') + Math.abs(info.delta).toFixed(2), w - 10, 84);
    }
    // Energie
    const soc = veh.socFrac;
    g.fillStyle = '#1b2633'; g.fillRect(10, h - 34, w - 20, 14);
    g.fillStyle = veh.overtakeActive ? '#ff3bd4' : (veh.harvesting ? '#2fe3c6' : '#2f8bff'); g.fillRect(10, h - 34, (w - 20) * soc, 14);
    g.font = '800 14px Arial'; g.textAlign = 'left'; g.fillStyle = '#fff';
    g.fillText(ERS_NAMES[veh.ersMode].toUpperCase(), 10, h - 6);
    g.textAlign = 'right'; g.fillText(Math.round(soc * 100) + '%', w - 10, h - 6);
    if (veh.aeroFlap > 0.5) { g.textAlign = 'left'; g.fillStyle = '#2fe36b'; g.font = '900 16px Arial'; g.fillText('X-MODE', 10, 92); }
    if (veh.pitLimiter) { g.fillStyle = '#ffd400'; g.font = '900 16px Arial'; g.textAlign = 'left'; g.fillText('LIMIT', 10, 74); }
    this.tex.needsUpdate = true;
  }
}
function paddleGeo() {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.06, 0.012); s.lineTo(0.075, -0.035); s.lineTo(0.01, -0.03); s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false }); g.translate(0, 0, -0.002);
  return g;
}
function tyreTempColor(T, c) {
  const lo = c.tOpt - c.tWin, hi = c.tOpt + c.tWin;
  if (T < lo - 25) return '#2f6bff'; if (T < lo) return '#38c6ff'; if (T <= hi) return '#2fe36b'; if (T < hi + 20) return '#ffb02e'; return '#ff3b3b';
}

/** Ein sichtbares Fahrzeug */
class CarVisual {
  constructor(team, number, { detail = 'high', physical = true } = {}) {
    CarGeo.build();
    this.team = team; this.number = number;
    const G = CarGeo;
    const root = this.root = new THREE.Group();
    const livery = Tex.livery(team, number);
    const paintParams = { map: livery, roughness: 0.32, metalness: 0.25 };
    this.paint = physical ? new THREE.MeshPhysicalMaterial(Object.assign({}, paintParams, { clearcoat: 0.9, clearcoatRoughness: 0.12 })) : new THREE.MeshStandardMaterial(paintParams);
    this.carbonMat = new THREE.MeshStandardMaterial({ map: Tex.carbon(), color: 0x9a9aa0, roughness: 0.42, metalness: 0.35 });
    this.endMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(team.colors[0]), roughness: 0.35, metalness: 0.2 });
    const add = (geo, mat, parent = root, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };
    const fine = [], mid = [], cast = [];
    cast.push(add(G.body, this.paint));
    this.cockpit = add(G.cockpitSides, new THREE.MeshStandardMaterial(Object.assign({}, paintParams, { side: THREE.DoubleSide })));
    cast.push(add(G.carbon, this.carbonMat));
    cast.push(add(G.endplates, this.endMat));
    mid.push(this.cockpit);
    mid.push(this.haloMesh = add(G.halo, new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.35, metalness: 0.6 })));
    fine.push(add(G.interior, new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.9, side: THREE.DoubleSide }), root, false));
    mid.push(add(G.rim, new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.95 }), root, false));
    for (const sx of [-1, 1]) {
      const mg = new THREE.Mesh(G.mirrorGlass, new THREE.MeshStandardMaterial({ color: 0x8fa6c0, roughness: 0.05, metalness: 1.0 }));
      mg.position.set(sx * 0.44, 0.40, -0.474); root.add(mg); fine.push(mg);
    }
    // Bewegliche Flügelklappen
    this.fwFlaps = [];
    for (const [geo, z, y, a] of [[G.fwFlap1, -2.62, -0.135, 0.28], [G.fwFlap2, -2.47, -0.085, 0.52]]) {
      const pv = new THREE.Group(); pv.position.set(0, y, z); root.add(pv);
      add(geo, this.carbonMat, pv); pv.rotation.x = a; pv.userData.base = a; this.fwFlaps.push(pv);
    }
    this.rwPivot = new THREE.Group(); this.rwPivot.position.set(0, 0.62, 2.20); root.add(this.rwPivot);
    add(G.rwFlap, this.endMat, this.rwPivot);
    // Rücklicht
    this.lightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1010, emissiveIntensity: 0 });
    const rl = new THREE.Mesh(G.rainLight, this.lightMat); rl.position.set(0, 0.04, 2.385); root.add(rl); mid.push(rl);
    // Fahrerhelm
    this.helmet = new THREE.Group(); this.helmet.position.set(0, 0.49, -0.17);
    const hm = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(team.colors[1]), roughness: 0.25, clearcoat: 1 });
    this.helmet.add(new THREE.Mesh(G.helmet, hm));
    const vm = new THREE.Mesh(G.visor, new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.9 })); vm.rotation.y = Math.PI; this.helmet.add(vm);
    root.add(this.helmet);
    // Räder
    this.wheels = [];
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.88 });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = i % 2 === 0, sgn = left ? -1 : 1;
      const wg = G.wheel[front ? 'F' : 'R'];
      const rootW = new THREE.Group(), steer = new THREE.Group(), spin = new THREE.Group();
      rootW.add(steer); steer.add(spin); root.add(rootW);
      const tm = new THREE.Mesh(wg.tread, tyreMat); tm.castShadow = true; spin.add(tm); cast.push(tm);
      const sideMat = new THREE.MeshStandardMaterial({ map: Tex.tyreSide(COMPOUNDS.medium.color), roughness: 0.85 });
      const sideMatIn = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9 });
      const so = new THREE.Mesh(wg.side, sideMat); so.rotation.y = sgn * Math.PI / 2; so.position.x = sgn * wg.W / 2; spin.add(so); mid.push(so);
      const si = new THREE.Mesh(wg.side, sideMatIn); si.rotation.y = -sgn * Math.PI / 2; si.position.x = -sgn * wg.W / 2; spin.add(si); fine.push(si);
      const rimMat = new THREE.MeshStandardMaterial({ map: Tex.rim(false), roughness: 0.4, metalness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide });
      const rf = new THREE.Mesh(wg.rimFace, rimMat); rf.rotation.y = sgn * Math.PI / 2; rf.position.x = sgn * (wg.W / 2 - 0.035); spin.add(rf); mid.push(rf);
      const br = new THREE.Mesh(wg.barrel, barrelMat); spin.add(br); fine.push(br);
      const glow = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.5, metalness: 0.3, emissive: 0xff5a10, emissiveIntensity: 0 });
      const disc = new THREE.Mesh(wg.disc, glow); disc.position.x = -sgn * 0.02; steer.add(disc); fine.push(disc);
      this.wheels.push({ root: rootW, steer, spin, sideMat, rimMat, glow, blurred: false, compound: 'medium' });
    }
    // Querlenker (dynamisch)
    this.rods = [];
    if (detail === 'high') {
      const rodMat = this.carbonMat;
      const defs = [];
      for (let i = 0; i < 4; i++) {
        const front = i < 2, s = i % 2 === 0 ? -1 : 1;
        const z = front ? -CAR_SPEC.wheelbase * (1 - CAR_SPEC.frontWeight) : CAR_SPEC.wheelbase * CAR_SPEC.frontWeight;
        const cy = front ? 0.0 : -0.05;
        defs.push([i, [s * 0.27, cy + 0.17, z + 0.20], [-s * 0.07, 0.12, 0]], [i, [s * 0.25, cy + 0.17, z - 0.20], [-s * 0.07, 0.12, 0]]);
        defs.push([i, [s * 0.23, cy - 0.07, z + 0.24], [-s * 0.06, -0.12, 0]], [i, [s * 0.22, cy - 0.07, z - 0.22], [-s * 0.06, -0.12, 0]]);
        defs.push([i, [s * 0.16, cy + 0.25, z + (front ? 0.05 : -0.05)], [-s * 0.07, -0.10, 0]]);
        defs.push([i, [s * 0.24, cy + 0.02, z + (front ? -0.1 : 0.12)], [-s * 0.07, 0.0, front ? -0.11 : 0.11]]);
      }
      for (const [w, a, b] of defs) { const m = new THREE.Mesh(G.rod, rodMat); m.castShadow = true; root.add(m); this.rods.push({ w, a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), mesh: m }); }
    }
    // Lenkrad (Cockpit)
    this.sw = new SteeringWheelModel(team);
    this.swPivot = new THREE.Group(); this.swPivot.position.set(0, 0.272, -0.655); this.swPivot.rotation.x = -0.28;
    this.swPivot.add(this.sw.group); root.add(this.swPivot);
    this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
    this.cockpitView = false;
    // Detailstufen: fine = ab Stufe 1 aus, mid = ab Stufe 2 aus (siehe setCarLod)
    this.lodFine = fine.concat(this.rods.map(r => r.mesh)); this.lodMid = mid.concat(this.fwFlaps, [this.rwPivot, this.helmet]);
    this.shadowMeshes = cast.concat([this.cockpit]);
    root.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
    this.applyEraLook();
  }
  /**
   * Epochen-Optik: Halo nur ab 2018, Karosserie auf Radstand/Breite der Epoche skaliert
   * (die Räder sitzen ohnehin dort, wo die Physik sie hat).
   */
  applyEraLook() {
    const E = typeof eraOf === 'function' ? eraOf(CAR_SPEC.era || 'e2026') : { halo: true, width: 1 };
    const sz = (CAR_SPEC.wheelbase || 3.4) / 3.4, sx = E.width || 1;
    const wheelRoots = new Set(this.wheels.map(w => w.root)), rods = new Set(this.rods.map(r => r.mesh));
    for (const o of this.root.children) {
      if (wheelRoots.has(o) || rods.has(o)) continue;
      if (!o.userData.p0) o.userData.p0 = o.position.clone();
      o.position.set(o.userData.p0.x * sx, o.userData.p0.y, o.userData.p0.z * sz);
      if (o === this.helmet || o === this.swPivot) continue;
      o.scale.set(sx, 1, sz);
    }
    for (const r of this.rods) { if (!r.a0) r.a0 = r.a.clone(); r.a.set(r.a0.x * sx, r.a0.y, r.a0.z * sz); }
    if (this.haloMesh) this.haloMesh.visible = E.halo !== false;
    this.haloOn = E.halo !== false;
  }

  /** Schatten nur von den großen Teilen (Kleinteile verdoppeln sonst die Draw Calls im Schattenpass) */
  setShadows(on) { this.root.traverse(o => { if (o.isMesh) o.castShadow = false; }); if (on) for (const m of this.shadowMeshes) m.castShadow = true; }
  setCompound(id) {
    for (const w of this.wheels) if (w.compound !== id) { w.compound = id; w.sideMat.map = Tex.tyreSide(COMPOUNDS[id].color, w.blurred); w.sideMat.needsUpdate = true; }
  }
  setCockpitView(on, opts = {}) {
    this.cockpitView = on;
    this.helmet.visible = !on;
    this.sw.group.visible = !(on && opts.hideWheel);
    this.sw.hands.visible = !(on && opts.hideHands);
  }

  /** Zustand aus der Physik übernehmen (interpoliert) */
  update(veh, alpha, steerDeg, info, now) {
    const r = this.root;
    r.position.set(lerp(veh.prevPos.x, veh.pos.x, alpha), lerp(veh.prevPos.y, veh.pos.y, alpha), lerp(veh.prevPos.z, veh.pos.z, alpha));
    this._q.set(veh.prevQ.x, veh.prevQ.y, veh.prevQ.z, veh.prevQ.w);
    r.quaternion.set(veh.q.x, veh.q.y, veh.q.z, veh.q.w);
    this._q.slerp(r.quaternion, alpha); r.quaternion.copy(this._q);
    // Räder: Federweg, Lenkung, Drehung, Bewegungsunschärfe, Bremsglühen
    for (let i = 0; i < 4; i++) {
      const w = veh.wheels[i], vw = this.wheels[i];
      vw.root.position.set(w.lx, w.yTop - w.L, w.lz);
      vw.steer.rotation.y = -w.steer;
      vw.spin.rotation.x = -(w.spin % (Math.PI * 2));
      const blur = Math.abs(w.omega) > 28;
      if (blur !== vw.blurred) {
        vw.blurred = blur;
        vw.rimMat.map = Tex.rim(blur); vw.rimMat.needsUpdate = true;
        vw.sideMat.map = Tex.tyreSide(COMPOUNDS[vw.compound].color, blur); vw.sideMat.needsUpdate = true;
      }
      vw.glow.emissiveIntensity = smoothstep(480, 1000, w.brakeTemp) * 2.5;
    }
    this.setCompound(veh.compound);
    // Aktive Aerodynamik sichtbar: Klappen öffnen im Geradenmodus
    const fl = veh.aeroFlap;
    this.rwPivot.rotation.x = lerp(0.52, 0.10, fl);
    this.fwFlaps.forEach((p, k) => { p.rotation.x = p.userData.base * lerp(1, 0.45, fl); });
    // Rücklicht blinkt bei Rekuperation
    this.lightMat.emissiveIntensity = veh.harvesting && (Math.floor(now * 4) % 2 === 0) ? 4 : (veh.pitLimiter ? 2 : 0.0);
    // Querlenker
    for (const rd of this.rods) {
      const w = veh.wheels[rd.w];
      const cx = w.lx, cy = w.yTop - w.L, cz = w.lz, st = -w.steer;
      const bx = rd.b.x * Math.cos(st) + rd.b.z * Math.sin(st), bz = -rd.b.x * Math.sin(st) + rd.b.z * Math.cos(st);
      const p = this._v.set(cx + bx, cy + rd.b.y, cz + bz);
      const d = this._v2.subVectors(p, rd.a); const len = d.length();
      rd.mesh.position.copy(rd.a); rd.mesh.scale.set(1, len, 1);
      rd.mesh.quaternion.setFromUnitVectors(this._up, d.multiplyScalar(1 / len));
    }
    // Lenkrad (1:1 zum realen Lenkrad, Anschlag ±180°)
    this.sw.group.rotation.z = -clamp(steerDeg, -CAR_SPEC.steerLockDeg, CAR_SPEC.steerLockDeg) * DEG;
    if (this.cockpitView || this.sw.group.visible) this.sw.update(veh, info, now);
  }
}
