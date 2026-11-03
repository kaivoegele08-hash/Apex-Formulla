#!/usr/bin/env node
// ============================================================================
//  Build: fügt die Quellteile aus src/ (nach Dateiname sortiert) zu EINER
//  HTML-Datei zusammen und packt optional das Verteil-ZIP.
//    node tools/build.mjs            → dist/apex-formula.html
//    node tools/build.mjs --zip      → zusätzlich dist/apex-formula.zip
// ============================================================================
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src'), dist = join(root, 'dist');
const parts = readdirSync(src).filter(f => /^\d\d_.*\.(js|html)$/.test(f)).sort();
if (!parts.length || !parts[0].endsWith('.html') || !parts[parts.length - 1].endsWith('.html')) {
  console.error('Erwartet: erster Teil 00_head.html, letzter Teil 99_tail.html');
  process.exit(1);
}
const html = parts.map(f => readFileSync(join(src, f), 'utf8')).join('');
mkdirSync(dist, { recursive: true });
const out = join(dist, 'apex-formula.html');
writeFileSync(out, html);
console.log(`gebaut: ${out} (${(statSync(out).size / 1024).toFixed(0)} KB, ${html.split('\n').length} Zeilen, ${parts.length} Teile)`);

if (process.argv.includes('--zip')) {
  // Spiel + Kurzanleitung + Linux-Extras (udev-Regel für Force Feedback per WebHID)
  const zip = join(dist, 'apex-formula.zip');
  const files = [out, join(root, 'extras', 'LIESMICH.txt'), join(root, 'extras', 'LIZENZ-enginesound.txt')];
  const linux = join(root, 'extras', 'linux');
  if (existsSync(linux)) for (const f of readdirSync(linux).sort()) files.push(join(linux, f));
  rmSync(zip, { force: true });
  try {
    execFileSync('zip', ['-q', '-j', '-X', zip, ...files]);
    console.log(`gepackt: ${zip} (${(statSync(zip).size / 1024).toFixed(0)} KB, ${files.length} Dateien)`);
  } catch (e) {
    console.error('ZIP fehlgeschlagen (ist „zip“ installiert?):', e.message);
    process.exit(1);
  }
}
