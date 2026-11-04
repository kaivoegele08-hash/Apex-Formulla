// ============================================================================
//  MODS – Strecken, Teams, Fahrer und Epochen (Autos) aus dem Ordner „mods“
//  neben der HTML-Datei. Jede Mod-Datei ruft ApexMods.register({...}) auf
//  (Format: mods/README.txt). Diese Datei enthält nur die reine Datenlogik
//  (ohne DOM) – das Laden der Dateien passiert im Kopf der HTML-Datei bzw.
//  über die Ordnerauswahl im Menü „Mods“.
// ============================================================================

const MOD_API = 1;
const MOD_REPORT = [];        // [{ id, name, author, version, source, ok, msg, items: [...] }]

/**
 * Strecke aus Eckpunkten: corners = [[x, z, Radius(, Breite)], …] in Fahrtrichtung (geschlossen).
 * An jeder Ecke entsteht ein Kreisbogen mit dem Radius, dazwischen Geraden. Ergebnis: Kontrollpunkte
 * alle ~12 m im Spielformat [x, z, Höhe, Breite, Querneigung°].
 */
function trackFromLayout(L) {
  const V = L.corners, n = V.length;
  if (!Array.isArray(V) || n < 3) throw new Error('layout.corners braucht mindestens 3 Eckpunkte [x, z, Radius]');
  const segs = [];
  for (let i = 0; i < n; i++) {
    const p0 = V[(i - 1 + n) % n], p1 = V[i], p2 = V[(i + 1) % n];
    let d1 = [p1[0] - p0[0], p1[1] - p0[1]]; const l1 = Math.hypot(...d1); d1 = [d1[0] / l1, d1[1] / l1];
    let d2 = [p2[0] - p1[0], p2[1] - p1[1]]; const l2 = Math.hypot(...d2); d2 = [d2[0] / l2, d2[1] / l2];
    if (!(l1 > 1) || !(l2 > 1)) throw new Error(`Eckpunkt ${i}: liegt (fast) auf dem Nachbarpunkt`);
    const ang = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]);
    const r = Math.max(8, +p1[2] || 30), t = r * Math.tan(Math.abs(ang) / 2);
    if (t > 0.5 * Math.min(l1, l2) + 1e-6) throw new Error(`Eckpunkt ${i}: Radius ${r} m ist zu groß für die Geraden davor/danach (max. ≈ ${Math.floor(r * 0.5 * Math.min(l1, l2) / t)} m)`);
    segs.push({ a: [p1[0] - d1[0] * t, p1[1] - d1[1] * t], b: [p1[0] + d2[0] * t, p1[1] + d2[1] * t], ang, r, d1, w: +p1[3] || 0 });
  }
  const pts = [], step = 2;
  for (let i = 0; i < n; i++) {
    const S = segs[i], nx = S.ang > 0 ? -S.d1[1] : S.d1[1], nz = S.ang > 0 ? S.d1[0] : -S.d1[0];
    const cx = S.a[0] + nx * S.r, cz = S.a[1] + nz * S.r, a0 = Math.atan2(S.a[1] - cz, S.a[0] - cx), m = Math.max(2, Math.floor(Math.abs(S.ang) * S.r / step));
    for (let k = 0; k < m; k++) { const th = a0 + S.ang * k / m; pts.push([cx + S.r * Math.cos(th), cz + S.r * Math.sin(th), i, 1]); }
    const nb = segs[(i + 1) % n].a, len = Math.hypot(nb[0] - S.b[0], nb[1] - S.b[1]), m2 = Math.max(1, Math.floor(len / step));
    for (let k = 0; k < m2; k++) pts.push([S.b[0] + (nb[0] - S.b[0]) * k / m2, S.b[1] + (nb[1] - S.b[1]) * k / m2, i, 0]);
  }
  // Start: angegebener Punkt bzw. Mitte der längsten Geraden
  let k0 = 0;
  if (Array.isArray(L.start)) { let bd = Infinity; pts.forEach((p, i) => { const d = (p[0] - L.start[0]) ** 2 + (p[1] - L.start[1]) ** 2; if (d < bd) { bd = d; k0 = i; } }); }
  else { let best = 0, run = 0, runStart = 0; for (let i = 0; i < pts.length * 2; i++) { const p = pts[i % pts.length]; if (!p[3]) { if (!run) runStart = i; run++; if (run > best) { best = run; k0 = (runStart + Math.floor(run * 0.6)) % pts.length; } } else run = 0; } }
  const P = pts.slice(k0).concat(pts.slice(0, k0));
  const acc = [0]; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; acc.push(acc[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const len = acc[acc.length - 1], spacing = 12, M = Math.max(24, Math.round(len / spacing)), out = [];
  const baseW = +L.width || 12;
  const elev = Array.isArray(L.elevation) ? L.elevation.slice().sort((a, b) => a[0] - b[0]) : null;
  const hAt = (u) => {
    if (!elev || !elev.length) return 0;
    const E = elev; if (u <= E[0][0]) return E[0][1];
    for (let i = 0; i < E.length - 1; i++) if (u <= E[i + 1][0]) { const f = (u - E[i][0]) / Math.max(1e-6, E[i + 1][0] - E[i][0]); return lerp(E[i][1], E[i + 1][1], 0.5 - 0.5 * Math.cos(f * Math.PI)); }
    const last = E[E.length - 1], f = (u - last[0]) / Math.max(1e-6, 1 - last[0]);   // zurück zum Anfang (geschlossen)
    return lerp(last[1], E[0][1], 0.5 - 0.5 * Math.cos(f * Math.PI));
  };
  let j = 0;
  for (let m = 0; m < M; m++) {
    const s = m * len / M; while (acc[j + 1] < s) j++;
    const t = (s - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]), a = P[j], b = P[(j + 1) % P.length];
    const w = segs[a[2]].w || baseW;
    out.push([+(a[0] + (b[0] - a[0]) * t).toFixed(1), +(a[1] + (b[1] - a[1]) * t).toFixed(1), +hAt(s / len).toFixed(2), clamp(w, 8, 22), 0]);
  }
  return { points: out, length: len };
}

