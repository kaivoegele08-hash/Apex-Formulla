// ============================================================================
//  PHYSICS – Fahrzeugdynamik (360 Hz, semi-implizit, allokationsfrei im Hotpath)
//  Starrkörper 6 DOF · 4 Feder-Dämpfer + Stabis + Packer · Pacejka-Reifen mit
//  Reibungsellipse, Lastempfindlichkeit, 3-Zonen-Temperatur, Verschleiß, Flatspots
//  · aktive Aero + Ground Effect + Aufsetzen · Hybrid (ICE + MGU-K + Batterie)
//  · 8-Gang-Getriebe, Kupplung, Sperrdifferential (implizit gelöst) · Bremsen mit
//  Temperatur · Fahrhilfen (TC/ABS/Auto-Schalten) · FFB-Moment-Berechnung
// ============================================================================

const SLOW_VX = 2.5;    // m/s – Untergrenze des Längsschlupf-Nenners (Stabilität bei Stillstand)
const SLOW_VY = 3.0;    // m/s – Untergrenze des Schräglauf-Nenners
const RPM2RAD = Math.PI / 30;
const ERS_MODES = ['save', 'balanced', 'attack'];
const ERS_NAMES = { save: 'Sparen', balanced: 'Ausgeglichen', attack: 'Angriff' };

/** Normierte Pacejka-Kurve: g(1) = 1 im Spitzenschlupf */
class TyreCurve {
  constructor(B, C, E) {
    this.B = B; this.C = C; this.E = E;
    let best = 0, xb = 0.1;
    for (let x = 0.0005; x < 1.5; x += 0.0001) { const v = this.raw(x); if (v > best) { best = v; xb = x; } }
    this.peak = xb;
    this.slope0 = B * C * xb;      // dg/ds bei s = 0
  }
  raw(x) { const bx = this.B * x; return Math.sin(this.C * Math.atan(bx - this.E * (bx - Math.atan(bx)))); }
  g(s) { return this.raw(s * this.peak); }
  /** g(s)/s, stabil für s → 0 */
  gOverS(s) { return s < 1e-4 ? this.slope0 : this.raw(s * this.peak) / s; }
}

/** Flache Ebene als Boden (für Tests ohne Strecke) */
class FlatGround {
  constructor(h = 0) { this.h0 = h; this.length = 1e9; }
  query(x, z, hint, out) {
    out.i = 0; out.f = 0; out.s = -z; out.d = x; out.side = 1; out.h = this.h0;
    out.nx = 0; out.ny = 1; out.nz = 0; out.surf = SURF.ASPHALT; out.edge = -5; out.barrier = 1e9; out.onTrack = true; out.inAero = true;
    return out;
  }
  locate(x, z, hint, out) { out.i = 0; out.f = 0; out.d = x; return out; }
}

/** Reifenzustand: Mischung, Temperaturen (3 Oberflächenzonen + Kern), Verschleiß, Flatspot */
class TyreState {
  constructor(compoundId = 'medium', temp = 70) { this.setCompound(compoundId, temp); }
  setCompound(id, temp = 70) {
    this.id = id; this.c = COMPOUNDS[id];
    this.tS = [temp, temp, temp];   // innen, mitte, außen (°C)
    this.tC = temp;                 // Kern
    this.wear = 0;                  // 0 neu … 1 abgefahren
    this.flat = 0;                  // Flatspot-Tiefe 0…1
    this.gripT = 1; this.tEff = temp;
  }
  /** Gripfaktor aus Temperatur (Arbeitsfenster) */
  tempFactor(T) {
    const c = this.c, lo = c.tOpt - c.tWin, hi = c.tOpt + c.tWin;
    if (T < lo) return lerp(c.coldGrip, 0.985, smoothstep(lo - 65, lo, T));
    if (T > hi) return 0.985 - 0.13 * smoothstep(hi, hi + 45, T);
    const u = (T - c.tOpt) / c.tWin;
    return 1 - 0.015 * u * u;
  }
  wearFactor() { const w = this.wear; return 1 - 0.05 * w - 2.6 * Math.max(0, w - 0.72) ** 2; }
}

/** Ein Rad mit Aufhängung, Reifen, Bremse */
class Wheel {
  constructor(idx, spec) {
    this.idx = idx;
    this.front = idx < 2; this.left = (idx % 2) === 0;
    this.side = this.left ? -1 : 1;
    const a = spec.wheelbase * (1 - spec.frontWeight), b = spec.wheelbase * spec.frontWeight;
    this.lx = (this.front ? spec.trackF : spec.trackR) * 0.5 * this.side;
    this.lz = this.front ? -a : b;
    this.radius = this.front ? spec.rF : spec.rR;
    this.inertia = this.front ? spec.IwF : spec.IwR;
    this.width = this.front ? spec.tyreWidthF : spec.tyreWidthR;
    this.travel = spec.suspTravel;
    this.hit = new GroundHit(); this.hint = -1;
    this.tyre = new TyreState('medium');
    this.reset();
  }
  reset() {
    this.omega = 0; this.spin = 0; this.x = 0; this.xdot = 0; this.L = this.travel;
    this.contact = false; this.Fz = 0; this.Fs = 0; this.Fx = 0; this.Fy = 0;
    this.vx = 0; this.vy = 0; this.kappa = 0; this.tanA = 0; this.sComb = 0; this.mu = 1.8;
    this.K = 0; this.a = 0; this.b = 0; this.dx = SLOW_VX; this.dy = SLOW_VY;
    this.steer = 0; this.camber = 0; this.Tb = 0; this.TbReq = 0; this.absF = 1;
    this.slipPower = 0; this.slipVel = 0; this.surf = 0; this.onTrack = true;
    this.brakeTemp = 320; this.brakeMu = 1;
    this.cx = 0; this.cy = 0; this.cz = 0;          // Kontaktpunkt (Welt)
    this.wcx = 0; this.wcy = 0; this.wcz = 0;       // Radmitte (Welt)
    this.fx = 0; this.fy = 0; this.fz = -1;         // Rad-Vorwärtsrichtung (Welt, auf Bodenebene)
    this.lxw = 1; this.lyw = 0; this.lzw = 0;       // Rad-Querrichtung (Welt)
    this.nx = 0; this.ny = 1; this.nz = 0;
    this.locked = false; this.vib = 0;
  }
}

class Vehicle {
  constructor(spec = CAR_SPEC, setup = DEFAULT_SETUP) {
    this.spec = spec;
    this.setup = Object.assign({}, DEFAULT_SETUP, setup);
    this.curveX = new TyreCurve(spec.tyre.Bx, spec.tyre.Cx, spec.tyre.Ex);
    this.curveY = new TyreCurve(spec.tyre.By, spec.tyre.Cy, spec.tyre.Ey);
    // Starrkörper
    this.mass = spec.mass; this.invMass = 1 / spec.mass;
    const [bw, bh, bl] = spec.inertiaBox, m = spec.mass;
    this.I = new Vec3(m / 12 * (bh * bh + bl * bl), m / 12 * (bw * bw + bl * bl), m / 12 * (bw * bw + bh * bh)); // Nicken, Gieren, Rollen
    this.invI = new Vec3(1 / this.I.x, 1 / this.I.y, 1 / this.I.z);
    this.pos = new Vec3(); this.q = new Quat(); this.vel = new Vec3(); this.angVel = new Vec3();
    this.prevPos = new Vec3(); this.prevQ = new Quat();
    this.R = new Mat3();
    this.wheels = [0, 1, 2, 3].map(i => new Wheel(i, spec));
    // Hilfsvektoren (wiederverwendet)
    this._F = new Vec3(); this._T = new Vec3(); this._v = new Vec3(); this._w = new Vec3();
    this._right = new Vec3(); this._up = new Vec3(); this._fwd = new Vec3();
    this._hit = new GroundHit(); this._loc = { i: 0, f: 0, d: 0 };
    this._t1 = new Vec3(); this._t2 = new Vec3(); this._t3 = new Vec3();
    // Karosserie-Kontaktpunkte [x, y, z, k, c, mu, typ] typ: 1 = Planke, 2 = Frontflügel, 0 = sonstige
    const fy = spec.floorY;
    this.contactPts = [
      [0, fy, spec.plankZ[0], 4.0e5, 9000, 0.30, 1], [0, fy, 0.0, 4.0e5, 9000, 0.30, 1], [0, fy, spec.plankZ[1], 4.0e5, 9000, 0.30, 1],
      [-0.72, fy + 0.012, 0.25, 3.0e5, 7000, 0.35, 1], [0.72, fy + 0.012, 0.25, 3.0e5, 7000, 0.35, 1],
      [-0.92, -0.162, -2.55, 2.0e5, 5000, 0.45, 2], [0.92, -0.162, -2.55, 2.0e5, 5000, 0.45, 2],
      [0, 0.66, 0.25, 2.0e5, 6000, 0.6, 0], [0, 0.58, -0.35, 2.0e5, 6000, 0.6, 0], [0, 0.68, 2.25, 2.0e5, 6000, 0.6, 0],
      [-0.55, 0.16, 0.45, 2.0e5, 6000, 0.6, 0], [0.55, 0.16, 0.45, 2.0e5, 6000, 0.6, 0], [0, 0.04, -2.3, 2.0e5, 6000, 0.6, 0],
    ];
    this.contactHints = new Int32Array(this.contactPts.length).fill(-1);
    // Kollisions-Eckpunkte für Barrieren (lokal)
    this.hullPts = [[-0.98, 0.0, -2.62], [0.98, 0.0, -2.62], [-1.0, 0.0, -1.85], [1.0, 0.0, -1.85], [-1.0, 0.0, 1.55], [1.0, 0.0, 1.55], [-0.6, 0.2, 2.45], [0.6, 0.2, 2.45], [0, 0, -2.85]];
    // Fahrereingaben (vom Spiel pro Frame gesetzt)
    this.input = { steer: 0, throttle: 0, brake: 0, clutch: 0, steerSource: 'keyboard' };
    this.aids = { tc: 1, abs: false, autoShift: false, autoClutch: true, manualClutch: false };
    this.track = null; this.ground = new FlatGround(0);
    this.trackIdx = -1; this.trackS = 0; this.lateral = 0;
    this.water = 0;           // Streckennässe 0…1 (Phase 5)
    this.trackGrip = 1.0;     // Gummiaufbau (Phase 2)
    this.health = { fw: 1, rw: 1, floor: 1, susp: [1, 1, 1, 1], toe: [0, 0, 0, 0], engine: 1 };   // Schaden: 1 = intakt
    this.slipstream = 0; this.dirtyAir = 0;                         // von der Rennlogik (Phase 3)
    this.applySetup(this.setup);
    this.resetState();
  }

