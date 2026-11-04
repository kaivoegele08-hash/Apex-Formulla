// Mods: Strecke aus Eckpunkten, Team/Fahrer, Auto-Epoche → Streckenmodell, Ideallinie, KI-Runde
const list = [];
globalThis.ApexMods = { register(m) { list.push(Object.assign({ source: 'test' }, m)); } };
const fs = await import('node:fs');
const code = fs.readFileSync(new URL('../../mods/beispiel_strecke.js', 'file://' + process.env.TESTFILE).pathname, 'utf8');
new Function('ApexMods', code)(globalThis.ApexMods);
for (const f of ['beispiel_team.js', 'beispiel_auto.js', 'beispiel_oldtimer.js']) new Function('ApexMods', fs.readFileSync(new URL('../../mods/' + f, 'file://' + process.env.TESTFILE).pathname, 'utf8'))(globalThis.ApexMods);
ApexMods.register({ id: 'kaputt', name: 'Kaputte Mod', tracks: [{ id: 'x', layout: { corners: [[0, 0, 400], [100, 0, 400], [50, 80, 400]] } }] });
ApexMods.register({ id: 'team-test', name: 'Team', teams: [{ id: 'blitz', name: 'Blitz Racing', colors: ['#ffee00', '#111111'] }], drivers: [{ name: 'Max Muster', team: 'blitz', num: 55, rating: 0.9 }, { name: 'Erika Beispiel', team: 'blitz', num: 56, rating: 0.8, era: 'e1990' }] });
ApexMods.register({ id: 'auto-test', name: 'Auto', eras: [{ id: 'mod-junior', name: 'Junior', spec: { mass: 620, engine: { curve: [[0, 100], [6000, 200], [9000, 230], [11000, 210]], limitRpm: 11000 }, ers: { maxKW: 0 }, aero: { mode: 'none', clFW: 0.6, clRW: 0.7, clFloor: 0.5 } } }] });
ApexMods.register({ id: 'modell-kaputt', name: 'Kaputtes Modell', eras: [{ id: 'mk', name: 'MK', model: { nose: [{ z: -1, w: 0.3, h: 0.2 }, { z: -2, w: 0.3, h: 0.2 }], parts: [{ type: 'kugel' }] } }] });
const rep = applyMods(list);
for (const r of rep) console.log(r.ok ? 'OK  ' : 'FEHL', r.name, '–', r.ok ? r.items.join(', ') : r.msg);
const T = new TrackModel(TRACKS.seeblick), line = new RacingLine(T);
console.log(`Seeblick: ${(T.length / 1000).toFixed(2)} km, ${T.def.points.length} Punkte, Aero-Zonen ${JSON.stringify(T.def.aeroZones)}, Box ${!!T.pit}, Runden ${T.def.raceLaps}`);
const v = new Vehicle(CAR_SPEC, {}); v.setCompound('medium', 85); v.placeOnTrack(T, T.length - 150, line.offsetAt(T.length - 150));
const ai = new AIDriver(v, line, { skill: 1, aggression: 0.5, consistency: 1, reaction: 0.2 }, 3), me = { vehicle: v, ai };
let laps = [], ls = null, last = v.trackS, t = 0, off = 0, imp = 0;
for (let i = 0; i < 360 * 260 && laps.length < 2; i++) { ai.control(PHYS_DT, { cars: [me], me, state: 'free', time: t }); v.step(PHYS_DT); t += PHYS_DT; for (const e of v.events) if (e.type === 'impact') imp++; v.events.length = 0; if (last > T.length - 60 && v.trackS < 60) { if (ls !== null) laps.push(t - ls); ls = t; } last = v.trackS; if (v.offTrackWheels >= 4) off += PHYS_DT; }
console.log('KI-Runden', laps.map(fmtTime).join(' '), '· neben der Strecke', off.toFixed(1), 's · Einschläge', imp);
applyEra('mod-junior'); console.log('Mod-Epoche aktiv:', CAR_SPEC.engine.limitRpm, 'U/min, KI lat0', AI_LIMITS.lat0.toFixed(2), '· Fahrer', DRIVERS.length);
applyEra('e1990'); console.log('1990 mit Mod-Fahrerin:', DRIVERS.some(d => d.name === 'Erika Beispiel'));
applyEra('e2026'); console.log('2026 mit Mod-Fahrer:', DRIVERS.some(d => d.name === 'Max Muster'), '· Teams', TEAMS.length);
applyEra('nachwuchs'); const vj = new Vehicle(CAR_SPEC, {}); vj.placeAt(0, 0, 0, 0); vj.aids.autoShift = true; let top = 0; for (let i = 0; i < 360 * 60; i++) { vj.input.throttle = 1; vj.step(PHYS_DT); vj.events.length = 0; top = Math.max(top, vj.speedKmh); } console.log('Nachwuchsformel: Vmax', top.toFixed(0), 'km/h'); applyEra('e2026');
const ok = rep.filter(r => r.ok).length === 6 && !rep.find(r => r.id === 'kaputt').ok && laps.length === 2 && off < 1;
console.log(ok ? 'OK' : 'FEHLER');
const mrep = rep.find(r => r.name === 'Kaputtes Modell'), oldr = rep.find(r => r.name === 'Beispiel: Zigarre 1960');
console.log('Modellprüfung:', mrep && !mrep.ok ? 'Fehler erkannt – ' + mrep.msg : 'NICHT erkannt', '· Oldtimer', oldr && oldr.ok ? 'OK' : 'FEHL ' + (oldr && oldr.msg));
if (!mrep || mrep.ok || !oldr || !oldr.ok || !ERAS.zigarre60.model || !ERAS.nachwuchs.model) { console.log('FEHLER Modell-Mods'); process.exit(1); }
const M = carModelOf(ERAS.zigarre60.model); console.log('Zigarre: Nase', M.nose.length, 'Querschnitte, eigene Nase', M.customNose, '· Teile', M.parts.length, '· Airbox', M.airbox.length, '· Frontflügel aus', M.look.frontWing === false);
