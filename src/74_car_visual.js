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
  cache: new Map(),
  /** Geometriesatz für die aktive Epoche (Modell aus den Epochendaten, Räder aus CAR_SPEC) */
  get() {
    const E = typeof eraOf === 'function' ? eraOf(CAR_SPEC.era || 'e2026') : null, S = CAR_SPEC;
    const key = (E ? E.id : '-') + '|' + [S.rF, S.rR, S.tyreWidthF, S.tyreWidthR, S.floorY].join(',');
    let G = this.cache.get(key);
    if (!G) { G = buildCarGeo(carModelOf(E && E.model), S); this.cache.set(key, G); }
    return G;
  },
};
/** Alle Fahrzeuggeometrien aus einem Modell (Daten) erzeugen */
function buildCarGeo(M, spec) {
    const G = {};
    const fy = spec.floorY;
    // --- Lackierte Karosserie ---
    const body = [];
    // Nase bis Cockpit-Vorderkante – drei Epochen-Varianten (tief 2014/2022+, mittel 2017–21, hoch bis 2013)
    // eigene Nase (Mod): nur diese Form, keine Höhenvarianten
    const NOSE = M.nose, FW = M.frontWing, RW = M.rearWing, nz0 = NOSE[0].z, nz1 = NOSE[NOSE.length - 1].z;
    G.nose = {}; G.pylons = {};
    for (const [key, lift0] of [['low', 0], ['mid', 0.08], ['high', 0.17]]) {
      const lift = M.customNose ? 0 : lift0;
      const secs = NOSE.map(q => { const f = clamp((nz1 - q.z) / Math.max(0.1, nz1 - nz0), 0, 1); return Object.assign({}, q, { y: (q.y || 0) + lift * Math.sqrt(f), h: q.h * (1 - 0.12 * f * (lift > 0.1 ? 1 : 0)) }); });
      G.nose[key] = loftGeometry(secs, { radial: 30, sub: 4, capStart: true });
      // Pylonen Nase → Frontflügel (Länge aus Nasenunterkante und Flügelhöhe)
      const pz = FW.z + 0.28, tipQ = secs.reduce((b, q) => Math.abs(q.z - pz) < Math.abs(b.z - pz) ? q : b, secs[0]);
      const pyl = [], top = (tipQ.y || 0) - tipQ.h * 0.35, bot = FW.y - 0.01, hgt = Math.max(0.02, top - bot);
      for (const x of [-0.07, 0.07]) { const p = new THREE.BoxGeometry(0.012, hgt, 0.22); p.translate(x, bot + hgt / 2, pz); pyl.push(p); }
      G.pylons[key] = mergeNI(pyl);
      if (M.customNose) { G.nose.mid = G.nose.high = G.nose.low; G.pylons.mid = G.pylons.high = G.pylons.low; break; }
    }
    // Cockpitseiten (oben offen)
    G.cockpitSides = loftGeometry(M.cockpit, { radial: 30, sub: 3, v0: 0.585, v1: 1.415 });
    // Motorabdeckung / Kopfstütze
    body.push(loftGeometry(M.engineCover, { radial: 28, sub: 4, capEnd: true }));
    // Airbox über dem Fahrerkopf
    if (M.airbox && M.airbox.length) body.push(loftGeometry(M.airbox, { radial: 22, sub: 4, capStart: true, capEnd: true }));
    // Seitenkästen (beidseitig)
    if (M.sidepod && M.sidepod.length) for (const sx of [-1, 1]) body.push(loftGeometry(M.sidepod.map(q => Object.assign({}, q, { x: sx * Math.abs(q.x || 0) })), { radial: 24, sub: 4, capEnd: true }));
    G.body = mergeNI(body);
    // --- Karbon: Boden, Diffusor, Haifischflosse, Flügel, Halo, Spiegel ---
    const carbon = [];
    const floorShape = new THREE.Shape();
    const fp = M.floor;
    floorShape.moveTo(fp[0][0], fp[0][1]); for (const p of fp.slice(1)) floorShape.lineTo(p[0], p[1]);
    const floor = new THREE.ExtrudeGeometry(floorShape, { depth: 0.028, bevelEnabled: false });
    floor.rotateX(Math.PI / 2); floor.translate(0, fy + 0.028, 0); carbon.push(floor);
    // Diffusor (ansteigende Platte + Finnen)
    const difL = [], dif = new THREE.BoxGeometry(1.0, 0.012, 0.78); dif.rotateX(-0.30); dif.translate(0, fy + 0.11, 1.78); difL.push(dif);
    for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) { const f = new THREE.BoxGeometry(0.008, 0.2, 0.7); f.translate(x, fy + 0.1, 1.78); difL.push(f); }
    G.diffuser = mergeNI(difL);
    // Haifischflosse
    const fin = new THREE.Shape(); fin.moveTo(0.55, 0.36); fin.lineTo(2.06, 0.66); fin.lineTo(2.1, 0.28); fin.lineTo(0.9, 0.24); fin.lineTo(0.55, 0.36);
    const fing = new THREE.ExtrudeGeometry(fin, { depth: 0.012, bevelEnabled: false }); fing.rotateY(-Math.PI / 2); fing.translate(0.006, 0, 0); G.fin = fing;
    // Frontflügel-Hauptblatt
    const fw = wingGeometry(FW.chord, FW.thick, FW.span, FW.camber); fw.rotateX(0.05); fw.translate(0, FW.y, FW.z); G.fwMain = fw;
    // Heckflügel-Hauptblatt, Beam-Wing, Schwanenhals
    const rw = wingGeometry(RW.chord, RW.thick, RW.span, RW.camber); rw.rotateX(0.12); rw.translate(0, RW.y, RW.z); G.rwMain = rw;
    const bw = wingGeometry(0.16, 0.08, RW.span * 0.86, 0.05); bw.rotateX(0.18); bw.translate(0, 0.13, RW.z + 0.04); G.beam = bw;
    // Bargeboards (1995–2021): Leitbleche vor den Seitenkästen
    const bb = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(-0.95, -0.17); sh.lineTo(-0.45, -0.17); sh.lineTo(-0.5, 0.12); sh.quadraticCurveTo(-0.8, 0.14, -0.95, -0.02); sh.lineTo(-0.95, -0.17);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(sx * 0.62, 0, 0); bb.push(g);
      const t = new THREE.BoxGeometry(0.16, 0.01, 0.3); t.translate(sx * 0.68, 0.11, -0.7); bb.push(t);
    }
    G.barge = mergeNI(bb);
    const swH = Math.max(0.1, RW.y - 0.08), swan = new THREE.BoxGeometry(0.03, swH, 0.06); swan.translate(0, 0.12 + swH / 2, RW.z + 0.14); G.swan = swan;
    // Crash-Struktur hinten
    const crash = new THREE.BoxGeometry(0.16, 0.12, 0.42); crash.translate(0, 0.04, 2.16); carbon.push(crash);
    // Halo
    const haloPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.31, 0.33, 0.08), new THREE.Vector3(-0.31, 0.50, -0.04), new THREE.Vector3(-0.25, 0.62, -0.34),
      new THREE.Vector3(0, 0.648, -0.62), new THREE.Vector3(0.25, 0.62, -0.34), new THREE.Vector3(0.31, 0.50, -0.04), new THREE.Vector3(0.31, 0.33, 0.08),
    ]);
    G.halo = new THREE.TubeGeometry(haloPath, 48, 0.024, 10, false);
    const pillar = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.30, -0.92), new THREE.Vector3(0, 0.48, -0.82), new THREE.Vector3(0, 0.64, -0.64)]), 12, 0.021, 8, false);
    G.halo = mergeNI([G.halo, pillar]);
    // Spiegel (Gehäuse) + Stiele
    for (const sx of [-1, 1]) {
      const m = roundedBox(0.13, 0.06, 0.05, 0.012, 2); m.translate(sx * 0.44, 0.40, -0.50); carbon.push(m);
      const st = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6); st.rotateZ(Math.PI / 2 * 0.6 * sx); st.translate(sx * 0.37, 0.35, -0.50); carbon.push(st);
    }
    G.carbon = mergeNI(carbon);
    G.mirrorGlass = new THREE.PlaneGeometry(0.115, 0.048);
    // Endplatten (lackiert)
    const endF = [], endR = [];
    for (const sx of [-1, 1]) {
      const ef = new THREE.BoxGeometry(0.012, 0.17, 0.48); ef.translate(sx * (FW.span / 2 + 0.005), FW.y + 0.06, FW.z + 0.2); endF.push(ef);
      const er = new THREE.BoxGeometry(0.012, 0.44, 0.52); er.translate(sx * (RW.span / 2 + 0.005), RW.y, RW.z + 0.16); endR.push(er);
    }
    G.endF = mergeNI(endF); G.endR = mergeNI(endR);
    // Bewegliche Elemente: Frontflügel-Klappen (2) und Heckflügel-Klappe – Drehpunkt an der Vorderkante
    G.fwFlap1 = wingGeometry(FW.chord * 0.57, 0.08, FW.span - 0.02, 0.07);
    G.fwFlap2 = wingGeometry(FW.chord * 0.43, 0.09, FW.span - 0.04, 0.08);
    G.rwFlap = wingGeometry(RW.chord * 0.73, 0.10, RW.span - 0.01, 0.08);
    G.fwFlaps = clamp(Math.round(FW.flaps ?? 2), 0, 2); G.rwFlaps = clamp(Math.round(RW.flaps ?? 1), 0, 1); G.FW = FW; G.RW = RW;
    // Cockpit-Innenraum (dunkel) und Polster
    // Innenraum folgt der Cockpitwanne (etwas kleiner), damit er bei eigenen Modellen nicht durchschaut
    const CK = M.cockpit, inner = loftGeometry(CK.map((q, i) => ({ z: q.z + (i === 0 ? 0.02 : i === CK.length - 1 ? -0.02 : 0), w: q.w * 0.92, h: q.h * 0.9, y: (q.y || 0) - 0.005, n: Math.max(2, (q.n || 3) - 0.2), x: q.x || 0 })), { radial: 24, sub: 2, mirrorX: true });
    G.interior = inner;
    const rimPts = [];
    for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2; rimPts.push(new THREE.Vector3(Math.sin(a) * 0.205, 0.315, -0.33 + Math.cos(a) * 0.46)); }
    G.rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 48, 0.022, 8, true);
    // Rücklicht
    G.rainLight = new THREE.BoxGeometry(0.09, 0.05, 0.02);
    // Helm
    G.helmet = new THREE.SphereGeometry(0.135, 24, 16);
    G.visor = new THREE.SphereGeometry(0.137, 24, 8, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.33, Math.PI * 0.2);
    // Räder
    G.wheel = {};
    for (const [key, R, W] of [['F', spec.rF, spec.tyreWidthF], ['R', spec.rR, spec.tyreWidthR]]) {
      const rimR = 0.229;
      const tread = new THREE.CylinderGeometry(R - 0.004, R - 0.004, W - 0.05, 40, 1, true); tread.rotateZ(Math.PI / 2);
      const shoulders = [];
      // Schultern: UV auf (0,0) → die Rillen-Textur (1998–2008) bleibt auf der Lauffläche
      for (const s of [-1, 1]) { const t = new THREE.TorusGeometry(R - 0.028, 0.026, 8, 40); t.rotateY(Math.PI / 2); t.translate(s * (W / 2 - 0.026), 0, 0); t.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(t.attributes.position.count * 2), 2)); shoulders.push(t); }
      const side = new THREE.RingGeometry(rimR, R - 0.03, 40, 1);
      const rimFace = new THREE.CircleGeometry(rimR, 32);
      const barrel = new THREE.CylinderGeometry(rimR - 0.005, rimR - 0.005, W * 0.86, 28, 1, true); barrel.rotateZ(Math.PI / 2);
      const disc = new THREE.CylinderGeometry(0.165, 0.165, 0.032, 28); disc.rotateZ(Math.PI / 2);
      G.wheel[key] = { tread: mergeNI([tread, ...shoulders]), side, rimFace, barrel, disc, R, W, rimR };
    }
    // Querlenker-Stab (Einheitslänge entlang y)
    G.rod = new THREE.CylinderGeometry(0.011, 0.011, 1, 6); G.rod.translate(0, 0.5, 0);
    G.parts = buildCarParts(M.parts || []);
    G.look = M.look || {};
    return G;
}
/** Zusatzteile einer Mod, je Material zu einer Geometrie zusammengefasst */
function buildCarParts(list) {
  const by = {};
  for (const p of list) {
    let g;
    if (p.type === 'loft') g = loftGeometry(p.sections, { radial: 24, sub: 3, capStart: p.cap !== false, capEnd: p.cap !== false });
    else if (p.type === 'box') { const [w, h, d] = p.size; g = p.r ? roundedBox(w, h, d, Math.min(p.r, w / 2, h / 2), 2) : new THREE.BoxGeometry(w, h, d); }
    else if (p.type === 'wing') { g = wingGeometry(p.chord, p.thick ?? 0.08, p.span, p.camber ?? 0.05); }
    else if (p.type === 'cyl') { g = new THREE.CylinderGeometry(p.r2 ?? p.r ?? p.r1, p.r1 ?? p.r, p.len, 16); }
    else if (p.type === 'sphere') { g = new THREE.SphereGeometry(p.r, 18, 12); }
    if (!g) continue;
    if (p.scale) g.scale(...p.scale);
    const r = p.rot || [0, 0, 0];
    if (p.type === 'wing' && p.rotX !== undefined) r[0] = p.rotX;
    const place = (gg, mx) => { const e = new THREE.Euler(r[0] * DEG, r[1] * DEG * mx, r[2] * DEG * mx); gg.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e)); const P = p.pos || [0, 0, 0]; gg.translate(P[0] * mx, P[1], P[2]); return gg; };
    const mat = p.mat || 'carbon';
    (by[mat] = by[mat] || []).push(place(p.mirror ? g.clone() : g, 1));
    if (p.mirror) by[mat].push(place(g, -1));
  }
  const out = {}; for (const k in by) out[k] = mergeNI(by[k]);
  return out;
}

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