  // ---------------------------------------------------------------------------
  //  Setup → physikalische Parameter
  // ---------------------------------------------------------------------------
  applySetup(setup) {
    const S = this.setup = Object.assign({}, DEFAULT_SETUP, setup);
    const spec = this.spec, mg = this.mass * G0;
    const hf = S.rideF / 1000, hr = S.rideR / 1000;
    const zf = spec.plankZ[0], zr = spec.plankZ[1];
    this.staticRake = hr - hf;
    this.refRideF = hf; this.refRideR = hr;
    for (const w of this.wheels) {
      const k = (w.front ? S.springF : S.springR) * 1000;
      const mCorner = this.mass * (w.front ? spec.frontWeight : 1 - spec.frontWeight) / 2;
      const cc = 2 * Math.sqrt(k * mCorner);
      w.k = k; w.cBump = 0.38 * cc; w.cReb = 0.62 * cc;
      w.kArb = (w.front ? S.arbF : S.arbR) * 1000;
      w.Fstatic = mg * (w.front ? spec.frontWeight : 1 - spec.frontWeight) / 2;
      w.xStatic = w.Fstatic / k;
      w.xBump = w.xStatic + (w.front ? spec.bumpGap[0] : spec.bumpGap[1]);
      w.kBump = 1.6e6; w.kBump2 = 9e7;
      // Bodenlinie im Fahrzeugsystem (statisch) → Radmittelpunkt → Federbein-Oberpunkt
      const hz = hf + (hr - hf) * (w.lz - zf) / (zr - zf);
      const yGround = spec.floorY - hz;
      const yWheel = yGround + w.radius;
      w.yTop = yWheel + (w.travel - w.xStatic);
      w.camberStatic = (w.front ? S.camberF : S.camberR) * DEG;
      w.toe = (w.front ? S.toeF : S.toeR) * DEG * (w.left ? 1 : -1);
      w.pressure = w.front ? S.pressureF : S.pressureR;
      w.pressOpt = w.front ? 22.5 : 21.0;
    }
    this.brakeBias = S.brakeBias / 100;
    this.brakePressure = S.brakePressure / 100;
    this.diffOn = S.diffOn / 100; this.diffOff = S.diffOff / 100; this.diffPreload = S.diffPreload;
    const a = spec.aero;
    this.clFW = a.clFW * (1 + 0.075 * (S.frontWing - 6));
    this.clRW = a.clRW * (1 + 0.09 * (S.rearWing - 6));
    this.cdFW = a.cdFW * (1 + 0.05 * (S.frontWing - 6));
    this.cdRW = a.cdRW * (1 + 0.08 * (S.rearWing - 6));
  }

