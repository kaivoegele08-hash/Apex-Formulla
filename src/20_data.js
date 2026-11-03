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
      pit: { from: 0.952, to: 0.088, side: 'L' },
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
};
const TRACK_ORDER = ['ringpark'];
