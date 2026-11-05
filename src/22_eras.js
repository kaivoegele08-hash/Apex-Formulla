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
// ---------------------------------------------------------------------------
//  RENNKLASSEN (heutige Autos): Nachwuchs-Formeln und GT – für Lizenzmodus und Karriere-Leiter.
//  cls = Klassen-Kürzel, tier = Stufe der Leiter (1 = Einstieg). ai: 'auto' → KI-Grenzen aus dem Auto geschätzt.
// ---------------------------------------------------------------------------
const NO_ERS = { maxKW: 0, battMJ: 0.001, maxCrankNm: 0, lapDeployMJ: 0, liftKW: { save: 0, balanced: 0, attack: 0 } };
Object.assign(ERAS, {
  f4: {
    id: 'f4', cls: 'F4', tier: 1, year: 2026, rosterSeed: 3004, name: 'F4', title: 'Formel-Nachwuchs F4', engineName: '1,4-l-Vierzylinder-Turbo (160 PS)',
    desc: 'Einstiegsklasse: leicht, wenig Leistung und kaum Abtrieb. Verzeiht viel, belohnt saubere Linie und frühes Gas. Kein ERS, kein DRS.',
    halo: true, width: 0.84, cylinders: 4, aiScale: 0.97,
    spec: {
      name: 'AF-F4', mass: 570, cgHeight: 0.30, wheelbase: 2.75, frontWeight: 0.42, trackF: 1.46, trackR: 1.42, inertiaBox: [0.95, 0.5, 3.2],
      rF: 0.29, rR: 0.305, IwF: 0.55, IwR: 0.7, tyreWidthF: 0.21, tyreWidthR: 0.26, maxWheelAngleDeg: 24, steerLockDeg: 200,
      engine: { idleRpm: 1800, limitRpm: 7200, inertia: 0.06, curve: eraCurve(118, 6200, NA_SHAPE(7200)), turboTau: [0.10, 0.04], dragBase: 6, dragK: 14 },
      ers: NO_ERS,
      gearbox: { ratios: eraGears(6, 7200, 228, 0.305, 2.8), shiftTime: 0.06, clutchMaxNm: 400 },
      brakes: { maxTorque: 4200, discCap: 900 },
      aero: { mode: 'none', clFW: 0.42, clRW: 0.52, clFloor: 0.30, cdBody: 0.50, cdRW: 0.18, cdFW: 0.05, floorFront: 0.40 },
      tyre: { muScale: 0.93, loadSens: 0.10 },
      ffb: { assist: 0.30, maxNm: 18 },
      setup: { brakeBias: 58, rearWing: 7, frontWing: 7 },
    },
    ai: 'auto',
  },
  f3: {
    id: 'f3', cls: 'F3', tier: 2, year: 2026, rosterSeed: 3003, name: 'F3', title: 'Formel-Nachwuchs F3', engineName: '3,4-l-V6 (Saugmotor, 380 PS)',
    desc: 'Zweite Stufe: spürbarer Abtrieb, DRS auf den Geraden, Saugmotor ohne Hybrid. Hier lernt man Bremspunkte und Windschatten.',
    halo: true, width: 0.9, cylinders: 6, aiScale: 0.95,
    spec: {
      name: 'AF-F3', mass: 673, cgHeight: 0.29, wheelbase: 3.00, frontWeight: 0.43, trackF: 1.52, trackR: 1.48, inertiaBox: [1.0, 0.52, 3.5],
      rF: 0.31, rR: 0.325, IwF: 0.65, IwR: 0.85, tyreWidthF: 0.25, tyreWidthR: 0.32, maxWheelAngleDeg: 22,
      engine: { idleRpm: 2500, limitRpm: 8200, inertia: 0.08, curve: eraCurve(280, 7600, NA_SHAPE(8200)), turboTau: [0.02, 0.01], dragBase: 10, dragK: 22 },
      ers: NO_ERS,
      gearbox: { ratios: eraGears(6, 8200, 285, 0.325, 2.9), shiftTime: 0.045, clutchMaxNm: 600 },
      brakes: { maxTorque: 6800, discCap: 1000 },
      aero: { mode: 'drs', clFW: 0.78, clRW: 0.85, clFloor: 0.85, cdBody: 0.52, cdRW: 0.26, cdFW: 0.07, straightFW: 1, straightRW: 0.5, cdStraightFW: 1, cdStraightRW: 0.45, floorFront: 0.39 },
      tyre: { muScale: 0.96, loadSens: 0.11 },
      ffb: { assist: 0.35, maxNm: 22 },
      setup: { brakeBias: 57 },
    },
    ai: 'auto',
  },
  f2: {
    id: 'f2', cls: 'F2', tier: 3, year: 2026, rosterSeed: 3002, name: 'F2', title: 'Formel-Nachwuchs F2', engineName: '3,4-l-V6-Turbo (620 PS)',
    desc: 'Letzte Stufe vor der Königsklasse: Turbo mit 620 PS, viel Abtrieb, DRS, Reifen bauen schnell ab. Schwer, aber schnell.',
    halo: true, width: 0.95, cylinders: 6, aiScale: 0.98,
    spec: {
      name: 'AF-F2', mass: 755, cgHeight: 0.285, wheelbase: 3.15, frontWeight: 0.44, trackF: 1.56, trackR: 1.52, inertiaBox: [1.05, 0.54, 3.7],
      rF: 0.33, rR: 0.34, IwF: 0.75, IwR: 1.0, tyreWidthF: 0.27, tyreWidthR: 0.36, maxWheelAngleDeg: 21,
      engine: { idleRpm: 3000, limitRpm: 9500, inertia: 0.08, curve: eraCurve(456, 8500, NA_SHAPE(9500)), turboTau: [0.25, 0.07], dragBase: 12, dragK: 26 },
      ers: NO_ERS,
      gearbox: { ratios: eraGears(6, 9500, 320, 0.34, 3.0), shiftTime: 0.035, clutchMaxNm: 800 },
      brakes: { maxTorque: 9000, discCap: 1200 },
      aero: { mode: 'drs', clFW: 0.92, clRW: 0.98, clFloor: 1.08, cdBody: 0.58, cdRW: 0.32, cdFW: 0.09, straightFW: 1, straightRW: 0.48, cdStraightFW: 1, cdStraightRW: 0.42, floorFront: 0.37 },
      tyre: { muScale: 0.96, loadSens: 0.12, wearK: 4.4e-8 },
      ffb: { assist: 0.4, maxNm: 24 },
    },
    ai: 'auto',
  },
  gt3: {
    id: 'gt3', cls: 'GT', tier: 2, year: 2026, rosterSeed: 3010, name: 'GT', title: 'GT-Sportwagen', engineName: '5,2-l-V8 (Saugmotor)',
    desc: 'Geschlossener Sportwagen: schwer, wenig Abtrieb, lange Bremswege, viel mechanischer Grip. ABS und Traktionskontrolle empfohlen.',
    halo: false, width: 1.0, cylinders: 8, aiScale: 0.82,
      spec: {
        name: 'AF-GT3', mass: 1300, cgHeight: 0.40, wheelbase: 2.70, frontWeight: 0.46,
        trackF: 1.68, trackR: 1.66, inertiaBox: [1.9, 1.2, 4.4],
        rF: 0.345, rR: 0.355, tyreWidthF: 0.30, tyreWidthR: 0.33,
        floorY: -0.40, plankZ: [-1.1, 1.2], steerLockDeg: 270, maxWheelAngleDeg: 24,
        engine: { idleRpm: 1400, limitRpm: 8800, inertia: 0.20, turboTau: [0.02, 0.01], dragBase: 20, dragK: 40,
                  curve: [[0, 300], [2000, 420], [4000, 520], [6000, 560], [7000, 550], [8000, 500], [8800, 440], [9200, 380]] },
        ers: { maxKW: 0 },
        gearbox: { ratios: [3.0, 2.15, 1.7, 1.4, 1.2, 1.05], shiftTime: 0.06, clutchMaxNm: 1200 },
        brakes: { maxTorque: 9000 },
        aero: { mode: 'none', clFW: 0.25, clRW: 0.55, clFloor: 0.5, floorFront: 0.45, cdBody: 0.85, cdRW: 0.12, cdFW: 0.03 },
        tyre: { muScale: 0.9 },
        ffb: { assist: 0.35, maxNm: 20 },
        // Grund-Setup (Spieler kann es im Setup-Menü ändern): Bremsbalance nach vorne, vorne steifer – stabil beim Anbremsen
        setup: { brakeBias: 63, springF: 230, springR: 210, arbF: 80, arbR: 70, rideF: 40, rideR: 60, rearWing: 8 },
      },
      model: {
        body: 'closed',
        driver: { x: -0.37, y: 0.40, z: -0.10 },          // links sitzen
        // Vorderwagen: Stoßfänger → Motorhaube (bis zur Windschutzscheibe); Radhäuser kommen als Kotflügel (parts)
        nose: [
          { z: -2.95, w: 1.60, h: 0.26, y: -0.25, n: 3.2 }, { z: -2.75, w: 1.72, h: 0.40, y: -0.18, n: 3.6 },
          { z: -2.30, w: 1.66, h: 0.48, y: -0.14, n: 4.5 }, { z: -1.60, w: 1.62, h: 0.52, y: -0.12, n: 5 },
          { z: -1.10, w: 1.64, h: 0.58, y: -0.10, n: 5 }, { z: -0.82, w: 1.66, h: 0.62, y: -0.08, n: 5 },
        ],
        // Hinterwagen: Türen → Heck
        engineCover: [
          { z: 0.10, w: 1.68, h: 0.64, y: -0.07, n: 5 }, { z: 0.90, w: 1.66, h: 0.64, y: -0.06, n: 5 },
          { z: 1.60, w: 1.64, h: 0.62, y: -0.05, n: 5 }, { z: 2.20, w: 1.66, h: 0.58, y: -0.04, n: 4.5 },
          { z: 2.55, w: 1.62, h: 0.50, y: -0.02, n: 4 },
        ],
        airbox: [], sidepod: [],
        frontWing: { span: 1.8, chord: 0.3 },
        rearWing: { span: 1.75, chord: 0.32, y: 0.66, z: 2.30, flaps: 1 },
        look: { frontWing: false, fin: false, beam: false, barge: false, grooves: false, diffuser: true },
        parts: [
          // Mittelteil (Türen) zwischen Vorder- und Hinterwagen
          { type: 'loft', mat: 'paint', sections: [{ z: -0.90, w: 1.66, h: 0.62, y: -0.08, n: 5 }, { z: 0.15, w: 1.68, h: 0.64, y: -0.07, n: 5 }] },
          // Kotflügel über den Rädern (rechts, mirror = links): breite Backen, darunter bleiben die Räder sichtbar
          { type: 'loft', mat: 'paint', mirror: true, sections: [
            { z: -2.55, w: 0.20, h: 0.18, y: 0.02, n: 3, x: 0.80 }, { z: -2.25, w: 0.34, h: 0.36, y: 0.08, n: 3, x: 0.86 },
            { z: -1.90, w: 0.36, h: 0.40, y: 0.10, n: 3, x: 0.88 }, { z: -1.50, w: 0.32, h: 0.34, y: 0.08, n: 3, x: 0.85 }, { z: -1.15, w: 0.16, h: 0.18, y: 0.04, n: 3, x: 0.80 }] },
          { type: 'loft', mat: 'paint', mirror: true, sections: [
            { z: 1.00, w: 0.18, h: 0.20, y: 0.04, n: 3, x: 0.80 }, { z: 1.25, w: 0.36, h: 0.40, y: 0.10, n: 3, x: 0.88 },
            { z: 1.55, w: 0.40, h: 0.44, y: 0.12, n: 3, x: 0.90 }, { z: 1.90, w: 0.36, h: 0.38, y: 0.10, n: 3, x: 0.88 }, { z: 2.25, w: 0.20, h: 0.20, y: 0.04, n: 3, x: 0.82 }] },
          // Kabine aus getöntem Glas, darauf das Dach in Wagenfarbe
          { type: 'loft', mat: 'glass', sections: [
            { z: -1.25, w: 1.55, h: 0.06, y: 0.27, n: 3 }, { z: -0.70, w: 1.42, h: 0.40, y: 0.45, n: 3.2 }, { z: -0.20, w: 1.34, h: 0.50, y: 0.50, n: 3.4 },
            { z: 0.40, w: 1.32, h: 0.48, y: 0.49, n: 3.4 }, { z: 1.20, w: 1.40, h: 0.20, y: 0.36, n: 3 }, { z: 1.90, w: 1.55, h: 0.06, y: 0.27, n: 3 }] },
          { type: 'loft', mat: 'paint', sections: [{ z: -0.55, w: 1.18, h: 0.04, y: 0.735, n: 4 }, { z: 0.10, w: 1.26, h: 0.06, y: 0.755, n: 4 }, { z: 0.75, w: 1.20, h: 0.04, y: 0.72, n: 4 }] },
          // Frontsplitter, Seitenschweller, Heckdiffusor-Kante
          { type: 'box', size: [1.9, 0.02, 0.35], pos: [0, -0.37, -2.86], mat: 'carbon' },
          { type: 'box', size: [0.08, 0.07, 2.2], pos: [0.84, -0.36, -0.20], mat: 'carbon', mirror: true },
          // Scheinwerfer und Rückleuchten (leuchten; Rückleuchten hell beim Bremsen)
          { type: 'sphere', r: 0.16, scale: [1.3, 0.45, 0.45], pos: [0.62, -0.04, -2.74], mat: 'light', mirror: true },
          { type: 'box', size: [0.50, 0.06, 0.03], pos: [0.62, 0.10, 2.555], mat: 'taillight', mirror: true },
          // Außenspiegel, Kühlergrill, Motorhauben-Schlitze, Abschlepphaken
          { type: 'box', size: [0.18, 0.08, 0.10], pos: [0.86, 0.32, -0.95], r: 0.03, mat: 'team2', mirror: true },
          { type: 'box', size: [0.9, 0.14, 0.02], pos: [0, -0.18, -2.97], r: 0.03, mat: 'dark' },
          { type: 'box', size: [0.22, 0.01, 0.45], pos: [0.30, 0.265, -1.75], rot: [4, 0, 0], mat: 'dark', mirror: true },
          { type: 'cyl', r: 0.02, len: 0.12, pos: [0.55, -0.20, -3.0], rot: [90, 0, 0], mat: 'team' },
        ],
      },
    ai: 'auto',
  },
});
const CLASS_ORDER = ['f4', 'f3', 'f2', 'e2026', 'gt3'];
const ERA_ORDER = ['e1990', 'e2000', 'e2010', 'e2014', 'e2017', 'e2020', 'e2022', 'e2026', 'f4', 'f3', 'f2', 'gt3'];
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
// ---------------------------------------------------------------------------
//  Fahrzeugmodell als Daten (wie das eingebaute Modell gebaut ist – Mods können jeden Teil ersetzen)
//  Koordinaten in Metern: vorne = −z, rechts = +x, oben = +y, Ursprung = Schwerpunkt.
//  Bezugsauto: Radstand 3,40 m (Vorderachse z ≈ −1,9, Hinterachse z ≈ +1,5), wird auf den Radstand der Epoche gestreckt.
//  Querschnitt { z, w (Breite), h (Höhe), y (Mitte), n (Eckigkeit: 2 = rund/oval, 4+ = kastig), x (seitlicher Versatz) }
// ---------------------------------------------------------------------------
const CAR_MODEL_BASE = {
  nose: [
    { z: -2.68, w: 0.09, h: 0.07, y: -0.105, n: 2.2 }, { z: -2.48, w: 0.20, h: 0.12, y: -0.088, n: 2.5 },
    { z: -2.08, w: 0.29, h: 0.19, y: -0.045, n: 2.8 }, { z: -1.62, w: 0.37, h: 0.29, y: 0.025, n: 3.0 },
    { z: -1.16, w: 0.47, h: 0.39, y: 0.075, n: 3.3 }, { z: -0.82, w: 0.60, h: 0.47, y: 0.085, n: 3.6 },
  ],
  cockpit: [
    { z: -0.82, w: 0.60, h: 0.47, y: 0.085, n: 3.6 }, { z: -0.45, w: 0.70, h: 0.47, y: 0.08, n: 3.8 },
    { z: -0.05, w: 0.78, h: 0.47, y: 0.075, n: 3.8 }, { z: 0.16, w: 0.78, h: 0.50, y: 0.09, n: 3.6 },
  ],
  engineCover: [
    { z: 0.12, w: 0.74, h: 0.50, y: 0.09, n: 3.4 }, { z: 0.45, w: 0.62, h: 0.52, y: 0.15, n: 3.0 },
    { z: 0.95, w: 0.44, h: 0.42, y: 0.13, n: 2.8 }, { z: 1.45, w: 0.26, h: 0.30, y: 0.09, n: 2.6 },
    { z: 1.95, w: 0.12, h: 0.16, y: 0.07, n: 2.4 },
  ],
  airbox: [
    { z: 0.06, w: 0.20, h: 0.20, y: 0.55, n: 2.6 }, { z: 0.25, w: 0.27, h: 0.30, y: 0.54, n: 2.8 },
    { z: 0.6, w: 0.24, h: 0.30, y: 0.47, n: 2.6 }, { z: 1.05, w: 0.12, h: 0.18, y: 0.34, n: 2.4 }, { z: 1.4, w: 0.04, h: 0.05, y: 0.27, n: 2.2 },
  ],
  // rechter Seitenkasten (x > 0), der linke wird gespiegelt
  sidepod: [
    { z: -0.52, w: 0.34, h: 0.34, y: -0.02, n: 3.6, x: 0.50 }, { z: -0.30, w: 0.42, h: 0.40, y: 0.0, n: 3.8, x: 0.50 },
    { z: 0.30, w: 0.40, h: 0.36, y: -0.03, n: 3.4, x: 0.47 }, { z: 0.90, w: 0.28, h: 0.26, y: -0.08, n: 3.0, x: 0.40 },
    { z: 1.40, w: 0.12, h: 0.15, y: -0.12, n: 2.6, x: 0.30 },
  ],
  // Unterboden: Umriss [x, z] im Uhrzeigersinn
  floor: [[-0.30, -1.35], [-0.62, -0.95], [-0.74, -0.55], [-0.76, 0.95], [-0.62, 1.30], [-0.52, 1.42], [0.52, 1.42], [0.62, 1.30], [0.76, 0.95], [0.74, -0.55], [0.62, -0.95], [0.30, -1.35]],
  frontWing: { span: 1.82, chord: 0.30, thick: 0.07, camber: 0.06, y: -0.165, z: -2.86, flaps: 2 },
  rearWing: { span: 1.0, chord: 0.26, thick: 0.09, camber: 0.07, y: 0.50, z: 2.08, flaps: 1 },
  body: 'open', // 'open' (Formelwagen) oder 'closed' (Sportwagen: ohne Cockpitwanne, Halo, Formel-Spiegel, Querlenker; mit GT-Cockpit)
  driver: null,  // Sitzposition { x, y, z } (Helmmitte) – Standard Formelwagen { x: 0, y: 0.49, z: -0.17 }
  look: {},     // optional: { nose: 'low'|'mid'|'high', fin, beam, barge, grooves, fw, rwX, rwY, frontWing, rearWing, diffuser } – sonst nach Baujahr
  parts: [],    // zusätzliche Teile (siehe mods/README.txt)
};
const CAR_PART_TYPES = ['loft', 'box', 'wing', 'cyl', 'sphere'];
const CAR_PART_MATS = ['paint', 'carbon', 'team', 'team2', 'dark', 'chrome', 'glass', 'light', 'taillight'];
/** Mod-Modell mit dem Standardmodell zusammenführen (Listen ersetzen, Flügel-Objekte ergänzen) */
function carModelOf(M) {
  const B = CAR_MODEL_BASE; if (!M) return B;
  const out = Object.assign({}, B, M);
  out.frontWing = Object.assign({}, B.frontWing, M.frontWing || {}); out.rearWing = Object.assign({}, B.rearWing, M.rearWing || {});
  out.look = Object.assign({}, M.look || {}); out.parts = M.parts || [];
  out.customNose = !!M.nose;
  return out;
}
/** Modelldaten einer Mod prüfen – wirft eine verständliche Fehlermeldung */
function validateCarModel(M) {
  if (!M || typeof M !== 'object') throw new Error('model muss ein Objekt sein');
  const num = (v, path) => { if (typeof v !== 'number' || !isFinite(v)) throw new Error(`model.${path}: Zahl erwartet`); };
  const secs = (L, path) => {
    if (!Array.isArray(L) || L.length < 2) throw new Error(`model.${path}: mindestens 2 Querschnitte nötig`);
    L.forEach((q, i) => { for (const k of ['z', 'w', 'h']) num(q[k], `${path}[${i}].${k}`); if (q.w <= 0 || q.h <= 0) throw new Error(`model.${path}[${i}]: w und h müssen > 0 sein`); for (const k of ['y', 'n', 'x']) if (q[k] !== undefined) num(q[k], `${path}[${i}].${k}`); if (i && q.z <= L[i - 1].z) throw new Error(`model.${path}[${i}].z muss größer sein als beim Querschnitt davor (von vorne nach hinten)`); });
  };
  for (const k of ['nose', 'cockpit', 'engineCover', 'airbox', 'sidepod']) if (M[k] !== undefined && !((k === 'airbox' || k === 'sidepod') && Array.isArray(M[k]) && !M[k].length)) secs(M[k], k);
  if (M.floor !== undefined) { if (!Array.isArray(M.floor) || M.floor.length < 3) throw new Error('model.floor: mindestens 3 Punkte [x, z]'); M.floor.forEach((p, i) => { num(p[0], `floor[${i}][0]`); num(p[1], `floor[${i}][1]`); }); }
  for (const w of ['frontWing', 'rearWing']) if (M[w] !== undefined) for (const [k, v] of Object.entries(M[w])) num(v, `${w}.${k}`);
  (M.parts || []).forEach((p, i) => {
    if (!CAR_PART_TYPES.includes(p.type)) throw new Error(`model.parts[${i}].type: eines von ${CAR_PART_TYPES.join(', ')}`);
    if (p.mat !== undefined && !CAR_PART_MATS.includes(p.mat)) throw new Error(`model.parts[${i}].mat: eines von ${CAR_PART_MATS.join(', ')}`);
    if (p.type === 'loft') secs(p.sections, `parts[${i}].sections`);
    for (const k of ['pos', 'rot', 'size', 'scale']) if (p[k] !== undefined) { if (!Array.isArray(p[k]) || p[k].length !== 3) throw new Error(`model.parts[${i}].${k}: [x, y, z] erwartet`); p[k].forEach((v, j) => num(v, `parts[${i}].${k}[${j}]`)); }
    if (p.type === 'box' && !p.size) throw new Error(`model.parts[${i}]: box braucht size [Breite, Höhe, Länge]`);
    if (p.type === 'wing') { num(p.span, `parts[${i}].span`); num(p.chord, `parts[${i}].chord`); }
    if (p.type === 'cyl') { num(p.len, `parts[${i}].len`); if (p.r === undefined && p.r1 === undefined) throw new Error(`model.parts[${i}]: cyl braucht r (oder r1/r2)`); }
    if (p.type === 'sphere') num(p.r, `parts[${i}].r`);
  });
  if ((M.parts || []).length > 120) throw new Error('model.parts: höchstens 120 Teile');
  if (M.body !== undefined && M.body !== 'open' && M.body !== 'closed') throw new Error("model.body: 'open' oder 'closed'");
  if (M.driver !== undefined && M.driver !== null) { for (const k of ['x', 'y', 'z']) num(M.driver[k], `driver.${k}`); }
  return true;
}