  resetState() {
    const spec = this.spec;
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0);
    for (const w of this.wheels) { w.reset(); w.x = w.xStatic; w.L = w.travel - w.xStatic; w.Fz = w.Fstatic; w.contact = true; }
    this.engOmega = spec.engine.idleRpm * RPM2RAD;
    this.gear = 1; this.shiftTimer = 0; this.shiftTarget = 1; this.shiftDir = 0; this.shiftCount = 0;
    this.clutchLocked = false; this.clutchCmd = 0; this.clutchTorque = 0;
    this.boost = 0; this.limiterCut = false; this.engTorque = 0; this.iceTorque = 0;
    this.thrCmd = 0; this.tcCut = 0; this.tcI = 0; this.tcActive = false; this.absActive = false; this.launchC = 0;
    this.soc = 0.8 * spec.ers.battMJ * 1e6; this.ersMode = 'balanced';
    this.ersPower = 0; this.kTorque = 0; this.harvesting = false;
    this.overtakeAvailable = false; this.overtakeActive = false;
    this.drsOK = true; this.aeroFlap = 0; this.aeroWant = 0; this.aeroManual = false; this.aeroAuto = true; this.inAeroZone = false;
    this.pitLimiter = false;
    this.rideF = this.refRideF; this.rideR = this.refRideR;
    this.downforce = 0; this.drag = 0; this.plankForce = 0; this.scrapeIntensity = 0; this.wingScrape = 0;
    this.ffb = 0; this.ffbRaw = 0; this.ffbFx = 0; this.impact = 0; this.impactTime = -10; this.impactNormal = new Vec3();
    this.speed = 0; this.vLong = 0; this.vLat = 0; this.accelLong = 0; this.accelLat = 0; this.yawRate = 0;
    this.time = 0; this.distance = 0;
    this.shiftDenied = 0; this.lastShiftTime = -10;
    this.events = [];   // {type, value} für Audio/UI
    this.surfVib = 0; this.kerbVib = 0; this.offTrackWheels = 0; this.limitWheels = 0; this.inPitLane = false; this.pitAuto = false; this.lapDeploy = 0;
  }

  setCompound(id, temp = 70) { for (const w of this.wheels) w.tyre.setCompound(id, temp); }
  get compound() { return this.wheels[0].tyre.id; }

  /** Fahrzeug auf die Strecke setzen (s = Streckenmeter, lateral = Querablage) */
  placeOnTrack(track, s, lateral = 0) {
    this.track = track;
    const p = track.poseAt(s, lateral);
    this.placeAt(p.x, p.y, p.z, p.yaw);
    this.trackIdx = p.j;
    for (const w of this.wheels) w.hint = p.j;
    this.contactHints.fill(p.j);
  }
  placeAt(x, y, z, yaw) {
    this.resetState();
    const spec = this.spec;
    const cgH = -(spec.floorY - (this.refRideF + (this.refRideR - this.refRideF) * (0 - spec.plankZ[0]) / (spec.plankZ[1] - spec.plankZ[0])));
    this.pos.set(x, y + cgH, z);
    const pitch = Math.atan2(this.refRideR - this.refRideF, spec.plankZ[1] - spec.plankZ[0]);
    const qy = new Quat().setFromAxisAngle(0, 1, 0, yaw);
    const qp = new Quat().setFromAxisAngle(1, 0, 0, -pitch);   // Nase leicht nach unten (Rake)
    this.q.multiplyQuats(qy, qp).normalize();
    this.prevPos.copy(this.pos); this.prevQ.copy(this.q);
  }

  // ---------------------------------------------------------------------------
  //  Getriebe
  // ---------------------------------------------------------------------------
  ratioOf(g) {
    const gb = this.spec.gearbox;
    if (g === 0) return 0;
    if (g < 0) return -gb.reverse * gb.final;
    return gb.ratios[g - 1] * gb.final;
  }
  get numGears() { return this.spec.gearbox.ratios.length; }
  /** Schaltanforderung: +1 hoch, −1 runter. Rückgabe: true wenn angenommen */
  requestShift(dir) {
    if (this.shiftTimer > 0) return false;
    const spd = Math.abs(this.vLong);
    let target = this.gear + dir;
    if (target > this.numGears) return false;
    if (target < -1) return false;
    if (this.gear === 1 && dir < 0 && spd > 1.5) return false;         // Leerlauf nur fast im Stand
    if (this.gear === 0 && dir < 0 && spd > 0.8) return false;         // Rückwärtsgang nur im Stillstand
    if (this.gear === -1 && dir > 0 && this.vLong < -0.8) return false;
    if (target > 0 && dir < 0) {
      // Schaltsperre gegen Überdrehen
      const wAvg = (this.wheels[2].omega + this.wheels[3].omega) * 0.5;
      const rpmAfter = Math.abs(this.ratioOf(target) * wAvg) / RPM2RAD;
      if (rpmAfter > this.spec.engine.limitRpm * 1.015) { this.shiftDenied = 0.6; this.events.push({ type: 'shiftDenied' }); return false; }
    }
    this.shiftTarget = target; this.shiftDir = dir;
    this.shiftTimer = this.spec.gearbox.shiftTime;
    this.clutchLocked = false;
    this.events.push({ type: 'shift', value: dir, from: this.gear, to: target });
    return true;
  }

  // ---------------------------------------------------------------------------
  //  Hauptschritt
  // ---------------------------------------------------------------------------
  step(h) {
    this.prevPos.copy(this.pos); this.prevQ.copy(this.q);
    this.time += h;
    const R = this.R.fromQuat(this.q), e = R.e;
    this._right.set(e[0], e[3], e[6]); this._up.set(e[1], e[4], e[7]); this._fwd.set(-e[2], -e[5], -e[8]);
    const fwd = this._fwd, rgt = this._right, vel = this.vel;
    this.vLong = vel.dot(fwd); this.vLat = vel.dot(rgt); this.speed = vel.length();
    this._F.set(0, -G0 * this.mass, 0); this._T.set(0, 0, 0);

    // Streckenposition (Schwerpunkt)
    const ground = this.track || this.ground;
    if (this.track) {
      const loc = this.track.locate(this.pos.x, this.pos.z, this.trackIdx, this._loc);
      this.trackIdx = loc.i; this.lateral = loc.d;
      const sPrev = this.trackS;
      this.trackS = this.track.S[loc.i] + loc.f * this.track.ds;
      if (sPrev > this.track.length - 60 && this.trackS < 60) this.lapDeploy = 0;   // neue Runde: Einsatzbudget zurücksetzen
      this.inAeroZone = this.track.aero[loc.i] === 1;
      const P = this.track.pit;
      this.inPitLane = !!(P && P.inPit[loc.i] && (loc.d >= 0 ? 1 : 0) === P.s && Math.abs(loc.d) > this.track.BD[P.s][loc.i] - 0.3);
    } else this.inAeroZone = true;

    this._controls(h);
    for (const w of this.wheels) this._suspension(w, h, ground);
    this._antiRoll();
    for (const w of this.wheels) this._applySuspension(w);
    for (const w of this.wheels) this._tyrePre(w);
    this._ersLogic(h);
    this._engineTorque(h);
    this._drivetrain(h);
    for (const w of this.wheels) this._tyreForces(w, h);
    this._aero(h);
    this._bodyContacts(h, ground);
    this._integrate(h);
    if (this.track) this._walls(h);
    this._thermal(h);
    this._energy(h);
    this._ffbCalc(h);
    // Abgeleitete Größen
    const aL = this._F.dot(fwd) * this.invMass, aT = this._F.dot(rgt) * this.invMass;
    this.accelLong = lerp(this.accelLong, aL, 0.05); this.accelLat = lerp(this.accelLat, aT, 0.05);
    this.yawRate = this.angVel.dot(this._up);
    this.distance += Math.max(0, this.vLong) * h;
    if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
  }

  // ---------------------------------------------------------------------------
  //  Mehrspieler: ferngesteuertes Fahrzeug (Zustand kommt über das Netzwerk)
  // ---------------------------------------------------------------------------
  /** Netz-Zustand übernehmen: { x,y,z, qx,qy,qz,qw, vx,vy,vz, steer, rpm, thr, brk, gear, cpd, flap } */
  netApply(st) {
    this.net = this.net || { has: false };
    const n = this.net;
    n.x = st.x; n.y = st.y; n.z = st.z; n.vx = st.vx; n.vy = st.vy; n.vz = st.vz;
    n.qx = st.qx; n.qy = st.qy; n.qz = st.qz; n.qw = st.qw;
    if (!n.has || Math.hypot(st.x - this.pos.x, st.z - this.pos.z) > 25) { this.pos.set(st.x, st.y, st.z); this.q.set(st.qx, st.qy, st.qz, st.qw); }
    n.has = true; n.age = 0;
    this.netRpm = st.rpm; this.input.throttle = st.thr; this.input.brake = st.brk; this.gear = st.gear;
    const cpd = COMPOUND_ORDER[st.cpd]; if (cpd && cpd !== this.compound) this.setCompound(cpd, 80);
    this.aeroFlap = st.flap; this.wheels[0].steer = this.wheels[1].steer = st.steer;
  }
  /** Ersatz für step(): Position vorhersagen (letzte Geschwindigkeit) und weich zum Netzstand ziehen */
  netStep(h) {
    this.prevPos.copy(this.pos); this.prevQ.copy(this.q);
    this.time += h;
    const n = this.net;
    if (n && n.has) {
      n.age += h; n.x += n.vx * h; n.y += n.vy * h; n.z += n.vz * h;   // Zielpunkt läuft mit
      const k = 1 - Math.exp(-h * 14);
      this.pos.x += (n.x - this.pos.x) * k; this.pos.y += (n.y - this.pos.y) * k; this.pos.z += (n.z - this.pos.z) * k;
      this.vel.set(n.vx, n.vy, n.vz);
      // Rotation: nlerp Richtung Netzstand
      let qx = n.qx, qy = n.qy, qz = n.qz, qw = n.qw; const q = this.q;
      if (q.x * qx + q.y * qy + q.z * qz + q.w * qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
      q.x += (qx - q.x) * k; q.y += (qy - q.y) * k; q.z += (qz - q.z) * k; q.w += (qw - q.w) * k;
      const ql = Math.hypot(q.x, q.y, q.z, q.w) || 1; q.x /= ql; q.y /= ql; q.z /= ql; q.w /= ql;
    }
    this.angVel.set(0, 0, 0);
    const R = this.R.fromQuat(this.q), e = R.e;
    this._right.set(e[0], e[3], e[6]); this._up.set(e[1], e[4], e[7]); this._fwd.set(-e[2], -e[5], -e[8]);
    this.vLong = this.vel.dot(this._fwd); this.vLat = this.vel.dot(this._right); this.speed = this.vel.length();
    if (this.track) {
      const loc = this.track.locate(this.pos.x, this.pos.z, this.trackIdx, this._loc);
      this.trackIdx = loc.i; this.lateral = loc.d; this.trackS = this.track.S[loc.i] + loc.f * this.track.ds;
      this.inAeroZone = this.track.aero[loc.i] === 1;
      const P = this.track.pit;
      this.inPitLane = !!(P && P.inPit[loc.i] && (loc.d >= 0 ? 1 : 0) === P.s && Math.abs(loc.d) > this.track.BD[P.s][loc.i] - 0.3);
    }
    // Raddrehung für die Grafik, Motordrehzahl für den Klang der Gegner
    for (const w of this.wheels) { w.omega = this.vLong / w.radius; w.spin += w.omega * h; }
    if (this.netRpm) this.engOmega = this.netRpm * RPM2RAD;
    this.distance += Math.max(0, this.vLong) * h;
  }
  /** Kompakter Netz-Zustand dieses (selbst simulierten) Fahrzeugs */
  netState() {
    const p = this.pos, q = this.q, v = this.vel;
    return { x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, vx: v.x, vy: v.y, vz: v.z, steer: (this.wheels[0].steer + this.wheels[1].steer) / 2, rpm: this.rpm, thr: this.input.throttle, brk: this.input.brake, gear: this.gear, cpd: Math.max(0, COMPOUND_ORDER.indexOf(this.compound)), flap: this.aeroFlap || 0 };
  }

  // ---------------------------------------------------------------------------
  //  Fahrerbefehle, Lenkung, Fahrhilfen, Bremsverteilung, Aero-Modus
  // ---------------------------------------------------------------------------
  _controls(h) {
    const spec = this.spec, inp = this.input, W = this.wheels;
    // Lenkung: ±1 = ±180° Lenkrad = ±21° Radeinschlag
    const st = clamp(inp.steer, -1, 1);
    const d = st * spec.maxWheelAngleDeg * DEG;
    const ack = spec.ackermann;
    const dt = this.health.toe;   // verbogene Aufhängung → Spurfehler (zieht zur Seite)
    W[0].steer = d * (d < 0 ? 1 + ack : 1 - ack * 0.5) + W[0].toe + dt[0];
    W[1].steer = d * (d > 0 ? 1 + ack : 1 - ack * 0.5) + W[1].toe + dt[1];
    W[2].steer = W[2].toe + dt[2]; W[3].steer = W[3].toe + dt[3];

    // Gas: Schaltvorgang, Fahrhilfen, Begrenzer
    let thr = clamp(inp.throttle, 0, 1);
    // Traktionskontrolle: Längs- UND kombinierten Schlupf der Antriebsräder begrenzen
    const tcK = this.aids.tc === 2 ? 0.085 : (this.aids.tc === 1 ? 0.115 : 0);
    const tcS = this.aids.tc === 2 ? 1.0 : 1.22;
    const kr = Math.max(W[2].kappa, W[3].kappa);
    const sr = Math.max(W[2].kappa > 0.012 ? W[2].sComb : 0, W[3].kappa > 0.012 ? W[3].sComb : 0);
    if (tcK > 0 && thr > 0.05) {
      const ex = clamp(Math.max(kr - tcK, (sr - tcS) * this.curveX.peak), -0.3, 1.5);
      this.tcI = clamp(this.tcI + ex * h * 5, 0, 0.6);
      const target = clamp(ex * 2.2 + this.tcI, 0, 0.9);
      this.tcCut += (target - this.tcCut) * clamp(h * (target > this.tcCut ? 45 : 12), 0, 1);
    } else { this.tcCut = Math.max(0, this.tcCut - 6 * h); this.tcI = 0; }
    this.tcActive = this.tcCut > 0.04;
    thr *= (1 - this.tcCut);
    if (this.pitLimiter) {
      const vLim = 80 / KMH;
      const lim = clamp((vLim - this.vLong) * 0.9 + 0.12, 0, 1);
      thr = Math.min(thr, lim);
    }
    this.thrCmd = thr;

    // Bremse: Pedal → Druck → Verteilung → ABS je Rad
    const brk = clamp(inp.brake, 0, 1);
    const Tmax = spec.brakes.maxTorque * this.brakePressure * brk;
    let anyAbs = false;
    for (const w of W) {
      let T = Tmax * (w.front ? this.brakeBias : 1 - this.brakeBias) * 0.5;
      if (this.aids.abs && brk > 0.02 && Math.abs(w.vx) > 2.5) {
        if (w.kappa < -spec.brakes.absSlip) { w.absF = Math.max(0.15, w.absF - 30 * h); anyAbs = true; }
        else w.absF = Math.min(1, w.absF + 9 * h);
      } else w.absF = Math.min(1, w.absF + 20 * h);
      w.TbReq = T * w.absF * w.brakeMu;
    }
    this.absActive = anyAbs;

    // Aktive Aerodynamik: Geradenmodus nur in Zonen, Zurückklappen beim Bremsen
    let want = this.aeroWant;
    // Epochen: 'active' (beide Flügel, jede Zone), 'drs' (nur Heckflügel, nur mit Freigabe), 'none'
    const aMode = spec.aero.mode || 'active';
    if (aMode === 'none' || !this.inAeroZone || brk > 0.08 || (aMode === 'drs' && !this.drsOK)) want = 0;
    else if (this.aeroAuto) {
      if (thr > 0.9 && this.vLong > 150 / KMH && inp.throttle > 0.95) want = 1;
    } else want = this.aeroManual ? 1 : 0;
    if (want === 0) this.aeroManual = false;
    this.aeroWant = want;
    const rate = h / spec.aero.flapTime;
    this.aeroFlap = want ? Math.min(1, this.aeroFlap + rate) : Math.max(0, this.aeroFlap - rate * 1.4);

    // Überholmodus endet, wenn die Energie erschöpft ist
    if (this.overtakeActive && this.soc <= 0) this.overtakeActive = false;

    // Automatisches Schalten
    if (this.aids.autoShift && this.shiftTimer <= 0 && this.gear === 0 && inp.throttle > 0.1) this.requestShift(1);
    if (this.aids.autoShift && this.shiftTimer <= 0 && this.gear >= 1) {
      const rpm = this.engOmega / RPM2RAD;
      const LIM = this.spec.engine.limitRpm;
      if (this.gear < this.numGears && rpm > LIM * 0.963 && this.clutchLocked && this.time - this.lastShiftTime > 0.25) this.requestShift(1);
      else if (this.gear > 1 && this.time - this.lastShiftTime > 0.2) {
        const wAvg = (W[2].omega + W[3].omega) * 0.5;
        const rpmDown = Math.abs(this.ratioOf(this.gear - 1) * wAvg) / RPM2RAD;
        // beim Bremsen früh runter – in den 1. Gang aber erst spät (Motorbremse blockiert sonst das Heck)
        const thresh = LIM * (brk > 0.1 ? (this.gear === 2 ? 0.74 : 0.92) : (thr < 0.2 ? 0.767 : 0.70));
        if (rpmDown < thresh) this.requestShift(-1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  //  Federung / Bodenkontakt
  // ---------------------------------------------------------------------------
  _suspension(w, h, ground) {
    const R = this.R, up = this._up, p = this.pos;
    const t = this._v;
    R.mulXYZ(w.lx, w.yTop, w.lz, t);
    const ox = p.x + t.x, oy = p.y + t.y, oz = p.z + t.z;
    const g = ground.query(ox, oz, w.hint, w.hit);
    w.hint = g.i;
    w.nx = g.nx; w.ny = g.ny; w.nz = g.nz; w.surf = g.surf; w.onTrack = g.onTrack; w.edge = g.edge;   // edge > 0: jenseits der weißen Linie
    const c = up.x * g.nx + up.y * g.ny + up.z * g.nz;
    const hO = (oy - g.h) * g.ny;
    let L = c > 0.3 ? (hO - w.radius) / c : 1e9;
    let x;
    if (L >= w.travel) { w.contact = false; L = w.travel; x = 0; }
    else { w.contact = true; x = w.travel - L; }
    if (L < -0.05) L = -0.05;   // harte Begrenzung (Packer fangen vorher ab)
    const xdot = (x - w.x) / h;
    w.xdot = xdot; w.x = x; w.L = L;
    // Radmitte und Kontaktpunkt
    w.wcx = ox - up.x * L; w.wcy = oy - up.y * L; w.wcz = oz - up.z * L;
    w.cx = w.wcx - g.nx * w.radius; w.cy = w.wcy - g.ny * w.radius; w.cz = w.wcz - g.nz * w.radius;
    if (!w.contact) { w.Fs = 0; return; }
    let F = w.k * x;
    const over = x - w.xBump;
    if (over > 0) F += w.kBump * over + w.kBump2 * over * over;
    // Dämpfer mit degressiver Kennlinie (Knie bei 0,12 m/s)
    const knee = 0.12, cd = xdot > 0 ? w.cBump : w.cReb, av = Math.abs(xdot);
    const Fd = av < knee ? cd * xdot : sgn(xdot) * cd * (knee + (av - knee) * 0.45);
    w.Fs = F + Fd;
  }

  _antiRoll() {
    const W = this.wheels;
    for (let ax = 0; ax < 2; ax++) {
      const l = W[ax * 2], r = W[ax * 2 + 1];
      if (l.contact && r.contact) {
        const f = l.kArb * (l.x - r.x) * this.health.susp[ax * 2];
        l.Fs += f; r.Fs -= f;
      }
    }
  }

  _applySuspension(w) {
    w.Fz = w.contact ? Math.max(0, w.Fs) : 0;
    if (w.Fz <= 0) return;
    // Normalkraft wirkt entlang der Bodennormale (Radaufstandskraft), Angriff in der Radmitte
    this._addForceAt(w.wcx, w.wcy, w.wcz, w.nx * w.Fz, w.ny * w.Fz, w.nz * w.Fz);
  }

  _addForceAt(px, py, pz, fx, fy, fz) {
    const F = this._F, T = this._T, p = this.pos;
    F.x += fx; F.y += fy; F.z += fz;
    const rx = px - p.x, ry = py - p.y, rz = pz - p.z;
    T.x += ry * fz - rz * fy; T.y += rz * fx - rx * fz; T.z += rx * fy - ry * fx;
  }

  // ---------------------------------------------------------------------------
  //  Reifen – Vorbereitung (Kontaktgeschwindigkeit, Reibwert, Sekantensteifigkeit)
  // ---------------------------------------------------------------------------
  _tyrePre(w) {
    const spec = this.spec, ty = spec.tyre, tyre = w.tyre;
    const fwd = this._fwd, rgt = this._right, up = this._up;
    // Radrichtung (um Fahrzeug-Hochachse gelenkt), projiziert auf Bodenebene
    const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
    let fx = fwd.x * cs + rgt.x * sn, fy = fwd.y * cs + rgt.y * sn, fz = fwd.z * cs + rgt.z * sn;
    const dn = fx * w.nx + fy * w.ny + fz * w.nz;
    fx -= w.nx * dn; fy -= w.ny * dn; fz -= w.nz * dn;
    const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    w.fx = fx; w.fy = fy; w.fz = fz;
    w.lxw = fy * w.nz - fz * w.ny; w.lyw = fz * w.nx - fx * w.nz; w.lzw = fx * w.ny - fy * w.nx;
    // Sturz relativ zum Boden (Wankwinkel mit Kompensation)
    const rollRightDown = -Math.asin(clamp(rgt.y, -1, 1));
    w.camber = w.camberStatic + rollRightDown * 0.7 * (w.left ? -1 : 1);
    if (!w.contact || w.Fz <= 0) { w.K = 0; w.a = 0; w.b = 0; w.vx = 0; w.vy = 0; return; }
    // Kontaktpunktgeschwindigkeit v + ω × r
    const p = this.pos, av = this.angVel, v = this.vel;
    const rx = w.cx - p.x, ry = w.cy - p.y, rz = w.cz - p.z;
    const vpx = v.x + av.y * rz - av.z * ry, vpy = v.y + av.z * rx - av.x * rz, vpz = v.z + av.x * ry - av.y * rx;
    w.vx = vpx * fx + vpy * fy + vpz * fz;
    w.vy = vpx * w.lxw + vpy * w.lyw + vpz * w.lzw;
    // Reibwert: Mischung × Last × Temperatur × Verschleiß × Untergrund × Sturz × Druck × Nässe
    const c = tyre.c, sd = SURFACES[w.surf];
    const load = w.Fz / (ty.fz0 * w.width / 0.34);
    let mu = c.mu * clamp(1 - ty.loadSens * (load - 1), 0.72, 1.12);
    mu *= tyre.gripT * tyre.wearFactor() * (1 - 0.05 * tyre.flat);
    mu *= lerp(sd.grip, sd.wetGrip, this.water) * (ty.muScale || 1);
    mu *= 1 - c.wetLoss * this.water - c.dryPenalty * (1 - this.water);
    const camDeg = w.camber * RAD2DEG;
    const camF = 1 + 0.012 * clamp(-camDeg, 0, 3.2) - 0.02 * Math.max(0, -camDeg - 3.2) ** 2 - 0.02 * Math.max(0, camDeg);
    mu *= camF * (1 - 0.012 * Math.abs(w.pressure - w.pressOpt));
    mu *= this.trackGrip;
    w.mu = Math.max(0.05, mu);
    w.dx = Math.max(Math.abs(w.vx), SLOW_VX);
    w.dy = Math.max(Math.abs(w.vx), SLOW_VY);
    const kap = (w.omega * w.radius - w.vx) / w.dx;
    const tA = w.vy / w.dy;
    const sx = kap / this.curveX.peak, sy = tA / this.curveY.peak;
    const s = Math.sqrt(sx * sx + sy * sy);
    // Sekantensteifigkeit (N je Einheit Längsschlupf) für die implizite Raddrehzahl-Lösung
    w.K = w.mu * w.Fz * this.curveX.gOverS(s) / this.curveX.peak;
    w.a = w.radius * w.radius * w.K / w.dx;
    w.b = w.radius * w.K * w.vx / w.dx;
    w.tanA = tA;
  }

  // ---------------------------------------------------------------------------
  //  ERS: Einsatz/Rekuperation → MGU-K-Moment an der Kurbelwelle
  // ---------------------------------------------------------------------------
  _ersLogic(h) {
    const ers = this.spec.ers, inp = this.input;
    const coupled = this.gear > 0 && this.clutchLocked && this.shiftTimer <= 0;
    const vk = Math.abs(this.vLong) * KMH;
    const max = ers.battMJ * 1e6, soc = this.soc / max;
    let Pd = 0, Ph = 0;
    this.harvesting = false;
    if (coupled) {
      const tp = this.overtakeActive ? ers.taperBoost : ers.taperNormal;
      const taper = 1 - smoothstep(tp[0], tp[1], vk);
      const brk = inp.brake;
      if (brk > 0.04) {
        // Brake-by-Wire: Rekuperation höchstens bis zum angeforderten Hinterachs-Bremsmoment
        const G = Math.abs(this.ratioOf(this.gear)) || 1;
        const rearReq = (this.wheels[2].TbReq + this.wheels[3].TbReq) * 0.65;
        const pMaxRear = rearReq / G * this.engOmega;
        Ph = Math.min(ers.maxKW * 1000, brk * 520000, pMaxRear) * smoothstep(20, 60, vk);
      } else if (this.thrCmd > 0.04) {
        const mode = this.overtakeActive ? 'attack' : this.ersMode;
        // Einsatzstrategie je Modus: Angriff leert die Batterie, Ausgeglichen hält sie im mittleren Bereich
        const socF = mode === 'attack' ? smoothstep(0.02, 0.10, soc) : (mode === 'balanced' ? smoothstep(0.10, 0.45, soc) : smoothstep(0.30, 0.65, soc));
        // Am Drehzahlbegrenzer nimmt das Steuergerät auch die MGU-K-Leistung zurück
        const lim = this.spec.engine.limitRpm, rpmNow = this.engOmega / RPM2RAD;
        const limF = 1 - smoothstep(lim - 300, lim - 20, rpmNow);
        Pd = ers.maxKW * 1000 * taper * ers.deploy[mode] * socF * Math.pow(this.thrCmd, 1.3) * limF;
        // „Super-Clipping“: im Sparmodus bei Vollgas am Geradenende nachladen
        if (this.ersMode === 'save' && !this.overtakeActive && vk > 300 && this.thrCmd > 0.95) { Pd = 0; Ph = 110000; }
      } else {
        Ph = ers.liftKW[this.ersMode] * 1000 * smoothstep(40, 90, vk);
      }
      if (this.soc >= max) Ph = 0;
      if (this.soc <= 0) Pd = 0;
      if (this.lapDeploy >= (ers.lapDeployMJ + (this.overtakeActive ? 0.5 : 0)) * 1e6) Pd = 0;   // Einsatzgrenze je Runde
    }
    const w = Math.max(this.engOmega, 400);
    this.kTorque = clamp((Pd - Ph) / w, -ers.maxCrankNm, ers.maxCrankNm);
    this.harvesting = Ph > 20000;
  }

  // ---------------------------------------------------------------------------
  //  Motor: Volllastkurve, Turbolader-Verzögerung, Schleppmoment, Begrenzer, Leerlauf
  // ---------------------------------------------------------------------------
  _engineTorque(h) {
    const eng = this.spec.engine;
    const rpm = this.engOmega / RPM2RAD;
    if (rpm > eng.limitRpm) this.limiterCut = true; else if (rpm < eng.limitRpm - 180) this.limiterCut = false;
    let thr = this.thrCmd;
    const coupled = this.gear !== 0 && this.clutchLocked;
    // Leerlaufregler (nur wenn entkoppelt bzw. sehr niedrige Drehzahl)
    if (!coupled || rpm < eng.idleRpm) {
      const idleT = clamp((eng.idleRpm + 250 - rpm) / 1800, 0, 0.32);
      thr = Math.max(thr, idleT);
    }
    if (this.limiterCut) thr = 0;
    // Zündunterbrechung beim Hochschalten
    if (this.shiftTimer > 0 && this.shiftDir > 0) thr = 0;
    const tau = lerp(eng.turboTau[0], eng.turboTau[1], clamp((rpm - 6000) / 6000, 0, 1));
    const k = 1 - Math.exp(-h / (thr > this.boost ? tau : tau * 0.35));
    this.boost += (thr - this.boost) * k;
    const Tfull = interpTable(eng.curve, rpm);
    const Tice = Tfull * thr * (0.42 + 0.58 * this.boost);
    const n = rpm / 15000;
    const Tdrag = (eng.dragBase + eng.dragK * n * n) * (1 - thr) * (rpm > 200 ? 1 : 0);
    this.iceTorque = Tice - Tdrag;
    this.engTorque = this.iceTorque + this.kTorque;
    this.throttleEff = thr;
  }

  // ---------------------------------------------------------------------------
  //  Antriebsstrang: Kupplung, Getriebe, Sperrdifferential – implizit gekoppelt
  // ---------------------------------------------------------------------------
  /** Einzelnes Rad implizit lösen (Sekanten-Linearisierung), Bremse als Reibmoment */
  _solveFree(w, h, Tdrive) {
    const m = w.inertia / h;
    const rhs = m * w.omega + w.b + Tdrive;
    const Tb = w.Tb;
    if (Tb <= 0) return rhs / (m + w.a);
    const s = w.omega > 1e-3 ? 1 : (w.omega < -1e-3 ? -1 : (rhs >= 0 ? 1 : -1));
    const om = (rhs - s * Tb) / (m + w.a);
    if (om * s < 0 || (Math.abs(w.omega) <= 1e-3)) {
      if (Math.abs(rhs) <= Tb) return 0;
      const s2 = rhs >= 0 ? 1 : -1;
      return (rhs - s2 * Tb) / (m + w.a);
    }
    return om;
  }

  _drivetrain(h) {
    const spec = this.spec, W = this.wheels, eng = spec.engine, gb = spec.gearbox;
    const L = W[2], Rr = W[3];
    // Rekuperation ersetzt einen Teil der hinteren Reibbremse (Brake-by-Wire)
    let regenAxle = 0;
    if (this.kTorque < 0 && this.clutchLocked && this.gear > 0) regenAxle = -this.kTorque * Math.abs(this.ratioOf(this.gear));
    for (const w of W) {
      w.Tb = w.TbReq;
      if (!w.front && regenAxle > 0) w.Tb = Math.max(0, w.TbReq - regenAxle * 0.5);
    }
    // Vorderräder
    W[0].omega = this._solveFree(W[0], h, 0);
    W[1].omega = this._solveFree(W[1], h, 0);

    // Schaltvorgang
    if (this.shiftTimer > 0) {
      this.shiftTimer -= h;
      if (this.shiftTimer <= 0) {
        this.gear = this.shiftTarget; this.shiftTimer = 0; this.shiftCount++;
        this.lastShiftTime = this.time; this.clutchLocked = false;
      }
    }
    const shifting = this.shiftTimer > 0;
    const G = shifting ? 0 : this.ratioOf(this.gear);
    const Ie = eng.inertia;
    const wAvg = (L.omega + Rr.omega) * 0.5;
    const wT = G * wAvg;                       // getriebeseitige Motordrehzahl
    const idleW = eng.idleRpm * RPM2RAD;
    const inp = this.input;

    // --- Kupplungssteuerung ---
    let cmd;
    if (G === 0) { cmd = 0; this.clutchLocked = false; this.clutchCmd = 0; }
    else if (this.aids.manualClutch && !this.aids.autoClutch) {
      cmd = 1 - clamp(inp.clutch, 0, 1);
    } else {
      const manual = clamp(inp.clutch, 0, 1);
      let instant = false;
      if (this.clutchLocked) {
        cmd = 1; instant = true;
        // Abwürgeschutz
        if ((this.engOmega < idleW * 1.04 && inp.throttle < 0.2) || this.engOmega < idleW * 0.9) { this.clutchLocked = false; cmd = 0; }
      } else if (Math.abs(G * this.vLong / Rr.radius) > idleW * 1.12 && Math.abs(this.engOmega - Math.abs(wT)) < 160) {
        cmd = 1; instant = true;                                // Fahrzeug schnell genug → sofort einkuppeln
      } else {
        // Anfahren: Kupplung regelt die Motordrehzahl auf einen gaspedalabhängigen Zielwert
        // (Vorsteuerung: aktuelles Motormoment übertragen + P-Anteil auf die Zieldrehzahl, kein Windup)
        if (inp.throttle > 0.03) {
          // Zieldrehzahl relativ zum Begrenzer (Standardauto 15.000: 6.450…10.050 U/min)
          const LIM = this.spec.engine.limitRpm, rpm = this.engOmega / RPM2RAD, target = LIM * (0.43 + 0.24 * inp.throttle);
          const ff = Math.max(0, this.engTorque) / gb.clutchMaxNm;
          const want = clamp(ff + (rpm - target) / (LIM * 0.213), 0, 1);
          this.launchC += (want - this.launchC) * clamp(h * 30, 0, 1);
        } else this.launchC = Math.max(0, this.launchC - h * 10);
        cmd = this.launchC; instant = true;
      }
      if (instant && cmd >= 1) this.launchC = 0;
      cmd *= 1 - manual;
      if (instant && manual < 0.02) this.clutchCmd = cmd;
    }
    this.clutchCmd = lerp(this.clutchCmd, cmd, cmd > this.clutchCmd ? clamp(h * 14, 0, 1) : clamp(h * 40, 0, 1));
    const cap = this.clutchCmd * gb.clutchMaxNm;

    let sgnL = 1, sgnR = 1;
    const mL = L.inertia / h, mR = Rr.inertia / h;
    const Te = this.engTorque;
    let wL, wR, wE;

    const solveRear = (Tin, mu4, Sold) => {
      // 2×2-System mit Motorträgheit (mu4) und Diff-Sperrmoment
      const base = Tin * 0.5 + mu4 * Sold;
      // Bremsrichtung je Hinterrad (bei Stillstand: Richtung der Antriebstendenz)
      sgnL = Math.abs(L.omega) > 1e-3 ? sgn(L.omega) : (L.b + Tin * 0.5 >= 0 ? 1 : -1);
      sgnR = Math.abs(Rr.omega) > 1e-3 ? sgn(Rr.omega) : (Rr.b + Tin * 0.5 >= 0 ? 1 : -1);
      const rL0 = mL * L.omega + base + L.b - L.Tb * sgnL;
      const rR0 = mR * Rr.omega + base + Rr.b - Rr.Tb * sgnR;
      const A11 = mL + L.a + mu4, A22 = mR + Rr.a + mu4, A12 = mu4;
      const wLock = (rL0 + rR0) / (A11 + A22 + 2 * mu4);
      let Tl = (A11 + mu4) * wLock - rL0;
      const lockF = Tin >= 0 ? this.diffOn : this.diffOff;
      const capD = this.diffPreload + lockF * Math.abs(Tin) * 0.5;
      if (Math.abs(Tl) > capD) Tl = sgn(Tl) * capD;
      const rL = rL0 + Tl, rR = rR0 - Tl;
      const det = A11 * A22 - A12 * A12;
      wL = (rL * A22 - A12 * rR) / det;
      wR = (A11 * rR - A12 * rL) / det;
      this.diffLock = Tl;
    };

    if (G === 0 || cap <= 1e-3) {
      // Motor frei
      wE = this.engOmega + h * Te / Ie;
      solveRear(0, 0, 0);
      this.clutchTorque = 0;
    } else {
      let done = false;
      if (this.clutchLocked) {
        const mu4 = Ie * G * G / (4 * h);
        const Sold = L.omega + Rr.omega;
        solveRear(G * Te, mu4, Sold);
        const wEnew = G * (wL + wR) * 0.5;
        const Tc = Te - Ie * (wEnew - this.engOmega) / h;
        if (Math.abs(Tc) <= cap * 1.0001) { wE = wEnew; this.clutchTorque = Tc; done = true; }
        else this.clutchLocked = false;
      }
      if (!done) {
        // Schleifende Kupplung: Reibmoment vom schnelleren zum langsameren Teil
        const slip = this.engOmega - wT;
        let Tc = cap * (Math.abs(slip) > 0.5 ? sgn(slip) : slip / 0.5);
        wE = this.engOmega + h * (Te - Tc) / Ie;
        solveRear(G * Tc, 0, 0);
        const wT2 = G * (wL + wR) * 0.5;
        if (sgn(wE - wT2) !== sgn(slip) || Math.abs(wE - wT2) < 0.6) {
          if (this.clutchCmd > 0.6) {
            // Synchronisiert → Impulserhaltung (Motor + Antriebsseite)
            const Jw = (L.inertia + Rr.inertia), Je = Ie * G * G;
            const wAvgNew = ((wL + wR) * 0.5 * Jw + (wE / G) * Je) / (Jw + Je);
            const dlt = wAvgNew - (wL + wR) * 0.5;
            wL += dlt; wR += dlt; wE = G * wAvgNew;
            this.clutchLocked = true;
          }
        }
        this.clutchTorque = Tc;
      }
    }
    // Bremsen dürfen die Drehrichtung nicht umkehren
    if (L.Tb > 0 && wL * sgnL < 0) wL = 0;
    if (Rr.Tb > 0 && wR * sgnR < 0) wR = 0;
    L.omega = wL; Rr.omega = wR;
    // Rev-Matching während des Schaltens (Zwischengas/Zündunterbrechung über Motorsteuerung)
    if (shifting) {
      const Gn = this.ratioOf(this.shiftTarget);
      const tgt = Math.max(idleW, Math.abs(Gn * (wL + wR) * 0.5));
      const corr = (tgt - wE) * Math.min(1, h / Math.max(this.shiftTimer, h));
      wE += clamp(corr, -70, 70);
    }
    this.engOmega = clamp(wE, 0, eng.limitRpm * 1.06 * RPM2RAD);
    for (const w of W) w.spin += w.omega * h;
  }

  // ---------------------------------------------------------------------------
  //  Reifenkräfte (kombinierter Schlupf, Reibungsellipse) + Roll-/Untergrundwiderstand
  // ---------------------------------------------------------------------------
  _tyreForces(w, h) {
    if (!w.contact || w.Fz <= 0) { w.Fx = 0; w.Fy = 0; w.kappa = 0; w.sComb = 0; w.slipPower = 0; w.slipVel = 0; w.locked = false; return; }
    const kap = (w.omega * w.radius - w.vx) / w.dx;
    w.kappa = kap;
    let Fx = w.K * kap;
    const sx = kap / this.curveX.peak, sy = w.tanA / this.curveY.peak;
    const s = Math.sqrt(sx * sx + sy * sy);
    w.sComb = s;
    const muY = w.mu * 0.97;
    let Fy = -muY * w.Fz * sy * this.curveY.gOverS(s);
    // Reibungsellipse
    const lim = w.mu * w.Fz;
    const mag = Math.hypot(Fx, Fy / 0.97);
    if (mag > lim) { const k = lim / mag; Fx *= k; Fy *= k; }
    w.Fx = Fx; w.Fy = Fy;
    // Rollwiderstand und Untergrund-Widerstand (Einsinken in Kies/Gras)
    const sd = SURFACES[w.surf];
    const Frr = -sd.rr * w.Fz * clamp(w.vx / 0.5, -1, 1);
    const ldF = w.Fz / 2000;
    const Fdl = -sd.drag * w.vx * ldF, Fdy = -sd.drag * w.vy * ldF * 0.6;
    const tx = Fx + Frr + Fdl, tyy = Fy + Fdy;
    // Kraftangriff etwas über dem Kontaktpunkt (Rollzentrum)
    const rc = 0.03;
    this._addForceAt(w.cx + w.nx * rc, w.cy + w.ny * rc, w.cz + w.nz * rc,
      w.fx * tx + w.lxw * tyy, w.fy * tx + w.lyw * tyy, w.fz * tx + w.lzw * tyy);
    const svx = w.omega * w.radius - w.vx;
    w.slipVel = Math.hypot(svx, w.vy);
    w.slipPower = Math.abs(Fx * svx) + Math.abs(Fy * w.vy);
    w.locked = Math.abs(w.vx) > 4 && Math.abs(w.omega * w.radius) < Math.abs(w.vx) * 0.25;
  }

  // ---------------------------------------------------------------------------
  //  Aerodynamik: aktive Flügel, Ground Effect, Windschatten/Dirty Air, Schaden
  // ---------------------------------------------------------------------------
  _aero(h) {
    const spec = this.spec, a = spec.aero, up = this._up, fwd = this._fwd;
    const vAir = Math.max(0, this.vel.dot(fwd));
    const q = 0.5 * a.rho * vAir * vAir;
    const t = this.aeroFlap;
    const clFW = this.clFW * lerp(1, a.straightFW, t) * this.health.fw;
    const clRW = this.clRW * lerp(1, a.straightRW, t) * this.health.rw;
    const cdFW = this.cdFW * lerp(1, a.cdStraightFW, t);
    const cdRW = this.cdRW * lerp(1, a.cdStraightRW, t);
    // Ground Effect über mittlere Unterboden-Höhe; Strömungsabriss bei sehr geringer Höhe
    const hAvg = (this.rideF + this.rideR) * 0.5;
    let ge = clamp(1 + 3.0 * (a.staticRide - hAvg), 0.75, 1.2);
    ge *= lerp(0.62, 1, smoothstep(0.003, 0.013, hAvg));
    const clFloor = spec.aero.clFloor * ge * this.health.floor;
    const floorFront = clamp(a.floorFront + 1.6 * ((this.rideR - this.rideF) - this.staticRake), 0.30, 0.52);
    const dirty = 1 - 0.28 * this.dirtyAir;
    const DFf = q * (clFW * dirty + clFloor * floorFront);
    const DFr = q * (clRW * (1 - 0.12 * this.dirtyAir) + clFloor * (1 - floorFront));
    const cd = (spec.aero.cdBody + cdFW + cdRW) * (1 - 0.32 * this.slipstream);
    const D = q * cd;
    this.downforce = DFf + DFr; this.drag = D; this.aeroBalance = (DFf + DFr) > 1 ? DFf / (DFf + DFr) : 0.47;
    const R = this.R, tp = this._v, p = this.pos;
    // Abtrieb an Vorder-/Hinterachse entlang −oben
    const zF = this.wheels[0].lz, zR = this.wheels[2].lz;
    R.mulXYZ(0, 0, zF, tp); this._addForceAt(p.x + tp.x, p.y + tp.y, p.z + tp.z, -up.x * DFf, -up.y * DFf, -up.z * DFf);
    R.mulXYZ(0, 0, zR, tp); this._addForceAt(p.x + tp.x, p.y + tp.y, p.z + tp.z, -up.x * DFr, -up.y * DFr, -up.z * DFr);
    // Luftwiderstand entgegen der Bewegung, leicht über dem Schwerpunkt
    if (this.speed > 0.5) {
      const v = this.vel, inv = 1 / this.speed;
      const dragAll = 0.5 * a.rho * this.speed * this.speed * cd;
      R.mulXYZ(0, a.dragHeight, 0, tp);
      this._addForceAt(p.x + tp.x, p.y + tp.y, p.z + tp.z, -v.x * inv * dragAll, -v.y * inv * dragAll, -v.z * inv * dragAll);
    }
  }

  // ---------------------------------------------------------------------------
  //  Karosserie-Bodenkontakte: Planke (Aufsetzen, Funken), Frontflügel, Überschlag
  // ---------------------------------------------------------------------------
  _bodyContacts(h, ground) {
    const R = this.R, p = this.pos, v = this.vel, av = this.angVel, tp = this._v;
    const upright = this._up.y > 0.75;
    this.plankForce = 0; this.wingScrape = 0;
    let rideF = this.rideF, rideR = this.rideR;
    for (let k = 0; k < this.contactPts.length; k++) {
      const c = this.contactPts[k];
      if (c[6] === 0 && upright) continue;   // Überschlag-Punkte nur bei starker Neigung
      R.mulXYZ(c[0], c[1], c[2], tp);
      const px = p.x + tp.x, py = p.y + tp.y, pz = p.z + tp.z;
      const g = ground.query(px, pz, this.contactHints[k], this._hit);
      this.contactHints[k] = g.i;
      const depth = (g.h - py) * g.ny;   // >0: unter dem Boden
      if (c[6] === 1 && k === 0) rideF = -depth;
      if (c[6] === 1 && k === 2) rideR = -depth;
      if (depth <= 0) continue;
      const rx = tp.x, ry = tp.y, rz = tp.z;
      const vpx = v.x + av.y * rz - av.z * ry, vpy = v.y + av.z * rx - av.x * rz, vpz = v.z + av.x * ry - av.y * rx;
      const vn = vpx * g.nx + vpy * g.ny + vpz * g.nz;
      let Fn = c[3] * depth - c[4] * vn;
      if (Fn <= 0) continue;
      Fn = Math.min(Fn, 2.5e5);
      const vtx = vpx - g.nx * vn, vty = vpy - g.ny * vn, vtz = vpz - g.nz * vn;
      const vt = Math.sqrt(vtx * vtx + vty * vty + vtz * vtz);
      const fr = c[5] * Fn / Math.max(vt, 0.3);
      this._addForceAt(px, py, pz, g.nx * Fn - vtx * fr, g.ny * Fn - vty * fr, g.nz * Fn - vtz * fr);
      if (c[6] === 1) this.plankForce += Fn;
      if (c[6] === 2) this.wingScrape += Fn;
    }
    this.rideF = rideF; this.rideR = rideR;
    this.scrapeIntensity = clamp(this.plankForce / 6000, 0, 1) * smoothstep(8, 25, this.speed);
  }

  // ---------------------------------------------------------------------------
  //  Integration (semi-implizites Euler-Verfahren)
  // ---------------------------------------------------------------------------
  _integrate(h) {
    const F = this._F, T = this._T, R = this.R, I = this.I, iI = this.invI;
    this.vel.addScaled(F, this.invMass * h);
    const wb = R.mulTVec(this.angVel, this._w);
    const tb = R.mulTVec(T, this._v);
    // Euler-Gleichungen im Körpersystem: I ω̇ = τ − ω × (I ω)
    const Lx = I.x * wb.x, Ly = I.y * wb.y, Lz = I.z * wb.z;
    const gx = wb.y * Lz - wb.z * Ly, gy = wb.z * Lx - wb.x * Lz, gz = wb.x * Ly - wb.y * Lx;
    wb.x += (tb.x - gx) * iI.x * h; wb.y += (tb.y - gy) * iI.y * h; wb.z += (tb.z - gz) * iI.z * h;
    R.mulVec(wb, this.angVel);
    // Begrenzung gegen numerische Ausreißer
    const wl = this.angVel.length(); if (wl > 40) this.angVel.scale(40 / wl);
    this.pos.addScaled(this.vel, h);
    this.q.integrate(this.angVel.x, this.angVel.y, this.angVel.z, h);
  }

  /** Welt-Inverse-Trägheit angewandt auf Vektor v → out */
  _invInertiaWorld(v, out) {
    const R = this.R, iI = this.invI;
    const x = v.x, y = v.y, z = v.z, e = R.e;
    const bx = (e[0] * x + e[3] * y + e[6] * z) * iI.x, by = (e[1] * x + e[4] * y + e[7] * z) * iI.y, bz = (e[2] * x + e[5] * y + e[8] * z) * iI.z;
    out.x = e[0] * bx + e[1] * by + e[2] * bz; out.y = e[3] * bx + e[4] * by + e[5] * bz; out.z = e[6] * bx + e[7] * by + e[8] * bz;
    return out;
  }

  // ---------------------------------------------------------------------------
  //  Barrieren (Mauern, Leitplanken, Reifenstapel): Impuls mit Restitution/Reibung
  // ---------------------------------------------------------------------------
  _walls(h) {
    const tr = this.track, R = this.R, p = this.pos, tp = this._v;
    let worst = 0, wn = null;
    for (let k = 0; k < this.hullPts.length; k++) {
      const c = this.hullPts[k];
      R.mulXYZ(c[0], c[1], c[2], tp);
      const px = p.x + tp.x, pz = p.z + tp.z;
      const loc = tr.locate(px, pz, this.trackIdx, this._loc);
      const side = loc.d >= 0 ? 1 : 0, jn = loc.f < 0.5 ? loc.i : (loc.i + 1) % tr.N;
      let bd = tr.BD[side][jn], pen, inward = 1;
      const P = tr.pit;
      if (P && side === P.s && P.inPit[jn]) {
        const far = bd + PIT_LANE_W, a = Math.abs(loc.d);
        if (this.inPitLane) {
          // in der Boxengasse: Außenwand (Garagen) und – außerhalb der Öffnungen – die Boxenmauer von hinten
          if (a > far) pen = a - far;
          else if (a < bd && P.inPit[jn] === 1) { pen = bd - a; inward = -1; }
          else continue;
        } else pen = a - (P.inPit[jn] === 2 ? far : bd);   // Öffnung: durchfahren bis zur Außenwand
      } else pen = Math.abs(loc.d) - bd;
      if (pen <= 0) continue;
      const sg = (loc.d >= 0 ? 1 : -1) * inward;
      const nx = -sg * tr.RX[loc.i], nz = -sg * tr.RZ[loc.i];
      // Relativgeschwindigkeit am Kontaktpunkt
      const rx = tp.x, ry = tp.y, rz = tp.z, v = this.vel, av = this.angVel;
      const vpx = v.x + av.y * rz - av.z * ry, vpz = v.z + av.x * ry - av.y * rx, vpy = v.y + av.z * rx - av.x * rz;
      const vn = vpx * nx + vpz * nz;
      // Positionskorrektur
      p.x += nx * pen * 0.9; p.z += nz * pen * 0.9;
      if (vn >= 0) continue;
      // Impuls j = −(1+e) vn / (1/m + n·((I⁻¹(r×n))×r))
      const e = 0.22;
      const rxn = this._t1.set(ry * nz, rz * nx - rx * nz, -ry * nx);
      const ii = this._invInertiaWorld(rxn, this._t2);
      const cx = ii.y * rz - ii.z * ry, cy = ii.z * rx - ii.x * rz, cz = ii.x * ry - ii.y * rx;
      const denom = this.invMass + (cx * nx + cy * 0 + cz * nz);
      const j = -(1 + e) * vn / denom;
      this._applyImpulse(rx, ry, rz, nx * j, 0, nz * j);
      // Reibung tangential (entlang der Wand)
      const tx = vpx - nx * vn, ty = vpy * 0.3, tz = vpz - nz * vn;
      const tl = Math.hypot(tx, ty, tz);
      if (tl > 0.01) {
        const jt = Math.min(0.45 * j, tl / (this.invMass * 2.5));
        this._applyImpulse(rx, ry, rz, -tx / tl * jt, -ty / tl * jt, -tz / tl * jt);
      }
      if (-vn > worst) { worst = -vn; wn = [nx, nz]; }
    }
    if (worst > 0.4) {
      this.impact = Math.max(this.impact, worst);
      this.impactTime = this.time;
      this.impactNormal.set(wn[0], 0, wn[1]);
      this.events.push({ type: 'impact', value: worst });
      if (this.onImpact) this.onImpact(worst, wn[0], wn[1], 'wall');
    }
  }

  _applyImpulse(rx, ry, rz, jx, jy, jz) {
    this.vel.x += jx * this.invMass; this.vel.y += jy * this.invMass; this.vel.z += jz * this.invMass;
    const t = this._t1.set(ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx);
    const d = this._invInertiaWorld(t, this._t3);
    this.angVel.x += d.x; this.angVel.y += d.y; this.angVel.z += d.z;
  }

  // ---------------------------------------------------------------------------
  //  Reifen- und Bremsentemperaturen, Verschleiß, Flatspots
  // ---------------------------------------------------------------------------
  _thermal(h) {
    const ty = this.spec.tyre, spd = this.speed;
    const amb = ty.ambient - 8 * this.water, trackT = ty.track - 14 * this.water;
    const hConv = ty.hBase + ty.hVel * Math.sqrt(spd) + 40 * this.water;
    let offTrack = 0, kerbVib = 0, vib = 0, beyond = 0;
    for (const w of this.wheels) {
      const t = w.tyre, c = t.c;
      // Wärmeeintrag
      const Pslip = w.slipPower * ty.slipHeat * c.heat;
      const Phys = ty.hyst * w.Fz * Math.abs(w.vx) * (1 + 0.06 * (w.pressOpt - w.pressure)) + SURFACES[w.surf].rr * 0.15 * w.Fz * Math.abs(w.vx);
      // Lastverteilung über die Lauffläche: Sturz und Querkraft
      const latIn = (w.left ? w.Fy : -w.Fy) / Math.max(w.Fz, 300);
      let skew = -w.camber * RAD2DEG * 0.07 - latIn * 0.32;
      skew = clamp(skew, -0.55, 0.55);
      const mid = 1 / 3 + 0.025 * (w.pressure - w.pressOpt);
      let wi = 1 / 3 + skew * 0.5, wo = 1 / 3 - skew * 0.5, wm = mid;
      wi = Math.max(0.04, wi); wo = Math.max(0.04, wo); wm = Math.max(0.1, wm);
      const ws = wi + wm + wo; wi /= ws; wm /= ws; wo /= ws;
      const wz = [wi, wm, wo];
      let toCore = 0;
      const contact = w.contact ? 1 : 0;
      for (let z = 0; z < 3; z++) {
        const Tz = t.tS[z];
        const qIn = Pslip * wz[z];
        const qOut = hConv * (Tz - amb) + ty.kSC * (Tz - t.tC) + 6 * contact * (Tz - trackT);
        t.tS[z] = Tz + h * (qIn - qOut) / ty.cSurf;
        toCore += ty.kSC * (Tz - t.tC);
      }
      t.tC += h * (toCore + Phys - ty.kCoreLoss * (1 + 0.02 * spd) * (t.tC - amb)) / ty.cCore;
      t.tEff = (wz[0] * t.tS[0] + wz[1] * t.tS[1] + wz[2] * t.tS[2]) * 0.72 + t.tC * 0.28;
      t.gripT = t.tempFactor(t.tEff);
      // Verschleiß: Gleitarbeit × Mischung × Überhitzung
      const hot = Math.max(0, t.tEff - (c.tOpt + c.tWin));
      t.wear = Math.min(1, t.wear + h * (ty.wearK * c.wear * w.slipPower * (1 + (hot / 14) ** 2) + 2e-7 * Math.abs(w.vx) * c.wear));
      // Flatspot durch Blockieren
      if (w.locked && w.contact) t.flat = Math.min(1, t.flat + h * 0.035 * (Math.abs(w.vx) / 40) * (w.Fz / 3000));
      // Bremsscheibe
      const Pb = w.Tb * Math.abs(w.omega) * 0.92;
      const hB = 5 + 1.0 * spd;
      w.brakeTemp += h * (Pb - hB * (w.brakeTemp - amb)) / this.spec.brakes.discCap;
      const bt = w.brakeTemp;
      w.brakeMu = bt < 350 ? lerp(0.8, 1, smoothstep(60, 350, bt)) : (bt > 1050 ? lerp(1, 0.78, smoothstep(1050, 1300, bt)) : 1);
      // Vibration (für FFB/Kamera/Audio)
      const sd = SURFACES[w.surf];
      if (w.edge > 0) beyond++;
      if (w.contact) {
        if (sd.offTrack) offTrack++;
        if (sd.kerb) kerbVib = Math.max(kerbVib, (w.surf === SURF.KERB_SAW ? 1 : (w.surf === SURF.SAUSAGE ? 0.9 : 0.5)) * smoothstep(2, 15, Math.abs(w.vx)));
        vib = Math.max(vib, sd.vibAmp * 120 * smoothstep(2, 20, Math.abs(w.vx)));
      }
    }
    this.offTrackWheels = offTrack;
    this.limitWheels = beyond;            // Track Limits: alle 4 Räder jenseits der weißen Linie
    this.kerbVib = kerbVib;
    this.surfVib = clamp(vib, 0, 1);
  }

  // ---------------------------------------------------------------------------
  //  Energiebilanz der Batterie
  // ---------------------------------------------------------------------------
  _energy(h) {
    const max = this.spec.ers.battMJ * 1e6;
    const P = this.kTorque * this.engOmega * ((this.clutchLocked && this.gear > 0) ? 1 : 0);
    this.ersPower = P;
    if (P > 0) { this.soc -= P / 0.95 * h; this.lapDeploy += P * h; }
    else this.soc -= P * 0.9 * h;
    this.soc = clamp(this.soc, 0, max);
  }

  // ---------------------------------------------------------------------------
  //  Force-Feedback-Moment: Rückstellmoment (pneumatischer + mech. Nachlauf),
  //  Lenkrollradius, Leichtwerden beim Untersteuern, Effekte
  // ---------------------------------------------------------------------------
  _ffbCalc(h) {
    const spec = this.spec, ty = spec.tyre, W = this.wheels;
    let M = 0;
    for (let i = 0; i < 2; i++) {
      const w = W[i];
      if (!w.contact) continue;
      const tp = ty.trail0 * Math.pow(Math.max(0, 1 - w.sComb), 1.3);
      M += -w.Fy * (tp + ty.mechTrail);
      M += w.Fx * ty.scrub * (w.left ? 1 : -1);
    }
    const ratio = spec.steerLockDeg / spec.maxWheelAngleDeg;
    const Tcol = M / ratio * spec.ffb.assist;
    this.ffbRaw = clamp(Tcol / spec.ffb.maxNm, -1.5, 1.5);
    // Effekte: Fahrbahn, Kerbs, Aufsetzen, Kollision, Flatspot
    let fx = (W[0].xdot - W[1].xdot) * 0.9;
    fx += this.kerbVib * 0.18 * Math.sin(this.time * 2 * Math.PI * 38);
    fx += this.scrapeIntensity * 0.15 * Math.sin(this.time * 2 * Math.PI * 61);
    const fl = Math.max(W[0].tyre.flat, W[1].tyre.flat);
    if (fl > 0.02) fx += fl * 0.35 * Math.sin(W[0].spin);
    const dt = this.time - this.impactTime;
    if (dt < 0.25) fx += Math.min(1, this.impact / 8) * Math.exp(-dt * 18) * Math.sin(dt * 90) * 0.9;
    this.ffbFx = fx;
    this.ffb = clamp(this.ffbRaw + fx, -1, 1);
  }

  /** Kompakter Telemetrie-Schnappschuss */
  get rpm() { return this.engOmega / RPM2RAD; }
  get socFrac() { return this.soc / (this.spec.ers.battMJ * 1e6); }
  get speedKmh() { return Math.abs(this.vLong) * KMH; }
}