/**
 * Bauform je Epoche: Nasenhöhe, Frontflügelbreite, Heckflügel (schmal/hoch 2009–2016),
 * Haifischflosse, Beam-Wing (verboten 2014–2021), Bargeboards (1995–2021), Rillenreifen (1998–2008)
 */
function carLookFor(E) {
  const y = (E && E.year) || 2026;
  return {
    nose: y < 2014 ? 'high' : (y >= 2017 && y < 2022) ? 'mid' : 'low',
    fw: y < 2009 ? 0.78 : 1,
    rwX: y < 2009 ? 1 : y < 2017 ? 0.76 : 1, rwY: y < 2009 ? 0.05 : y < 2017 ? 0.1 : 0,
    fin: (y >= 2008 && y < 2011) || y >= 2017,
    beam: y < 2014 || y >= 2022,
    barge: y >= 1995 && y < 2022,
    grooves: y >= 1998 && y < 2009,
  };
}
let _grooveTex = null;
/** Lauffläche mit vier Längsrillen (Rillenreifen 1998–2008) */
function grooveTex() {
  if (_grooveTex) return _grooveTex;
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#1b1b1d'; g.fillRect(0, 0, 4, 128);
  g.fillStyle = '#060606'; for (const v of [0.2, 0.4, 0.6, 0.8]) g.fillRect(0, Math.round(v * 128) - 3, 4, 6);
  _grooveTex = new THREE.CanvasTexture(c); _grooveTex.colorSpace = THREE.SRGBColorSpace;
  return _grooveTex;
}

