// ============================================================================
//  RENDER – Strecken-Geometrie aus dem Spline: Fahrbahn, Linien, Randsteine,
//  Kunstrasen, Ausläufe, Kies, Gras, Barrieren, Fangzäune, Gelände, Szenerie
//  (Bäume per Instancing, Tribünen, Boxengebäude, Start-Ziel-Brücke, Ampel,
//  Bremsschilder, See, Gebäude). Geometrie je Material zusammengefasst.
// ============================================================================

/** Sammelt Vertices/Indizes für ein Material */
class GeoBuilder {
  constructor() { this.p = []; this.uv = []; this.ix = []; this.col = null; }
  v(x, y, z, u, w) { this.p.push(x, y, z); this.uv.push(u, w); return this.p.length / 3 - 1; }
  tri(a, b, c) { this.ix.push(a, b, c); }
  quad(a, b, c, d) { this.ix.push(a, b, c, a, c, d); }
  get empty() { return this.ix.length === 0; }
  build(normals = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.ix, 1) : new THREE.Uint16BufferAttribute(this.ix, 1));
    if (normals) g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

class TrackVisual {
  constructor(track, quality) {
    this.track = track; this.q = quality;
    this.group = new THREE.Group(); this.group.name = 'track';
    this.mats = this._materials();
    this.crowdSpots = [];
    this._surfaces();
    this._barriers();
    this._terrain();
    this._scenery();
  }

