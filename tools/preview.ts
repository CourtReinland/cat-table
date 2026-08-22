/**
 * Isolation lookdev for in-game models.
 *   preview.html?model=suki          — sculpted Suki (default)
 *   preview.html?model=candelabra    — img2threejs factory
 * Views: ?view=beauty|side|front|threeq|paw|face
 * Clip:   ?clip=Sit|Walk|PlayBow|Loaf|Wink|Idle (beauty defaults to Sit)
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
const clipParam = params.get('clip');
const timeParam = parseFloat(params.get('t') ?? '');

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
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17131c);

function lookdevLights() {
  // cooler / softer key so white fur keeps pink shade instead of clipping
  const hemi = new THREE.HemisphereLight(0xfff4f0, 0x322430, 0.48);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff8f4, 1.42);
  key.position.set(0.55, 0.85, 0.65);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd4dcff, 0.58);
  fill.position.set(-0.8, 0.35, 0.25);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd4e4, 0.48);
  rim.position.set(-0.15, 0.55, -0.85);
  scene.add(rim);
}

type View = { pos: THREE.Vector3; target: THREE.Vector3; fov: number };

const SUKI_VIEWS: Record<string, View> = {
  // glTF Y-up: muzzle ~+Z, height +Y. Pull back so the whole cat fits.
  beauty: { pos: new THREE.Vector3(0.52, 0.20, 0.88), target: new THREE.Vector3(0, 0.10, 0.00), fov: 28 },
  threeq: { pos: new THREE.Vector3(0.55, 0.20, 0.80), target: new THREE.Vector3(0, 0.10, 0.00), fov: 30 },
  side:   { pos: new THREE.Vector3(1.18, 0.16, 0.04), target: new THREE.Vector3(0, 0.13, 0.00), fov: 26 },
  front:  { pos: new THREE.Vector3(0.00, 0.14, 1.18), target: new THREE.Vector3(0, 0.10, 0.00), fov: 26 },
  face:   { pos: new THREE.Vector3(0.04, 0.22, 0.56), target: new THREE.Vector3(0, 0.21, 0.12), fov: 30 },
  paw:    { pos: new THREE.Vector3(0.040, -0.048, 0.048), target: new THREE.Vector3(0.040, 0.000, 0.080), fov: 36 },
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
    outlineCharacter(model, 0x3a2840, 0.0024);
    scene.add(model);
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      const want = clipParam
        ?? (view === 'beauty' ? 'Sit' : view === 'face' ? 'Idle' : 'Idle');
      const clip = gltf.animations.find((c) => c.name === want)
        ?? gltf.animations.find((c) => c.name === 'Idle')
        ?? gltf.animations[0];
      const action = mixer.clipAction(clip);
      action.play();
      // ?t= samples a specific second (Wink mid-close, Walk paw-up).
      // otherwise settle hold clips (Sit / PlayBow / Loaf) before stills
      mixer.update(Number.isFinite(timeParam) ? timeParam : 0.85);
    }
    console.info('[preview] suki.glb', gltf.animations.map((c) => c.name).join(', '));
  } catch (err) {
    console.error('[preview] suki.glb failed', err);
  }
}

const viewSpec = modelName === 'candelabra' ? CANDLE_VIEW : (SUKI_VIEWS[view] ?? SUKI_VIEWS.beauty);
const camera = new THREE.PerspectiveCamera(viewSpec.fov, innerWidth / innerHeight, view === 'paw' ? 0.002 : 0.01, 20);
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
    ? `Suki isolation · ${view}${clipParam ? ` · ${clipParam}` : ''} · drag to orbit`
    : `preview · ${modelName}`;
}

(window as any).__ready = true;
(window as any).__scene = scene;
(window as any).__model = model;
(window as any).__THREE = THREE;
(window as any).__view = view;
(window as any).__modelName = modelName;
