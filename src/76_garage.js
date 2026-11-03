// ============================================================================
//  RENDER – Garage als animierter Hauptmenü-Hintergrund
// ============================================================================

class GarageScene {
  constructor(renderer) {
    this.renderer = renderer;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07080b);
    scene.fog = new THREE.Fog(0x07080b, 14, 34);
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 120);
    // Umgebungsreflexionen (RoomEnvironment über PMREM)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment(renderer);
    this.envRT = pmrem.fromScene(room, 0.04);
    scene.environment = this.envRT.texture;
    room.dispose(); pmrem.dispose();
    // Boden
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1c21, roughness: 0.28, metalness: 0.2 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    // Bodenmarkierungen
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xff3b1f });
    for (const x of [-2.6, 2.6]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 9), lineMat); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.002, 0); scene.add(l); }
    // Drehteller
    this.turn = new THREE.Group(); scene.add(this.turn);
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.25, 0.06, 64), new THREE.MeshStandardMaterial({ color: 0x24272e, roughness: 0.35, metalness: 0.5 }));
    tt.position.y = 0.03; tt.receiveShadow = true; scene.add(tt);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.22, 0.02, 8, 96), new THREE.MeshBasicMaterial({ color: 0xff3b1f }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.062; scene.add(ring);
    // Rückwand mit Lichtleisten und Logo
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.7 });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), wallMat); wall.position.set(0, 5, -7); scene.add(wall);
    const sideL = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), wallMat); sideL.rotation.y = Math.PI / 2; sideL.position.set(-11, 5, 4); scene.add(sideL);
    const sideR = sideL.clone(); sideR.rotation.y = -Math.PI / 2; sideR.position.x = 11; scene.add(sideR);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xf2f4f8 });
    for (let k = -4; k <= 4; k++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 6), stripMat); s.position.set(k * 2.2, 4.2, -6.98); scene.add(s); }
    const logoTex = Tex.banner('APEX FORMULA', 'WORLD CHAMPIONSHIP');
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), new THREE.MeshBasicMaterial({ map: logoTex, toneMapped: false }));
    logo.position.set(0, 7.6, -6.95); scene.add(logo);
    // Deckenlichtfelder
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const z of [-2, 2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.4), panelMat); p.rotation.x = Math.PI / 2; p.position.set(0, 7.5, z); scene.add(p); }
    // Requisiten: Reifenstapel, Werkzeugwagen
    const tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.38, 28);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.85 });
    const bandMats = COMPOUND_ORDER.slice(0, 3).map(c => new THREE.MeshStandardMaterial({ color: new THREE.Color(COMPOUNDS[c].color), roughness: 0.5 }));
    const bandGeo = new THREE.TorusGeometry(0.3, 0.015, 6, 28);
    [[-6.2, -4.2], [-5.3, -4.6], [6.0, -4.3], [5.1, -3.6]].forEach(([x, z], k) => {
      for (let h = 0; h < 4 - (k % 2); h++) {
        const t = new THREE.Mesh(tyreGeo, tyreMat); t.position.set(x, 0.19 + h * 0.39, z); t.castShadow = true; scene.add(t);
        const b = new THREE.Mesh(bandGeo, bandMats[k % 3]); b.rotation.x = Math.PI / 2; b.position.set(x, 0.38 + h * 0.39, z); scene.add(b);
      }
    });
    const cart = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.7), new THREE.MeshStandardMaterial({ color: 0xc4122f, roughness: 0.4, metalness: 0.4 }));
    cart.position.set(-7.5, 0.55, -1.5); cart.castShadow = true; scene.add(cart);
    // Licht
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20232a, 0.6));
    const key = new THREE.SpotLight(0xffffff, 380, 30, 0.6, 0.5, 1.6);
    key.position.set(3, 8, 5); key.target.position.set(0, 0.4, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004;
    scene.add(key); scene.add(key.target);
    const rim = new THREE.SpotLight(0xff6a3d, 220, 30, 0.7, 0.6, 1.6); rim.position.set(-5, 5, -5); rim.target.position.set(0, 0.5, 0); scene.add(rim); scene.add(rim.target);
    const fill = new THREE.PointLight(0x7fb0ff, 40, 20, 2); fill.position.set(0, 3, 8); scene.add(fill);
    this.car = null; this.veh = null; this.t = Math.random() * 10;
  }
  setCar(team, number) {
    if (this.car) { this.turn.remove(this.car.root); }
    this.car = new CarVisual(team, number, { detail: 'high', physical: true });
    this.car.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.veh = new Vehicle(CAR_SPEC, {});
    this.veh.placeAt(0, 0.062, 0, 0);
    this.veh.engOmega = 0;
    this.turn.add(this.car.root);
    this.car.update(this.veh, 1, 0, null, 0);
  }
  update(dt, aspect) {
    this.t += dt;
    this.turn.rotation.y += dt * 0.16;
    const a = this.t * 0.07;
    this.camera.position.set(Math.sin(a) * 1.6 + 5.6, 1.55 + Math.sin(this.t * 0.21) * 0.15, Math.cos(a) * 1.2 + 4.6);
    this.camera.lookAt(0.6, 0.35, 0);
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    if (this.car) {
      // leicht eingelenkte Vorderräder und Lenkrad
      const st = Math.sin(this.t * 0.3) * 0.25;
      this.veh.input.steer = st; this.veh._controls(0.0001);
      this.car.update(this.veh, 1, st * 180, null, this.t);
    }
  }
}
