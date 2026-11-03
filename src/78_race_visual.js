// ============================================================================
//  RENDER – Ghost-Fahrzeug, TV-Kamerapositionen, Detailstufen für KI-Autos
// ============================================================================

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
