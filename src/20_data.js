// ============================================================================
//  DATEN – Untergründe, Reifenmischungen, Fahrzeug, Setups, Teams, Fahrer,
//  Strecken (Editor-Format als JSON). Alles frei erfunden.
// ============================================================================

// ---------------------------------------------------------------------------
//  Untergründe: Grip, Rollwiderstand, Geschwindigkeitswiderstand (Einsinken),
//  Vibrationsprofil (Amplitude/Wellenlänge der Fahrbahnunebenheit)
// ---------------------------------------------------------------------------
const SURF = { ASPHALT: 0, LINE: 1, KERB: 2, KERB_SAW: 3, SAUSAGE: 4, ASTRO: 5, GRASS: 6, GRAVEL: 7, PIT: 8, RUNOFF: 9 };
const SURFACES = [
  { id: 0, key: 'asphalt', name: 'Asphalt', grip: 1.00, wetGrip: 1.00, rr: 0.011, drag: 0, vibAmp: 0.0005, vibLen: 3.0, offTrack: false, kerb: false },
  { id: 1, key: 'line', name: 'Begrenzungslinie', grip: 0.97, wetGrip: 0.72, rr: 0.011, drag: 0, vibAmp: 0.0005, vibLen: 3.0, offTrack: false, kerb: false },
  { id: 2, key: 'kerb', name: 'Randstein', grip: 0.93, wetGrip: 0.70, rr: 0.014, drag: 0, vibAmp: 0.0025, vibLen: 1.0, offTrack: false, kerb: true },
  { id: 3, key: 'kerbSaw', name: 'Sägezahn-Randstein', grip: 0.88, wetGrip: 0.66, rr: 0.020, drag: 0, vibAmp: 0.0065, vibLen: 0.42, offTrack: false, kerb: true },
  { id: 4, key: 'sausage', name: 'Wurst-Randstein', grip: 0.76, wetGrip: 0.55, rr: 0.030, drag: 0, vibAmp: 0.0040, vibLen: 0.6, offTrack: true, kerb: true },
  { id: 5, key: 'astro', name: 'Kunstrasen', grip: 0.74, wetGrip: 0.42, rr: 0.020, drag: 0, vibAmp: 0.0015, vibLen: 1.6, offTrack: true, kerb: false },
  { id: 6, key: 'grass', name: 'Gras', grip: 0.55, wetGrip: 0.32, rr: 0.060, drag: 9, vibAmp: 0.0060, vibLen: 3.5, offTrack: true, kerb: false, dirt: true },
  { id: 7, key: 'gravel', name: 'Kiesbett', grip: 0.46, wetGrip: 0.42, rr: 0.200, drag: 62, vibAmp: 0.0090, vibLen: 0.22, offTrack: true, kerb: false, dirt: true, sink: 0.05 },
  { id: 8, key: 'pit', name: 'Boxengasse', grip: 0.96, wetGrip: 0.86, rr: 0.011, drag: 0, vibAmp: 0.0004, vibLen: 3.0, offTrack: false, kerb: false },
  { id: 9, key: 'runoff', name: 'Asphalt-Auslauf', grip: 0.93, wetGrip: 0.84, rr: 0.012, drag: 0, vibAmp: 0.0008, vibLen: 2.5, offTrack: true, kerb: false },
];
const SURF_BY_KEY = Object.fromEntries(SURFACES.map(s => [s.key, s.id]));

// ---------------------------------------------------------------------------
//  Reifenmischungen (fiktiver Reifenhersteller „VULKAR“)
//  mu: Spitzenreibwert bei Nennlast · tOpt/tWin: Temperaturfenster (°C)
//  wear: Verschleißfaktor · wetLoss: Gripverlust bei voller Nässe (Phase 5)
// ---------------------------------------------------------------------------
const COMPOUNDS = {
  soft:   { id: 'soft',   name: 'Weich',        short: 'W', color: '#e8262f', mu: 1.90, tOpt: 88,  tWin: 17, wear: 1.65, coldGrip: 0.76, heat: 1.10, wetLoss: 0.62, dryPenalty: 0 },
  medium: { id: 'medium', name: 'Mittel',       short: 'M', color: '#f6c700', mu: 1.84, tOpt: 95,  tWin: 19, wear: 1.00, coldGrip: 0.75, heat: 1.00, wetLoss: 0.62, dryPenalty: 0 },
  hard:   { id: 'hard',   name: 'Hart',         short: 'H', color: '#efefef', mu: 1.78, tOpt: 104, tWin: 21, wear: 0.62, coldGrip: 0.73, heat: 0.92, wetLoss: 0.63, dryPenalty: 0 },
  inter:  { id: 'inter',  name: 'Intermediate', short: 'I', color: '#2fb54a', mu: 1.55, tOpt: 72,  tWin: 20, wear: 1.45, coldGrip: 0.82, heat: 1.18, wetLoss: 0.24, dryPenalty: 0.04 },
  wet:    { id: 'wet',    name: 'Regen',        short: 'R', color: '#2272e6', mu: 1.40, tOpt: 58,  tWin: 20, wear: 1.30, coldGrip: 0.85, heat: 1.25, wetLoss: 0.08, dryPenalty: 0.08 },
};
const COMPOUND_ORDER = ['soft', 'medium', 'hard', 'inter', 'wet'];

// ---------------------------------------------------------------------------
//  Fahrzeug „AF-26“ – modernes Formelkonzept (klein, leicht, 50/50-Hybrid,
//  aktive Aerodynamik). Lokales System: vorwärts = −Z, rechts = +X, oben = +Y,
//  Ursprung im Schwerpunkt.
// ---------------------------------------------------------------------------
const CAR_SPEC = {
  name: 'AF-26',
  mass: 770,                  // kg inkl. Fahrer
  cgHeight: 0.28,             // m (Nenn-Schwerpunkthöhe)
  wheelbase: 3.40,
  frontWeight: 0.45,          // statischer Lastanteil vorne
  trackF: 1.60, trackR: 1.60,
  inertiaBox: [1.10, 0.55, 3.90],  // effektive Massenverteilung Breite/Höhe/Länge → Trägheitstensor
  rF: 0.355, rR: 0.360,       // Reifenradien
  IwF: 0.85, IwR: 1.15,       // Raddrehträgheit inkl. Bremse/Antriebsstrang-Anteil (kg m²)
  tyreWidthF: 0.30, tyreWidthR: 0.38,
  floorY: -0.227,             // Plankenebene relativ zum Schwerpunkt (lokal y)
  plankZ: [-1.20, 1.30],      // Messpunkte Fahrhöhe vorne/hinten (lokal z)
  suspTravel: 0.065,          // Federweg (Ausfederung → Anschlag)
  bumpGap: [0.017, 0.024],    // Restweg bis Packer (ab statischer Einfederung) vorne/hinten
  steerLockDeg: 180,          // Lenkrad ±180° (360° Gesamtrotation)
  maxWheelAngleDeg: 21,       // Radeinschlag vorne bei Vollausschlag
  ackermann: 0.10,
  engine: {
    idleRpm: 4000, limitRpm: 15000, inertia: 0.09,
    // Volllast-Drehmoment des Verbrenners (Nm) über Drehzahl → ~400 kW bei 12.000 U/min
    curve: [[0, 120], [3000, 160], [4000, 182], [6000, 240], [8000, 290], [9500, 318], [11000, 335], [12000, 318], [13000, 292], [14000, 266], [15000, 240], [16000, 200]],
    dragBase: 10, dragK: 32,  // Schleppmoment = base + k·(n/15000)²
    turboTau: [0.30, 0.08],   // Ladedruck-Zeitkonstante bei niedriger/hoher Drehzahl
  },
  ers: {
    maxKW: 350,               // MGU-K
    battMJ: 4.0,              // nutzbarer Energiespeicher
    maxCrankNm: 450,
    taperNormal: [290, 345],  // km/h: volle Leistung bis …, null bei …
    taperBoost: [337, 355],   // im Überholmodus
    liftKW: { save: 200, balanced: 120, attack: 60 },
    deploy: { save: 0.55, balanced: 0.85, attack: 1.0 },
    lapDeployMJ: 4.0,         // Einsatzgrenze je Runde (Überholmodus: +0,5 MJ)
  },
  gearbox: {
    ratios: [5.0, 3.8, 3.05, 2.525, 2.1625, 1.8875, 1.6625, 1.475],  // 8 Gänge
    reverse: 4.0, final: 4.0,
    shiftTime: 0.030,         // s
    clutchMaxNm: 760,
  },
  brakes: { maxTorque: 11000, discCap: 1300, absSlip: 0.12 },
  aero: {
    rho: 1.20,
    clFW: 1.25, clRW: 1.15, clFloor: 1.60,      // Abtriebsflächen (m²) Kurvenmodus
    cdBody: 0.55, cdRW: 0.36, cdFW: 0.10,       // Widerstandsflächen (m²)
    straightFW: 0.42, straightRW: 0.30,          // Abtriebsanteil im Geradenmodus
    cdStraightFW: 0.45, cdStraightRW: 0.22,      // Widerstandsanteil im Geradenmodus
    floorFront: 0.36,                            // Druckpunkt Unterboden (Anteil Vorderachse)
    flapTime: 0.25,                              // s Umklappzeit
    dragHeight: 0.18,                            // Angriffshöhe Luftwiderstand über SP
    staticRide: 0.053,                           // Referenz-Fahrhöhe Unterboden (m)
  },
  tyre: {
    Bx: 16.0, Cx: 1.65, Ex: 0.20,   // Pacejka längs
    By: 14.5, Cy: 1.55, Ey: 0.15,   // Pacejka quer (über tan α)
    fz0: 3500, loadSens: 0.12,      // Nennlast und Lastempfindlichkeit
    trail0: 0.045, mechTrail: 0.012, scrub: 0.03,   // Nachlauf/Lenkrollradius für FFB
    cSurf: 1700, cCore: 9000,       // Wärmekapazitäten (J/K) je Zone bzw. Kern
    kSC: 110, kCoreLoss: 16, hBase: 4, hVel: 2.2, slipHeat: 0.36, hyst: 0.018,
    wearK: 3.4e-8,                  // Verschleiß je J Gleitarbeit (×Mischungsfaktor)
    ambient: 24, track: 34,
  },
  ffb: { assist: 0.45, maxNm: 26 },
};