  _materials() {
    const T = Tex;
    const asphalt = T.asphalt(), bump = T.asphaltBump();
    const m = {
      road: new THREE.MeshStandardMaterial({ map: asphalt, bumpMap: bump, bumpScale: 0.6, roughness: 0.92, metalness: 0.0, color: 0xffffff }),
      line: new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.65 }),
      kerb1: new THREE.MeshStandardMaterial({ map: T.kerb(1), roughness: 0.7 }),
      kerb2: new THREE.MeshStandardMaterial({ map: T.kerb(2), roughness: 0.7 }),
      saus: new THREE.MeshStandardMaterial({ map: T.kerb(4), roughness: 0.6 }),
      astro: new THREE.MeshStandardMaterial({ map: T.astro(), roughness: 0.95 }),
      runoff: new THREE.MeshStandardMaterial({ map: T.runoff(), bumpMap: bump, bumpScale: 0.4, roughness: 0.9 }),
      grass: new THREE.MeshStandardMaterial({ map: T.grass(), roughness: 1.0, color: 0xdfe8d8 }),
      gravel: new THREE.MeshStandardMaterial({ map: T.gravel(), roughness: 1.0, bumpMap: T.gravel(), bumpScale: 1.5 }),
      pit: new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.85, color: 0xcfd2d8 }),
      wall: new THREE.MeshStandardMaterial({ map: T.concrete(), roughness: 0.85 }),
      ads: new THREE.MeshStandardMaterial({ map: T.adsWall(), roughness: 0.6 }),
      rail: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.85 }),
      post: new THREE.MeshStandardMaterial({ color: 0x8a8e93, roughness: 0.5, metalness: 0.6 }),
      tyres: new THREE.MeshStandardMaterial({ map: T.tyreWall(), roughness: 0.9 }),
      fence: new THREE.MeshStandardMaterial({ map: T.fence(), transparent: false, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }),
      terrain: new THREE.MeshStandardMaterial({ map: T.grass(), roughness: 1.0, vertexColors: true }),
      checker: new THREE.MeshStandardMaterial({ map: T.checker(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      paint: new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      crowd: new THREE.MeshStandardMaterial({ map: T.crowd(), roughness: 0.9 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.45, metalness: 0.7 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.55, metalness: 0.3 }),
      facade: new THREE.MeshStandardMaterial({ map: T.facade(), roughness: 0.8 }),
      garage: new THREE.MeshStandardMaterial({ map: T.garageFront(), roughness: 0.7 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.08, metalness: 0.9 }),
      water: new THREE.MeshStandardMaterial({ color: 0x1c3a48, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.3 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7 }),
      lampOff: new THREE.MeshStandardMaterial({ color: 0x220404, roughness: 0.3, emissive: 0x000000 }),
      bark: new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1.0 }),
      leaves: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xe3dccd, roughness: 0.85 }),
      copper: new THREE.MeshStandardMaterial({ color: 0x5f9c86, roughness: 0.6, metalness: 0.4 }),
    };
    for (const k of ['kerb1', 'kerb2', 'saus']) m[k].polygonOffset = false;
    return m;
  }

  _add(geo, mat, { cast = false, receive = true, name = '' } = {}) {
    if (!geo) return null;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.name = name;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    this.group.add(mesh);
    return mesh;
  }

  /** Weltposition für Sample j mit Querablage d (Höhe aus dem Querprofil) */
  _pt(j, d, dy = 0) {
    const T = this.track;
    return [T.X[j] + T.RX[j] * d, T.visualHeight(j, d) + dy, T.Z[j] + T.RZ[j] * d];
  }

  /** Weltpunkt bei Streckenmeter s und Querablage d */
  _ptS(s, d, dy = 0.003) {
    const T = this.track, L = T.length;
    s = ((s % L) + L) % L;
    const j = Math.floor(s / T.ds) % T.N, j1 = (j + 1) % T.N, f = (s - T.S[j]) / T.ds;
    const x = lerp(T.X[j] + T.RX[j] * d, T.X[j1] + T.RX[j1] * d, f), z = lerp(T.Z[j] + T.RZ[j] * d, T.Z[j1] + T.RZ[j1] * d, f);
    return [x, lerp(T.visualHeight(j, d), T.visualHeight(j1, d), f) + dy, z];
  }

  /**
   * Streifen entlang der Strecke: für Sample-Lauf [j0..j1] (inkl., umbrechend) und
   * Querpositionen lat(j) → Array von d-Werten (links→rechts). uFn: Quer-UV.
   */
  _strip(B, j0, count, latFn, { vScale = 6, uFn = null, dy = 0, hFn = null, swap = false, flipU = false } = {}) {
    const T = this.track, N = T.N;
    let rowPrev = null;
    for (let k = 0; k <= count; k++) {
      const j = (j0 + k) % N;
      const sv = (T.S[j0] + k * T.ds) / vScale;
      const lats = latFn(j);
      const row = [];
      for (let i = 0; i < lats.length; i++) {
        const d = lats[i];
        const x = T.X[j] + T.RX[j] * d, z = T.Z[j] + T.RZ[j] * d;
        const y = (hFn ? hFn(j, d, i) : T.visualHeight(j, d)) + dy;
        const u = uFn ? uFn(i, d, lats) : d / vScale;
        row.push(swap ? B.v(x, y, z, flipU ? -sv : sv, u) : B.v(x, y, z, u, sv));
      }
      if (rowPrev) for (let i = 0; i < row.length - 1; i++) B.quad(rowPrev[i], rowPrev[i + 1], row[i + 1], row[i]);
      rowPrev = row;
    }
  }

  /** Zusammenhängende Läufe eines Prädikats über die geschlossene Runde */
  _runs(pred) {
    const N = this.track.N, runs = [];
    let start = -1;
    for (let j0 = 0; j0 < N; j0++) if (!pred(j0)) { start = j0; break; }
    if (start < 0) return [[0, N]];    // gesamte Runde
    let a = -1;
    for (let k = 1; k <= N; k++) {
      const j = (start + k) % N, on = pred(j);
      if (on && a < 0) a = k;
      if ((!on || k === N) && a >= 0) { runs.push([(start + a) % N, k - a]); a = -1; }
    }
    return runs;
  }

  // ---------------------------------------------------------------------------
  _surfaces() {
    const T = this.track, N = T.N, M = this.mats;
    // Fahrbahn
    const road = new GeoBuilder();
    this._strip(road, 0, N, j => { const w = T.HW[j] - 0.25; return [-w, -w * 0.66, -w * 0.33, 0, w * 0.33, w * 0.66, w]; }, { vScale: 7 });
    this._add(road.build(), M.road, { name: 'road' });
    // Weiße Begrenzungslinien
    const lines = new GeoBuilder();
    for (const sg of [-1, 1]) this._strip(lines, 0, N, j => sg < 0 ? [-T.HW[j], -T.HW[j] + 0.25] : [T.HW[j] - 0.25, T.HW[j]], { vScale: 7, dy: 0.0 });
    this._add(lines.build(), M.line, { name: 'lines' });
    // Randsteine (je Seite und Typ), Wurst-Randsteine, Kunstrasen – Läufe um ein Sample erweitert (verjüngt, lückenlos)
    const kerbB = { 1: new GeoBuilder(), 2: new GeoBuilder() }, sausB = new GeoBuilder(), astroB = new GeoBuilder();
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1;
      for (const type of [1, 2]) {
        for (const [j0, n] of this._runs(j => T.kerbT[s][j] === type)) {
          const a0 = (j0 - 1 + N) % N;
          const lat = (j) => { const hw = T.HW[j], ke = T.kerbT[s][j] === type ? T.KE[s][j] : hw; const r = [0, 0.15, 0.5, 0.85, 1].map(t => hw + (ke - hw) * t); return sg > 0 ? r : r.reverse().map(x => -x); };
          this._strip(kerbB[type], a0, n + 1, lat, { vScale: 2.0, uFn: (i, d, l) => i / (l.length - 1) * 0.25 });
        }
      }
      for (const [j0, n] of this._runs(j => T.saus[s][j] === 1)) {
        const a0 = (j0 - 1 + N) % N;
        const lat = (j) => { const ke = T.KE[s][j], se = T.saus[s][j] ? T.SE[s][j] : ke; const r = [0, 0.15, 0.32, 0.5, 0.68, 0.85, 1].map(t => ke + (se - ke) * t); return sg > 0 ? r : r.reverse().map(x => -x); };
        this._strip(sausB, a0, n + 1, lat, { vScale: 1.5, uFn: (i, d, l) => i / (l.length - 1) * 0.3 });
      }
      for (const [j0, n] of this._runs(j => T.astroW[s][j] > 0)) {
        const a0 = (j0 - 1 + N) % N;
        const lat = (j) => { const se = T.SE[s][j], ae = T.astroW[s][j] > 0 ? T.AE[s][j] : se; return sg > 0 ? [se, ae] : [-ae, -se]; };
        this._strip(astroB, a0, n + 1, lat, { vScale: 4, uFn: (i) => i * 0.5 });
      }
    }
    if (!kerbB[1].empty) this._add(kerbB[1].build(), M.kerb1, { name: 'kerbs' });
    if (!kerbB[2].empty) this._add(kerbB[2].build(), M.kerb2, { name: 'kerbsSaw' });
    if (!sausB.empty) this._add(sausB.build(), M.saus, { name: 'sausage', cast: true });
    if (!astroB.empty) this._add(astroB.build(), M.astro, { name: 'astro' });
    // Ausläufe je Untergrund (Quads nach Typ am Startsample sortiert)
    const runB = { [SURF.GRASS]: new GeoBuilder(), [SURF.GRAVEL]: new GeoBuilder(), [SURF.RUNOFF]: new GeoBuilder(), [SURF.ASPHALT]: new GeoBuilder(), [SURF.ASTRO]: new GeoBuilder(), [SURF.PIT]: new GeoBuilder() };
    const ext = new GeoBuilder();
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1;
      for (const type of Object.keys(runB).map(Number)) {
        for (const [j0, n] of this._runs(j => T.runT[s][j] === type)) {
          const lat = (j) => { const ae = T.AE[s][j], bd = T.BD[s][j]; const r = [ae, Math.min(bd, ae + 0.8), ae + (bd - ae) * 0.4, ae + (bd - ae) * 0.75, bd]; return sg > 0 ? r : r.reverse().map(x => -x); };
          this._strip(runB[type], j0, n, lat, { vScale: type === SURF.GRAVEL ? 5 : 8 });
        }
      }
      // Grasstreifen hinter der Barriere, fällt sanft zum Gelände ab
      this._strip(ext, 0, N, j => { const bd = T.BD[s][j]; const r = [bd, bd + 6, bd + 16, bd + 32]; return sg > 0 ? r : r.reverse().map(x => -x); },
        { vScale: 10, hFn: (j, d) => { const bd = T.BD[s][j], a = Math.abs(d); return T.visualHeight(j, d) - 0.55 * smoothstep(bd, bd + 32, a); } });
    }
    const runMat = { [SURF.GRASS]: M.grass, [SURF.GRAVEL]: M.gravel, [SURF.RUNOFF]: M.runoff, [SURF.ASPHALT]: M.runoff, [SURF.ASTRO]: M.astro, [SURF.PIT]: M.pit };
    for (const k in runB) if (!runB[k].empty) this._add(runB[k].build(), runMat[k], { name: 'runoff' + k });
    this._add(ext.build(), M.grass, { name: 'verge' });
    // Start-/Ziellinie (Schachbrett) und Startaufstellung
    const sf = new GeoBuilder(), grid = new GeoBuilder();
    const w0 = T.HW[0];
    this._strip(sf, (N - 1) % N, 1, j => [-w0 + 0.25, w0 - 0.25], { dy: 0.002, vScale: 2, uFn: (i) => i * w0 / 2 });
    for (let k = 0; k < 20; k++) {
      const s0 = T.length - 10 - k * 8;
      const side = k % 2 === 0 ? -1 : 1;
      const jc = Math.floor(s0 / T.ds) % N;
      const dC = side * T.HW[jc] * 0.42;
      for (const [sa, sb, d0, d1] of [[s0 - 0.22, s0, dC - 1.3, dC + 1.3], [s0 - 4.2, s0, dC - 1.3, dC - 1.14], [s0 - 4.2, s0, dC + 1.14, dC + 1.3]]) {
        const p0 = this._ptS(sa, d0), p1 = this._ptS(sa, d1), p2 = this._ptS(sb, d1), p3 = this._ptS(sb, d0);
        grid.quad(grid.v(...p0, 0, 0), grid.v(...p1, 1, 0), grid.v(...p2, 1, 1), grid.v(...p3, 0, 1));
      }
    }
    this._add(sf.build(), M.checker, { name: 'startLine' });
    this._add(grid.build(), M.paint, { name: 'gridSlots' });
  }

  // ---------------------------------------------------------------------------
  /**
   * Senkrechte Fläche im (vorzeichenbehafteten) Querabstand dFn(j) zwischen y0Fn(j) und y1Fn(j).
   * toCenter: Flächennormale zeigt zur Streckenmitte.
   */
  _vface(B, side, j0, n, dFn, y0Fn, y1Fn, toCenter, vScale = 6, uA = 0, uB = 1) {
    const bottomFirst = (side === 1) === toCenter;
    this._strip(B, j0, n, j => { const d = dFn(j); return [d, d]; }, {
      vScale, swap: true, flipU: (side === 1) === toCenter, uFn: (i) => (bottomFirst ? (i ? uB : uA) : (i ? uA : uB)),
      hFn: (j, d, i) => (bottomFirst ? (i ? y1Fn(j) : y0Fn(j)) : (i ? y0Fn(j) : y1Fn(j))),
    });
  }

  _barriers() {
    const T = this.track, N = T.N, M = this.mats;
    const wall = new GeoBuilder(), ads = new GeoBuilder(), tyre = new GeoBuilder(), rail = new GeoBuilder(), fence = new GeoBuilder();
    const posts = [];
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1;
      const ground = (j) => T.visualHeight(j, sg * T.BD[s][j]);
      const dIn = (j) => sg * T.BD[s][j];
      // Betonmauern (entlang Start/Ziel mit Werbung)
      const H = 1.05, th = 0.35;
      for (const [j0, n] of this._runs(j => T.barT[s][j] === BARRIER.WALL)) {
        const B = T.inRange(j0, 0.93, 0.11) ? ads : wall;
        this._vface(B, s, j0, n, dIn, ground, j => ground(j) + H, true, B === ads ? 16 : 6);
        this._strip(B, j0, n, j => sg > 0 ? [T.BD[s][j], T.BD[s][j] + th] : [-(T.BD[s][j] + th), -T.BD[s][j]], { vScale: 6, uFn: (i) => i * 0.05, hFn: (j) => ground(j) + H });
        this._vface(B, s, j0, n, j => sg * (T.BD[s][j] + th), ground, j => ground(j) + H, false, 6);
      }
      // Reifenstapel (gerundete Front, Förderband-Abdeckung)
      for (const [j0, n] of this._runs(j => T.barT[s][j] === BARRIER.TYRES)) {
        const prof = [[0, 0], [0.05, 0.3], [0.07, 0.6], [0.03, 0.9], [0.25, 0.95], [1.2, 0.95]];
        this._strip(tyre, j0, n, j => { const r = prof.map(([dd]) => T.BD[s][j] + dd); return sg > 0 ? r : r.slice().reverse().map(x => -x); }, {
          vScale: 3, swap: true, uFn: (i) => (sg > 0 ? prof[i][1] : prof[prof.length - 1 - i][1]) / 0.95 * 0.98,
          hFn: (j, d, i) => ground(j) + (sg > 0 ? prof[i][1] : prof[prof.length - 1 - i][1]),
        });
      }
      // Leitplanken (zwei Holme, beidseitig sichtbar) + Pfosten
      for (const [j0, n] of this._runs(j => T.barT[s][j] === BARRIER.GUARDRAIL)) {
        for (const [y0, y1] of [[0.42, 0.6], [0.62, 0.8]]) this._vface(rail, s, j0, n, dIn, j => ground(j) + y0, j => ground(j) + y1, true, 4);
        for (let k = 0; k <= n; k += 2) { const j = (j0 + k) % N; posts.push([j, sg * (T.BD[s][j] + 0.12), ground(j), 0.8]); }
      }
      // Fangzaun auf ganzer Länge hinter der Barriere
      this._vface(fence, s, 0, N, j => sg * (T.BD[s][j] + 0.6), ground, j => ground(j) + 3.6, true, 3.2, 0, 1.3);
      for (let j = 0; j < N; j += 3) posts.push([j, sg * (T.BD[s][j] + 0.62), ground(j), 3.7]);
    }
    if (!wall.empty) this._add(wall.build(), M.wall, { name: 'walls', cast: true });
    if (!ads.empty) this._add(ads.build(), M.ads, { name: 'adWalls', cast: true });
    if (!tyre.empty) this._add(tyre.build(), M.tyres, { name: 'tyreWalls', cast: true });
    if (!rail.empty) { M.rail.side = THREE.DoubleSide; this._add(rail.build(), M.rail, { name: 'rails', cast: true }); }
    this._add(fence.build(), M.fence, { name: 'fence' });
    // Pfosten als InstancedMesh
    const pg = new THREE.BoxGeometry(0.1, 1, 0.1); pg.translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(pg, M.post, posts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    posts.forEach(([j, d, y, h], i) => {
      ps.set(T.X[j] + T.RX[j] * d, y, T.Z[j] + T.RZ[j] * d); q.setFromAxisAngle(up, Math.atan2(-T.TX[j], -T.TZ[j])); sc.set(1, h, 1);
      m4.compose(ps, q, sc); inst.setMatrixAt(i, m4);
    });
    inst.instanceMatrix.needsUpdate = true; inst.castShadow = true; inst.computeBoundingSphere();
    this.group.add(inst);
  }

  // ---------------------------------------------------------------------------
  /** Gelände: Raster, nahe der Strecke unter den Ausläufen, weiter weg sanfte Hügel */
  _terrain() {
    const T = this.track, b = T.bounds, margin = 1400;
    const x0 = b.minX - margin, x1 = b.maxX + margin, z0 = b.minZ - margin, z1 = b.maxZ + margin;
    const nx = 170, nz = Math.round(170 * (z1 - z0) / (x1 - x0));
    const B = new GeoBuilder(); B.col = [];
    const avgY = (b.minY + b.maxY) / 2;
    const lake = this._lakeInfo();
    this.terrainH = (x, z) => this._terrainHeight(x, z, avgY, lake);
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const x = lerp(x0, x1, ix / nx), z = lerp(z0, z1, iz / nz);
      const y = this.terrainH(x, z);
      B.v(x, y, z, x / 14, z / 14);
      const n = noise1(x * 0.004 + z * 0.0031) * 0.5 + noise1(z * 0.009 - x * 0.002) * 0.5;
      const c = 0.78 + n * 0.12;
      B.col.push(c * 0.95, c, c * 0.9);
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix, bb = a + 1, c = a + nx + 1, d = c + 1;
      B.quad(a, c, d, bb);
    }
    this._add(B.build(), this.mats.terrain, { name: 'terrain' });
  }
  _lakeInfo() {
    const sc = this.track.def.scenery; if (!sc || !sc.lake) return null;
    const T = this.track, L = sc.lake, j = T.idxOf(L.at), sg = L.side === 'R' ? 1 : -1;
    const s = L.side === 'R' ? 1 : 0;
    const d = sg * (T.BD[s][j] + L.dist);
    const cx = T.X[j] + T.RX[j] * d, cz = T.Z[j] + T.RZ[j] * d;
    return { cx, cz, rx: L.rx, rz: L.rz, ang: Math.atan2(T.TX[j], T.TZ[j]), y: T.Y[j] - 1.1 };
  }
  _inLake(lake, x, z, pad = 0) {
    if (!lake) return false;
    const dx = x - lake.cx, dz = z - lake.cz, c = Math.cos(lake.ang), s = Math.sin(lake.ang);
    const u = dx * c - dz * s, v = dx * s + dz * c;
    return (u * u) / ((lake.rz + pad) ** 2) + (v * v) / ((lake.rx + pad) ** 2) < 1;
  }
  _terrainHeight(x, z, avgY, lake) {
    const T = this.track;
    const ns = T.nearestSample(x, z, 4);
    const j = ns.j;
    const d = (x - T.X[j]) * T.RX[j] + (z - T.Z[j]) * T.RZ[j];
    const s = d >= 0 ? 1 : 0, sg = d >= 0 ? 1 : -1, a = Math.abs(d);
    const lim = T.BD[s][j] + 32;
    const hNear = T.visualHeight(j, sg * Math.min(a, lim)) - 0.55;
    const hills = (noise1(x * 0.0021 + 3.1) * 0.6 + noise1(z * 0.0017 - 1.7) * 0.6 + noise1((x + z) * 0.0043) * 0.3) * 22 + 8;
    const t = smoothstep(lim, lim + 520, ns.dist);
    let h = lerp(hNear, avgY - 0.6 + hills, t);
    if (lake && this._inLake(lake, x, z, 18)) {
      const inner = this._inLake(lake, x, z, 0) ? 1 : 0.5;
      h = Math.min(h, lake.y - 1.6 * inner);
    }
    return h;
  }

  // ---------------------------------------------------------------------------
  _scenery() {
    const T = this.track, sc = T.def.scenery || {}, M = this.mats;
    const rng = makeRng(sc.seed || 1);
    const lake = this._lakeInfo();
    const blocked = [];   // Rechtecke/Kreise, in denen keine Bäume stehen
    // See
    if (lake) {
      const g = new THREE.CircleGeometry(1, 64); g.rotateX(-Math.PI / 2); g.scale(lake.rz, 1, lake.rx);
      g.rotateY(lake.ang); g.translate(lake.cx, lake.y + 0.9, lake.cz);
      this._add(g, M.water, { name: 'lake' });
      blocked.push({ x: lake.cx, z: lake.cz, r: Math.max(lake.rx, lake.rz) + 12 });
    }
    // Tribünen
    const standGeo = [], roofGeo = [], steelGeo = [];
    for (const st of (sc.grandstands || [])) {
      const j = T.idxOf(st.at), s = st.side === 'R' ? 1 : 0, sg = s ? 1 : -1;
      const span = Math.round(st.len / 2 / T.ds);
      let bdMax = 0; for (let k = -span; k <= span; k++) bdMax = Math.max(bdMax, T.BD[s][(j + k + T.N) % T.N]);
      const off = bdMax + 4;
      const cx = T.X[j] + T.RX[j] * sg * off, cz = T.Z[j] + T.RZ[j] * sg * off;
      const yaw = Math.atan2(T.TX[j], T.TZ[j]);
      const base = T.visualHeight(j, sg * bdMax) - 0.3;
      const rows = st.rows || 10, rh = 0.55, rd = 0.95;
      const depth = rows * rd;
      // Treppenprofil als Extrusion
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      for (let r = 0; r < rows; r++) { shape.lineTo(r * rd, (r + 1) * rh); shape.lineTo((r + 1) * rd, (r + 1) * rh); }
      shape.lineTo(depth, 0); shape.lineTo(0, 0);
      const ge = new THREE.ExtrudeGeometry(shape, { depth: st.len, bevelEnabled: false, steps: 1 });
      // UV: Publikumstextur über die Stufen
      const uv = ge.attributes.uv, pos = ge.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getZ(i) / 20, pos.getY(i) / (rows * rh) * 0.95);
      ge.translate(0, 0, -st.len / 2);
      const m = new THREE.Matrix4().makeRotationY(sg > 0 ? yaw + Math.PI : yaw);
      ge.applyMatrix4(m); ge.translate(cx, base, cz);
      standGeo.push(ge);
      // Dach und Stützen
      const roof = new THREE.BoxGeometry(depth + 2, 0.25, st.len);
      roof.translate(depth / 2, rows * rh + 3.2, 0); roof.applyMatrix4(m); roof.translate(cx, base, cz); roofGeo.push(roof);
      for (let k = -st.len / 2; k <= st.len / 2; k += 20) {
        const col = new THREE.CylinderGeometry(0.18, 0.18, rows * rh + 3.3, 6);
        col.translate(depth + 0.5, (rows * rh + 3.3) / 2, k); col.applyMatrix4(m); col.translate(cx, base, cz); steelGeo.push(col);
      }
      blocked.push({ x: cx, z: cz, r: st.len / 2 + depth + 10 });
      this.crowdSpots.push({ x: cx, z: cz, r: st.len / 2 + 60 });
    }
    // Boxengebäude und Boxengasse
    if (sc.pit) {
      const p = sc.pit, s = p.side === 'R' ? 1 : 0, sg = s ? 1 : -1;
      const ja = T.idxOf(p.from), jb = T.idxOf(p.to);
      const n = (jb - ja + T.N) % T.N, jm = (ja + Math.floor(n / 2)) % T.N;
      const len = n * T.ds;
      const bd = T.BD[s][jm];
      const yaw = Math.atan2(T.TX[jm], T.TZ[jm]);
      const laneW = 13, depth = 18, hgt = 10;
      const base = T.visualHeight(jm, sg * bd) - 0.02;
      // Boxengasse
      const lane = new GeoBuilder();
      this._strip(lane, ja, n, j => sg > 0 ? [T.BD[s][j] + 0.35, T.BD[s][j] + laneW] : [-(T.BD[s][j] + laneW), -(T.BD[s][j] + 0.35)], { vScale: 8, hFn: (j) => base + 0.01 });
      this._add(lane.build(), M.pit, { name: 'pitLane' });
      const pl = new GeoBuilder();
      this._strip(pl, ja, n, j => sg > 0 ? [T.BD[s][j] + 4.0, T.BD[s][j] + 4.2] : [-(T.BD[s][j] + 4.2), -(T.BD[s][j] + 4.0)], { vScale: 4, hFn: () => base + 0.015 });
      this._add(pl.build(), M.paint, { name: 'pitLine' });
      const off = bd + laneW + depth / 2;
      const cx = T.X[jm] + T.RX[jm] * sg * off, cz = T.Z[jm] + T.RZ[jm] * sg * off;
      const m = new THREE.Matrix4().makeRotationY(yaw);
      const bldg = new THREE.BoxGeometry(depth, hgt, len);
      bldg.translate(0, hgt / 2, 0); bldg.applyMatrix4(m); bldg.translate(cx, base, cz);
      // Garagenfront mit eigener Textur (Seite zur Strecke)
      const front = new THREE.PlaneGeometry(len, hgt * 0.55);
      front.rotateY(sg > 0 ? Math.PI / 2 : -Math.PI / 2); front.translate(sg * (depth / 2 + 0.02), hgt * 0.275, 0);
      const uvs = front.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setX(i, uvs.getX(i) * len / 64);
      front.applyMatrix4(m); front.translate(cx, base, cz);
      const glassG = new THREE.BoxGeometry(depth * 0.9, 2.2, len * 0.98); glassG.translate(sg * 0.6, hgt + 1.1, 0); glassG.applyMatrix4(m); glassG.translate(cx, base, cz);
      const roofP = new THREE.BoxGeometry(depth + 4, 0.4, len + 4); roofP.translate(sg * 1.5, hgt + 2.4, 0); roofP.applyMatrix4(m); roofP.translate(cx, base, cz);
      this._add(bldg, M.facade, { name: 'pitBuilding', cast: true });
      this._add(front, M.garage, { name: 'garages' });
      this._add(glassG, M.glass, { name: 'pitGlass' });
      roofGeo.push(roofP);
      blocked.push({ x: cx, z: cz, r: len / 2 + 30 });
      this.crowdSpots.push({ x: cx, z: cz, r: len / 2 + 40 });
    }
    if (standGeo.length) this._add(mergeGeometries(standGeo), M.crowd, { name: 'stands', cast: true });
    if (roofGeo.length) this._add(mergeGeometries(roofGeo.map(g => g.toNonIndexed ? g.toNonIndexed() : g)), M.roof, { name: 'roofs', cast: true });
    if (steelGeo.length) this._add(mergeGeometries(steelGeo.map(g => g.toNonIndexed())), M.steel, { name: 'steel', cast: true });
    // Start-Ziel-Brücke mit Ampelanlage
    this._gantry();
    // Bremsschilder
    this._brakeBoards();
    // Gebäude (Kurhaus, Pavillons)
    for (const b of (sc.buildings || [])) {
      const j = T.idxOf(b.at), s = b.side === 'R' ? 1 : 0, sg = s ? 1 : -1;
      const off = T.BD[s][j] + b.dist;
      const cx = T.X[j] + T.RX[j] * sg * off, cz = T.Z[j] + T.RZ[j] * sg * off;
      const face = Math.atan2(sg * T.RX[j], sg * T.RZ[j]);
      const y = this.terrainH(cx, cz) - 0.2;
      this._building(b.kind, cx, y, cz, face);
      blocked.push({ x: cx, z: cz, r: b.kind === 'kurhaus' ? 70 : 25 });
    }
    // Bäume (Instancing)
    this._trees(rng, blocked, lake);
  }

  _gantry() {
    const T = this.track, M = this.mats, j = 0;
    const yaw = Math.atan2(T.TX[j], T.TZ[j]);
    const dl = -(T.BD[0][j] + 0.8), dr = T.BD[1][j] + 0.8;
    const yl = T.visualHeight(j, dl), yr = T.visualHeight(j, dr), H = 7.2;
    const geo = [];
    for (const [d, y] of [[dl, yl], [dr, yr]]) {
      const c = new THREE.BoxGeometry(0.7, H + 1.2, 0.7); c.translate(T.X[j] + T.RX[j] * d, y + (H + 1.2) / 2, T.Z[j] + T.RZ[j] * d); geo.push(c);
    }
    const width = dr - dl;
    const beam = new THREE.BoxGeometry(width, 1.4, 0.9); beam.rotateY(Math.atan2(-T.TX[j], -T.TZ[j]));
    const mx = T.X[j] + T.RX[j] * (dl + dr) / 2, mz = T.Z[j] + T.RZ[j] * (dl + dr) / 2, my = (yl + yr) / 2 + H;
    beam.translate(mx, my + 0.4, mz); geo.push(beam);
    this._add(mergeGeometries(geo), M.dark, { name: 'gantry', cast: true });
    // Banner beidseitig
    const bt = Tex.banner('KURSTADT RINGPARK', 'APEX FORMULA WORLD CHAMPIONSHIP');
    const bm = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6, emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: 0.15 });
    for (const side of [1, -1]) {
      const p = new THREE.PlaneGeometry(width * 0.92, 1.25);
      p.rotateY(yaw + (side > 0 ? 0 : Math.PI));
      p.translate(mx + T.TX[j] * 0.46 * side, my + 0.4, mz + T.TZ[j] * 0.46 * side);
      this._add(p, bm, { name: 'banner' });
    }
    // Ampel: 5 Lichtgehäuse mit je zwei Lampen (Phase 3 schaltet sie)
    const housings = [], lamps = [];
    for (let k = 0; k < 5; k++) {
      const off = (k - 2) * 0.9;
      const px = mx + T.RX[j] * off, pz = mz + T.RZ[j] * off;
      const h = new THREE.BoxGeometry(0.55, 1.5, 0.35); h.rotateY(yaw); h.translate(px, my - 1.0, pz); housings.push(h);
      for (const ly of [-0.45, 0.15]) {
        const l = new THREE.CircleGeometry(0.17, 16); l.rotateY(yaw + Math.PI); l.translate(px - T.TX[j] * 0.18, my - 1.0 + ly, pz - T.TZ[j] * 0.18); lamps.push(l);
      }
    }
    this._add(mergeGeometries(housings), M.dark, { name: 'lightPods', cast: true });
    this.startLampMat = M.lampOff.clone();
    this._add(mergeGeometries(lamps), this.startLampMat, { name: 'startLamps' });
  }

  _brakeBoards() {
    const T = this.track, boards = T.brakeBoards; if (!boards.length) return;
    const byText = {};
    for (const b of boards) {
      const s = b.side, sg = s ? 1 : -1, j = b.j;
      const d = sg * (T.AE[s][j] + 2.2);
      const x = T.X[j] + T.RX[j] * d, z = T.Z[j] + T.RZ[j] * d, y = T.visualHeight(j, d);
      const yaw = Math.atan2(T.TX[j], T.TZ[j]);
      const pl = new THREE.PlaneGeometry(1.3, 0.65); pl.rotateY(yaw + Math.PI); pl.translate(x, y + 1.0, z);
      (byText[b.dist] = byText[b.dist] || []).push(pl);
      const post = new THREE.BoxGeometry(0.08, 0.75, 0.08); post.translate(x, y + 0.37, z);
      (byText.post = byText.post || []).push(post);
    }
    for (const k in byText) {
      const mat = k === 'post' ? this.mats.post : new THREE.MeshStandardMaterial({ map: Tex.sign(k), roughness: 0.6, side: THREE.DoubleSide });
      this._add(mergeGeometries(byText[k]), mat, { name: 'brakeBoards' + k });
    }
  }

  _building(kind, x, y, z, yaw) {
    const M = this.mats, m = new THREE.Matrix4().makeRotationY(yaw), parts = { facade: [], stone: [], copper: [], roof: [] };
    const put = (g, list) => { g.applyMatrix4(m); g.translate(x, y, z); parts[list].push(g); };
    if (kind === 'kurhaus') {
      const main = new THREE.BoxGeometry(70, 16, 22); main.translate(0, 8, 0); put(main, 'facade');
      const wingL = new THREE.BoxGeometry(18, 12, 30); wingL.translate(-35, 6, 6); put(wingL, 'facade');
      const wingR = wingL.clone(); wingR.translate(70, 0, 0); put(wingR, 'facade');
      const port = new THREE.BoxGeometry(24, 1.4, 9); port.translate(0, 13.5, -15); put(port, 'stone');
      for (let k = -5; k <= 5; k++) { const c = new THREE.CylinderGeometry(0.55, 0.65, 13, 10); c.translate(k * 2.2, 6.5, -18); put(c, 'stone'); }
      const drum = new THREE.CylinderGeometry(7, 7, 4, 24); drum.translate(0, 18, 0); put(drum, 'stone');
      const dome = new THREE.SphereGeometry(7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); dome.translate(0, 20, 0); put(dome, 'copper');
      const roofG = new THREE.BoxGeometry(72, 0.6, 24); roofG.translate(0, 16.3, 0); put(roofG, 'roof');
    } else {
      const base = new THREE.CylinderGeometry(7, 7, 0.6, 8); base.translate(0, 0.3, 0); put(base, 'stone');
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const c = new THREE.CylinderGeometry(0.25, 0.25, 4, 8); c.translate(Math.cos(a) * 6, 2.3, Math.sin(a) * 6); put(c, 'stone'); }
      const r = new THREE.ConeGeometry(8, 3.5, 8); r.translate(0, 6, 0); put(r, 'copper');
    }
    for (const k in parts) if (parts[k].length) this._add(mergeGeometries(parts[k].map(g => g.index ? g.toNonIndexed() : g)), M[k], { name: 'bldg' + k, cast: true });
  }

  _trees(rng, blocked, lake) {
    const T = this.track, b = T.bounds, margin = 520;
    const want = Math.round(((T.def.scenery && T.def.scenery.trees) || 1500) * (this.q.trees || 1));
    const pts = [];
    let tries = 0;
    while (pts.length < want && tries < want * 12) {
      tries++;
      const x = lerp(b.minX - margin, b.maxX + margin, rng()), z = lerp(b.minZ - margin, b.maxZ + margin, rng());
      // Gruppierung über Rauschfeld
      const cl = noise1(x * 0.012 + 7.3) + noise1(z * 0.011 - 2.1);
      if (cl < -0.15 && rng() < 0.85) continue;
      const ns = T.nearestSample(x, z, 4);
      const j = ns.j, d = (x - T.X[j]) * T.RX[j] + (z - T.Z[j]) * T.RZ[j];
      const s = d >= 0 ? 1 : 0;
      if (ns.dist < T.BD[s][j] + 14 || ns.dist < T.HW[j] + 20) continue;
      if (lake && this._inLake(lake, x, z, 6)) continue;
      if (blocked.some(o => (x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r)) continue;
      pts.push([x, z, rng()]);
    }
    const n = pts.length;
    const trunk = new THREE.CylinderGeometry(0.16, 0.28, 3.2, 6); trunk.translate(0, 1.6, 0);
    const round = new THREE.IcosahedronGeometry(2.0, 1); round.scale(1, 1.2, 1); round.translate(0, 4.6, 0);
    const cone = new THREE.ConeGeometry(1.9, 6.5, 8); cone.translate(0, 5.4, 0);
    const nRound = pts.filter(p => p[2] < 0.62).length;
    const tI = new THREE.InstancedMesh(trunk, this.mats.bark, n);
    const rI = new THREE.InstancedMesh(round, this.mats.leaves, Math.max(1, nRound));
    const cI = new THREE.InstancedMesh(cone, this.mats.leaves, Math.max(1, n - nRound));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    let ri = 0, ci = 0;
    pts.forEach(([x, z, t], i) => {
      const y = this.terrainH(x, z) - 0.1;
      const s = 0.75 + rng() * 0.75;
      ps.set(x, y, z); q.setFromAxisAngle(up, rng() * 6.28); sc.set(s, s * (0.85 + rng() * 0.4), s);
      m4.compose(ps, q, sc); tI.setMatrixAt(i, m4);
      if (t < 0.62) { rI.setMatrixAt(ri, m4); col.setHSL(0.24 + rng() * 0.08, 0.45 + rng() * 0.2, 0.2 + rng() * 0.1); rI.setColorAt(ri, col); ri++; }
      else { cI.setMatrixAt(ci, m4); col.setHSL(0.3 + rng() * 0.05, 0.35 + rng() * 0.15, 0.14 + rng() * 0.06); cI.setColorAt(ci, col); ci++; }
    });
    rI.count = ri; cI.count = ci;
    for (const im of [tI, rI, cI]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.castShadow = true; im.receiveShadow = false; im.computeBoundingSphere(); this.group.add(im); }
    this.treeCount = n;
  }

  /** Startampel: n Lichter an (0–5), Phase 3 */
  setStartLights(n) { if (this.startLampMat) this.startLampMat.emissive.setRGB(n > 0 ? 1 : 0, 0, 0), this.startLampMat.emissiveIntensity = n > 0 ? 3 : 0; }

  /** Publikumsnähe 0…1 für Audio */
  crowdLevel(x, z) {
    let best = 0;
    for (const c of this.crowdSpots) { const d = Math.hypot(x - c.x, z - c.z); best = Math.max(best, 1 - smoothstep(c.r * 0.3, c.r * 1.6, d)); }
    return best;
  }
}