/** Abgefallene Teile: fliegen mit dem Schwung des Autos weg, springen auf und bleiben liegen (rein optisch) */
const CarDebris = {
  list: [], ground: null, max: 24,
  detach(part, veh, dir) {
    if (typeof Render === 'undefined' || !Render.scene) return;
    part.updateWorldMatrix(true, true);
    const o = part.clone(true); o.visible = true; o.rotation.set(0, 0, 0); o.position.set(0, 0, 0); o.scale.set(1, 1, 1);
    const g = new THREE.Group(); g.add(o);
    part.matrixWorld.decompose(g.position, g.quaternion, g.scale);
    Render.scene.add(g);
    const r = () => Math.random() - 0.5;
    this.list.push({ g, v: new THREE.Vector3(veh.vel.x * 0.75 + r() * 4, 1.5 + Math.random() * 2.5, veh.vel.z * 0.75 + r() * 4), w: new THREE.Vector3(r() * 9, r() * 9, r() * 9), t: 0, rest: false });
    while (this.list.length > this.max) this._drop(this.list.shift());
  },
  _drop(d) { if (d.g.parent) d.g.parent.remove(d.g); },
  update(dt) {
    const q = this._q || (this._q = new THREE.Quaternion()), e = this._e || (this._e = new THREE.Euler());
    for (const d of this.list) {
      d.t += dt; if (d.rest) continue;
      d.v.y -= 9.81 * dt; d.v.multiplyScalar(1 - 0.25 * dt);
      d.g.position.addScaledVector(d.v, dt);
      e.set(d.w.x * dt, d.w.y * dt, d.w.z * dt); q.setFromEuler(e); d.g.quaternion.multiply(q);
      const gy = (this.ground ? this.ground(d.g.position.x, d.g.position.z) : 0) + 0.05;
      if (d.g.position.y < gy) {
        d.g.position.y = gy;
        if (Math.abs(d.v.y) < 1.2 && d.v.length() < 3) { d.rest = true; continue; }
        d.v.y = Math.abs(d.v.y) * 0.3; d.v.x *= 0.55; d.v.z *= 0.55; d.w.multiplyScalar(0.5);
      }
    }
  },
  clear() { for (const d of this.list) this._drop(d); this.list.length = 0; },
};