// ---------------------------------------------------------------------------
//  Setup – Standardwerte, Bereiche, Voreinstellungen
// ---------------------------------------------------------------------------
const SETUP_RANGES = {
  frontWing: [1, 11, 1], rearWing: [1, 11, 1],
  diffOn: [10, 100, 5], diffOff: [10, 100, 5], diffPreload: [20, 200, 10],
  camberF: [-3.5, -2.5, 0.1], camberR: [-2.0, -1.0, 0.1], toeF: [-0.15, 0.0, 0.01], toeR: [0.05, 0.35, 0.01],
  springF: [140, 300, 10], springR: [120, 260, 10], arbF: [40, 200, 10], arbR: [20, 160, 10],
  rideF: [20, 50, 1], rideR: [50, 100, 1],
  brakePressure: [80, 100, 1], brakeBias: [50, 65, 0.5],
  pressureF: [21.0, 25.0, 0.1], pressureR: [19.5, 23.5, 0.1],
};
const DEFAULT_SETUP = {
  frontWing: 6, rearWing: 6, diffOn: 55, diffOff: 45, diffPreload: 60,
  camberF: -3.0, camberR: -1.6, toeF: -0.05, toeR: 0.20,
  springF: 200, springR: 170, arbF: 100, arbR: 95, rideF: 32, rideR: 75,
  brakePressure: 100, brakeBias: 56, pressureF: 22.5, pressureR: 21.0,
};
const SETUP_PRESETS = {
  high:     { name: 'Hoher Abtrieb',    values: { frontWing: 9, rearWing: 10, diffOn: 50, springF: 190, springR: 160, rideF: 31, rideR: 78 } },
  balanced: { name: 'Ausgewogen',       values: {} },
  low:      { name: 'Niedriger Abtrieb', values: { frontWing: 3, rearWing: 2, diffOn: 65, springF: 220, springR: 190, rideF: 30, rideR: 70 } },
};

// ---------------------------------------------------------------------------
//  Teams und Fahrer (frei erfunden) – Farben: [Basis, Sekundär, Akzent]
// ---------------------------------------------------------------------------
const TEAMS = [
  { id: 'aurora',     name: 'Aurora Veloce',        short: 'AUR', colors: ['#c4122f', '#f4f4f4', '#141414'], pattern: 'stripe',  sponsors: ['VELTRAX', 'ORBANO'] },
  { id: 'nordlicht',  name: 'Nordlicht Motorsport', short: 'NRD', colors: ['#00a39b', '#c5cbd0', '#0b1f2a'], pattern: 'split',   sponsors: ['QUELLWERK', 'LUMIRA'] },
  { id: 'kestrel',    name: 'Kestrel Grand Prix',   short: 'KES', colors: ['#ff7a00', '#121212', '#ffffff'], pattern: 'chevron', sponsors: ['TARVEN', 'SKYLOFT DATA'] },
  { id: 'atlas',      name: 'Atlas Dynamics',       short: 'ATL', colors: ['#0c2b5e', '#ffd400', '#ffffff'], pattern: 'stripe',  sponsors: ['HALDEN BANK', 'BRAVIK'] },
  { id: 'solaris',    name: 'Solaris Racing',       short: 'SOL', colors: ['#d8a31a', '#101010', '#ffffff'], pattern: 'split',   sponsors: ['MORVANE', 'ISOTERRA'] },
  { id: 'brennhagen', name: 'Brennhagen Rennsport', short: 'BRH', colors: ['#0f7d3c', '#f4f4f4', '#0a0a0a'], pattern: 'chevron', sponsors: ['GRAUFELD', 'PAXLINE'] },
  { id: 'monteverde', name: 'Monteverde Corse',     short: 'MVC', colors: ['#6e1b38', '#dcb54c', '#111111'], pattern: 'stripe',  sponsors: ['TESSARO', 'ALTIVO'] },
  { id: 'halcyon',    name: 'Halcyon F-Team',       short: 'HAL', colors: ['#5ecaf3', '#ff4fa5', '#ffffff'], pattern: 'split',   sponsors: ['NEVALUX', 'VANTARI'] },
  { id: 'ironvale',   name: 'Ironvale Racing',      short: 'IRV', colors: ['#6a7076', '#e3252c', '#151515'], pattern: 'chevron', sponsors: ['RHENOX', 'KORVIN'] },
  { id: 'tempest',    name: 'Tempest Formula',      short: 'TMP', colors: ['#5c2b88', '#b8f500', '#ffffff'], pattern: 'stripe',  sponsors: ['SOLVERA', 'CYRANEX'] },
];
const DRIVERS = [
  { name: 'Lukas Brenner',      nat: 'DEU', num: 7,  team: 'aurora', rating: 0.86, aggression: 0.6 },     { name: 'Mateo Aranda',       nat: 'ESP', num: 21, team: 'aurora', rating: 0.72, aggression: 0.5 },
  { name: 'Sven Lindqvist',     nat: 'SWE', num: 9,  team: 'nordlicht', rating: 0.95, aggression: 0.55 },  { name: 'Elliot Hartley',     nat: 'GBR', num: 26, team: 'nordlicht', rating: 0.8, aggression: 0.7 },
  { name: 'Kenji Morioka',      nat: 'JPN', num: 18, team: 'kestrel', rating: 0.84, aggression: 0.45 },    { name: 'Rafael Duarte',      nat: 'BRA', num: 12, team: 'kestrel', rating: 0.7, aggression: 0.8 },
  { name: 'Théo Marchand',      nat: 'FRA', num: 31, team: 'atlas', rating: 0.9, aggression: 0.5 },      { name: 'Harrison Whitfield', nat: 'AUS', num: 4,  team: 'atlas', rating: 0.76, aggression: 0.65 },
  { name: 'Aleksander Nowak',   nat: 'POL', num: 15, team: 'solaris', rating: 0.66, aggression: 0.4 },    { name: 'Daniel Okafor',      nat: 'GBR', num: 42, team: 'solaris', rating: 0.62, aggression: 0.6 },
  { name: 'Jonas Vermeulen',    nat: 'BEL', num: 8,  team: 'brennhagen', rating: 0.74, aggression: 0.5 }, { name: 'Noah Fischbacher',   nat: 'CHE', num: 27, team: 'brennhagen', rating: 0.58, aggression: 0.45 },
  { name: 'Matteo Ferrandi',    nat: 'ITA', num: 11, team: 'monteverde', rating: 0.82, aggression: 0.75 }, { name: 'Felipe Castañeda',   nat: 'MEX', num: 33, team: 'monteverde', rating: 0.68, aggression: 0.7 },
  { name: 'Arjun Mehta',        nat: 'IND', num: 19, team: 'halcyon', rating: 0.6, aggression: 0.35 },    { name: "Liam O'Rourke",      nat: 'IRL', num: 6,  team: 'halcyon', rating: 0.55, aggression: 0.6 },
  { name: 'Emil Haugland',      nat: 'NOR', num: 24, team: 'ironvale', rating: 0.52, aggression: 0.5 },   { name: 'Carlos Medina',      nat: 'ARG', num: 14, team: 'ironvale', rating: 0.48, aggression: 0.75 },
  { name: 'Yuto Saeki',         nat: 'JPN', num: 37, team: 'tempest', rating: 0.5, aggression: 0.4 },    { name: 'Samuel Achterberg',  nat: 'NLD', num: 5,  team: 'tempest', rating: 0.45, aggression: 0.55 },
];

