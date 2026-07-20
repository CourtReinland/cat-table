import * as THREE from 'three';
import { ApartmentScene } from './ApartmentScene';
import { CameraRig } from './CameraRig';
import { LEVELS, getBoyfriend, SUKI, type LevelDef, type Boyfriend } from '../data/content';
import { audio } from '../audio/AudioManager';
import { UI } from '../ui/UI';

type Phase =
  | 'title'
  | 'intro'
  | 'playing'
  | 'cutscene'
  | 'complete'
  | 'ending'
  | 'pause'
  | 'loading';

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private rig!: CameraRig;
  private apartment = new ApartmentScene();
  private ui = new UI();
  private phase: Phase = 'loading';
  private levelIndex = 0;
  private level!: LevelDef;
  private boyfriend!: Boyfriend;
  private keys = new Set<string>();
  private swatPressed = false;
  private clock = new THREE.Clock();
  private levelStart = 0;
  private dialogueIndex = 0;
  private usingWebGPU = false;
  private hintTimer = 0;
  private brokenThisLevel = 0;
  private touchInput = { x: 0, z: 0 };
  private vignette!: HTMLDivElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init() {
    this.ui.show('loading');
    await this.initRenderer();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in this.renderer) {
      (this.renderer as THREE.WebGLRenderer).outputColorSpace = THREE.SRGBColorSpace;
    }
    if ('toneMapping' in this.renderer) {
      (this.renderer as THREE.WebGLRenderer).toneMapping = THREE.ACESFilmicToneMapping;
      (this.renderer as THREE.WebGLRenderer).toneMappingExposure = 0.92;
    }

    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.installVignette();

    this.bindInput();
    this.bindTouch();
    window.addEventListener('resize', () => this.onResize());

    const urls = [
      SUKI.portrait,
      ...LEVELS.flatMap((l) => {
        const b = getBoyfriend(l.boyfriendId);
        return [b.portrait, b.cutscene];
      }),
      '/assets/ui/title-keyart.jpg',
    ];
    await Promise.all(
      urls.map(
        (src) =>
          new Promise<void>((res) => {
            const img = new Image();
            img.onload = () => res();
            img.onerror = () => res();
            img.src = src;
          }),
      ),
    );

    this.phase = 'title';
    this.ui.show('title');
    this.clock.start();
    this.loop();
  }

  private installVignette() {
    this.vignette = document.createElement('div');
    this.vignette.id = 'fx-vignette';
    this.vignette.style.cssText = `
      position:absolute;inset:0;pointer-events:none;z-index:4;
      background: radial-gradient(ellipse at center, transparent 40%, rgba(5,2,12,0.55) 100%);
      mix-blend-mode: multiply; opacity: 0.85;
    `;
    document.getElementById('app')?.appendChild(this.vignette);

    const grain = document.createElement('div');
    grain.id = 'fx-grain';
    grain.style.cssText = `
      position:absolute;inset:0;pointer-events:none;z-index:4;opacity:0.04;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    `;
    document.getElementById('app')?.appendChild(grain);
  }

  private async initRenderer() {
    const tryWebGPU = async () => {
      if (!('gpu' in navigator) || !(navigator as Navigator & { gpu?: unknown }).gpu) {
        throw new Error('no navigator.gpu');
      }
      const WebGPU = await import('three/webgpu');
      const r = new WebGPU.WebGPURenderer({ canvas: this.canvas, antialias: true });
      await r.init();
      this.renderer = r as unknown as THREE.WebGLRenderer;
      this.usingWebGPU = true;
      console.info('[CatTopSim] WebGPU renderer active');
    };

    const tryWebGL = () => {
      const parent = this.canvas.parentElement;
      if (parent) {
        const fresh = this.canvas.cloneNode(false) as HTMLCanvasElement;
        fresh.id = this.canvas.id;
        parent.replaceChild(fresh, this.canvas);
        this.canvas = fresh;
      }
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
      });
      this.usingWebGPU = false;
      console.info('[CatTopSim] WebGL renderer active');
    };

    try {
      await tryWebGPU();
    } catch (err) {
      console.info('[CatTopSim] WebGPU skipped:', err);
      tryWebGL();
    }
  }

  private bindInput() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') {
        e.preventDefault();
        this.swatPressed = true;
      }
      if (e.code === 'Escape') {
        if (this.phase === 'playing') this.pause();
        else if (this.phase === 'pause') this.resume();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    this.canvas.addEventListener('pointerdown', () => {
      if (this.phase === 'playing') this.swatPressed = true;
    });

    this.ui.on('start', () => this.beginGame());
    this.ui.on('introGo', () => this.startPlaying());
    this.ui.on('dialogueNext', () => this.advanceDialogue());
    this.ui.on('nextLevel', () => this.nextLevel());
    this.ui.on('replay', () => this.beginGame());
    this.ui.on('resume', () => this.resume());
    this.ui.on('quitTitle', () => {
      this.phase = 'title';
      this.ui.hideHud();
      this.ui.show('title');
    });
  }

  private beginGame() {
    audio.startAmbience();
    audio.playUI();
    audio.playVoice('/assets/audio/title-line.mp3');
    this.levelIndex = 0;
    this.showIntro(this.levelIndex);
  }

  private showIntro(index: number) {
    this.levelIndex = index;
    this.level = LEVELS[index];
    this.boyfriend = getBoyfriend(this.level.boyfriendId);
    this.phase = 'intro';
    this.ui.hideHud();
    this.ui.showIntro(this.boyfriend, this.level);
    if (this.boyfriend.sukiVoice) {
      setTimeout(() => audio.playVoice(this.boyfriend.sukiVoice), 400);
    }
    this.apartment.loadLevel(this.level);
    this.brokenThisLevel = 0;
  }

  private startPlaying() {
    audio.playUI();
    audio.playMeow();
    this.phase = 'playing';
    this.levelStart = performance.now();
    this.hintTimer = 6;
    this.ui.show('none');
    this.ui.showHud(this.level, this.boyfriend);
    this.ui.updateChaos(0, this.apartment.totalCount);
    this.ui.flashHint('WASD move · Space swat · Heavy objects need multiple hits');
  }

  private pause() {
    this.phase = 'pause';
    this.ui.show('pause');
  }

  private resume() {
    this.phase = 'playing';
    this.ui.show('none');
  }

  private onObjectBroken(kind: string) {
    this.brokenThisLevel++;
    audio.playShatter(kind as 'glass' | 'ceramic' | 'soft' | 'metal');
    this.ui.updateChaos(this.apartment.brokenCount, this.apartment.totalCount);
    this.ui.flashHint(this.pickHint());
    this.rig.addPunch(0.7);

    if (this.apartment.allBroken) {
      setTimeout(() => this.onLevelCleared(), 700);
    }
  }

  private pickHint(): string {
    const hints = [
      'Yes… more chaos…',
      'He almost looked over.',
      'ASMR: expensive regrets.',
      'Heather is going to notice… eventually.',
      'Heavy things need a few swats.',
      'Shoulder-check the light stuff.',
      'Gravity is your love language.',
    ];
    return hints[Math.floor(Math.random() * hints.length)];
  }

  private onLevelCleared() {
    if (this.phase !== 'playing') return;
    audio.playSuccess();
    audio.playMeow();
    this.phase = 'cutscene';
    this.dialogueIndex = 0;
    this.ui.hideHud();
    this.ui.showCutscene(this.boyfriend, this.dialogueIndex);
    const line = this.boyfriend.dialogue[0];
    if (line?.voice) audio.playVoice(line.voice);
  }

  private advanceDialogue() {
    audio.playUI();
    this.dialogueIndex++;
    if (this.dialogueIndex >= this.boyfriend.dialogue.length) {
      this.showComplete();
    } else {
      this.ui.showCutscene(this.boyfriend, this.dialogueIndex);
      const line = this.boyfriend.dialogue[this.dialogueIndex];
      if (line?.voice) audio.playVoice(line.voice);
    }
  }

  private showComplete() {
    this.phase = 'complete';
    const secs = Math.round((performance.now() - this.levelStart) / 1000);
    this.ui.showComplete(
      this.boyfriend,
      this.brokenThisLevel,
      secs,
      this.levelIndex >= LEVELS.length - 1,
    );
  }

  private nextLevel() {
    audio.playUI();
    if (this.levelIndex >= LEVELS.length - 1) {
      this.phase = 'ending';
      this.ui.show('ending');
      return;
    }
    this.showIntro(this.levelIndex + 1);
  }

  private bindTouch() {
    const zone = document.getElementById('stick-zone');
    const knob = document.getElementById('stick-knob');
    const nudgeBtn = document.getElementById('btn-touch-nudge');
    if (!zone || !knob) return;

    const maxR = 40;
    let active = false;
    let cx = 0;
    let cy = 0;

    const setKnob = (dx: number, dy: number) => {
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, maxR);
      const nx = (dx / len) * cl;
      const ny = (dy / len) * cl;
      knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
      this.touchInput.x = nx / maxR;
      this.touchInput.z = ny / maxR;
    };

    const reset = () => {
      active = false;
      this.touchInput.x = 0;
      this.touchInput.z = 0;
      knob.style.transform = 'translate(-50%, -50%)';
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      active = true;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      setKnob(e.clientX - cx, e.clientY - cy);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!active) return;
      setKnob(e.clientX - cx, e.clientY - cy);
    });
    zone.addEventListener('pointerup', reset);
    zone.addEventListener('pointercancel', reset);

    nudgeBtn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.swatPressed = true;
    });
  }

  private getInput() {
    let x = this.touchInput.x;
    let z = this.touchInput.z;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    return { x, z };
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.phase === 'playing') {
      const input = this.getInput();
      const wantSwat = this.swatPressed;
      this.swatPressed = false;

      const { breaks, swatResult, didSwat } = this.apartment.update(dt, input, wantSwat);
      if (didSwat) audio.playNudge();

      if (swatResult === 'locked') {
        this.ui.flashHint('Too heavy — swat again!');
        this.rig.addPunch(0.25);
      } else if (swatResult === 'unlocked') {
        this.ui.flashHint('It\'s loose — finish it!');
        this.rig.addPunch(0.45);
      } else if (swatResult === 'pushed') {
        this.rig.addPunch(0.55);
      }

      for (const ev of breaks) this.onObjectBroken(ev.kind);

      const cat = this.apartment.cat;
      this.rig.follow(dt, cat.group.position, cat.facingYaw, cat.velocity);

      if (this.hintTimer > 0) {
        this.hintTimer -= dt;
        if (this.hintTimer <= 0) this.ui.hideHint();
      }
    } else if (
      this.phase === 'intro' ||
      this.phase === 'complete' ||
      this.phase === 'cutscene' ||
      this.phase === 'pause'
    ) {
      this.apartment.update(dt, { x: 0, z: 0 }, false);
      const c = new THREE.Vector3(0, this.apartment.counterY + 0.2, 0);
      this.rig.orbit(c, performance.now() * 0.001, 3.6, 2.3);
    }

    if (this.phase !== 'title' && this.phase !== 'loading' && this.phase !== 'ending') {
      this.renderer.render(this.apartment.scene, this.rig.camera);
    } else {
      const gl = this.renderer as THREE.WebGLRenderer;
      if (gl.setClearColor) gl.setClearColor(0x07040e, 1);
      this.renderer.clear?.();
    }
  };

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.rig.setSize(w, h);
    this.renderer.setSize(w, h);
  }
}
