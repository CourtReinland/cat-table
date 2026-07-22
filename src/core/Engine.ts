import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';

export type Quality = 'high' | 'medium' | 'low';

/** iOS / old-Safari safe mode: skip post-processing, cap pixel ratio. */
export const IS_MOBILE_SAFARI: boolean = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iP(hone|ad|od)/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const oldSafari = /^((?!chrome|chromium|android|edg|firefox).)*safari/i.test(ua);
  return iOS || oldSafari;
})();

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
  safeMode = IS_MOBILE_SAFARI;
  private canvas: HTMLCanvasElement;
  private scenePass: any;
  private bloomOn = true;
  private rendering = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init() {
    const q = new URLSearchParams(location.search);
    if (q.get('gpu') === '1') this.safeMode = false; // debug override
    const forceWebGL = this.safeMode || q.get('gl') === '1';

    (window as any).__bootStage?.(`boot: creating renderer (${forceWebGL ? 'WebGL2' : 'auto'})…`);
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: !this.safeMode,
      forceWebGL,
      powerPreference: 'high-performance',
    });
    await this.renderer.init();

    this.usingWebGPU = (this.renderer.backend as any)?.isWebGPUBackend === true;
    console.info(`[CatTopSim] backend: ${this.usingWebGPU ? 'WebGPU' : 'WebGL2 (fallback)'}${this.safeMode ? ' · safeMode' : ''}`);
    (window as any).__bootStage?.(`boot: backend ready (${this.usingWebGPU ? 'WebGPU' : 'WebGL2'})`);

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

    // the post chain is the risky part on mobile GPUs — skip it entirely in safeMode
    if (!this.safeMode) {
      this.scenePass = pass(this.scene, this.camera);
      this.rebuildPipeline();
    }
    this.applyQuality(this.safeMode ? 'low' : 'high');

    window.addEventListener('resize', () => this.onResize());
  }

  private rebuildPipeline() {
    if (this.safeMode) return;
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
    if (this.safeMode && q !== 'low') q = 'low';
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const bloom = q !== 'low' && !this.safeMode;
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
      if (this.safeMode) {
        // plain forward pass — no render targets, safest possible iOS path
        this.renderer.render(this.scene, this.camera);
      } else {
        await this.pipeline.renderAsync();
      }
    } catch (err) {
      // a dropped frame must never kill the loop
      console.warn('[CatTopSim] frame dropped', err);
    } finally {
      this.rendering = false;
    }
  }
}
