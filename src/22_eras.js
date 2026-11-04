// ============================================================================
//  EPOCHEN – Fahrzeugkonzepte verschiedener Formel-Generationen (frei
//  nachempfunden, keine echten Fahrzeuge/Fahrer). Jede Epoche überschreibt
//  Teile von CAR_SPEC (Motor, Getriebe, Aero, Reifen, Masse, ERS), bringt
//  gemessene KI-Grenzen (AI_LIMITS) und ein eigenes, erfundenes Fahrerfeld mit.
//  applyEra(id) schaltet zur Laufzeit um (vor dem Aufbau einer Sitzung).
// ============================================================================

const CAR_SPEC_BASE = JSON.parse(JSON.stringify(CAR_SPEC));
const DRIVERS_BASE = DRIVERS.map(d => Object.assign({}, d));

/** Übersetzungen so bestimmen, dass der höchste Gang am Begrenzer vTop (km/h) erreicht */
function eraGears(n, limitRpm, vTopKmh, r = 0.33, spread = 3.0, final = 4.0) {
  const top = (limitRpm * (Math.PI / 30) * r) / (vTopKmh / 3.6), first = top * spread, out = [];
  for (let i = 0; i < n; i++) out.push(+((first * Math.pow(top / first, Math.pow(i / (n - 1), 0.85))) / final).toFixed(3));
  return out;
}
/** Drehmomentkurve aus Leistungsspitze: [rpm, Anteil vom Spitzenmoment] */
function eraCurve(peakKW, peakRpm, shape) {
  const Tpk = peakKW * 1000 / (peakRpm * (Math.PI / 30));
  return shape.map(([rpm, f]) => [rpm, Math.round(Tpk * f)]);
}

