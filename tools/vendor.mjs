#!/usr/bin/env node
// ============================================================================
//  Fremdbibliotheken einmalig bündeln (nur nach einem Versionswechsel nötig):
//    APEX_NODE_MODULES=/pfad/zu/node_modules node tools/vendor.mjs
//  Braucht dort: three@0.160.0, peerjs@1.5.4, esbuild. Ergebnis (wird eingecheckt):
//    vendor/three-bundle.min.js, vendor/peerjs.min.js
// ============================================================================
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NM = process.env.APEX_NODE_MODULES || join(root, 'node_modules');
const require = createRequire(join(NM, 'x.js'));
const esbuild = require('esbuild');
await esbuild.build({ entryPoints: [join(root, 'vendor/three-entry.js')], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: join(root, 'vendor/three-bundle.min.js'), nodePaths: [NM], legalComments: 'none',
  banner: { js: '/* three.js r160 – MIT-Lizenz, Copyright 2010-2023 Three.js Authors (https://threejs.org) – gebündelt für Apex Formula */' } });
copyFileSync(join(NM, 'peerjs/dist/peerjs.min.js'), join(root, 'vendor/peerjs.min.js'));
for (const f of ['three-bundle.min.js', 'peerjs.min.js']) console.log(f, (statSync(join(root, 'vendor', f)).size / 1024).toFixed(0), 'KB');
