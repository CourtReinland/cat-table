import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';

export type Quality = 'high' | 'medium' | 'low';

/**
 * Renderer + post chain. Uses three's WebGPURenderer which transparently
 * falls back to the WebGL2 backend when WebGPU is unavailable.
 */
export class Engine {
  renderer!: InstanceType<typeof THREE.WebGPURenderer>;
  pipeline!: InstanceType<typeof THREE.RenderPipeline>;
  scene = new THREE.Scene();
  camera!: THREE.PerspectiveCamera;
  usingWebGPU = false;
  quality: Quality = 'high';
  private canvas: HTMLCanvasElement;
  private scenePass: any;
  private bloomOn = true;
  private rendering = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init() {
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    await this.renderer.init();

    this.usingWebGPU = (this.renderer.backend as any)?.isWebGPUBackend === true;
    console.info(`[CatTopSim] backend: ${this.usingWebGPU ? 'WebGPU' : 'WebGL2 (fallback)'}`);

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;

    this.camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      0.05,
      80,
    );

    this.scenePass = pass(this.scene, this.camera);
    this.rebuildPipeline();
    this.applyQuality('high');

    window.addEventListener('resize', () => this.onResize());
  }

  private rebuildPipeline() {
    this.pipeline = new THREE.RenderPipeline(this.renderer);
    const color = this.scenePass.getTextureNode();
    if (this.bloomOn) {
      const bloomPass = bloom(color, 0.28, 0.5, 0.85);
      this.pipeline.outputNode = color.add(bloomPass) as any;
    } else {
      this.pipeline.outputNode = color;
    }
  }

  applyQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const bloom = q !== 'low';
    if (bloom !== this.bloomOn) {
      this.bloomOn = bloom;
      this.rebuildPipeline();
    }
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.5) : 1);
    this.onResize();
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** Async render; skips a frame if the previous one is still in flight. */
  async render() {
    if (this.rendering) return;
    this.rendering = true;
    try {
      await this.pipeline.renderAsync();
    } catch (err) {
      // a dropped frame must never kill the loop
      console.warn('[CatTopSim] frame dropped', err);
    } finally {
      this.rendering = false;
    }
  }
}