// Fiktive Fahrer je Epoche (Namen aus Silben-Pools, deterministisch je Jahr)
const ERA_NAME_POOL = {
  DEU: [['Jens', 'Rolf', 'Torsten', 'Markus', 'Kai', 'Felix', 'Lennart', 'Tobias'], ['Hagedorn', 'Wenzel', 'Rauscher', 'Kessler', 'Brandt', 'Oberle', 'Steinmetz', 'Vogt']],
  GBR: [['Nigel', 'Oliver', 'James', 'Callum', 'Harvey', 'Rhys', 'Edward', 'Owen'], ['Ashford', 'Pembridge', 'Thorne', 'Calloway', 'Whitmore', 'Redfern', 'Hale', 'Barrow']],
  ITA: [['Marco', 'Alessio', 'Giorgio', 'Lorenzo', 'Davide', 'Enzo', 'Fabio', 'Riccardo'], ['Ferraioli', 'Benedetti', 'Castellano', 'Moretti', 'Galvani', 'Rinaldi', 'Sarti', 'Vescovi']],
  FRA: [['Didier', 'Julien', 'Laurent', 'Pierre', 'Romain', 'Antoine', 'Hugo', 'Mathis'], ['Delacroix', 'Moreau', 'Lefèvre', 'Girardot', 'Bassin', 'Roussel', 'Charpentier', 'Vidal']],
  BRA: [['Rubens', 'Cristiano', 'Thiago', 'Paulo', 'Felipe', 'Caio', 'Diego', 'Lucas'], ['Moraes', 'Teixeira', 'Albuquerque', 'Prado', 'Cardoso', 'Bastos', 'Rocha', 'Nogueira']],
  FIN: [['Mika', 'Kimi', 'Jyrki', 'Teemu', 'Lauri', 'Aleksi', 'Sami', 'Eero'], ['Lahtinen', 'Koskela', 'Rautio', 'Halonen', 'Nieminen', 'Vaara', 'Ketola', 'Salonen']],
  ESP: [['Javier', 'Carlos', 'Iñigo', 'Pedro', 'Álvaro', 'Sergio', 'Marc', 'Rubén'], ['Olmedo', 'Carrasco', 'Ibarra', 'Quintana', 'Serrano', 'Montoya', 'Ferrer', 'Valero']],
  JPN: [['Satoru', 'Takuma', 'Kazuki', 'Hiroshi', 'Ren', 'Yuto', 'Daiki', 'Sho'], ['Nakagawa', 'Okuda', 'Hayashi', 'Takeda', 'Morita', 'Sugimoto', 'Kanda', 'Arai']],
  AUT: [['Gerhard', 'Florian', 'Lukas', 'Christoph', 'Patrick', 'Matthias'], ['Pichler', 'Leitner', 'Gruber', 'Hofbauer', 'Strasser', 'Moser']],
  AUS: [['Mark', 'Daniel', 'Jack', 'Brodie', 'Liam', 'Cooper'], ['Kingsley', 'Dawson', 'Harlow', 'McAllister', 'Brennan', 'Fairley']],
  NLD: [['Jos', 'Max', 'Robin', 'Sander', 'Thijs', 'Bram'], ['van Dalen', 'de Groot', 'Visser', 'Hendriks', 'Bakker', 'van Loon']],
  SWE: [['Stefan', 'Marcus', 'Viktor', 'Oskar', 'Linus', 'Anton'], ['Ekholm', 'Sjöberg', 'Lindahl', 'Norén', 'Åström', 'Berglund']],
  MEX: [['Héctor', 'Esteban', 'Rodrigo', 'Emilio'], ['Salazar', 'Villarreal', 'Cervantes', 'Ortega']],
  CAN: [['Jacques', 'Nicholas', 'Lance', 'Ethan'], ['Tremblay', 'Gagnon', 'Lachance', 'Bouchard']],
  USA: [['Eddie', 'Logan', 'Tyler', 'Mason'], ['Carver', 'Holloway', 'Brookes', 'Sterling']],
  CHN: [['Wei', 'Hao', 'Jun', 'Ming'], ['Zhou', 'Lin', 'Chen', 'Tang']],
};
const ERA_NAT_MIX = {
  1990: ['BRA', 'GBR', 'FRA', 'ITA', 'DEU', 'AUT', 'FIN', 'JPN', 'ITA', 'GBR', 'FRA', 'BRA', 'SWE', 'DEU', 'ITA', 'FRA', 'GBR', 'AUS', 'BRA', 'ITA'],
  2000: ['DEU', 'FIN', 'GBR', 'BRA', 'ESP', 'ITA', 'FRA', 'DEU', 'AUS', 'FIN', 'JPN', 'GBR', 'BRA', 'AUT', 'CAN', 'NLD', 'ITA', 'DEU', 'FRA', 'ESP'],
  2010: ['DEU', 'ESP', 'GBR', 'FIN', 'AUS', 'BRA', 'MEX', 'FRA', 'GBR', 'ITA', 'JPN', 'DEU', 'SWE', 'NLD', 'ESP', 'BRA', 'FIN', 'CAN', 'DEU', 'GBR'],
  2014: ['GBR', 'DEU', 'FIN', 'AUS', 'ESP', 'NLD', 'MEX', 'FRA', 'BRA', 'SWE', 'DEU', 'GBR', 'JPN', 'ITA', 'FIN', 'CAN', 'USA', 'ESP', 'FRA', 'DEU'],
  2017: ['GBR', 'DEU', 'NLD', 'FIN', 'AUS', 'ESP', 'MEX', 'FRA', 'CAN', 'DEU', 'ESP', 'FRA', 'GBR', 'SWE', 'JPN', 'BRA', 'USA', 'ITA', 'FIN', 'AUT'],
  2020: ['GBR', 'NLD', 'MEX', 'FIN', 'AUS', 'ESP', 'GBR', 'FRA', 'CAN', 'DEU', 'AUS', 'CHN', 'JPN', 'ITA', 'USA', 'BRA', 'SWE', 'AUT', 'FRA', 'FIN'],
  2022: ['NLD', 'GBR', 'MEX', 'ESP', 'GBR', 'FRA', 'CAN', 'DEU', 'FIN', 'AUS', 'CHN', 'JPN', 'DEU', 'USA', 'ITA', 'BRA', 'SWE', 'AUT', 'FRA', 'ESP'],
};
function eraDrivers(year) {
  let seed = year * 7919 + 13; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const nats = ERA_NAT_MIX[year] || ERA_NAT_MIX[2022], used = new Set(), nums = new Set(), out = [];
  const teamIds = TEAMS.map(t => t.id);
  nats.forEach((nat, i) => {
    const P = ERA_NAME_POOL[nat] || ERA_NAME_POOL.GBR;
    let name = '';
    for (let k = 0; k < 30 && (!name || used.has(name)); k++) name = P[0][Math.floor(rng() * P[0].length)] + ' ' + P[1][Math.floor(rng() * P[1].length)];
    used.add(name);
    let num = 0; while (!num || nums.has(num)) num = 1 + Math.floor(rng() * (year < 2014 ? 40 : 99));
    nums.add(num);
    // Teams nach Stärke: die ersten Plätze der Liste fahren für die Spitzenteams
    const team = teamIds[Math.floor(i / 2) % teamIds.length];
    const rating = clamp(0.97 - i * 0.021 + (rng() - 0.5) * 0.06, 0.5, 0.98);
    out.push({ name, nat, num, team, rating: +rating.toFixed(2), aggression: +(0.3 + rng() * 0.6).toFixed(2) });
  });
  // Teamkollegen mischen, damit nicht immer der Bessere zuerst steht
  return out;
}

