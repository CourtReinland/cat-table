/**
 * Standalone preview for img2threejs-generated factories.
 * ?model=candelabra picks the factory; orbit params via ?a=angle.
 */
import * as THREE from 'three/webgpu';
import { createCandelabraModel, createCandelabraLookDevLights } from '../src/game/models/createCandelabraModel';
import { refineCandelabra } from '../src/game/models/refineCandelabra';

const params = new URLSearchParams(location.search);
const angle = parseFloat(params.get('a') ?? '0.6');

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
await renderer.init();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17131c);

const model = createCandelabraModel();
refineCandelabra(model);
scene.add(model);
if (params.get('bare') !== '1') scene.add(createCandelabraLookDevLights('reference'));
else scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));

const showGround = params.get('bare') !== '1';
if (showGround) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshStandardNodeMaterial({ color: 0x241e28, roughness: 0.9 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.01, 20);
const target = new THREE.Vector3(0, 0.17, 0);
camera.position.set(Math.sin(angle) * 0.85, 0.28, Math.cos(angle) * 0.85);
camera.lookAt(target);

function frame() {
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
(window as any).__ready = true;
(window as any).__scene = scene;
(window as any).__model = model;
(window as any).__THREE = THREE;
