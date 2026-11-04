// ============================================================================
//  RENDER – Fahrerfiguren (prozedural, Rennanzug in Teamfarben) und
//  Siegerehrung: Podest, Pokale, Konfetti, Sektdusche, Kamerafahrt
// ============================================================================

/** Rennanzug-Textur: Teamfarbe, Seitenstreifen, Startnummer und Sponsor auf dem Rücken */
function suitTexture(team, number) {
  return Tex.make('suit|' + team.id + '|' + number, 256, 256, (g, w, hh) => {
    g.fillStyle = team.colors[0]; g.fillRect(0, 0, w, hh);
    g.fillStyle = team.colors[1]; g.fillRect(0, hh * 0.42, w, hh * 0.08); g.fillRect(w * 0.47, 0, w * 0.06, hh);
    g.fillStyle = team.colors[2] || '#ffffff'; g.fillRect(0, hh * 0.5, w, hh * 0.02);
    g.font = '900 64px Arial'; g.textAlign = 'center'; g.fillStyle = team.colors[1];
    g.fillText(String(number), w * 0.75, hh * 0.33);
    g.font = '800 22px Arial'; g.fillStyle = '#ffffff'; g.fillText((team.sponsors && team.sponsors[0]) || team.name.toUpperCase(), w * 0.25, hh * 0.3);
  }, { repeat: false });
}
const SKIN_TONES = [0xf1c7a5, 0xe0ac85, 0xc68863, 0x9a6544, 0x6f4630, 0xf5d5bd];

/**
 * Fahrerfigur (~1,75 m) mit Gelenken für einfache Animationen.
 * opts: { helmet: Helm statt Kappe, seed: Hautton/Größe }
 */