/** Sitzposition (Helmmitte) des aktiven Autos, auf Radstand/Breite gestreckt – für Cockpitkamera */
function carDriverPos() {
  const E = eraOf(CAR_SPEC.era || 'e2026'), M = E.model || {};
  const D = Object.assign({ x: 0, y: 0.49, z: -0.17 }, M.driver || {}), sz = (CAR_SPEC.wheelbase || 3.4) / 3.4, sx = E.width || 1;
  return { x: D.x * sx, y: D.y, z: D.z * sz, closed: M.body === 'closed' };
}
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
  if (typeof AI_LIMITS !== 'undefined') Object.assign(AI_LIMITS, E.ai === 'auto' ? scaleAILimits(estimateAILimits(CAR_SPEC), E.aiScale) : E.ai || AI_LIMITS_DEFAULT);
  const roster = (E.drivers || (E.id === 'e2026' ? DRIVERS_BASE : eraDrivers(E.rosterSeed || E.year))).concat(E.extraDrivers || []);
  DRIVERS.length = 0; for (const d of roster) DRIVERS.push(Object.assign({}, d));
  ACTIVE_ERA = E.id;
  if (typeof Events !== 'undefined') Events.emit('era:changed', E.id);
  return true;
}
/** Speicherschlüssel für Bestzeiten/Ghosts: Strecke + Epoche (Standardauto ohne Zusatz) */
function trackKey(id) { return id + (ACTIVE_ERA === 'e2026' ? '' : '|' + ACTIVE_ERA); }
