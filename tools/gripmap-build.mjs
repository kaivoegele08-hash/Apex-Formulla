// Ergebnisse von tools/gripmap-learn.js (JSON-Dateien) in src/44_gripmaps.js eintragen.
//   node tools/gripmap-build.mjs <Ordner mit *.json>
// Steigerungen werden mit Sicherheitsabstand (Standard 1,5 %, MARGIN=…) übernommen (Rennen mit Verkehr, kalte Reifen).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = process.argv[2];
if (!dir) { console.error('Ordner angeben'); process.exit(1); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), file = join(ROOT, 'src/44_gripmaps.js');
const maps = {}, report = [];
for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf8').trim().split('\n').pop()); } catch (e) { report.push(`${f}: unlesbar`); continue; }
  const gain = d.base - d.best, ok = d.resets === 0 && (gain > 0.05 || d.baseResets > 0);
  report.push(`${d.key.padEnd(20)} ${d.base.toFixed(2)}${d.baseResets ? ' (Abflug)' : ''} → ${d.best.toFixed(2)} s  ${ok ? 'übernommen' : 'verworfen'}`);
  if (ok && d.list.length) maps[d.key] = d.list.map(([a, b, x]) => [a, b, +(x > 1 ? Math.max(1, x * (1 - (+process.env.MARGIN || 0.015))) : x).toFixed(3)]);
}
const src = readFileSync(file, 'utf8');
const body = 'const GRIP_MAPS = {\n' + Object.keys(maps).sort().map(k => `  '${k}': ${JSON.stringify(maps[k])},`).join('\n') + '\n};';
writeFileSync(file, src.replace(/const GRIP_MAPS = \{[\s\S]*?\n?\};/, body));
console.log(report.join('\n'));
console.log(`${Object.keys(maps).length} Einträge geschrieben`);