// ---------------------------------------------------------------------------
//  STRECKEN – Editor-Datenformat
//  points: geschlossener Catmull-Rom-Spline, je Stützpunkt [x, z, höhe, breite, banking°]
//          (Banking positiv = rechte Fahrbahnseite höher)
//  Bereiche (from/to) als Anteil der Rundenlänge (0…1, darf über 1→0 umbrechen)
//  sections: überschreiben pro Seite (L/R/B) Auslauf, Barriere, Randsteine …
// ---------------------------------------------------------------------------
const TRACKS = {
  ringpark: {
    id: 'ringpark',
    name: 'Kurstadt Ringpark',
    location: 'Kurstadt',
    character: 'Schneller, flüssiger Parkkurs mit Hochgeschwindigkeitskurven, langen Geraden und einer engen Haarnadel.',
    timeOfDay: 'afternoon',
    raceLaps: 57,
    aiLapFactor: 1.0446,   // gemessene KI-Rundenzeit / Profil-Rundenzeit (weich, Qualifying-Schätzung)
    corners: [
      { name: 'Kurhaus', at: 0.131 }, { name: 'Parkbogen', at: 0.225 }, { name: 'Brunnen', at: 0.381 },
      { name: 'Haarnadel', at: 0.615 }, { name: 'Schwanensee', at: 0.81 }, { name: 'Schikane', at: 0.874 }, { name: 'Zielkurve', at: 0.922 },
    ],
    points: [
      [0,0,0,16,0],[53.3,0,0.01,16,0],[106.7,0,0.03,16,0],[160,0,0.07,16,0],[213.3,0,0.13,16,0],[266.7,0,0.19,16,0],[320,0,0.25,16,0],[373.3,0,0.31,16,0],
      [426.7,0,0.38,16,0],[480,0,0.43,16,0],[533.3,0,0.47,16,0],[586.7,0,0.49,15.8,0],[640,0,0.5,15.1,0],[666.3,4.2,0.45,14.8,0],[690,16.2,0.32,14.6,0],[708.8,35,0.11,14.5,0],
      [720.8,58.7,-0.16,14.5,0],[725,85,-0.46,14.5,0],[725,140,-1.06,14.3,0],[725,195,-1.44,14.1,0],[727.9,233.4,-1.5,13.9,0],[736.4,271,-1.39,13.7,0],[750.3,306.9,-1.14,13.6,0],[769.5,340.4,-0.77,13.5,0],
      [808.6,398.4,0.07,13.5,0],[824.3,428,0.48,13.5,0],[833.5,460.1,0.85,13.5,0],[835.9,493.5,1.16,13.5,0],[831.2,526.6,1.38,13.5,0],[819.8,558,1.49,13.5,0],[802,586.4,1.52,13.5,0],[777.4,617.9,1.68,13.5,0],
      [759.7,646.9,1.94,13.5,0],[748.9,679.1,2.29,13.5,0],[745.6,712.9,2.72,13.5,0],[750.1,746.6,3.2,13.5,0],[762,778.4,3.7,13.5,0],[780.7,806.7,4.18,13.5,0],[799.7,834.3,4.62,13.5,0],[813.1,865.1,4.99,13.5,0],
      [820.3,897.8,5.27,13.5,0],[821.2,931.4,5.44,13.5,0],[815.7,964.5,5.5,13.5,0],[803.9,995.9,5.46,13.5,0],[781.1,1042.6,5.25,13.5,0],[758.3,1089.4,4.92,13.5,0],[735.5,1136.1,4.54,13.5,0],[712.7,1182.8,4.22,13.5,0],
      [690,1229.6,4.03,13.6,0],[680.3,1243.9,4,13.7,0],[667.1,1255,4,13.8,0],[651.3,1262,3.98,13.8,0],[634.2,1264.4,3.94,13.9,0],[578.5,1264.4,3.69,14,0],[522.8,1264.4,3.3,14,0],[467.1,1264.4,2.84,14,0],
      [411.3,1264.4,2.41,14,0],[355.6,1264.4,2.11,14,0],[299.9,1264.4,2,14,0],[244.2,1264.4,1.89,14,0],[188.5,1264.4,1.57,14,0],[132.7,1264.4,1.08,14,0],[77,1264.4,0.48,14,0],[21.3,1264.4,-0.15,14,0],
      [-34.4,1264.4,-0.72,14,0],[-90.1,1264.4,-1.18,14,0],[-145.9,1264.4,-1.44,14,0],[-201.6,1264.4,-1.51,14,0],[-238.2,1265.5,-1.56,14,0],[-274.7,1268.9,-1.65,14.2,0],[-310.9,1274.4,-1.77,14.6,0],[-346.7,1282.2,-1.88,14.9,0],
      [-395.2,1294.3,-1.98,14.9,0],[-443.8,1306.4,-1.97,14.4,0],[-492.3,1318.5,-1.71,14,0],[-540.8,1330.6,-1.2,14,0],[-549.4,1331.5,-1.09,14,0],[-558,1329.8,-0.98,14,0],[-565.7,1325.8,-0.87,14,0],[-571.9,1319.7,-0.76,14,0],
      [-576.1,1312.1,-0.64,14,0],[-578,1303.6,-0.52,14,0],[-577.3,1294.9,-0.4,14,0],[-574.2,1286.8,-0.29,14,0],[-568.9,1279.9,-0.17,14,0],[-530.5,1242.9,0.47,14,0],[-492.2,1205.8,0.89,14,0],[-453.8,1168.8,1.01,14,0],
      [-415.4,1131.7,1.32,14,0],[-377.1,1094.7,2.01,14,0],[-338.7,1057.6,2.89,14,0],[-317.8,1031.1,3.45,14,0],[-304.8,1000.1,3.93,14,0],[-300.5,966.6,4.29,14,0],[-305.4,933.3,4.47,14,0],[-316.3,904.8,4.5,14,0],
      [-332,878.6,4.45,14,0],[-352,855.6,4.36,14,0],[-375.7,836.4,4.23,14,0],[-425.5,802.9,3.9,14,0],[-475.2,769.3,3.53,14,0],[-525,735.8,3.21,14,-0.6],[-554.9,713,3.08,14,-1.1],[-582.1,686.9,3.01,14,-1.5],
      [-606.1,657.9,2.99,14,-1.5],[-626.7,626.4,2.9,14,-1.6],[-643.5,592.7,2.73,14,-1.8],[-656.4,557.4,2.5,14,-2],[-665.2,520.8,2.23,14,-2.2],[-669.7,483.4,1.94,14,-2.4],[-670,445.8,1.65,14,-2.5],[-666,408.4,1.4,14,-2.4],
      [-657.8,371.6,1.19,14,-1.9],[-645.4,336.1,1.06,14,-1],[-629.1,302.2,1,14,-0.2],[-595.3,241.3,0.92,14,0],[-587.4,231,0.89,13.9,0],[-576.9,223.3,0.85,13.9,0],[-564.5,219,0.81,13.9,0],[-552.2,214.6,0.76,13.8,0],
      [-541.7,207,0.72,13.8,0],[-533.8,196.6,0.67,13.7,0],[-507.9,150,0.48,13.6,0],[-482.1,103.3,0.34,13.5,0],[-456.2,56.7,0.3,13.8,-0.6],[-438.8,33.2,0.3,14.1,-1.6],[-415.8,15.2,0.29,14.3,-2],[-388.9,3.9,0.27,14.5,-1.6],
      [-360,0,0.25,14.5,-0.6],[-308.6,0,0.21,15.1,0],[-257.1,0,0.16,15.8,0],[-205.7,0,0.12,16,0],[-154.3,0,0.07,16,0],[-102.9,0,0.03,16,0],[-51.4,0,0.01,16,0]
    ],
    sectors: [0, 0.352, 0.665],
    aeroZones: [[0.942, 0.104], [0.392, 0.596]],
    overtakeDetection: [0.905, 0.368],
    defaults: { runoff: 'grass', runoffWidth: 12, barrier: 'guardrail' },
    autoKerbs: { minRadius: 360 },
    sections: [
      { from: 0.936, to: 0.112, side: 'L', runoff: 'runoff', runoffWidth: 2.5, barrier: 'wall', kerb: 0, astro: 0 },   // Boxenmauer
      { from: 0.944, to: 0.104, side: 'R', runoff: 'grass', runoffWidth: 7, barrier: 'wall', kerb: 0 },              // Tribünenseite
      { from: 0.112, to: 0.160, side: 'L', runoff: 'runoff', runoffWidth: 34, astro: 3, barrier: 'tyres' },           // Kurhaus
      { from: 0.205, to: 0.250, side: 'L', runoff: 'gravel', runoffWidth: 30, barrier: 'tyres' },                     // Parkbogen
      { from: 0.255, to: 0.292, side: 'R', runoff: 'gravel', runoffWidth: 26, barrier: 'tyres' },
      { from: 0.290, to: 0.334, side: 'L', runoff: 'gravel', runoffWidth: 26, barrier: 'tyres' },
      { from: 0.366, to: 0.400, side: 'L', runoff: 'runoff', runoffWidth: 28, astro: 3, barrier: 'tyres' },           // Brunnen
      { from: 0.596, to: 0.634, side: 'L', runoff: 'runoff', runoffWidth: 40, astro: 3, barrier: 'tyres' },           // Haarnadel
      { from: 0.682, to: 0.712, side: 'R', runoff: 'gravel', runoffWidth: 24, barrier: 'tyres' },
      { from: 0.765, to: 0.856, side: 'L', runoff: 'grass', runoffWidth: 18, barrier: 'guardrail' },                 // Schwanensee
      { from: 0.772, to: 0.850, side: 'R', runoff: 'grass', runoffWidth: 6, barrier: 'wall' },                       // Mauer zum See
      { from: 0.858, to: 0.893, side: 'B', runoff: 'runoff', runoffWidth: 16, astro: 2.5, barrier: 'tyres' },        // Schikane
      { from: 0.865, to: 0.8745, side: 'R', kerb: 1, sausage: true },
      { from: 0.8745, to: 0.884, side: 'L', kerb: 1, sausage: true },
      { from: 0.906, to: 0.940, side: 'L', runoff: 'gravel', runoffWidth: 26, barrier: 'tyres' },                     // Zielkurve
    ],
    scenery: {
      seed: 1871,
      trees: 2600,
      pit: { from: 0.962, to: 0.062, side: 'L' },
      grandstands: [
        { at: 0.985, len: 240, side: 'R', rows: 14 }, { at: 0.128, len: 130, side: 'L', rows: 10 },
        { at: 0.385, len: 90, side: 'L', rows: 8 }, { at: 0.612, len: 120, side: 'L', rows: 12 },
        { at: 0.876, len: 100, side: 'L', rows: 10 }, { at: 0.925, len: 90, side: 'L', rows: 9 },
      ],
      lake: { at: 0.812, side: 'R', dist: 95, rx: 85, rz: 150 },
      buildings: [
        { at: 0.135, side: 'L', dist: 150, kind: 'kurhaus' },
        { at: 0.47, side: 'R', dist: 110, kind: 'pavillon' },
        { at: 0.70, side: 'L', dist: 90, kind: 'pavillon' },
      ],
    },
  },
  // Nach einer Streckenskizze des Spielers: Mittellinie aus der Zeichnung extrahiert (5,3 km)
  falkenried: {
    id: 'falkenried',
    name: 'Falkenried-Ring',
    location: 'Falkenried',
    character: 'Lange Start-Ziel-Gerade, harte Bremszone in Kurve 1, schnelle Gegengerade bergauf, dann ein enges, welliges Kurvengeschlängel mit Spitzkehren und der weiten Westkehre.',
    timeOfDay: 'evening',
    raceLaps: 57,
    aiLapFactor: 1.0450,   // gemessene KI-Rundenzeit / Profil-Rundenzeit (weich, Qualifying-Schätzung)
    corners: [
      { name: 'Kurve 1', at: 0.121 }, { name: 'Nordkehre', at: 0.268 }, { name: 'Spitzkehre', at: 0.328 }, { name: 'Talkurve', at: 0.365 },
      { name: 'Kuppe', at: 0.425 }, { name: 'Senke', at: 0.453 }, { name: 'Schleife', at: 0.488 }, { name: 'Waldbogen', at: 0.548 },
      { name: 'Westkehre', at: 0.655 }, { name: 'Wiesenbogen', at: 0.749 }, { name: 'Hangkurve', at: 0.791 }, { name: 'Zielkurve', at: 0.86 },
    ],
    points: [
      [368.5,273.8,-0.63,16.0,0],[391.0,269.2,-0.46,16.0,0],[413.3,264.5,-0.3,16.0,0],[436.1,259.8,-0.13,16.0,0],[459.0,255.0,0.03,16.0,0],[481.9,250.2,0.18,16.0,0],[504.6,245.5,0.32,16.0,0],[527.4,240.8,0.45,16.0,0],
      [550.3,236.0,0.57,16.0,0],[573.2,231.3,0.68,16.0,0],[596.0,226.5,0.79,16.0,0],[618.9,221.8,0.88,16.0,0],[641.8,217.0,0.95,16.0,0],[664.5,212.3,1.02,16.0,0],[687.4,207.5,1.08,16.0,0],[710.2,202.8,1.12,16.0,0],
      [733.0,198.0,1.16,16.0,0],[755.9,193.2,1.19,16.0,0],[778.5,188.0,1.2,16.0,0],[801.5,183.4,1.2,16.0,0],[824.4,178.5,1.19,16.0,0],[847.2,173.6,1.19,16.0,0],[869.4,166.5,1.17,16.0,0],[892.4,162.4,1.14,16.0,0],
      [915.4,158.7,1.13,14.0,0],[938.3,154.1,1.15,14.0,0],[959.0,143.8,1.22,14.0,0],[975.2,127.1,1.35,14.0,0],[983.6,105.4,1.56,14.0,0],[985.2,82.3,1.81,14.0,0],[979.0,59.9,2.11,14.0,0],[966.5,40.2,2.42,14.0,0],
      [952.3,21.7,2.74,14.0,0],[938.4,3.0,3.05,14.0,0],[924.4,-15.7,3.37,14.0,0],[910.4,-34.3,3.68,14.0,0],[896.0,-52.7,3.99,14.0,0],[881.9,-71.3,4.29,14.0,0],[868.1,-90.1,4.6,14.0,0],[854.0,-108.7,4.9,14.0,0],
      [839.3,-126.8,5.19,14.0,0],[825.4,-145.5,5.49,14.0,0],[810.9,-163.8,5.78,14.0,0],[796.7,-182.3,6.06,14.0,0],[782.3,-200.8,6.35,14.0,0],[768.2,-219.3,6.63,14.0,0],[753.7,-237.6,6.9,14.0,0],[739.4,-256.0,7.17,14.0,0],
      [725.2,-274.5,7.44,14.0,0],[711.0,-293.1,7.7,14.0,0],[696.9,-311.7,7.96,14.0,0],[682.2,-329.8,8.2,14.0,0],[667.1,-347.6,8.42,14.0,0],[650.6,-364.1,8.63,14.0,0],[633.3,-379.7,8.81,14.0,0],[614.3,-393.2,8.97,14.0,0],
      [594.3,-405.3,9.1,14.0,0],[573.0,-414.7,9.19,14.0,0],[551.2,-423.0,9.24,14.0,0],[528.4,-428.0,9.23,14.0,0],[505.1,-429.5,9.17,14.0,0],[482.0,-426.7,9.05,14.0,0],[460.1,-419.0,8.87,14.0,0],[441.3,-405.4,8.64,14.0,0],
      [427.4,-386.8,8.37,14.0,0],[418.6,-365.2,8.06,14.0,0],[411.2,-343.0,7.75,14.0,0],[403.7,-320.9,7.42,14.0,0],[397.5,-298.5,7.09,14.0,0],[390.4,-276.2,6.76,14.0,0],[385.3,-253.5,6.45,14.0,0],[384.6,-230.2,6.15,14.0,0],
      [389.3,-207.4,5.86,14.0,0],[396.7,-185.2,5.58,14.0,0],[401.6,-162.5,5.29,14.0,0],[396.3,-140.0,4.99,14.0,0],[382.7,-121.3,4.7,14.0,0],[364.1,-107.2,4.41,14.0,0],[344.8,-94.0,4.13,14.0,0],[325.1,-81.5,3.87,14.0,0],
      [305.7,-68.6,3.63,14.0,0],[284.5,-59.0,3.42,14.0,0],[261.8,-54.0,3.26,14.0,0],[238.4,-53.9,3.16,14.0,0],[215.6,-58.6,3.1,14.0,0],[194.6,-68.6,3.11,14.0,0],[175.5,-81.9,3.18,14.0,0],[158.9,-98.3,3.29,14.0,0],
      [142.8,-115.2,3.43,14.0,0],[127.2,-132.5,3.59,14.0,0],[111.5,-149.8,3.76,14.0,0],[95.6,-166.9,3.93,14.0,0],[79.9,-184.2,4.11,14.0,0],[64.2,-201.5,4.29,14.0,0],[48.5,-218.7,4.45,14.0,0],[32.1,-235.3,4.58,13.0,0],
      [12.8,-248.1,4.66,13.0,0],[-10.1,-251.5,4.67,13.0,0],[-32.5,-245.8,4.59,13.0,0],[-50.8,-231.5,4.45,13.0,0],[-65.5,-213.4,4.27,13.0,0],[-81.4,-196.3,4.1,13.0,0],[-98.6,-180.6,3.98,13.0,0],[-120.0,-171.9,3.95,13.0,0],
      [-142.9,-174.8,4.0,13.0,0],[-161.9,-188.0,4.15,13.0,0],[-175.2,-207.1,4.36,13.0,0],[-187.5,-226.9,4.61,13.0,0],[-198.6,-247.5,4.88,13.0,0],[-212.2,-266.4,5.12,13.0,0],[-231.5,-279.2,5.31,13.0,0],[-254.2,-283.7,5.43,13.0,0],
      [-277.1,-279.6,5.46,13.0,0],[-297.0,-267.9,5.41,13.0,0],[-312.0,-250.1,5.29,13.0,0],[-322.2,-229.1,5.13,13.0,0],[-332.4,-208.2,4.96,13.0,0],[-347.4,-190.3,4.81,13.0,0],[-365.1,-175.2,4.69,13.0,0],[-385.2,-163.4,4.62,14.0,0],
      [-406.0,-152.9,4.58,14.0,0],[-427.6,-143.9,4.57,14.0,0],[-449.6,-136.4,4.59,14.0,0],[-472.3,-130.9,4.64,14.0,0],[-495.5,-128.3,4.71,14.0,0],[-518.8,-128.1,4.82,14.0,0],[-542.0,-130.3,4.95,14.0,0],[-564.9,-134.9,5.1,14.0,0],
      [-587.2,-141.7,5.27,14.0,0],[-608.7,-150.8,5.46,14.0,0],[-630.1,-160.0,5.66,14.0,0],[-651.5,-169.3,5.86,14.0,0],[-673.0,-178.5,6.04,14.0,0],[-694.4,-187.8,6.21,14.0,0],[-715.9,-196.9,6.38,14.0,0],[-737.2,-206.3,6.53,14.0,0],
      [-758.5,-215.9,6.67,14.0,0],[-780.0,-224.9,6.79,14.0,0],[-801.5,-233.9,6.9,14.0,0],[-823.1,-242.8,6.98,14.0,0],[-845.7,-248.5,7.01,14.0,0],[-868.9,-249.3,6.98,14.0,0],[-891.7,-244.3,6.87,14.0,0],[-912.6,-234.0,6.71,14.0,0],
      [-930.3,-219.0,6.49,14.0,0],[-943.9,-200.0,6.23,14.0,0],[-952.6,-178.5,5.93,14.0,0],[-958.1,-155.8,5.63,14.0,0],[-958.5,-132.5,5.33,14.0,0],[-955.8,-109.4,5.04,14.0,0],[-949.7,-86.8,4.77,14.0,0],[-941.1,-65.2,4.51,14.0,0],
      [-930.3,-44.5,4.28,14.0,0],[-916.0,-26.1,4.08,14.0,0],[-899.8,-9.3,3.9,14.0,0],[-881.5,5.2,3.75,14.0,0],[-861.3,16.8,3.63,14.0,0],[-839.3,24.5,3.55,14.0,0],[-816.4,29.0,3.5,14.0,0],[-793.1,29.5,3.49,14.0,0],
      [-770.0,27.0,3.5,14.0,0],[-747.3,21.5,3.52,14.0,0],[-724.7,15.9,3.54,14.0,0],[-702.0,10.5,3.54,14.0,0],[-678.8,8.5,3.51,14.0,0],[-655.5,9.9,3.43,14.0,0],[-632.6,14.6,3.31,14.0,0],[-610.2,21.0,3.16,14.0,0],
      [-588.4,29.3,3.0,14.0,0],[-566.2,36.6,2.84,14.0,0],[-543.3,40.9,2.71,14.0,0],[-520.0,41.6,2.6,14.0,0],[-497.0,38.0,2.54,14.0,0],[-475.1,30.0,2.51,14.0,0],[-454.3,19.5,2.52,14.0,0],[-433.8,8.3,2.54,14.0,0],
      [-413.9,-3.8,2.55,14.0,0],[-393.5,-15.1,2.54,14.0,0],[-371.0,-21.0,2.47,14.0,0],[-348.0,-18.4,2.33,14.0,0],[-327.9,-6.8,2.13,14.0,0],[-313.4,11.3,1.87,14.0,0],[-306.2,33.3,1.58,14.0,0],[-305.5,56.6,1.27,14.0,0],
      [-307.7,79.8,0.98,14.0,0],[-313.8,102.3,0.71,14.0,0],[-321.0,124.5,0.45,14.0,0],[-330.0,146.0,0.21,14.0,0],[-341.3,166.5,-0.02,14.0,0],[-351.6,187.4,-0.25,14.0,0],[-362.5,208.0,-0.49,14.0,0],[-371.6,229.5,-0.74,14.0,0],
      [-377.0,252.1,-1.02,14.0,0],[-377.9,275.4,-1.31,14.0,0],[-373.8,298.4,-1.62,14.0,0],[-365.3,320.0,-1.93,14.0,0],[-352.3,339.4,-2.23,14.0,0],[-336.1,356.1,-2.51,14.0,0],[-316.8,369.3,-2.77,14.0,0],[-295.8,379.3,-2.99,14.0,0],
      [-273.3,385.6,-3.17,14.0,0],[-250.2,388.6,-3.3,14.0,0],[-226.9,388.8,-3.39,14.0,0],[-203.7,387.2,-3.46,14.0,0],[-180.4,386.5,-3.49,16.0,0],[-157.4,382.7,-3.5,16.0,0],[-134.3,378.4,-3.5,16.0,0],[-111.6,373.7,-3.48,16.0,0],
      [-88.7,368.9,-3.44,16.0,0],[-65.9,364.2,-3.39,16.0,0],[-43.1,359.4,-3.32,16.0,0],[-20.2,354.7,-3.24,16.0,0],[2.7,349.9,-3.14,16.0,0],[25.6,345.1,-3.04,16.0,0],[48.4,340.4,-2.92,16.0,0],[71.3,335.6,-2.8,16.0,0],
      [93.9,330.9,-2.67,16.0,0],[116.7,326.2,-2.53,16.0,0],[139.6,321.4,-2.38,16.0,0],[162.5,316.7,-2.22,16.0,0],[185.4,311.9,-2.05,16.0,0],[208.2,307.2,-1.88,16.0,0],[231.0,302.4,-1.71,16.0,0],[253.9,297.7,-1.53,16.0,0],
      [276.8,292.9,-1.35,16.0,0],[299.6,288.1,-1.17,16.0,0],[322.4,283.4,-0.99,16.0,0],[345.3,278.7,-0.81,16.0,0]
    ],
    sectors: [0, 0.3, 0.62],
    aeroZones: [[0.905, 0.088], [0.142, 0.222]],
    overtakeDetection: [0.875, 0.128],
    defaults: { runoff: 'grass', runoffWidth: 12, barrier: 'guardrail' },
    autoKerbs: { minRadius: 320 },
    sections: [
      { from: 0.895, to: 0.08, side: 'L', runoff: 'runoff', runoffWidth: 2.5, barrier: 'wall', kerb: 0, astro: 0 },    // Boxenmauer
      { from: 0.905, to: 0.07, side: 'R', runoff: 'grass', runoffWidth: 8, barrier: 'wall', kerb: 0 },                 // Tribünen
      { from: 0.098, to: 0.152, side: 'R', runoff: 'runoff', runoffWidth: 32, astro: 3, barrier: 'tyres' },             // Kurve 1
      { from: 0.224, to: 0.292, side: 'R', runoff: 'gravel', runoffWidth: 28, barrier: 'tyres' },                       // Nordkehre
      { from: 0.298, to: 0.342, side: 'L', runoff: 'runoff', runoffWidth: 22, astro: 2.5, barrier: 'tyres' },           // Spitzkehre
      { from: 0.41, to: 0.525, side: 'B', runoff: 'runoff', runoffWidth: 16, astro: 2.5, barrier: 'tyres' },            // Kuppe–Senke–Schleife
      { from: 0.605, to: 0.73, side: 'R', runoff: 'gravel', runoffWidth: 30, barrier: 'tyres' },                        // Westkehre
      { from: 0.77, to: 0.815, side: 'L', runoff: 'gravel', runoffWidth: 24, barrier: 'tyres' },                        // Hangkurve
      { from: 0.83, to: 0.89, side: 'R', runoff: 'runoff', runoffWidth: 30, astro: 3, barrier: 'tyres' },               // Zielkurve
    ],
    scenery: {
      seed: 4711,
      trees: 2400,
      pit: { from: 0.932, to: 0.045, side: 'L' },
      grandstands: [
        { at: 0.975, len: 260, side: 'R', rows: 14 }, { at: 0.115, len: 120, side: 'R', rows: 10 },
        { at: 0.268, len: 90, side: 'R', rows: 8 }, { at: 0.655, len: 120, side: 'R', rows: 10 },
        { at: 0.86, len: 100, side: 'R', rows: 10 },
      ],
      buildings: [
        { at: 0.03, side: 'R', dist: 140, kind: 'kurhaus' },
        { at: 0.40, side: 'L', dist: 90, kind: 'pavillon' },
        { at: 0.56, side: 'L', dist: 80, kind: 'pavillon' },
      ],
    },
  },
  // Stadtkurs am Hafen: enge Mauern, 90°-Ecken, Haarnadel am Leuchtturm (Generator: Polygon mit Eckenradien)
  hafen: {
    id: 'hafen',
    name: 'Hafenstadt-Kurs',
    location: 'Hafenstadt',
    character: 'Enger Stadtkurs zwischen Mauern: lange Hafengerade, rechtwinklige Ecken, Schikane am Markt und die Haarnadel am Leuchtturm. Fehler werden sofort bestraft.',
    timeOfDay: 'evening',
    raceLaps: 70,
    aiLapFactor: 1.0773,   // gemessene KI-Rundenzeit / Profil-Rundenzeit (weich, Qualifying-Schätzung)
    corners: [
      { name: 'Hafentor', at: 0.122 }, { name: 'Zollhaus', at: 0.295 }, { name: 'Marktschikane', at: 0.38 }, { name: 'Kaibogen', at: 0.506 },
      { name: 'Speicher', at: 0.574 }, { name: 'Leuchtturm', at: 0.648 }, { name: 'Fischmarkt', at: 0.715 }, { name: 'Werft', at: 0.784 },
      { name: 'Kran', at: 0.84 }, { name: 'Hafenkurve', at: 0.866 },
    ],
    points: [
      [450.0,700.0,0.25,14,0],[438.0,700.0,0.28,14,0],[426.0,700.0,0.3,14,0],[414.0,700.0,0.33,14,0],[402.0,700.0,0.35,14,0],[389.9,700.0,0.37,14,0],[377.9,700.0,0.39,14,0],[365.9,700.0,0.41,14,0],
      [353.9,700.0,0.42,14,0],[341.9,700.0,0.44,14,0],[329.9,700.0,0.45,14,0],[317.9,700.0,0.46,14,0],[305.9,700.0,0.47,14,0],[293.9,700.0,0.48,14,0],[281.8,700.0,0.49,14,0],[269.8,700.0,0.5,14,0],
      [257.8,700.0,0.51,14,0],[245.8,700.0,0.51,14,0],[233.8,700.0,0.51,14,0],[221.8,700.0,0.52,14,0],[209.8,700.0,0.52,14,0],[197.8,700.0,0.52,14,0],[185.8,700.0,0.52,14,0],[173.8,700.0,0.51,14,0],
      [161.7,700.0,0.51,14,0],[149.7,700.0,0.51,14,0],[137.7,700.0,0.5,14,0],[125.7,700.0,0.5,14,0],[113.7,700.0,0.49,14,0],[101.7,700.0,0.49,14,0],[89.7,700.0,0.48,14,0],[77.7,700.0,0.47,14,0],
      [65.7,700.0,0.46,14,0],[53.6,700.0,0.46,12,0],[41.6,700.0,0.45,12,0],[29.6,699.9,0.44,12,0],[18.1,696.8,0.43,12,0],[8.5,689.7,0.42,12,0],[2.2,679.6,0.41,12,0],[0.0,667.8,0.41,12,0],
      [0.0,655.8,0.4,12,0],[0.0,643.8,0.39,12,0],[0.0,631.8,0.38,12,0],[0.0,619.8,0.38,12,0],[0.0,607.8,0.37,12,0],[0.0,595.8,0.37,12,0],[0.0,583.8,0.36,12,0],[0.0,571.8,0.36,12,0],
      [0.0,559.7,0.35,12,0],[0.0,547.7,0.35,12,0],[0.0,535.7,0.35,12,0],[0.0,523.7,0.35,12,0],[0.0,511.7,0.35,12,0],[0.0,499.7,0.35,12,0],[0.0,487.7,0.35,12,0],[0.0,475.7,0.35,12,0],
      [0.0,463.7,0.36,12,0],[0.0,451.6,0.36,12,0],[0.0,439.6,0.37,12,0],[0.0,427.6,0.38,12,0],[0.0,415.6,0.38,12,0],[0.0,403.6,0.39,12,0],[0.0,391.6,0.4,12,0],[0.0,379.6,0.41,12,0],
      [0.0,367.6,0.43,12,0],[0.0,355.6,0.44,12,0],[0.0,343.5,0.45,12,0],[0.0,331.5,0.46,12,0],[0.0,319.5,0.48,12,0],[0.0,307.5,0.49,12,0],[0.0,295.5,0.51,12,0],[0.0,283.5,0.53,12,0],
      [0.0,271.5,0.54,12,0],[0.0,259.5,0.56,12,0],[0.0,247.5,0.58,12,0],[0.0,235.4,0.59,12,0],[0.0,223.4,0.61,12,0],[0.0,211.4,0.63,12,0],[0.0,199.4,0.65,12,0],[0.0,187.4,0.66,12,0],
      [0.0,175.4,0.68,12,0],[0.0,163.4,0.7,12,0],[0.0,151.4,0.71,12,0],[0.0,139.4,0.73,12,0],[0.0,127.4,0.74,12,0],[1.0,115.4,0.76,12,0],[7.5,105.5,0.77,12,0],[18.2,100.3,0.79,12,0],
      [30.1,100.0,0.8,12,0],[42.2,100.0,0.81,12,0],[54.2,100.0,0.82,12,0],[66.2,100.0,0.83,12,0],[78.2,100.0,0.84,12,0],[90.2,100.0,0.85,12,0],[102.2,100.0,0.85,12,0],[114.2,100.0,0.86,12,0],
      [126.2,100.0,0.86,12,0],[138.2,100.0,0.86,12,0],[150.3,100.0,0.86,12,0],[162.3,100.0,0.86,12,0],[174.3,100.0,0.86,12,0],[186.3,100.0,0.85,12,0],[198.3,100.0,0.85,12,0],[210.3,100.0,0.84,12,0],
      [222.3,100.0,0.83,12,0],[234.3,100.0,0.82,12,0],[246.2,99.0,0.81,12,0],[255.9,92.1,0.8,12,0],[259.9,81.0,0.78,12,0],[260.0,69.0,0.77,12,0],[260.0,57.0,0.75,12,0],[260.0,45.0,0.73,12,0],
      [260.0,33.0,0.71,12,0],[260.0,21.0,0.69,12,0],[263.0,9.5,0.66,12,0],[271.9,1.7,0.64,12,0],[283.6,0.0,0.61,12,0],[295.7,0.0,0.59,12,0],[307.7,0.0,0.56,12,0],[319.7,0.0,0.53,12,0],
      [331.7,0.0,0.5,12,0],[343.7,0.0,0.47,12,0],[355.7,0.0,0.44,12,0],[367.7,0.0,0.41,12,0],[379.7,0.0,0.37,12,0],[391.7,0.0,0.34,12,0],[403.8,0.0,0.31,12,0],[415.8,0.0,0.27,12,0],
      [427.8,0.0,0.24,12,0],[439.8,0.0,0.2,12,0],[451.8,0.0,0.17,12,0],[463.8,0.0,0.14,12,0],[475.8,0.0,0.1,12,0],[487.8,0.0,0.07,12,0],[499.8,0.0,0.03,12,0],[511.8,0.0,0.0,12,0],
      [523.9,0.0,-0.03,12,0],[535.9,0.0,-0.06,12,0],[547.9,0.0,-0.09,12,0],[559.9,0.0,-0.13,12,0],[571.9,0.0,-0.16,12,0],[583.9,0.0,-0.18,12,0],[595.9,0.0,-0.21,12,0],[607.9,0.0,-0.24,12,0],
      [619.9,0.0,-0.27,12,0],[632.0,0.0,-0.29,12,0],[643.8,1.6,-0.31,12,0],[654.9,6.2,-0.34,12,0],[664.3,13.5,-0.36,12,0],[673.1,21.7,-0.38,12,0],[681.8,30.0,-0.4,12,0],[690.6,38.2,-0.41,12,0],
      [699.3,46.4,-0.43,12,0],[708.1,54.7,-0.44,12,0],[716.8,62.9,-0.46,12,0],[725.6,71.1,-0.47,12,0],[734.3,79.4,-0.48,12,0],[743.1,87.6,-0.49,12,0],[751.8,95.8,-0.5,12,0],[760.6,104.1,-0.5,12,0],
      [769.3,112.3,-0.51,12,0],[778.0,120.5,-0.51,12,0],[786.8,128.7,-0.52,12,0],[795.5,137.0,-0.52,12,0],[804.3,145.2,-0.52,12,0],[812.9,153.6,-0.52,12,0],[818.6,164.0,-0.52,12,0],[820.0,175.9,-0.51,12,0],
      [820.0,187.9,-0.51,12,0],[820.0,199.9,-0.51,12,0],[820.0,211.9,-0.5,12,0],[820.0,224.0,-0.5,12,0],[820.0,236.0,-0.49,12,0],[820.0,248.0,-0.48,12,0],[820.0,260.0,-0.47,12,0],[820.0,272.0,-0.47,12,0],
      [820.0,284.0,-0.46,12,0],[820.0,296.0,-0.45,12,0],[820.0,308.0,-0.44,12,0],[820.0,320.0,-0.43,12,0],[820.0,332.1,-0.43,12,0],[820.0,344.1,-0.42,12,0],[820.0,356.1,-0.41,12,0],[820.0,368.1,-0.4,12,0],
      [820.0,380.1,-0.39,12,0],[820.0,392.1,-0.39,12,0],[819.5,404.1,-0.38,12,0],[812.2,413.1,-0.37,12,0],[800.5,413.5,-0.37,12,0],[789.1,409.7,-0.36,12,0],[777.7,405.9,-0.36,12,0],[766.4,402.1,-0.35,12,0],
      [755.0,398.3,-0.35,12,0],[743.6,394.5,-0.35,12,0],[732.2,390.7,-0.35,12,0],[720.8,386.9,-0.35,12,0],[709.4,383.1,-0.35,12,0],[698.0,379.3,-0.35,12,0],[686.6,375.5,-0.35,12,0],[675.2,371.7,-0.36,12,0],
      [663.8,367.9,-0.36,12,0],[652.2,365.1,-0.37,12,0],[640.4,367.0,-0.37,12,0],[630.5,373.6,-0.38,12,0],[623.2,383.1,-0.39,12,0],[616.1,392.8,-0.4,12,0],[609.1,402.5,-0.41,12,0],[602.0,412.2,-0.42,12,0],
      [594.9,422.0,-0.43,12,0],[587.9,431.7,-0.44,12,0],[580.8,441.4,-0.46,12,0],[574.3,451.5,-0.47,12,0],[572.1,463.2,-0.49,12,0],[574.9,474.8,-0.5,12,0],[582.3,484.1,-0.52,12,0],[592.3,490.8,-0.53,12,0],
      [602.4,497.3,-0.55,12,0],[612.5,503.8,-0.57,12,0],[622.6,510.3,-0.58,12,0],[632.7,516.7,-0.6,12,0],[642.8,523.2,-0.62,12,0],[652.9,529.7,-0.64,12,0],[663.0,536.2,-0.65,12,0],[673.1,542.7,-0.67,12,0],
      [683.2,549.2,-0.69,12,0],[693.3,555.7,-0.7,12,0],[704.2,560.7,-0.72,12,0],[716.0,563.2,-0.74,12,0],[727.7,565.5,-0.75,12,0],[739.5,567.9,-0.77,12,0],[751.3,570.3,-0.78,12,0],[763.1,572.6,-0.79,12,0],
      [774.8,575.0,-0.8,12,0],[786.6,577.3,-0.82,12,0],[798.4,579.7,-0.83,12,0],[810.2,582.0,-0.83,12,0],[822.0,584.4,-0.84,12,0],[833.7,586.7,-0.85,12,0],[845.5,589.1,-0.85,12,0],[857.3,591.5,-0.86,12,0],
      [869.1,593.8,-0.86,12,0],[880.8,596.2,-0.86,12,0],[891.7,600.9,-0.86,12,0],[898.7,610.5,-0.86,12,0],[900.0,622.4,-0.86,12,0],[900.0,634.4,-0.85,12,0],[900.0,646.4,-0.85,12,0],[900.0,658.4,-0.84,12,0],
      [900.0,670.4,-0.83,12,0],[898.6,682.3,-0.82,12,0],[892.4,692.4,-0.8,12,0],[882.2,698.7,-0.79,12,0],[870.4,700.0,-0.77,12,0],[858.4,700.0,-0.76,14,0],[846.4,700.0,-0.74,14,0],[834.3,700.0,-0.72,14,0],
      [822.3,700.0,-0.7,14,0],[810.3,700.0,-0.67,14,0],[798.3,700.0,-0.65,14,0],[786.3,700.0,-0.63,14,0],[774.3,700.0,-0.6,14,0],[762.3,700.0,-0.57,14,0],[750.3,700.0,-0.54,14,0],[738.3,700.0,-0.51,14,0],
      [726.2,700.0,-0.48,14,0],[714.2,700.0,-0.45,14,0],[702.2,700.0,-0.42,14,0],[690.2,700.0,-0.39,14,0],[678.2,700.0,-0.36,14,0],[666.2,700.0,-0.32,14,0],[654.2,700.0,-0.29,14,0],[642.2,700.0,-0.26,14,0],
      [630.2,700.0,-0.22,14,0],[618.2,700.0,-0.19,14,0],[606.1,700.0,-0.15,14,0],[594.1,700.0,-0.12,14,0],[582.1,700.0,-0.08,14,0],[570.1,700.0,-0.05,14,0],[558.1,700.0,-0.02,14,0],[546.1,700.0,0.02,14,0],
      [534.1,700.0,0.05,14,0],[522.1,700.0,0.08,14,0],[510.1,700.0,0.11,14,0],[498.0,700.0,0.14,14,0],[486.0,700.0,0.17,14,0],[474.0,700.0,0.2,14,0],[462.0,700.0,0.23,14,0]
    ],
    sectors: [0, 0.33, 0.67],
    aeroZones: [[0.875, 0.1], [0.405, 0.49]],
    overtakeDetection: [0.845, 0.385],
    defaults: { runoff: 'runoff', runoffWidth: 3, barrier: 'wall' },
    autoKerbs: { minRadius: 200 },
    sections: [
      { from: 0, to: 1, side: 'B', runoff: 'runoff', runoffWidth: 3, barrier: 'wall', astro: 0 },              // Stadtkurs: überall Mauern
      { from: 0.93, to: 0.07, side: 'L', runoff: 'runoff', runoffWidth: 2.5, barrier: 'wall', kerb: 0 },        // Boxenmauer
      { from: 0.1, to: 0.15, side: 'L', runoff: 'runoff', runoffWidth: 20, barrier: 'tyres' },                  // Notausgang Hafentor
      { from: 0.628, to: 0.672, side: 'L', runoff: 'runoff', runoffWidth: 16, barrier: 'tyres' },               // Leuchtturm
      { from: 0.365, to: 0.4, side: 'B', kerb: 1, sausage: true },                                              // Schikane
    ],
    scenery: {
      seed: 2207,
      trees: 500,
      city: true,
      pit: { from: 0.945, to: 0.055, side: 'L' },
      grandstands: [
        { at: 0.975, len: 240, side: 'R', rows: 14 }, { at: 0.648, len: 100, side: 'R', rows: 10 },
        { at: 0.38, len: 90, side: 'R', rows: 8 }, { at: 0.122, len: 80, side: 'R', rows: 9 },
      ],
      lake: { at: 0.2, side: 'L', dist: 60, rx: 120, rz: 240 },
      buildings: [
        { at: 0.45, side: 'R', dist: 40, kind: 'kurhaus' }, { at: 0.56, side: 'L', dist: 30, kind: 'pavillon' },
        { at: 0.3, side: 'R', dist: 35, kind: 'pavillon' }, { at: 0.75, side: 'R', dist: 45, kind: 'kurhaus' },
        { at: 0.82, side: 'L', dist: 30, kind: 'pavillon' },
      ],
    },
  },

  // Schneller Landkurs im Gebirgstal: große Radien, Höhenunterschiede, eine Kehre (Generator)
  alpental: {
    id: 'alpental',
    name: 'Alpental-Ring',
    location: 'Alpental',
    character: 'Sehr schneller Kurs im Bergtal: 1,2 km Zielgerade, lange Vollgasbögen, bergauf zur engen Kehre und bergab durch den Wald zurück. Rund 37 m Höhenunterschied.',
    timeOfDay: 'morning',
    raceLaps: 58,
    aiLapFactor: 1.0468,   // gemessene KI-Rundenzeit / Profil-Rundenzeit (weich, Qualifying-Schätzung)
    corners: [
      { name: 'Talkurve', at: 0.108 }, { name: 'Bergbogen', at: 0.228 }, { name: 'Kanzel', at: 0.307 }, { name: 'Kehre', at: 0.484 },
      { name: 'Waldeck', at: 0.551 }, { name: 'Lärchen', at: 0.644 }, { name: 'Almbogen', at: 0.74 }, { name: 'Sennhütte', at: 0.797 },
      { name: 'Zielbogen', at: 0.863 },
    ],
    points: [
      [62.6,1250.0,-10.65,16,0],[74.6,1250.0,-10.39,16,0],[86.7,1250.0,-10.13,16,0],[98.7,1250.0,-9.87,16,0],[110.7,1250.0,-9.62,16,0],[122.7,1250.0,-9.37,16,0],[134.7,1250.0,-9.12,16,0],[146.8,1250.0,-8.88,16,0],
      [158.8,1250.0,-8.64,16,0],[170.8,1250.0,-8.41,16,0],[182.8,1250.0,-8.17,16,0],[194.8,1250.0,-7.95,16,0],[206.8,1250.0,-7.73,16,0],[218.9,1250.0,-7.51,16,0],[230.9,1250.0,-7.31,16,0],[242.9,1250.0,-7.1,16,0],
      [254.9,1250.0,-6.91,16,0],[266.9,1250.0,-6.72,16,0],[279.0,1250.0,-6.53,16,0],[291.0,1250.0,-6.35,16,0],[303.0,1250.0,-6.18,16,0],[315.0,1250.0,-6.02,16,0],[327.0,1250.0,-5.86,16,0],[339.1,1250.0,-5.71,16,0],
      [351.1,1250.0,-5.57,16,0],[363.1,1250.0,-5.43,16,0],[375.1,1250.0,-5.3,16,0],[387.1,1250.0,-5.18,16,0],[399.2,1250.0,-5.06,16,0],[411.2,1250.0,-4.96,16,0],[423.2,1250.0,-4.86,16,0],[435.2,1250.0,-4.76,16,0],
      [447.2,1250.0,-4.68,16,0],[459.2,1250.0,-4.6,16,0],[471.3,1250.0,-4.52,16,0],[483.3,1250.0,-4.46,16,0],[495.3,1250.0,-4.4,16,0],[507.3,1250.0,-4.35,16,0],[519.3,1250.0,-4.3,16,0],[531.4,1250.0,-4.26,16,0],
      [543.4,1250.0,-4.22,16,0],[555.4,1250.0,-4.19,16,0],[567.4,1250.0,-4.17,16,0],[579.4,1250.0,-4.15,16,0],[591.5,1250.0,-4.14,16,0],[603.5,1250.0,-4.13,16,0],[615.5,1250.0,-4.13,16,0],[627.5,1250.0,-4.13,16,0],
      [639.5,1249.7,-4.13,16,0],[651.5,1248.5,-4.14,16,0],[663.3,1246.5,-4.15,16,0],[675.0,1243.8,-4.16,16,0],[686.5,1240.2,-4.18,16,0],[697.7,1235.8,-4.2,14,0],[708.6,1230.7,-4.22,14,0],[719.1,1224.9,-4.24,14,0],
      [729.1,1218.3,-4.26,14,0],[738.7,1211.1,-4.29,14,0],[747.8,1203.2,-4.31,14,0],[756.3,1194.7,-4.34,14,0],[764.3,1185.7,-4.37,14,0],[771.5,1176.1,-4.39,14,0],[778.1,1166.1,-4.42,14,0],[784.0,1155.6,-4.44,14,0],
      [789.2,1144.8,-4.46,14,0],[793.6,1133.6,-4.48,14,0],[797.9,1122.4,-4.5,14,0],[802.1,1111.1,-4.51,14,0],[806.3,1099.9,-4.52,14,0],[810.5,1088.6,-4.53,14,0],[814.7,1077.3,-4.54,14,0],[819.0,1066.1,-4.54,14,0],
      [823.2,1054.8,-4.53,14,0],[827.4,1043.6,-4.53,14,0],[831.6,1032.3,-4.51,14,0],[835.8,1021.1,-4.5,14,0],[840.1,1009.8,-4.47,14,0],[844.3,998.6,-4.44,14,0],[848.5,987.3,-4.41,14,0],[852.7,976.1,-4.36,14,0],
      [856.9,964.8,-4.31,14,0],[861.2,953.6,-4.26,14,0],[865.4,942.3,-4.2,14,0],[869.6,931.0,-4.13,14,0],[873.8,919.8,-4.05,14,0],[878.0,908.5,-3.96,14,0],[882.3,897.3,-3.87,14,0],[886.5,886.0,-3.77,14,0],
      [890.7,874.8,-3.66,14,0],[894.9,863.5,-3.54,14,0],[899.1,852.3,-3.42,14,0],[903.4,841.0,-3.28,14,0],[907.6,829.8,-3.14,14,0],[911.8,818.5,-2.99,14,0],[915.7,807.1,-2.82,14,0],[919.1,795.6,-2.66,14,0],
      [922.1,784.0,-2.48,14,0],[924.6,772.2,-2.29,14,0],[926.7,760.4,-2.09,14,0],[928.3,748.5,-1.89,14,0],[929.4,736.5,-1.68,14,0],[930.1,724.5,-1.45,14,0],[930.4,712.5,-1.22,14,0],[930.1,700.5,-0.99,14,0],
      [929.4,688.5,-0.74,14,0],[928.3,676.5,-0.48,14,0],[926.8,664.6,-0.22,14,0],[925.3,652.7,0.05,14,0],[923.8,640.7,0.33,14,0],[922.3,628.8,0.61,14,0],[920.9,616.9,0.91,14,0],[919.4,604.9,1.21,14,0],
      [917.9,593.0,1.51,14,0],[916.4,581.1,1.82,14,0],[914.9,569.2,2.14,14,0],[913.4,557.2,2.47,14,0],[911.9,545.3,2.8,14,0],[910.4,533.4,3.13,14,0],[908.9,521.5,3.47,14,0],[907.4,509.5,3.82,14,0],
      [906.0,497.6,4.17,14,0],[904.5,485.7,4.52,14,0],[903.0,473.8,4.88,14,0],[901.5,461.8,5.24,14,0],[900.0,449.9,5.6,14,0],[898.5,438.0,5.97,14,0],[897.0,426.1,6.33,14,0],[895.5,414.1,6.7,14,0],
      [894.0,402.2,7.07,14,0],[892.5,390.3,7.44,14,0],[891.0,378.3,7.81,14,0],[889.6,366.4,8.18,14,0],[888.1,354.5,8.55,14,0],[886.6,342.6,8.92,14,0],[885.1,330.6,9.29,14,0],[883.0,318.8,9.65,14,0],
      [879.6,307.3,10.01,14,0],[875.1,296.2,10.37,14,0],[869.3,285.6,10.73,14,0],[862.5,275.7,11.08,14,0],[854.7,266.6,11.43,14,0],[845.9,258.4,11.78,14,0],[836.3,251.1,12.12,14,0],[826.0,245.0,12.45,14,0],
      [815.1,239.9,12.78,14,0],[803.7,236.1,13.1,14,0],[792.0,233.4,13.42,14,0],[780.2,231.0,13.73,14,0],[768.5,228.7,14.03,14,0],[756.7,226.3,14.33,14,0],[744.9,224.0,14.61,14,0],[733.1,221.6,14.89,14,0],
      [721.3,219.3,15.16,14,0],[709.5,216.9,15.42,14,0],[697.7,214.5,15.67,14,0],[686.0,212.2,15.92,14,0],[674.2,209.8,16.15,14,0],[662.4,207.5,16.37,14,0],[650.6,205.1,16.58,14,0],[638.8,202.8,16.79,14,0],
      [627.0,200.4,16.98,14,0],[615.2,198.0,17.16,14,0],[603.5,195.7,17.33,14,0],[591.7,193.3,17.48,14,0],[579.9,191.0,17.63,14,0],[568.1,188.6,17.76,14,0],[556.3,186.3,17.89,14,0],[544.5,183.9,18.0,14,0],
      [532.7,181.5,18.1,14,0],[521.0,179.2,18.18,14,0],[509.2,176.8,18.26,14,0],[497.4,174.5,18.32,14,0],[485.6,172.1,18.37,14,0],[473.8,169.8,18.41,14,0],[462.0,167.4,18.44,14,0],[450.2,165.0,18.45,14,0],
      [438.5,162.7,18.46,14,0],[426.7,160.3,18.45,14,0],[414.9,158.0,18.43,14,0],[403.1,155.6,18.4,14,0],[391.3,153.3,18.35,14,0],[379.5,150.9,18.3,14,0],[367.7,148.8,18.23,14,0],[355.9,146.7,18.15,14,0],
      [344.0,144.7,18.07,14,0],[332.2,142.7,17.97,14,0],[320.3,140.6,17.86,14,0],[308.5,138.6,17.74,14,0],[296.6,136.6,17.61,14,0],[284.8,134.5,17.47,14,0],[272.9,132.5,17.32,14,0],[261.1,130.5,17.16,14,0],
      [249.3,128.4,17.0,14,0],[237.4,126.4,16.82,14,0],[225.6,124.4,16.64,14,0],[213.7,122.4,16.45,14,0],[201.9,120.3,16.25,14,0],[190.0,118.3,16.05,14,0],[178.2,116.3,15.83,14,0],[166.3,114.2,15.62,14,0],
      [154.5,112.2,15.39,14,0],[142.6,110.2,15.16,14,0],[130.8,108.1,14.93,14,0],[118.9,106.1,14.69,14,0],[107.1,104.1,14.44,14,0],[95.2,102.0,14.19,14,0],[83.4,100.0,13.94,14,0],[71.6,98.0,13.69,14,0],
      [59.7,96.0,13.43,14,0],[47.9,93.9,13.17,14,0],[36.0,91.9,12.9,14,0],[24.2,89.9,12.64,14,0],[12.2,88.6,12.38,14,0],[0.5,91.0,12.11,14,0],[-9.9,96.9,11.84,14,0],[-17.9,105.8,11.58,14,0],
      [-22.7,116.8,11.31,14,0],[-23.7,128.7,11.05,14,0],[-21.0,140.4,10.78,14,0],[-15.1,150.8,10.52,14,0],[-8.7,161.0,10.26,14,0],[-2.4,171.2,10.0,14,0],[4.0,181.4,9.75,14,0],[10.4,191.6,9.49,14,0],
      [16.7,201.8,9.25,14,0],[23.1,212.0,9.0,14,0],[29.5,222.2,8.76,14,0],[35.8,232.4,8.52,14,0],[42.2,242.5,8.29,14,0],[48.6,252.7,8.06,14,0],[55.0,262.9,7.84,14,0],[61.3,273.1,7.62,14,0],
      [67.7,283.3,7.41,14,0],[74.1,293.5,7.2,14,0],[80.4,303.7,7.0,14,0],[86.8,313.9,6.81,14,0],[93.2,324.1,6.62,14,0],[99.5,334.3,6.44,14,0],[105.9,344.5,6.27,14,0],[112.3,354.7,6.1,14,0],
      [118.7,364.9,5.94,14,0],[125.0,375.1,5.78,14,0],[130.5,385.7,5.64,14,0],[135.2,396.8,5.5,14,0],[138.8,408.3,5.36,14,0],[141.4,420.0,5.24,14,0],[143.0,431.9,5.12,14,0],[143.5,443.9,5.01,14,0],
      [143.0,455.9,4.91,14,0],[141.5,467.8,4.81,14,0],[138.9,479.6,4.72,14,0],[135.3,491.0,4.64,14,0],[130.7,502.1,4.56,14,0],[125.1,512.8,4.49,14,0],[118.7,522.9,4.43,14,0],[111.4,532.5,4.37,14,0],
      [103.3,541.3,4.32,14,0],[94.4,549.4,4.28,14,0],[85.0,557.0,4.24,14,0],[75.7,564.5,4.21,14,0],[66.3,572.0,4.18,14,0],[56.9,579.5,4.16,14,0],[47.5,587.0,4.14,14,0],[38.1,594.5,4.13,14,0],
      [28.7,602.0,4.13,14,0],[19.3,609.5,4.13,14,0],[10.0,617.0,4.13,14,0],[0.6,624.5,4.13,14,0],[-8.8,632.1,4.14,14,0],[-18.2,639.6,4.15,14,0],[-27.6,647.1,4.17,14,0],[-37.0,654.6,4.19,14,0],
      [-46.4,662.1,4.21,14,0],[-55.7,669.6,4.23,14,0],[-65.1,677.1,4.25,14,0],[-74.5,684.6,4.28,14,0],[-83.9,692.1,4.3,14,0],[-93.3,699.6,4.33,14,0],[-102.7,707.1,4.35,14,0],[-112.1,714.6,4.38,14,0],
      [-121.4,722.2,4.4,14,0],[-130.8,729.7,4.43,14,0],[-140.4,736.9,4.45,14,0],[-150.4,743.6,4.47,14,0],[-160.8,749.6,4.49,14,0],[-171.6,754.9,4.5,14,0],[-182.7,759.5,4.52,14,0],[-194.1,763.4,4.53,14,0],
      [-205.6,766.6,4.54,14,0],[-217.4,769.0,4.54,14,0],[-229.3,770.6,4.54,14,0],[-241.3,771.5,4.53,14,0],[-253.3,771.6,4.52,14,0],[-265.3,771.1,4.5,14,0],[-277.3,770.5,4.48,14,0],[-289.3,769.9,4.46,14,0],
      [-301.3,769.3,4.42,14,0],[-313.3,768.7,4.39,14,0],[-325.3,768.1,4.34,14,0],[-337.4,767.5,4.29,14,0],[-349.4,766.9,4.23,14,0],[-361.4,766.3,4.16,14,0],[-373.4,765.7,4.09,14,0],[-385.4,765.1,4.01,14,0],
      [-397.4,764.5,3.92,14,0],[-409.4,763.9,3.82,14,0],[-421.4,763.3,3.72,14,0],[-433.4,762.7,3.6,14,0],[-445.4,762.1,3.48,14,0],[-457.4,761.5,3.35,14,0],[-469.4,760.9,3.21,14,0],[-481.4,760.3,3.06,14,0],
      [-493.4,759.7,2.91,14,0],[-505.4,759.1,2.74,14,0],[-517.4,758.5,2.57,14,0],[-529.4,757.9,2.38,14,0],[-541.4,757.3,2.19,14,0],[-553.4,756.7,1.99,14,0],[-565.4,756.1,1.78,14,0],[-577.4,755.5,1.57,14,0],
      [-589.4,754.9,1.34,14,0],[-601.4,754.3,1.11,14,0],[-613.4,753.7,0.86,14,0],[-625.4,753.1,0.61,14,0],[-637.5,753.0,0.35,14,0],[-649.4,754.3,0.09,14,0],[-661.1,757.0,-0.19,14,0],[-672.4,761.1,-0.47,14,0],
      [-683.1,766.6,-0.76,14,0],[-693.1,773.2,-1.05,14,0],[-702.2,781.1,-1.36,14,0],[-710.3,789.9,-1.67,14,0],[-717.3,799.7,-1.98,14,0],[-723.5,810.0,-2.3,14,0],[-729.7,820.3,-2.63,14,0],[-735.9,830.6,-2.97,14,0],
      [-742.0,840.9,-3.3,14,0],[-748.2,851.2,-3.65,14,0],[-754.4,861.5,-3.99,14,0],[-760.6,871.8,-4.34,14,0],[-766.8,882.1,-4.7,14,0],[-773.0,892.4,-5.06,14,0],[-779.1,902.7,-5.42,14,0],[-785.3,913.1,-5.78,14,0],
      [-791.5,923.4,-6.15,14,0],[-797.7,933.7,-6.52,14,0],[-803.9,944.0,-6.89,14,0],[-810.1,954.3,-7.25,14,0],[-816.3,964.6,-7.62,14,0],[-822.0,975.1,-8.0,14,0],[-826.8,986.1,-8.36,14,0],[-830.5,997.6,-8.73,14,0],
      [-833.1,1009.3,-9.1,14,0],[-834.5,1021.2,-9.47,14,0],[-834.8,1033.3,-9.83,14,0],[-833.9,1045.2,-10.19,14,0],[-831.9,1057.1,-10.55,14,0],[-828.7,1068.7,-10.91,14,0],[-824.5,1079.9,-11.26,14,0],[-819.2,1090.7,-11.61,14,0],
      [-812.8,1100.9,-11.95,14,0],[-805.6,1110.5,-12.28,14,0],[-797.4,1119.3,-12.62,14,0],[-788.5,1127.3,-12.94,14,0],[-778.9,1134.6,-13.26,14,0],[-769.3,1141.8,-13.58,14,0],[-759.7,1149.0,-13.88,14,0],[-750.1,1156.2,-14.18,14,0],
      [-740.4,1163.4,-14.47,14,0],[-730.8,1170.6,-14.75,14,0],[-721.2,1177.8,-15.03,14,0],[-711.6,1185.1,-15.29,14,0],[-702.0,1192.3,-15.55,14,0],[-692.4,1199.5,-15.8,14,0],[-682.7,1206.7,-16.03,14,0],[-673.1,1213.9,-16.26,14,0],
      [-663.5,1221.1,-16.48,14,0],[-653.9,1228.3,-16.69,14,0],[-643.8,1234.9,-16.88,14,0],[-633.1,1240.3,-17.07,14,0],[-621.9,1244.6,-17.24,14,0],[-610.3,1247.7,-17.41,14,0],[-598.4,1249.5,-17.56,14,0],[-586.4,1250.0,-17.7,14,0],
      [-574.4,1250.0,-17.83,14,0],[-562.4,1250.0,-17.94,14,0],[-550.3,1250.0,-18.05,16,0],[-538.3,1250.0,-18.14,16,0],[-526.3,1250.0,-18.22,16,0],[-514.3,1250.0,-18.29,16,0],[-502.3,1250.0,-18.35,16,0],[-490.3,1250.0,-18.39,16,0],
      [-478.2,1250.0,-18.43,16,0],[-466.2,1250.0,-18.45,16,0],[-454.2,1250.0,-18.46,16,0],[-442.2,1250.0,-18.45,16,0],[-430.2,1250.0,-18.44,16,0],[-418.1,1250.0,-18.41,16,0],[-406.1,1250.0,-18.38,16,0],[-394.1,1250.0,-18.33,16,0],
      [-382.1,1250.0,-18.27,16,0],[-370.1,1250.0,-18.19,16,0],[-358.0,1250.0,-18.11,16,0],[-346.0,1250.0,-18.02,16,0],[-334.0,1250.0,-17.91,16,0],[-322.0,1250.0,-17.8,16,0],[-310.0,1250.0,-17.67,16,0],[-297.9,1250.0,-17.54,16,0],
      [-285.9,1250.0,-17.4,16,0],[-273.9,1250.0,-17.24,16,0],[-261.9,1250.0,-17.08,16,0],[-249.9,1250.0,-16.91,16,0],[-237.9,1250.0,-16.73,16,0],[-225.8,1250.0,-16.55,16,0],[-213.8,1250.0,-16.35,16,0],[-201.8,1250.0,-16.15,16,0],
      [-189.8,1250.0,-15.94,16,0],[-177.8,1250.0,-15.73,16,0],[-165.7,1250.0,-15.5,16,0],[-153.7,1250.0,-15.28,16,0],[-141.7,1250.0,-15.04,16,0],[-129.7,1250.0,-14.81,16,0],[-117.7,1250.0,-14.56,16,0],[-105.6,1250.0,-14.32,16,0],
      [-93.6,1250.0,-14.07,16,0],[-81.6,1250.0,-13.81,16,0],[-69.6,1250.0,-13.56,16,0],[-57.6,1250.0,-13.3,16,0],[-45.6,1250.0,-13.04,16,0],[-33.5,1250.0,-12.77,16,0],[-21.5,1250.0,-12.51,16,0],[-9.5,1250.0,-12.24,16,0],
      [2.5,1250.0,-11.98,16,0],[14.5,1250.0,-11.71,16,0],[26.6,1250.0,-11.44,16,0],[38.6,1250.0,-11.18,16,0],[50.6,1250.0,-10.91,16,0]
    ],
    sectors: [0, 0.32, 0.65],
    aeroZones: [[0.885, 0.09], [0.33, 0.45]],
    overtakeDetection: [0.85, 0.31],
    defaults: { runoff: 'grass', runoffWidth: 14, barrier: 'guardrail' },
    autoKerbs: { minRadius: 320 },
    sections: [
      { from: 0.93, to: 0.07, side: 'R', runoff: 'runoff', runoffWidth: 2.5, barrier: 'wall', kerb: 0, astro: 0 },   // Boxenmauer
      { from: 0.93, to: 0.07, side: 'L', runoff: 'grass', runoffWidth: 8, barrier: 'wall', kerb: 0 },               // Tribünen
      { from: 0.085, to: 0.135, side: 'R', runoff: 'runoff', runoffWidth: 30, astro: 3, barrier: 'tyres' },          // Talkurve
      { from: 0.46, to: 0.505, side: 'R', runoff: 'gravel', runoffWidth: 32, barrier: 'tyres' },                     // Kehre
      { from: 0.72, to: 0.82, side: 'R', runoff: 'gravel', runoffWidth: 26, barrier: 'tyres' },                      // Alm/Sennhütte
    ],
    scenery: {
      seed: 9133,
      trees: 3400,
      pit: { from: 0.94, to: 0.06, side: 'R' },
      grandstands: [
        { at: 0.975, len: 280, side: 'L', rows: 14 }, { at: 0.108, len: 120, side: 'L', rows: 10 },
        { at: 0.484, len: 100, side: 'L', rows: 10 }, { at: 0.863, len: 90, side: 'L', rows: 8 },
      ],
      lake: { at: 0.6, side: 'L', dist: 130, rx: 150, rz: 100 },
      buildings: [
        { at: 0.3, side: 'R', dist: 90, kind: 'pavillon' }, { at: 0.75, side: 'L', dist: 150, kind: 'kurhaus' },
      ],
    },
  },
};
const TRACK_ORDER = ['ringpark', 'falkenried', 'hafen', 'alpental'];
