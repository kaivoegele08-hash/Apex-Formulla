if (process.env.OLDLINE) { AI_TUNE.globalLine = false; for (const k in GRIP_MAPS) delete GRIP_MAPS[k]; }
// Rennen mit vollem KI-Feld: Start, Kollisionen, Schaden, Positionen, Zielflagge, Rechenzeit
const h = PHYS_DT;
for (const k of (process.env.OFF || '').split(',').filter(Boolean)) AI_TUNE[k] = false;
const T = new TrackModel(TRACKS[process.env.TRACK || 'ringpark']), line = new RacingLine(T);
let seed = +(process.env.SEED || 12345); const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const LAPS = +(process.env.LAPS || 3), SIZE = +(process.env.SIZE || 20);
const field = buildField({ playerTeam: 'aurora', size: SIZE, rng }).filter(e => !e.player);
for (const e of field) e.compound = LAPS < 10 ? 'soft' : ['medium', 'medium', 'soft', 'hard'][Math.floor(rng() * 4)];
const race = new RaceSession({ track: T, line, laps: LAPS, entries: field, damage: process.env.DMG || 'full', rng });
let pitMsgs = 0, laneWalls = 0; Events.on('race:service', () => pitMsgs++);
let contacts = 0, hard = 0, walls = 0, msgs = [], overtakes = 0, lastOrder = null;
Events.on('race:msg', (t) => msgs.push(`${fmtTime(race.time)} ${t}`));
for (const e of race.entries) { const f = e.vehicle.onImpact; e.vehicle.onImpact = (sp, nx, nz) => { if (race.state === 'race' && sp > 2) walls++; f(sp, nx, nz); }; }
const t0 = performance.now(); let steps = 0, startPos = null, lap1 = null;
const origResolve = CarContacts.resolve.bind(CarContacts);
CarContacts.resolve = (en, L, cb) => origResolve(en, L, (a, b, sp, x, z) => { if (race.state === 'race') { contacts++; if (sp > 4) hard++; } cb(a, b, sp, x, z); });
while (!race.over && race.time < 60 + LAPS * 110) {
  race.step(h); steps++;
  if (race.state === 'race' && !startPos && race.time - race.greenAt > 0.01) startPos = race.entries.map(e => e.gridPos);
  if (!lap1 && race.order && race.order[0].timing.laps.length >= 1) lap1 = race.order.slice(0, 5).map(e => `P${e.pos} ${e.name} (Start ${e.gridPos})`).join(', ');
  if (race.entries.some(e => !isFinite(e.vehicle.pos.x))) { console.log('NaN!'); break; }
  if (race.order && race.order[0].timing.laps.length >= 1 && steps % 360 === 0) { const o = race.order.filter(e => !e.retired).map(e => e.idx); if (lastOrder) for (let i = 0; i < o.length; i++) if (lastOrder.indexOf(o[i]) > i) overtakes += lastOrder.indexOf(o[i]) - i; lastOrder = o; }
}
const ms = performance.now() - t0;
console.log(`Rechenzeit: ${(ms / race.time / 10).toFixed(1)} % Echtzeit für ${race.entries.length} Autos (${(ms / steps * 1000).toFixed(0)} µs je Schritt)`);
console.log(`Nach Runde 1: ${lap1}`);
console.log(`Positionsgewinne nach Runde 1: ${overtakes} · Kontakte ${contacts} (davon hart > 4 m/s: ${hard}), Mauertreffer ${walls}, Rennende ${race.over ? 'ja' : 'NEIN'} nach ${fmtTime(race.time - race.greenAt)}`);
const cls = race.classification();
for (const r of cls) console.log(`${String(r.pos).padStart(2)}. ${r.name.padEnd(20)} ${TEAMS.find(t => t.id === r.team).short} Start ${String(r.e.gridPos).padStart(2)} Rd ${r.laps} ${r.finished ? fmtTime(r.total) : (r.retired ? 'AUS ' + r.e.retireReason : 'unterwegs')} beste ${fmtTime(r.best)} ${r.penalty ? '+' + r.penalty + 's' : ''} Schaden: ${Damage.summary(r.e.vehicle)} TL ${r.e.warnings} Stopps ${r.e.pitStops} Mischungen ${[...r.e.used].join('/')}`);
console.log(`Boxenstopps gesamt: ${pitMsgs}`);
console.log('Meldungen:\n  ' + msgs.filter(m => !/Schnellste/.test(m)).slice(0, 30).join('\n  '));