/** Geraden der Kontrollpunkte suchen → Aero-/DRS-Zonen und Erkennungspunkte (Anteile 0…1) */
function autoAeroZones(points) {
  const n = points.length, L = [], straight = [];
  let total = 0;
  for (let i = 0; i < n; i++) { const a = points[i], b = points[(i + 1) % n]; L.push(total); total += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  for (let i = 0; i < n; i++) {
    const a = points[(i - 1 + n) % n], b = points[i], c = points[(i + 1) % n];
    const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]), h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    straight.push(Math.abs(wrapAngle(h2 - h1)) < 0.012);
  }
  const runs = []; let st = -1;
  for (let i = 0; i < n * 2; i++) { const s = straight[i % n]; if (s && st < 0) st = i; if ((!s || i === n * 2 - 1) && st >= 0) { if (st < n) runs.push([st, i - 1]); st = -1; } }
  const zones = runs.map(([a, b]) => ({ a, b, len: (b - a) * total / n })).filter(r => r.len > 420).sort((x, y) => y.len - x.len).slice(0, 3);
  const frac = (i) => ((i % n) + n) % n / n;
  return {
    aeroZones: zones.map(z => [+frac(z.a + 5).toFixed(3), +frac(z.b - 6).toFixed(3)]),
    overtakeDetection: zones.map(z => +frac(z.a - 25).toFixed(3)),
  };
}

