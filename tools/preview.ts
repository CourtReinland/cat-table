/**
 * Isolation lookdev for in-game models.
 *   preview.html?model=suki          — sculpted Suki (default)
 *   preview.html?model=candelabra    — img2threejs factory
 * Views: ?view=beauty|side|front|threeq|paw|face
 * Orbit:  ?a=radians  (yaw around the view target)
 */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createCandelabraModel, createCandelabraLookDevLights } from '../src/game/models/createCandelabraModel';
import { refineCandelabra } from '../src/game/models/refineCandelabra';
import { toonify, outlineCharacter } from '../src/game/Toon';

const params = new URLSearchParams(location.search);
const modelName = (params.get('model') ?? 'suki').toLowerCase();
const view = (params.get('view') ?? 'beauty').toLowerCase();
const angle = parseFloat(params.get('a') ?? '0');
const forceWebGL = params.get('gl') === '1' || params.get('gpu') !== '1';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({
  canvas,
  antialias: true,
  forceWebGL,
  powerPreference: 'high-performance',
});
await renderer.init();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17131c);

function lookdevLights() {
  const hemi = new THREE.HemisphereLight(0xfff0e4, 0x2a2230, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4ea, 1.85);
  key.position.set(0.55, 0.85, 0.65);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8d4ff, 0.45);
  fill.position.set(-0.8, 0.35, 0.25);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd0c0, 0.9);
  rim.position.set(-0.15, 0.55, -0.85);
  scene.add(rim);
}

type View = { pos: THREE.Vector3; target: THREE.Vector3; fov: number };

const SUKI_VIEWS: Record<string, View> = {
  beauty: { pos: new THREE.Vector3(0.48, 0.28, 0.52), target: new THREE.Vector3(0, 0.15, 0.02), fov: 34 },
  threeq: { pos: new THREE.Vector3(0.52, 0.26, 0.50), target: new THREE.Vector3(0, 0.15, 0.02), fov: 34 },
  side:   { pos: new THREE.Vector3(0.78, 0.18, 0.04), target: new THREE.Vector3(0, 0.15, 0.00), fov: 32 },
  front:  { pos: new THREE.Vector3(0.02, 0.20, 0.72), target: new THREE.Vector3(0, 0.16, 0.00), fov: 32 },
  face:   { pos: new THREE.Vector3(0.10, 0.26, 0.34), target: new THREE.Vector3(0, 0.23, -0.18), fov: 28 },
  paw:    { pos: new THREE.Vector3(0.16, 0.07, 0.24), target: new THREE.Vector3(0.05, 0.015, 0.10), fov: 28 },
};

const CANDLE_VIEW: View = {
  pos: new THREE.Vector3(Math.sin(0.6) * 0.85, 0.28, Math.cos(0.6) * 0.85),
  target: new THREE.Vector3(0, 0.17, 0),
  fov: 36,
};

let model: THREE.Object3D = new THREE.Group();
let mixer: THREE.AnimationMixer | null = null;

if (modelName === 'candelabra') {
  const m = createCandelabraModel();
  refineCandelabra(m);
  model = m;
  scene.add(model);
  if (params.get('bare') !== '1') scene.add(createCandelabraLookDevLights('reference'));
  else scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
  if (params.get('bare') !== '1') {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshStandardNodeMaterial({ color: 0x241e28, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }
} else {
  lookdevLights();
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 48),
    new THREE.MeshToonNodeMaterial({ color: 0x241e28 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.001;
  ground.receiveShadow = true;
  scene.add(ground);

  try {
    const gltf = await new GLTFLoader().loadAsync('assets/models/suki.glb');
    model = gltf.scene;
    model.scale.setScalar(1);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
      }
    });
    toonify(model);
    outlineCharacter(model, 0x2a1c24, 0.0035);
    scene.add(model);
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      const idle = gltf.animations.find((c) => c.name === 'Idle') ?? gltf.animations[0];
      mixer.clipAction(idle).play();
    }
    console.info('[preview] suki.glb', gltf.animations.map((c) => c.name).join(', '));
  } catch (err) {
    console.error('[preview] suki.glb failed', err);
  }
}

const viewSpec = modelName === 'candelabra' ? CANDLE_VIEW : (SUKI_VIEWS[view] ?? SUKI_VIEWS.beauty);
const camera = new THREE.PerspectiveCamera(viewSpec.fov, innerWidth / innerHeight, 0.01, 20);
const target = viewSpec.target.clone();
const radius = viewSpec.pos.clone().sub(target);
const yaw0 = Math.atan2(radius.x, radius.z);
const dist = Math.hypot(radius.x, radius.z);
const elev = radius.y;

function placeCam(yaw: number) {
  camera.position.set(
    target.x + Math.sin(yaw) * dist,
    target.y + elev,
    target.z + Math.cos(yaw) * dist,
  );
  camera.lookAt(target);
}
placeCam(yaw0 + angle);

let drag = false;
let lastX = 0;
let yaw = yaw0 + angle;
canvas.addEventListener('pointerdown', (e) => {
  drag = true;
  lastX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', () => { drag = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw -= (e.clientX - lastX) * 0.008;
  lastX = e.clientX;
  placeCam(yaw);
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
function frame() {
  const dt = clock.getDelta();
  mixer?.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

const hud = document.getElementById('hud');
if (hud) {
  hud.textContent = modelName === 'suki'
    ? `Suki isolation · ${view} · drag to orbit`
    : `preview · ${modelName}`;
}

(window as any).__ready = true;
(window as any).__scene = scene;
(window as any).__model = model;
(window as any).__THREE = THREE;
(window as any).__view = view;
(window as any).__modelName = modelName;