class DriverFigure {
  constructor(team, number, { helmet = false, seed = 1 } = {}) {
    this.team = team;
    const root = this.root = new THREE.Group();
    const rnd = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    const scale = 0.94 + rnd(1) * 0.1;
    const suitTex = new THREE.MeshStandardMaterial({ map: suitTexture(team, number), roughness: 0.65 });
    const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(team.colors[0]), roughness: 0.65 });
    const suit2 = new THREE.MeshStandardMaterial({ color: new THREE.Color(team.colors[1]), roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: SKIN_TONES[Math.floor(rnd(2) * SKIN_TONES.length)], roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });
    const mk = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    // Beine
    this.legs = [-1, 1].map(s => {
      const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.92, 0); root.add(hip);
      mk(new THREE.CapsuleGeometry(0.078, 0.36, 4, 10), suit, hip, 0, -0.24, 0);
      const knee = new THREE.Group(); knee.position.set(0, -0.46, 0); hip.add(knee);
      mk(new THREE.CapsuleGeometry(0.07, 0.34, 4, 10), suit, knee, 0, -0.2, 0);
      mk(new THREE.BoxGeometry(0.11, 0.08, 0.26), dark, knee, 0, -0.43, 0.05);
      return { hip, knee };
    });
    // Rumpf
    this.torso = new THREE.Group(); this.torso.position.y = 0.94; root.add(this.torso);
    const chest = mk(new THREE.CapsuleGeometry(0.17, 0.34, 6, 14), suitTex, this.torso, 0, 0.3, 0); chest.scale.set(1.12, 1, 0.72);
    mk(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 14), suit2, this.torso, 0, 0.06, 0).scale.set(1.05, 1, 0.75);   // Gürtel
    // Kopf
    this.head = new THREE.Group(); this.head.position.set(0, 0.72, 0); this.torso.add(this.head);
    mk(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), skin, this.head, 0, -0.06, 0);
    if (helmet) {
      mk(new THREE.SphereGeometry(0.145, 18, 14), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(team.colors[1]), roughness: 0.25, clearcoat: 1 }), this.head, 0, 0.1, 0);
      mk(new THREE.BoxGeometry(0.2, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.9 }), this.head, 0, 0.1, 0.12);
    } else {
      mk(new THREE.SphereGeometry(0.11, 16, 12), skin, this.head, 0, 0.09, 0).scale.set(0.92, 1.08, 0.98);
      // Kappe in Teamfarbe mit Schirm
      const cap = mk(new THREE.SphereGeometry(0.117, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(team.colors[0]), roughness: 0.6 }), this.head, 0, 0.12, 0);
      cap.scale.set(0.95, 0.8, 1);
      mk(new THREE.BoxGeometry(0.17, 0.012, 0.1), new THREE.MeshStandardMaterial({ color: new THREE.Color(team.colors[1]), roughness: 0.6 }), this.head, 0, 0.13, 0.13);
      for (const s of [-1, 1]) mk(new THREE.SphereGeometry(0.012, 6, 6), dark, this.head, s * 0.038, 0.1, 0.1);
    }
    // Arme: Schulter → Ellbogen → Hand
    this.arms = [-1, 1].map(s => {
      const sh = new THREE.Group(); sh.position.set(s * 0.24, 0.5, 0); this.torso.add(sh);
      mk(new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), suit, sh, 0, -0.16, 0);
      const el = new THREE.Group(); el.position.set(0, -0.32, 0); sh.add(el);
      mk(new THREE.CapsuleGeometry(0.05, 0.22, 4, 8), suit2, el, 0, -0.14, 0);
      const hand = new THREE.Group(); hand.position.set(0, -0.3, 0); el.add(hand);
      mk(new THREE.SphereGeometry(0.05, 10, 8), dark, hand);
      return { sh, el, hand, s };
    });
    root.scale.setScalar(scale);
    this.t = rnd(3) * 10; this.mode = 'idle'; this.jump = 0;
  }
  /** Gegenstand in die rechte Hand (Pokal, Flasche) */
  hold(obj) { if (this.held) this.arms[1].hand.remove(this.held); this.held = obj; if (obj) this.arms[1].hand.add(obj); }
  /** mode: idle | wave | cheer | trophy | spray */
  update(dt, mode = this.mode) {
    this.t += dt; const t = this.t, A = this.arms, L = this.legs;
    const ease = (cur, tgt, k = 8) => cur + (tgt - cur) * (1 - Math.exp(-dt * k));
    let aL = [0.08, 0, 0.1], aR = [0.08, 0, -0.1], elL = -0.15, elR = -0.15, y = 0;
    if (mode === 'wave') { aR = [0, 0, -2.6 + Math.sin(t * 7) * 0.35]; elR = -0.4; }
    else if (mode === 'cheer') { const k = Math.abs(Math.sin(t * 4.5)); aL = [0, 0, 2.7]; aR = [0, 0, -2.7]; elL = elR = -0.3; y = k * 0.14; }
    else if (mode === 'trophy') { aL = [-2.6, 0, 0.25]; aR = [-2.6, 0, -0.25]; elL = elR = -0.5; y = Math.abs(Math.sin(t * 3)) * 0.06; }
    else if (mode === 'spray') { aR = [-1.9 + Math.sin(t * 9) * 0.2, 0.3, -0.3]; elR = -0.2; aL = [0, 0, 1.2 + Math.sin(t * 5) * 0.2]; }
    else { aL[2] += Math.sin(t * 1.3) * 0.03; aR[2] -= Math.sin(t * 1.3) * 0.03; }
    for (const [arm, a, e] of [[A[0], aL, elL], [A[1], aR, elR]]) {
      arm.sh.rotation.x = ease(arm.sh.rotation.x, a[0]); arm.sh.rotation.y = ease(arm.sh.rotation.y, a[1]); arm.sh.rotation.z = ease(arm.sh.rotation.z, a[2]);
      arm.el.rotation.x = ease(arm.el.rotation.x, e);
    }
    this.torso.rotation.y = Math.sin(t * 0.7) * 0.06;
    this.head.rotation.y = Math.sin(t * 0.45 + 1) * 0.25;
    for (const l of L) { l.knee.rotation.x = ease(l.knee.rotation.x, y > 0.05 ? 0.25 : 0.02); }
    this.jump = ease(this.jump, y, 12);
    this.root.position.y = this.baseY + this.jump;
  }
}

/** Pokal (Drehkörper) in Gold/Silber/Bronze */
function trophyMesh(place) {
  const col = [0xe8c14a, 0xc9ced6, 0xc0814a][place] || 0xe8c14a;
  const pts = [[0, 0], [0.07, 0], [0.07, 0.02], [0.03, 0.04], [0.025, 0.12], [0.045, 0.15], [0.1, 0.22], [0.11, 0.3], [0.1, 0.31], [0.0, 0.31]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: col, metalness: 1, roughness: 0.22 }));
  m.castShadow = true; m.scale.setScalar(place === 0 ? 1.25 : 1);
  return m;
}
function bottleMesh() {
  const pts = [[0, 0], [0.04, 0], [0.04, 0.17], [0.015, 0.24], [0.013, 0.29], [0, 0.29]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), new THREE.MeshStandardMaterial({ color: 0x1f5a2a, metalness: 0.3, roughness: 0.2 }));
  m.rotation.x = Math.PI * 0.85; m.position.y = -0.02;
  return m;
}

/**
 * Siegerehrung als eigene Szene (wie die Garage). podium = [{ team, number, name }] für Platz 1–3,
 * info = { track, title }. update(dt, aspect) animiert Ablauf und Kamera.
 */
class PodiumScene {
  constructor(renderer, podium, info = {}) {
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e14);
    scene.fog = new THREE.Fog(0x0b0e14, 16, 40);
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 120);
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(renderer);
    this.envRT = pmrem.fromScene(room, 0.04); scene.environment = this.envRT.texture; room.dispose(); pmrem.dispose();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.5 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    // Podest: Mitte (1), links (2), rechts (3)
    const H = [1.15, 0.8, 0.5], X = [0, -1.65, 1.65];
    const stepMat = new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.4 });
    const numMat = (n) => new THREE.MeshBasicMaterial({ map: Tex.sign(String(n), '#ff3b1f', '#ffffff') });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.55, H[i], 1.3), stepMat); b.position.set(X[i], H[i] / 2, 0); b.castShadow = b.receiveShadow = true; scene.add(b);
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), numMat(i + 1)); n.position.set(X[i], H[i] * 0.55, 0.652); scene.add(n);
    }
    // Rückwand mit Logo und Streckenname
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 7), new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.8 })); wall.position.set(0, 3.5, -2.2); scene.add(wall);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.8), new THREE.MeshBasicMaterial({ map: Tex.banner('APEX FORMULA', (info.track || '').toUpperCase()), toneMapped: false })); logo.position.set(0, 3.75, -2.18); scene.add(logo);
    const sponsorTex = Tex.adsWall ? Tex.adsWall() : null;
    if (sponsorTex) { const ads = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.8), new THREE.MeshBasicMaterial({ map: sponsorTex })); ads.position.set(0, 0.4, -2.17); scene.add(ads); }
    // Licht
    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x202228, 0.7));
    const key = new THREE.SpotLight(0xffffff, 520, 30, 0.55, 0.5, 1.5); key.position.set(2, 9, 6); key.target.position.set(0, 1.2, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; scene.add(key); scene.add(key.target);
    const warm = new THREE.SpotLight(0xffb070, 180, 25, 0.8, 0.6, 1.5); warm.position.set(-6, 5, 3); warm.target.position.set(0, 1, 0); scene.add(warm); scene.add(warm.target);
    // Fahrer
    this.drivers = podium.slice(0, 3).map((p, i) => {
      const f = new DriverFigure(p.team, p.number, { seed: i + 1 + p.number });
      f.baseY = H[i]; f.root.position.set(X[i], H[i], 0.05); f.root.rotation.y = i === 1 ? 0.25 : i === 2 ? -0.25 : 0;
      scene.add(f.root); f.place = i;
      return f;
    });
    // Partikel: Konfetti und Sekt
    const mkPts = (n, size, colors) => {
      const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const c = new THREE.Color(colors[i % colors.length]); col.set([c.r, c.g, c.b], i * 3); pos[i * 3 + 1] = -10; }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
      p.frustumCulled = false; scene.add(p); return { p, pos, vel: new Float32Array(n * 3), n, next: 0 };
    };
    const tc = podium.slice(0, 3).flatMap(p => p.team.colors.slice(0, 2));
    this.confetti = mkPts(1400, 0.09, ['#ffffff', '#ffd400', '#ff3b1f', ...tc]);
    this.spray = mkPts(900, 0.075, ['#fff6d8', '#ffe9a8', '#ffffff']);
    this.t = 0; this.info = info;
  }
  _emit(P, x, y, z, vx, vy, vz, spread) {
    const i = P.next; P.next = (P.next + 1) % P.n;
    P.pos.set([x, y, z], i * 3);
    P.vel.set([vx + (Math.random() - 0.5) * spread, vy + (Math.random() - 0.5) * spread, vz + (Math.random() - 0.5) * spread], i * 3);
  }
  _step(P, dt, grav, drag) {
    const p = P.pos, v = P.vel;
    for (let i = 0; i < P.n; i++) {
      const k = i * 3; if (p[k + 1] < -5) continue;
      v[k] *= 1 - drag * dt; v[k + 2] *= 1 - drag * dt; v[k + 1] = v[k + 1] * (1 - drag * dt) - grav * dt;
      p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      if (p[k + 1] < 0.01) { p[k + 1] = 0.01; v[k] = v[k + 1] = v[k + 2] = 0; }
    }
    P.p.geometry.attributes.position.needsUpdate = true;
  }
  /** Ablauf: 0–3 s winken, 3–7 s Pokale, ab 7 s Sektdusche + Jubel; Kamera fährt langsam um das Podest */
  update(dt, aspect) {
    this.t += dt; const t = this.t;
    const phase = t < 3 ? 'wave' : t < 7.5 ? 'trophy' : 'spray';
    if (phase === 'trophy' && !this._trophies) { this._trophies = true; this.drivers.forEach((d, i) => d.hold(trophyMesh(i))); }
    if (phase === 'spray' && !this._bottles) { this._bottles = true; this.drivers.forEach(d => d.hold(bottleMesh())); }
    this.drivers.forEach((d, i) => d.update(dt, phase === 'spray' && t % 6 > 4.5 ? 'cheer' : phase));
    // Konfetti ab dem Pokal, Sekt in der Duschphase
    if (t > 3) { const n = Math.floor(dt * 260); for (let k = 0; k < n; k++) this._emit(this.confetti, (Math.random() - 0.5) * 8, 7, (Math.random() - 0.5) * 4, 0, -0.3, 0, 0.6); }
    if (phase === 'spray') {
      const v = new THREE.Vector3();
      for (const d of this.drivers) {
        d.arms[1].hand.getWorldPosition(v);
        const n = Math.floor(dt * 140); for (let k = 0; k < n; k++) this._emit(this.spray, v.x, v.y + 0.1, v.z + 0.1, (d.place === 1 ? 1 : d.place === 2 ? -1 : (Math.random() - 0.5)) * 1.5, 3.2, 2.6, 1.6);
      }
    }
    this._step(this.confetti, dt, 0.9, 1.4); this._step(this.spray, dt, 9.81, 0.5);
    // Kamera: Halbkreis vor dem Podest, am Anfang nah am Sieger
    const a = Math.sin(t * 0.12) * 0.55, r = lerp(5.2, 7.4, smoothstep(0, 6, t));
    this.camera.position.set(Math.sin(a) * r, lerp(1.9, 2.4, smoothstep(0, 6, t)), Math.cos(a) * r + 0.4);
    this.camera.lookAt(0, lerp(1.95, 1.55, smoothstep(0, 6, t)), 0);
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
  }
  dispose() { this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); if (this.envRT) this.envRT.dispose(); }
}