/** Ein sichtbares Fahrzeug */
class CarVisual {
  constructor(team, number, { detail = 'high', physical = true } = {}) {
    this.team = team; this.number = number;
    const G = this.G = CarGeo.get();
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
    // Epochen-Teile: Nase (3 Varianten), Frontflügel- und Heckflügel-Baugruppen, Haifischflosse, Beam-Wing, Bargeboards
    this.noseMesh = {}; this.pylonMesh = {};
    for (const k of ['low', 'mid', 'high']) { cast.push(this.noseMesh[k] = add(G.nose[k], this.paint)); this.pylonMesh[k] = add(G.pylons[k], this.carbonMat); }
    this.fwGroup = new THREE.Group(); root.add(this.fwGroup); this.fwInner = new THREE.Group(); this.fwGroup.add(this.fwInner);
    cast.push(add(G.fwMain, this.carbonMat, this.fwInner)); add(G.endF, this.endMat, this.fwInner);
    this.rwGroup = new THREE.Group(); root.add(this.rwGroup); this.rwInner = new THREE.Group(); this.rwGroup.add(this.rwInner);
    cast.push(add(G.rwMain, this.carbonMat, this.rwInner)); cast.push(add(G.endR, this.endMat, this.rwInner)); add(G.swan, this.carbonMat, this.rwInner);
    this.diffMesh = add(G.diffuser, this.carbonMat);
    this.finMesh = add(G.fin, this.carbonMat); this.beamMesh = add(G.beam, this.carbonMat); this.bargeMesh = add(G.barge, this.carbonMat);
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
    for (const [geo, z, y, a] of [[G.fwFlap1, G.FW.z + 0.24, G.FW.y + 0.03, 0.28], [G.fwFlap2, G.FW.z + 0.39, G.FW.y + 0.08, 0.52]].slice(0, G.fwFlaps)) {
      const pv = new THREE.Group(); pv.position.set(0, y, z); this.fwInner.add(pv);
      add(geo, this.carbonMat, pv); pv.rotation.x = a; pv.userData.base = a; this.fwFlaps.push(pv);
    }
    this.rwPivot = new THREE.Group(); this.rwPivot.position.set(0, G.RW.y + 0.12, G.RW.z + 0.12); this.rwInner.add(this.rwPivot);
    if (G.rwFlaps) add(G.rwFlap, this.endMat, this.rwPivot);
    // Zusatzteile der Mod (je Material eine Geometrie)
    const PM = { paint: this.paint, carbon: this.carbonMat, team: this.endMat,
      team2: new THREE.MeshStandardMaterial({ color: new THREE.Color(team.colors[1] || team.colors[0]), roughness: 0.35, metalness: 0.2 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 }), chrome: new THREE.MeshStandardMaterial({ color: 0xd6dade, roughness: 0.15, metalness: 1 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.6 }) };
    for (const k in G.parts) cast.push(add(G.parts[k], PM[k] || this.carbonMat));
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
    const tyreMat = this.tyreMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.88 });
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
    // Bauform der Epoche (Mods: nach Jahr)
    const L = this.look = Object.assign(carLookFor(E), this.G && this.G.look || {});
    for (const k in this.noseMesh) { this.noseMesh[k].visible = k === L.nose; this.pylonMesh[k].visible = k === L.nose; }
    this.fwInner.scale.x = L.fw;
    this.rwInner.scale.x = L.rwX; this.rwInner.position.y = L.rwY;
    this.finMesh.visible = L.fin; this.beamMesh.visible = L.beam; this.bargeMesh.visible = L.barge;
    this.fwGroup.visible = L.frontWing !== false; this.rwGroup.visible = L.rearWing !== false; this.diffMesh.visible = L.diffuser !== false;
    if (L.frontWing === false) for (const k in this.pylonMesh) this.pylonMesh[k].visible = false;
    this.tyreMat.map = L.grooves ? grooveTex() : null; this.tyreMat.color.setHex(L.grooves ? 0xffffff : 0x1b1b1d); this.tyreMat.needsUpdate = true;
  }

  /**
   * Sichtbarer Schaden: Flügel hängen durch und fallen ab (als Trümmer auf der Strecke),
   * verbogene Aufhängung kippt das Rad, ein angeschlagener Motor qualmt. Reparatur stellt alles wieder her.
   */
  _damageLook(veh, now) {
    const H = veh.health, D = this._dmg || (this._dmg = { fw: false, rw: false, smokeT: 0 });
    // Frontflügel: ab 3 % Schaden schief, unter 55 % ab
    const fwOff = H.fw < 0.55;
    if (fwOff && !D.fw) { if (this.fwGroup.visible) CarDebris.detach(this.fwInner, veh, -1); D.fw = true; }
    if (!fwOff && D.fw && H.fw > 0.96) D.fw = false;
    this.fwInner.visible = !D.fw;
    if (!D.fw) { const b = clamp((1 - H.fw) / 0.45, 0, 1); this.fwInner.rotation.z = (this.number % 2 ? 1 : -1) * b * 0.09; this.fwInner.rotation.x = b * 0.06; this.fwInner.position.y = -b * 0.03; }
    const rwOff = H.rw < 0.5;
    if (rwOff && !D.rw) { if (this.rwGroup.visible) CarDebris.detach(this.rwInner, veh, 1); D.rw = true; }
    if (!rwOff && D.rw && H.rw > 0.96) D.rw = false;
    this.rwInner.visible = !D.rw;
    if (!D.rw) { const b = clamp((1 - H.rw) / 0.5, 0, 1); this.rwInner.rotation.z = (this.number % 2 ? -1 : 1) * b * 0.07; }
    // Aufhängung: Rad kippt (Sturz) mit dem Schaden
    for (let i = 0; i < 4; i++) { const b = 1 - H.susp[i]; this.wheels[i].root.rotation.z = b > 0.03 ? (i % 2 ? 1 : -1) * Math.min(0.3, b * 0.35) : 0; }
    // Motor: Rauch aus dem Heck
    const fx = typeof Render !== 'undefined' ? Render.fx : null;
    if (fx && H.engine < 0.6 && now - D.smokeT > (0.03 + H.engine * 0.08)) {
      D.smokeT = now; const R = veh.R, t = this._v; R.mulXYZ(0, 0.35, 1.9, t);
      const k = 1 - H.engine, g = 0.18 + H.engine * 0.5;
      fx.smoke.spawn(veh.pos.x + t.x, veh.pos.y + t.y, veh.pos.z + t.z, veh.vel.x * 0.4 + (Math.random() - 0.5), 0.8 + Math.random(), veh.vel.z * 0.4 + (Math.random() - 0.5), 1.2 + k * 1.5, 0.5, 2.2 + k, g, g, g, 0.35 + k * 0.3, 1.4, -0.2);
    }
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
    if (veh.health) this._damageLook(veh, now);
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
