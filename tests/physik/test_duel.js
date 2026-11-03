// Zweikampf: KI verteidigt gegen einen schnelleren „Spieler“ (vom Testfahrer gesteuert)
const h = PHYS_DT, T = new TrackModel(TRACKS[process.env.TRACK || 'falkenried']), line = new RacingLine(T);
const D = DRIVERS[2];
const race = new RaceSession({ track: T, line, laps: 4, entries: [
  { driver: D, team: D.team, number: D.num, profile: { skill: 0.975, aggression: 0.6, consistency: 0.95, reaction: 0.2 } },
  { driver: { name: 'Spieler', num: 77, team: 'aurora', rating: 1 }, team: 'aurora', number: 77, player: true },
], damage: 'full' });
const me = race.player;
me.ai = new AIDriver(me.vehicle, line, { skill: 1.0, aggression: 0.8, consistency: 1, reaction: 0.15 }, 3); me.ai.hold();
const def = race.entries[0];
let defMoves = 0, doors = 0, lastDef = 0, contacts = 0, lead = [], passes = 0, prevAhead = null;
const orig = CarContacts.resolve.bind(CarContacts);
CarContacts.resolve = (en, L, cb) => orig(en, L, (a, b, sp, x, z) => { if (sp > 2) contacts++; cb(a, b, sp, x, z); });
// Der „Spieler“ ist kein KI-Eintrag – RaceSession.step ruft seine KI, weil e.ai gesetzt ist; für die Verteidiger-Logik bleibt er „player“
while (!race.over && race.time < 600) {
  if (race.state === 'race' && me.ai.launchAt === Infinity) me.ai.launch(race.time);
  race.step(h);
  const ds = def.ai.defendSide; if (ds && !lastDef) defMoves++; lastDef = ds;
  if (def.ai.doorT > 1.99) doors++;
  const ahead = me.distance > def.distance ? 'Spieler' : 'KI';
  if (prevAhead && ahead !== prevAhead) passes++; prevAhead = ahead;
}
console.log(`Verteidigungsmanöver der KI: ${defMoves} (Innenseite) + ${doors} (Tür zu) · Führungswechsel: ${passes} · Kontakte > 2 m/s: ${contacts}`);
for (const r of race.classification()) console.log(`${r.pos}. ${r.name} ${r.finished ? fmtTime(r.total) : r.retired ? 'AUS' : '-'} beste ${fmtTime(r.best)} Schaden: ${Damage.summary(r.e.vehicle)}`);
