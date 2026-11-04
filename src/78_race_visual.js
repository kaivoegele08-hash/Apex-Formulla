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

/** Detailstufe für entfernte Fahrzeuge: Kleinteile ausblenden, Schatten nur in der Nähe */
function setCarLod(vis, dist, shadows) {
  const lvl = dist < 70 ? 0 : dist < 220 ? 1 : 2;
  if (vis._lod === lvl) return;
  vis._lod = lvl;
  vis.sw.group.visible = lvl === 0;
  vis.helmet.visible = lvl < 2;
  for (const r of vis.rods) r.mesh.visible = lvl === 0;
  const cast = shadows && lvl === 0;
  vis.root.traverse(o => { if (o.isMesh) o.castShadow = cast; });
}

/** TV-Kameras: hinter der Barriere, abwechselnd links/rechts, alle ≈ 170 m */
function buildTvSpots(track) {
  const spots = [], T = track, step = 170;
  let side = 0;
  for (let s = 40; s < T.length; s += step) {
    const j = Math.floor(s / T.ds) % T.N;
    // Kurvenaußenseite bevorzugen (bessere Sicht), sonst abwechselnd
    const k = T.KS[(j + 25) % T.N];
    side = Math.abs(k) > 0.003 ? (k > 0 ? 0 : 1) : 1 - side;
    const sg = side === 1 ? 1 : -1;
    const off = sg * (Math.min(T.BD[side][j], T.HW[j] + 30) + 4);
    const x = T.X[j] + T.RX[j] * off, z = T.Z[j] + T.RZ[j] * off;
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