const NA_SHAPE = (lim) => [[0, 0.40], [lim * 0.25, 0.55], [lim * 0.45, 0.78], [lim * 0.65, 0.93], [lim * 0.8, 1.0], [lim * 0.9, 1.0], [lim * 0.97, 0.95], [lim, 0.88], [lim * 1.05, 0.7]];
const HY_SHAPE = (lim) => [[0, 0.38], [4000, 0.62], [7000, 0.92], [9000, 1.04], [10500, 1.0], [12000, 0.88], [13500, 0.78], [lim, 0.70], [lim * 1.05, 0.55]];

const ERAS = {
  e1990: {
    id: 'e1990', year: 1990, name: '1990', title: 'Sauger-Ära 1990', engineName: '3,5-l-V12 (Saugmotor)',
    desc: 'Leicht, viel mechanischer Grip, wenig Abtrieb. Kein ERS, kein DRS, schwere Lenkung, lange Schaltzeiten – fahren mit Gefühl, früh bremsen.',
    halo: false, width: 0.93, cylinders: 12,
    spec: {
      name: 'AF-90', mass: 590, cgHeight: 0.30, wheelbase: 2.90, frontWeight: 0.44, trackF: 1.80, trackR: 1.67,
      rF: 0.33, rR: 0.335, tyreWidthF: 0.30, tyreWidthR: 0.39, maxWheelAngleDeg: 23,
      engine: { idleRpm: 3500, limitRpm: 13800, inertia: 0.13, curve: eraCurve(505, 12800, NA_SHAPE(13800)), turboTau: [0.02, 0.01], dragBase: 14, dragK: 36 },
      ers: { maxKW: 0, battMJ: 0.001, maxCrankNm: 0, lapDeployMJ: 0, liftKW: { save: 0, balanced: 0, attack: 0 } },
      gearbox: { ratios: eraGears(6, 13800, 330, 0.335, 2.75), shiftTime: 0.075, clutchMaxNm: 700 },
      brakes: { maxTorque: 7800, discCap: 1100 },
      aero: { mode: 'none', clFW: 0.72, clRW: 0.80, clFloor: 0.50, cdBody: 0.62, cdRW: 0.28, cdFW: 0.07, floorFront: 0.40 },
      tyre: { muScale: 0.93, loadSens: 0.11 },
      ffb: { assist: 0.22, maxNm: 30 },
    },
    ai: { lat0: 1.484, latAero: 0.000361, latMax: 2.83, brk0: 1.85, brkAero: 0.000402, brkMax: 4.12, power: 400000, mass: 590, drag: 0.00138 },
  },
  e2000: {
    id: 'e2000', year: 2000, name: '2000', title: 'V10-Ära 2000', engineName: '3,0-l-V10 (bis 18.500 U/min)',
    desc: 'Rillenreifen mit wenig mechanischem Grip, dafür viel Abtrieb und kreischende V10. Kein ERS, kein DRS.',
    halo: false, width: 0.93, cylinders: 10,
    spec: {
      name: 'AF-00', mass: 650, cgHeight: 0.29, wheelbase: 3.05, frontWeight: 0.45, trackF: 1.46, trackR: 1.42,
      rF: 0.33, rR: 0.335, tyreWidthF: 0.27, tyreWidthR: 0.34, maxWheelAngleDeg: 21,
      engine: { idleRpm: 5000, limitRpm: 18500, inertia: 0.07, curve: eraCurve(610, 17500, NA_SHAPE(18500)), turboTau: [0.02, 0.01], dragBase: 12, dragK: 34 },
      ers: { maxKW: 0, battMJ: 0.001, maxCrankNm: 0, lapDeployMJ: 0, liftKW: { save: 0, balanced: 0, attack: 0 } },
      gearbox: { ratios: eraGears(7, 18500, 345, 0.335, 2.9), shiftTime: 0.04, clutchMaxNm: 650 },
      brakes: { maxTorque: 9000, discCap: 1200 },
      aero: { mode: 'none', clFW: 1.15, clRW: 1.30, clFloor: 0.95, cdBody: 0.58, cdRW: 0.33, cdFW: 0.09, floorFront: 0.38 },
      tyre: { muScale: 0.87, loadSens: 0.12 },
      ffb: { assist: 0.32, maxNm: 28 },
    },
    ai: { lat0: 1.457, latAero: 0.000426, latMax: 3.31, brk0: 1.83, brkAero: 0.000458, brkMax: 4.41, power: 480000, mass: 650, drag: 0.00129 },
  },
  e2010: {
    id: 'e2010', year: 2010, name: '2010', title: 'V8-Ära 2010', engineName: '2,4-l-V8 (18.000 U/min)',
    desc: 'Glatte Reifen sind zurück, breiter Frontflügel, schmaler Heckflügel, Tanken verboten (schweres Auto). Kein ERS, kein DRS.',
    halo: false, width: 0.95, cylinders: 8,
    spec: {
      name: 'AF-10', mass: 700, cgHeight: 0.29, wheelbase: 3.20, frontWeight: 0.46, trackF: 1.48, trackR: 1.42,
      rF: 0.33, rR: 0.335, tyreWidthF: 0.25, tyreWidthR: 0.33, maxWheelAngleDeg: 21,
      engine: { idleRpm: 5000, limitRpm: 18000, inertia: 0.07, curve: eraCurve(560, 17500, NA_SHAPE(18000)), turboTau: [0.02, 0.01], dragBase: 11, dragK: 33 },
      ers: { maxKW: 0, battMJ: 0.001, maxCrankNm: 0, lapDeployMJ: 0, liftKW: { save: 0, balanced: 0, attack: 0 } },
      gearbox: { ratios: eraGears(7, 18000, 330, 0.335, 2.95), shiftTime: 0.03, clutchMaxNm: 650 },
      brakes: { maxTorque: 9300, discCap: 1200 },
      aero: { mode: 'none', clFW: 1.30, clRW: 1.05, clFloor: 1.10, cdBody: 0.56, cdRW: 0.28, cdFW: 0.11, floorFront: 0.38 },
      tyre: { muScale: 0.96, loadSens: 0.12 },
      ffb: { assist: 0.4, maxNm: 26 },
    },
    ai: { lat0: 1.718, latAero: 0.000388, latMax: 3.51, brk0: 2.02, brkAero: 0.000398, brkMax: 4.26, power: 420000, mass: 700, drag: 0.00114 },
  },
  e2014: {
    id: 'e2014', year: 2014, name: '2014', title: 'Hybrid-Ära 2014', engineName: '1,6-l-V6-Turbo + 120 kW MGU-K',
    desc: 'Viel Drehmoment, wenig Abtrieb, schmale Autos – Traktion ist alles. ERS (4 MJ je Runde) und DRS (Heckflügel öffnet bei < 1 s Abstand).',
    halo: false, width: 0.95, cylinders: 6,
    spec: {
      name: 'AF-14', mass: 740, cgHeight: 0.28, wheelbase: 3.40, frontWeight: 0.45, trackF: 1.48, trackR: 1.42,
      rF: 0.33, rR: 0.335, tyreWidthF: 0.25, tyreWidthR: 0.33, maxWheelAngleDeg: 21,
      engine: { idleRpm: 4000, limitRpm: 15000, inertia: 0.08, curve: eraCurve(440, 10500, HY_SHAPE(15000)), turboTau: [0.35, 0.09] },
      ers: { maxKW: 120, battMJ: 4.0, maxCrankNm: 200, lapDeployMJ: 4.0, taperNormal: [380, 400], taperBoost: [380, 400], liftKW: { save: 60, balanced: 30, attack: 10 }, overtake: false },
      gearbox: { ratios: eraGears(8, 15000, 335, 0.335, 3.3), shiftTime: 0.03 },
      brakes: { maxTorque: 9500, discCap: 1200 },
      aero: { mode: 'drs', clFW: 1.10, clRW: 1.00, clFloor: 1.05, cdBody: 0.54, cdRW: 0.30, cdFW: 0.10, straightFW: 1, straightRW: 0.45, cdStraightFW: 1, cdStraightRW: 0.40, floorFront: 0.37 },
      tyre: { muScale: 0.94, loadSens: 0.12 },
      ffb: { assist: 0.42, maxNm: 26 },
    },
    ai: { lat0: 1.586, latAero: 0.000367, latMax: 3.07, brk0: 1.93, brkAero: 0.000386, brkMax: 4.10, power: 450000, mass: 740, drag: 0.00107 },
  },
  e2017: {
    id: 'e2017', year: 2017, name: '2017', title: 'Breitbau-Ära 2017', engineName: '1,6-l-V6-Turbo-Hybrid',
    desc: 'Breite Autos und Reifen, Rekord-Abtrieb, enorme Kurvengeschwindigkeiten. ERS und DRS, noch ohne Halo.',
    halo: false, width: 1.0, cylinders: 6,
    spec: {
      name: 'AF-17', mass: 790, cgHeight: 0.28, wheelbase: 3.60, frontWeight: 0.45, trackF: 1.60, trackR: 1.58,
      rF: 0.33, rR: 0.335, tyreWidthF: 0.305, tyreWidthR: 0.405, maxWheelAngleDeg: 21,
      engine: { idleRpm: 4000, limitRpm: 15000, inertia: 0.08, curve: eraCurve(505, 10500, HY_SHAPE(15000)), turboTau: [0.30, 0.08] },
      ers: { maxKW: 120, battMJ: 4.0, maxCrankNm: 200, lapDeployMJ: 4.0, taperNormal: [380, 400], taperBoost: [380, 400], liftKW: { save: 60, balanced: 30, attack: 10 }, overtake: false },
      gearbox: { ratios: eraGears(8, 15000, 345, 0.335, 3.3), shiftTime: 0.025 },
      brakes: { maxTorque: 11000, discCap: 1300 },
      aero: { mode: 'drs', clFW: 1.40, clRW: 1.40, clFloor: 1.65, cdBody: 0.60, cdRW: 0.38, cdFW: 0.12, straightFW: 1, straightRW: 0.5, cdStraightFW: 1, cdStraightRW: 0.42, floorFront: 0.37 },
      tyre: { muScale: 1.02, loadSens: 0.12 },
    },
    ai: { lat0: 1.929, latAero: 0.000383, latMax: 3.87, brk0: 2.25, brkAero: 0.000400, brkMax: 4.50, power: 500000, mass: 790, drag: 0.00117 },
  },
  e2020: {
    id: 'e2020', year: 2020, name: '2020', title: 'Halo-Ära 2020', engineName: '1,6-l-V6-Turbo-Hybrid (~1000 PS)',
    desc: 'Die schnellsten Autos ihrer Zeit: viel Abtrieb, fast 1000 PS, schwer. ERS und DRS, mit Halo.',
    halo: true, width: 1.0, cylinders: 6,
    spec: {
      name: 'AF-20', mass: 810, cgHeight: 0.28, wheelbase: 3.65, frontWeight: 0.45, trackF: 1.60, trackR: 1.58,
      rF: 0.33, rR: 0.335, tyreWidthF: 0.305, tyreWidthR: 0.405, maxWheelAngleDeg: 21,
      engine: { idleRpm: 4000, limitRpm: 15000, inertia: 0.08, curve: eraCurve(545, 10500, HY_SHAPE(15000)), turboTau: [0.28, 0.08] },
      ers: { maxKW: 120, battMJ: 4.0, maxCrankNm: 200, lapDeployMJ: 4.0, taperNormal: [380, 400], taperBoost: [380, 400], liftKW: { save: 60, balanced: 30, attack: 10 }, overtake: false },
      gearbox: { ratios: eraGears(8, 15000, 350, 0.335, 3.3), shiftTime: 0.025 },
      brakes: { maxTorque: 11000, discCap: 1300 },
      aero: { mode: 'drs', clFW: 1.42, clRW: 1.38, clFloor: 1.72, cdBody: 0.60, cdRW: 0.36, cdFW: 0.12, straightFW: 1, straightRW: 0.5, cdStraightFW: 1, cdStraightRW: 0.42, floorFront: 0.37 },
      tyre: { muScale: 1.03, loadSens: 0.12 },
    },
    ai: { lat0: 1.954, latAero: 0.000380, latMax: 3.89, brk0: 2.31, brkAero: 0.000373, brkMax: 4.41, power: 530000, mass: 810, drag: 0.00112 },
  },
  e2022: {
    id: 'e2022', year: 2022, name: '2022', title: 'Ground-Effect-Ära 2022', engineName: '1,6-l-V6-Turbo-Hybrid',
    desc: 'Abtrieb kommt vom Unterboden: weniger Verwirbelung beim Hinterherfahren, aber tief = schnell und bockig (Aufsetzen). 18-Zoll-Räder, schwerstes Auto.',
    halo: true, width: 1.0, cylinders: 6,
    spec: {
      name: 'AF-22', mass: 850, cgHeight: 0.28, wheelbase: 3.60, frontWeight: 0.45, trackF: 1.60, trackR: 1.58,
      rF: 0.36, rR: 0.36, tyreWidthF: 0.305, tyreWidthR: 0.405, maxWheelAngleDeg: 21,
      engine: { idleRpm: 4000, limitRpm: 15000, inertia: 0.08, curve: eraCurve(530, 10500, HY_SHAPE(15000)), turboTau: [0.28, 0.08] },
      ers: { maxKW: 120, battMJ: 4.0, maxCrankNm: 200, lapDeployMJ: 4.0, taperNormal: [380, 400], taperBoost: [380, 400], liftKW: { save: 60, balanced: 30, attack: 10 }, overtake: false },
      gearbox: { ratios: eraGears(8, 15000, 345, 0.36, 3.3), shiftTime: 0.025 },
      brakes: { maxTorque: 11500, discCap: 1300 },
      aero: { mode: 'drs', clFW: 1.0, clRW: 1.05, clFloor: 2.25, cdBody: 0.60, cdRW: 0.33, cdFW: 0.10, straightFW: 1, straightRW: 0.45, cdStraightFW: 1, cdStraightRW: 0.40, floorFront: 0.38 },
      tyre: { muScale: 1.0, loadSens: 0.12 },
    },
    ai: { lat0: 1.767, latAero: 0.000377, latMax: 3.50, brk0: 2.19, brkAero: 0.000344, brkMax: 4.12, power: 520000, mass: 850, drag: 0.00102 },
  },
  e2026: {
    id: 'e2026', year: 2026, name: '2026', title: 'Aktive Aero 2026 (Standard)', engineName: '1,6-l-V6-Turbo + 350 kW MGU-K',
    desc: 'Das Standardauto des Spiels: kleiner, leichter, 50/50-Hybrid, aktive Aerodynamik auf den Geraden und Überholmodus.',
    halo: true, width: 1.0, cylinders: 6,
    spec: {},
    ai: null,
  },
};
const ERA_ORDER = ['e1990', 'e2000', 'e2010', 'e2014', 'e2017', 'e2020', 'e2022', 'e2026'];
let ACTIVE_ERA = 'e2026';

