// Einstieg für das gebündelte Three.js (tools/vendor.mjs → vendor/three-bundle.min.js).
// Das Spiel liest die Klassen aus window.ApexLib – so läuft es ohne Internet und ohne Modul-Ladevorgänge (file://).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
window.ApexLib = { THREE, Sky, RoomEnvironment, mergeGeometries, EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass };
