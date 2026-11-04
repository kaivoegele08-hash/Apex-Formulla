if (process.env.OLDLINE) { AI_TUNE.globalLine = false; for (const k in GRIP_MAPS) delete GRIP_MAPS[k]; }
// Wetter: Nässe-Verlauf, Rundenzeiten, Reifenwechsel der KI (wechselhaft bzw. Dauerregen)
const h = PHYS_DT, T = new TrackModel(TRACKS[process.env.TRACK || 'ringpark']), line = new RacingLine(T);
let seed = +(process.env.SEED || 3); const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const TYPE = process.env.WX || 'changeable', LAPS = +(process.env.LAPS || 12);
const wx = new Weather(TYPE, { duration: LAPS * 90, rng });
const field = buildField({ playerTeam: 'aurora', size: 12, rng }).filter(e => !e.player);
const start = Weather.bestFor(wx.water);
for (const e of field) e.compound = start || 'medium';
const race = new RaceSession({ track: T, line, laps: LAPS, entries: field, damage: 'full', rng, weather: wx });
const stops = []; Events.on('race:service', (e, t, info) => stops.push(`R${e.timing.laps.length + 1} ${e.name.split(' ')[1]}→${info.plan.compound} (Nässe ${Math.round(wx.water * 100)} %)`));
let walls = 0; for (const e of race.entries) { const f = e.vehicle.onImpact; e.vehicle.onImpact = (sp, a, b) => { if (sp > 3 && race.state === 'race') walls++; f(sp, a, b); }; }
const trace = []; let lastLap = 0;
while (!race.over && race.time < LAPS * 200) {
  race.step(h);
  const lead = race.order && race.order[0];
  if (lead && lead.timing.laps.length > lastLap) { lastLap = lead.timing.laps.length; trace.push(`R${lastLap}: ${fmtTime(lead.timing.lastLap)} Regen ${Math.round(wx.rain * 100)} % Nässe ${Math.round(wx.water * 100)} % Reifen ${[...new Set(race.entries.filter(e => !e.retired).map(e => e.vehicle.compound))].join('/')}`); }
}
console.log(`Wetter: ${wx.name}, Start ${start || 'Slicks'}`);
console.log(trace.join('\n'));
console.log(`Boxenstopps: ${stops.length}\n  ${stops.slice(0, 16).join('\n  ')}`);
console.log(`Mauertreffer ${walls} · Ausfälle ${race.entries.filter(e => e.retired).length} · Rennende ${race.over}`);
for (const e of race.entries) if (!e.finished && !e.retired) console.log(`NICHT IM ZIEL: ${e.name} Rd ${e.timing.laps.length} pitting=${e.pitting} phase=${e.ai.pit ? e.ai.pit.phase : '-'} plan=${JSON.stringify(e.pitPlan)} v=${e.vehicle.speedKmh.toFixed(0)} s=${e.vehicle.trackS.toFixed(0)} lat=${e.vehicle.lateral.toFixed(1)} inLane=${e.vehicle.inPitLane} stuck=${e.ai.stuckT.toFixed(1)}`);