// ---------------------------------------------------------------------------
//  Minikarte (2D-Canvas) – automatisch aus dem Spline
// ---------------------------------------------------------------------------
class Minimap {
  constructor(track, size = 220) {
    this.track = track; this.size = size;
    const b = track.bounds, pad = 14;
    const sc = (size - 2 * pad) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    this.sc = sc;
    this.ox = pad + ((size - 2 * pad) - (b.maxX - b.minX) * sc) / 2 - b.minX * sc;
    this.oz = pad + ((size - 2 * pad) - (b.maxZ - b.minZ) * sc) / 2 - b.minZ * sc;
    this.bg = document.createElement('canvas'); this.bg.width = size; this.bg.height = size;
    const g = this.bg.getContext('2d');
    const path = () => { g.beginPath(); for (let j = 0; j <= track.N; j += 3) { const k = j % track.N; const [x, y] = this.map(track.X[k], track.Z[k]); if (j === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); };
    g.lineJoin = 'round'; g.lineCap = 'round';
    path(); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 7; g.stroke();
    path(); g.strokeStyle = 'rgba(235,238,245,0.92)'; g.lineWidth = 3.2; g.stroke();
    // Sektorgrenzen
    const cols = ['#ff3b1f', '#ffd400', '#30c0ff'];
    track.sectorS.forEach((s, i) => { const j = Math.floor(s / track.ds) % track.N; const [x, y] = this.map(track.X[j], track.Z[j]); g.fillStyle = cols[i]; g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); });
    // Start/Ziel
    const [sx, sy] = this.map(track.X[0], track.Z[0]);
    g.fillStyle = '#fff'; g.fillRect(sx - 1.5, sy - 6, 3, 12);
  }
  map(x, z) { return [this.ox + x * this.sc, this.oz + z * this.sc]; }
  draw(ctx, cars) {
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.drawImage(this.bg, 0, 0);
    for (const c of cars) {
      const [x, y] = this.map(c.x, c.z);
      ctx.fillStyle = c.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, c.player ? 5 : 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
}