function deepAssign(dst, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) deepAssign(dst[k], v);
    else dst[k] = Array.isArray(v) ? v.map(x => Array.isArray(x) ? x.slice() : x) : v;
  }
  return dst;
}
function eraOf(id) { return ERAS[id] || ERAS.e2026; }
/**
 * Epoche aktivieren: CAR_SPEC/AI_LIMITS/DRIVERS werden an Ort und Stelle ersetzt, damit alle Module
 * (Physik, KI, Grafik, Audio) ohne Umbau die neuen Werte sehen. Gibt true zurück, wenn sich etwas geändert hat.
 */
function applyEra(id) {
  const E = eraOf(id);
  if (ACTIVE_ERA === E.id && applyEra._done) return false;
  applyEra._done = true;
  for (const k of Object.keys(CAR_SPEC)) delete CAR_SPEC[k];
  deepAssign(CAR_SPEC, JSON.parse(JSON.stringify(CAR_SPEC_BASE)));
  deepAssign(CAR_SPEC, E.spec || {});
  if (!CAR_SPEC.aero.mode) CAR_SPEC.aero.mode = 'active';
  if (CAR_SPEC.ers.overtake === undefined) CAR_SPEC.ers.overtake = CAR_SPEC.ers.maxKW > 0;
  if (CAR_SPEC.tyre.muScale === undefined) CAR_SPEC.tyre.muScale = 1;
  CAR_SPEC.cylinders = E.cylinders || 6; CAR_SPEC.era = E.id;
  if (typeof AI_LIMITS !== 'undefined') Object.assign(AI_LIMITS, E.ai || AI_LIMITS_DEFAULT);
  const roster = (E.drivers || (E.id === 'e2026' ? DRIVERS_BASE : eraDrivers(E.year))).concat(E.extraDrivers || []);
  DRIVERS.length = 0; for (const d of roster) DRIVERS.push(Object.assign({}, d));
  ACTIVE_ERA = E.id;
  if (typeof Events !== 'undefined') Events.emit('era:changed', E.id);
  return true;
}
/** Speicherschlüssel für Bestzeiten/Ghosts: Strecke + Epoche (Standardauto ohne Zusatz) */
function trackKey(id) { return id + (ACTIVE_ERA === 'e2026' ? '' : '|' + ACTIVE_ERA); }