/** Fehlende Felder einer Mod-Strecke mit sinnvollen Werten auffüllen */
function completeTrackDef(d) {
  const def = Object.assign({}, d);
  if (!def.id || !/^[a-z0-9_-]+$/i.test(def.id)) throw new Error('Strecke braucht eine id aus Buchstaben/Ziffern/-/_');
  if (!def.points && def.layout) Object.assign(def, { points: trackFromLayout(def.layout).points });
  if (!Array.isArray(def.points) || def.points.length < 24) throw new Error('Strecke braucht layout.corners oder mindestens 24 points');
  def.points = def.points.map(p => [+p[0], +p[1], +(p[2] || 0), +(p[3] || 12), +(p[4] || 0)]);
  let len = 0; for (let i = 0; i < def.points.length; i++) { const a = def.points[i], b = def.points[(i + 1) % def.points.length]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  if (len < 1200 || len > 9000) throw new Error(`Streckenlänge ${Math.round(len)} m – erlaubt sind 1,2 bis 9 km`);
  def.name = def.name || def.id; def.location = def.location || 'Mod';
  def.character = def.character || 'Mod-Strecke';
  def.timeOfDay = def.timeOfDay || 'afternoon';
  def.raceLaps = def.raceLaps || Math.max(10, Math.round(305000 / len));
  def.corners = def.corners || [];
  def.sectors = def.sectors || [0, 0.33, 0.67];
  if (!def.aeroZones || !def.overtakeDetection) Object.assign(def, autoAeroZones(def.points), def.aeroZones ? { aeroZones: def.aeroZones } : {}, def.overtakeDetection ? { overtakeDetection: def.overtakeDetection } : {});
  def.defaults = Object.assign({ runoff: 'grass', runoffWidth: 12, barrier: 'guardrail' }, def.defaults || {});
  def.autoKerbs = def.autoKerbs || { minRadius: 340 };
  def.sections = def.sections || [];
  const sc = def.scenery = Object.assign({ seed: 1000 + Math.floor(len) % 9000, trees: 700 }, def.scenery || {});
  if (sc.pit === undefined) sc.pit = { from: 0.955, to: 0.045, side: 'R' };
  if (sc.pit === false) delete sc.pit;
  sc.grandstands = sc.grandstands || [{ at: 0.985, len: 220, side: sc.pit && sc.pit.side === 'R' ? 'L' : 'R', rows: 12 }];
  sc.buildings = sc.buildings || [];
  def.mod = true;
  return def;
}

/** KI-Grenzen für ein Mod-Auto aus dem Standardauto schätzen (Grip, Abtrieb/Masse, Luftwiderstand) */
function estimateAILimits(spec) {
  const B = AI_LIMITS_DEFAULT, S0 = CAR_SPEC_BASE, a0 = S0.aero, a = spec.aero;
  const cl = (x) => x.clFW + x.clRW + x.clFloor, cd = (x) => x.cdBody + x.cdRW + x.cdFW;
  const mu = (spec.tyre && spec.tyre.muScale) || 1, aeroR = (cl(a) / spec.mass) / (cl(a0) / S0.mass);
  const ice = Math.max(...spec.engine.curve.map(([r, T]) => T * r * Math.PI / 30)) / 1000;
  // mechanischer Grip: Lastverlagerung (Schwerpunkthöhe / Spur bzw. Radstand) und Reifenbreite
  const tw = Math.pow((spec.tyreWidthF + spec.tyreWidthR) / (S0.tyreWidthF + S0.tyreWidthR), 0.3);
  const trk = (x) => (x.trackF + x.trackR) / 2;
  const fLat = clamp(Math.sqrt((S0.cgHeight / trk(S0)) / (spec.cgHeight / trk(spec))) * tw, 0.6, 1.1);
  const fBrk = clamp(Math.sqrt((S0.cgHeight / S0.wheelbase) / (spec.cgHeight / spec.wheelbase)) * tw, 0.6, 1.1);
  return {
    lat0: B.lat0 * mu * fLat, latAero: B.latAero * aeroR * mu, latMax: B.latMax * Math.min(1.25, 0.55 * mu * fLat + 0.45 * aeroR),
    brk0: B.brk0 * mu * fBrk, brkAero: B.brkAero * aeroR * mu, brkMax: B.brkMax * Math.min(1.25, 0.5 * mu * fBrk + 0.5 * aeroR),
    power: Math.round(B.power * (ice + spec.ers.maxKW) / 750 / 10000) * 10000, mass: spec.mass, drag: B.drag * (cd(a) / cd(a0)) * (S0.mass / spec.mass),
  };
}

const TEAM_PATTERNS = ['stripe', 'split', 'chevron'];
/** Registrierte Mods übernehmen (einmal beim Start, danach erneut nach der Ordnerauswahl) */
function applyMods(list) {
  const out = [];
  for (const m of list) {
    if (m._applied) continue;
    m._applied = true;
    const rep = { id: m.id || '?', name: m.name || m.id || 'Unbenannte Mod', author: m.author || '', version: m.version || '', source: m.source || '', ok: true, msg: '', items: [] };
    try {
      if (!m.id) throw new Error('Feld „id“ fehlt');
      if (MOD_REPORT.some(r => r.id === m.id && r.ok)) { rep.ok = false; rep.msg = 'doppelt (bereits geladen)'; out.push(rep); MOD_REPORT.push(rep); continue; }
      for (const t of m.teams || []) {
        if (!t.id || !t.name || !Array.isArray(t.colors) || t.colors.length < 2) throw new Error(`Team „${t.name || t.id}“: id, name und colors [Basis, Sekundär, Akzent] nötig`);
        const team = { id: t.id, name: t.name, short: (t.short || t.name.slice(0, 3)).toUpperCase().slice(0, 3), colors: [t.colors[0], t.colors[1], t.colors[2] || '#ffffff'], pattern: TEAM_PATTERNS.includes(t.pattern) ? t.pattern : 'stripe', sponsors: (t.sponsors || [t.name.toUpperCase(), 'MOD']).slice(0, 2), mod: true };
        const i = TEAMS.findIndex(x => x.id === t.id); if (i >= 0) TEAMS[i] = team; else TEAMS.push(team);
        rep.items.push('Team ' + team.name);
      }
      for (const d of m.drivers || []) {
        if (!d.name || !d.team || !TEAMS.some(t => t.id === d.team)) throw new Error(`Fahrer „${d.name || '?'}“: name und ein vorhandenes team nötig`);
        const drv = { name: d.name, nat: d.nat || '', num: clamp(Math.round(d.num || 99), 1, 99), team: d.team, rating: clamp(+d.rating || 0.7, 0.3, 1), aggression: clamp(d.aggression ?? 0.5, 0, 1), mod: true };
        const eras = d.era ? [].concat(d.era) : ['e2026'];
        for (const e of eras) {
          if (e === 'e2026') { DRIVERS_BASE.push(drv); if (ACTIVE_ERA === 'e2026') DRIVERS.push(Object.assign({}, drv)); }
          else if (ERAS[e]) { (ERAS[e].extraDrivers || (ERAS[e].extraDrivers = [])).push(drv); }
        }
        rep.items.push('Fahrer ' + drv.name);
      }
      for (const e of m.eras || m.cars || []) {
        if (!e.id) throw new Error('Epoche/Auto braucht eine id');
        const spec = deepAssign(JSON.parse(JSON.stringify(CAR_SPEC_BASE)), e.spec || {});
        if (!spec.aero.mode) spec.aero.mode = 'active';
        if (!spec.ers.maxKW) spec.ers = Object.assign(spec.ers, { maxKW: 0, battMJ: 0.001, maxCrankNm: 0, lapDeployMJ: 0, liftKW: { save: 0, balanced: 0, attack: 0 } });
        if (e.model) validateCarModel(e.model);
        const era = { id: e.id, year: e.year || 2026, model: e.model || null, name: e.name || e.id, title: e.title || e.name || e.id, engineName: e.engineName || 'Mod-Motor', desc: e.desc || 'Mod-Fahrzeug', halo: e.halo !== false, width: e.width || 1, cylinders: e.cylinders || 6,
          spec: e.spec || {}, ai: e.ai || estimateAILimits(spec), drivers: e.drivers || null, mod: true };
        ERAS[e.id] = era; if (!ERA_ORDER.includes(e.id)) ERA_ORDER.push(e.id);
        rep.items.push('Epoche ' + era.name);
      }
      for (const t of m.tracks || []) {
        const def = completeTrackDef(t);
        TRACKS[def.id] = def; if (!TRACK_ORDER.includes(def.id)) TRACK_ORDER.push(def.id);
        rep.items.push('Strecke ' + def.name);
      }
      if (!rep.items.length) throw new Error('enthält keine tracks, teams, drivers oder eras');
    } catch (err) { rep.ok = false; rep.msg = err.message || String(err); }
    out.push(rep); MOD_REPORT.push(rep);
  }
  return out;
}
