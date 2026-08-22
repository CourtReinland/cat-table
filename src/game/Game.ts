import * as THREE from 'three/webgpu';
import { Engine } from '../core/Engine';
import { Input } from '../core/Input';
import { Save } from '../core/Save';
import { audio } from '../audio/AudioManager';
import { Apartment } from './Apartment';
import { FX } from './FX';
import { UI } from '../ui/UI';
import {
  BOYFRIENDS,
  ENDING,
  FAIL_LINES,
  LEVELS,
  NARRATOR,
  PUSH_HINTS,
  getBoyfriend,
  shatterableCount,
  type BoyDef,
  type LevelDef,
  type Line,
} from '../data/content';
import { preloadBoys } from './BoyGlb';
import { Hazards } from './Hazards';
import { toonGradient } from './Toon';
import type { ShatterEvent } from './Physics';
import { cameraRelativeMove, lookToCamDir, stepProwl } from './Steer';

type Phase =
  | 'loading'
  | 'title'
  | 'intro'
  | 'playing'
  | 'cinematic'
  | 'dialogue'
  | 'complete'
  | 'fail'
  | 'ending'
  | 'pause';

const SFX_NAMES = [
  'shatter-glass',
  'shatter-ceramic',
  'smash-grand',
  'clatter-metal',
  'thud-soft',
  'meow-cute',
  'meow-sassy',
  'meow-triumph',
  'purr',
  'whoosh',
  'ui-pop',
  'success',
  'heart-pop',
];

export class Game {
  private engine: Engine;
  private apartment: Apartment;
  private fx = new FX();
  private ui = new UI();
  private input = new Input();
  private save = new Save();
  private clock = new THREE.Clock();
  private phase: Phase = 'loading';
  private prePause: Phase = 'playing';

  private levelIndex = 0;
  private level!: LevelDef;
  private boy!: BoyDef;

  // gameplay state
  private score = 0;
  private combo = 0;
  private comboTimer = 0;
  private broken = 0;
  private barkStage = 0;
  private levelStart = 0;
  private timeScale = 1;
  private slowmoT = 0;
  private meowCooldown = 0;
  private pushCooldown = 0;
  private hazardHits = 0;
  /** seconds left before the date gives up on the counter */
  private timeLeft = 0;
  private failReason: 'hand' | 'mouse' | 'timeout' | 'default' = 'default';
  private hazards!: Hazards;
  private targetBreak = 0;
  private catVel = new THREE.Vector3();
  private lookDir = new THREE.Vector3();
  private camMode: 'follow' | 'orbit' | 'cine' = 'orbit';
  private camPos = new THREE.Vector3(0, 2.2, 4.2);
  private camLook = new THREE.Vector3(0, 1, 0);
  private shakeRot = { z: 0 };
  /** first-person mode: camera rides between Suki's ears */
  fpCam = true;
  private fpBobT = 0;
  private fpPunch = new THREE.Vector3();
  private fpFovKick = 0;
  /** set true for one frame after an impact — drives the FP camera jolt */
  fpJolt = 0;
  // contact-based paw swipe state
  private swipeT = 0;
  private swipeHit = false;
  private swipeBlocked = false;
  private pawTip = new THREE.Vector3();
  /** first-person paw: parented to the camera, sweeps on shove */
  private fpPaw: THREE.Group | null = null;
  private fpPawT = -1; // <0 = hidden

  // cutscene state
  private cineT = 0;
  private cineFrom = new THREE.Vector3();
  private cineLookFrom = new THREE.Vector3();
  private boyFrom = new THREE.Vector3();
  private catFrom = new THREE.Vector3();
  private cuddlePoint = new THREE.Vector3();
  private dlgIndex = 0;
  private dlgLines: Line[] = [];

  // test harness
  autopilot = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas);
    this.apartment = new Apartment(this.engine.scene);
    this.hazards = new Hazards(this.engine.scene);
  }

  async init() {
    const stage = (window as any).__bootStage ?? (() => {});
    stage('boot: renderer…');
    await this.engine.init();
    this.fx.init(this.engine.scene);
    stage('boot: loading models…');
    await Promise.race([
      Promise.all([this.apartment.cat.wait(), preloadBoys(BOYFRIENDS.map((b) => b.id))]),
      new Promise((r) => setTimeout(r, 15000)),
    ]);
    this.ui.init(this.save);
    this.input.bindCanvas(this.canvas);
    this.bindUI();
    this.bindUnlock();

    // URL test hooks: ?auto=1&level=2&instant=1&quality=low
    const q = new URLSearchParams(location.search);
    this.autopilot = q.get('auto') === '1';
    const forcedQ = q.get('quality');
    if (forcedQ === 'low' || forcedQ === 'medium' || forcedQ === 'high') {
      this.save.data.settings.quality = forcedQ;
      this.engine.applyQuality(forcedQ);
    }
    const lvl = Math.min(parseInt(q.get('level') ?? '0', 10) || 0, LEVELS.length - 1);

    this.phase = 'title';
    this.ui.show('title');
    this.ui.refreshTitleStartButton((this.save.data.unlocked ?? 0) > 0);
    this.loadLevel(lvl, false);
    stage('boot: first frame…');
    this.clock.start();
    this.loop();
    if (this.autopilot) this.showIntro(lvl);
  }

  // ── setup ────────────────────────────────────────────────────────────────

  private bindUnlock() {
    const unlock = () => {
      audio.unlock();
      audio.volumes = this.save.data.settings;
      audio.applyVolumes();
      const urls = [
        ...SFX_NAMES.map((n) => `assets/audio/sfx/${n}.mp3`),
        ...['title', 'play', 'cuddle'].map((n) => `assets/audio/music/${n}.mp3`),
        ...BOYFRIENDS.flatMap((b) =>
          [b.lines.intro, ...b.lines.barks, ...b.lines.cutscene].map((l) => l.voice).filter(Boolean) as string[],
        ),
        NARRATOR.title,
        NARRATOR.ending,
      ];
      void audio.load(urls).then(() => {
        if (this.phase === 'title' || this.phase === 'intro') audio.music('title');
      });
      audio.music('title');
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private bindUI() {
    this.ui.on('start', () => {
      audio.sfx('ui-pop');
      const next = Math.min(this.save.data.unlocked, LEVELS.length - 1);
      this.showIntro(next);
      audio.voice(NARRATOR.title);
    });
    this.ui.on('selectLevel', (i: number) => {
      audio.sfx('ui-pop');
      this.showIntro(i);
    });
    this.ui.on('introGo', () => {
      audio.sfx('ui-pop');
      this.startPlaying();
    });
    this.ui.on('dialogueNext', () => this.advanceDialogue());
    this.ui.on('nextLevel', () => {
      audio.sfx('ui-pop');
      if (this.levelIndex >= LEVELS.length - 1) {
        this.phase = 'ending';
        this.ui.showEnding(ENDING.lines);
        audio.music('cuddle');
        void audio.voice(NARRATOR.ending).then(() => audio.voice(ENDING.lines[2].voice));
      } else {
        this.showIntro(this.levelIndex + 1);
      }
    });
    this.ui.on('replay', () => {
      audio.sfx('ui-pop');
      this.showIntro(this.levelIndex);
    });
    this.ui.on('failRetry', () => {
      audio.sfx('ui-pop');
      this.showIntro(this.levelIndex);
    });
    this.ui.on('resume', () => this.resume());
    this.ui.on('restart', () => {
      audio.sfx('ui-pop');
      this.resume();
      this.showIntro(this.levelIndex);
    });
    this.ui.on('quitTitle', () => {
      audio.sfx('ui-pop');
      this.haltProwl();
      this.phase = 'title';
      this.camMode = 'orbit';
      this.ui.showHud(false);
      this.ui.hideDialogue();
      this.setCg(null);
      this.ui.show('title');
      this.ui.refreshTitleStartButton(this.save.data.unlocked > 0);
      audio.music('title');
    });
    this.ui.on('settingsBack', () => {
      audio.volumes = this.save.data.settings;
      audio.applyVolumes();
      const q = this.save.data.settings.quality;
      this.engine.applyQuality(q === 'auto' ? 'high' : q);
    });
    this.ui.on('wipe', () => {
      this.save.wipe();
      this.ui.refreshTitleStartButton(false);
      this.ui.buildLevelCards();
      audio.sfx('meow-sassy');
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.phase === 'playing') this.pause();
        else if (this.phase === 'pause') this.resume();
      }
      if (e.code === 'Space' && this.phase === 'dialogue') this.advanceDialogue();
      if (e.code === 'KeyC' && this.phase === 'playing') {
        this.fpCam = !this.fpCam;
        this.ui.hint(this.fpCam ? "Suki's eyes: first-person" : 'Third-person view');
        this.ui.hideHint();
      }
    });
  }

  private loadLevel(index: number, showIntro = true) {
    this.levelIndex = index;
    this.level = LEVELS[index];
    this.boy = getBoyfriend(this.level.boyfriendId);
    this.apartment.loadLevel(this.level);
    this.apartment.physics.onShatter = (ev) => this.onShatter(ev);
    this.score = 0;
    this.combo = 0;
    this.broken = 0;
    this.barkStage = 0;
    this.hazardHits = 0;
    this.pushCooldown = 0;
    this.targetBreak = shatterableCount(this.level);
    this.haltProwl();
    this.timeScale = 1;
    this.slowmoT = 0;
    this.hazards.reset(this.apartment.surface, this.level.difficulty);
    this.timeLeft = this.level.difficulty.timeLimit;
    if (showIntro) this.showIntroCard();
  }

  /** Drop residual prowl so idle/sit can own title/intro/fail/cinematic. */
  private haltProwl() {
    this.catVel.set(0, 0, 0);
    const cat = this.apartment.cat;
    cat.yawRate = 0;
    cat.speed = 0;
  }

  private showIntro(index: number) {
    this.loadLevel(index, false);
    this.showIntroCard();
  }

  private showIntroCard() {
    this.phase = 'intro';
    this.camMode = 'orbit';
    this.ui.showHud(false);
    this.ui.hideDialogue();
    this.setCg(null);
    this.ui.showIntro(this.boy, this.level, this.levelIndex);
    audio.music('title');
    setTimeout(() => audio.voice(this.boy.lines.intro.voice), 350);
  }

  private startPlaying() {
    this.phase = 'playing';
    this.camMode = 'follow';
    this.levelStart = performance.now();
    this.ui.show('none');
    this.ui.showHud(true);
    this.ui.hudLevel(this.level.name);
    this.ui.buildHearts(this.targetBreak);
    this.ui.updateAttention(0);
    this.ui.score(0);
    this.ui.combo(0);
    this.ui.setHazardHits(0, this.level.difficulty.lives);
    this.ui.hint('WASD prowl · Space swipe · E meow · dodge hand & mouse');
    setTimeout(() => this.ui.hideHint(), 6200);
    audio.music('play');
    audio.meow('sassy');
    // snap camera behind cat
    const s = this.apartment.surface;
    this.camPos.set(this.apartment.cat.group.position.x * 0.7, s.topY + 1.45, s.cz + s.halfD + 2.25);
    this.camLook.set(0, s.topY + 0.02, s.cz);
  }

  private pause() {
    this.prePause = this.phase;
    this.phase = 'pause';
    this.ui.show('pause');
  }

  private resume() {
    this.phase = this.prePause === 'pause' ? 'playing' : this.prePause;
    this.ui.show('none');
  }

  // ── gameplay ─────────────────────────────────────────────────────────────

  private onShatter(ev: ShatterEvent) {
    const s = this.apartment.surface;
    this.broken++;
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = 2.2;
    const mult = Math.min(5, this.combo);
    const pts = Math.round(ev.body.points * (1 + (mult - 1) * 0.5));
    this.score += pts;

    // audio + fx
    const sfxName =
      ev.kind === 'glass' ? 'shatter-glass' : ev.kind === 'ceramic' ? 'shatter-ceramic' : ev.kind === 'grand' ? 'smash-grand' : ev.kind === 'metal' ? 'clatter-metal' : 'thud-soft';
    audio.sfx(sfxName, { pan: THREE.MathUtils.clamp(ev.pos.x / 3, -0.8, 0.8) });
    this.fpJolt = Math.min(1, this.fpJolt + 0.5);
    this.fpPunch.y += 0.012;
    if (ev.kind === 'soft') this.fx.softBurst(ev.pos);
    else this.fx.shatterBurst(ev.pos, ev.kind);

    // shard debris
    const shardCount = ev.kind === 'grand' ? 12 : ev.kind === 'soft' ? 0 : ev.kind === 'metal' ? 4 : 7;
    if (shardCount > 0) {
      const color = (ev.body.group.children[0] as THREE.Mesh)?.material
        ? ((ev.body.group.children[0] as THREE.Mesh).material as any).color?.getHex?.() ?? 0xcccccc
        : 0xcccccc;
      this.apartment.physics.shards.spawn(
        ev.pos,
        new THREE.Vector3((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2),
        color,
        shardCount,
        ev.kind === 'grand' ? 0.05 : 0.035,
        2.4,
      );
    }

    // ui
    this.ui.score(this.score);
    this.ui.combo(mult);
    this.ui.comboPop(pts, mult);
    this.ui.updateAttention(this.broken / Math.max(1, this.targetBreak));
    if (Math.random() < 0.3) this.ui.hint(PUSH_HINTS[Math.floor(Math.random() * PUSH_HINTS.length)]);

    // boyfriend notices
    const pct = this.broken / Math.max(1, this.targetBreak);
    const stages = [0.22, 0.5, 0.78];
    if (this.barkStage < stages.length && pct >= stages[this.barkStage]) {
      const line = this.boy.lines.barks[this.barkStage];
      this.barkStage++;
      this.ui.bark(this.boy, line.text, 4.2);
      audio.voice(line.voice);
      this.apartment.boyfriend?.react();
    }
    this.apartment.boyfriend?.lookAt(ev.pos.clone().setY(s.topY + 0.2));
    setTimeout(() => {
      if (this.phase === 'playing') this.apartment.boyfriend?.lookAt(null);
    }, 2600);

    // last shatterable object — dramatic slow-mo, then cutscene
    if (this.broken >= this.targetBreak) {
      this.slowmoT = 1.1;
      this.hazards.clear();
      audio.sfx('success');
      setTimeout(() => this.startCinematic(), 1000);
    }
  }

  private updatePlaying(dt: number) {
    const cat = this.apartment.cat;
    const s = this.apartment.surface;
    this.pushCooldown = Math.max(0, this.pushCooldown - dt);

    // movement
    let axes = this.input.moveAxes();
    let push = (this.input.pressed('Space') || this.input.pointerPressed()) && this.pushCooldown <= 0;
    let meow = this.input.pressed('KeyE');

    // integrate knockback/tumble from the previous frame first — while rolling,
    // input is ignored (she's airborne, not steering)
    const rolling = this.apartment.cat.updateKnock(dt);
    if (rolling) {
      axes = { x: 0, z: 0 };
      push = false;
      meow = false;
    }

    if (this.autopilot) {
      const auto = this.autoInput();
      axes = auto.axes;
      push = auto.push && this.pushCooldown <= 0;
    }

    const speed = this.input.sprint ? 2.2 : 1.35;
    // Autopilot already emits world XZ toward props. Player WASD + stick
    // share camera-local axes and must go through the same camera basis.
    const worldAxes = this.autopilot ? axes : this.playerWorldAxes(axes);
    const desired = { x: worldAxes.x * speed, z: worldAxes.z * speed };
    const stepped = stepProwl(dt, this.catVel, cat.yaw, desired);
    this.catVel.set(stepped.x, 0, stepped.z);
    cat.yaw = stepped.yaw;
    cat.yawRate = stepped.yawRate;
    cat.group.position.addScaledVector(this.catVel, dt);

    // clamp to counter top
    const m = 0.14;
    cat.group.position.x = THREE.MathUtils.clamp(cat.group.position.x, s.cx - s.halfW + m, s.cx + s.halfW - m);
    cat.group.position.z = THREE.MathUtils.clamp(cat.group.position.z, s.cz - s.halfD + m, s.cz + s.halfD - m);
    cat.group.position.y = s.topY;

    const spd = this.catVel.length();
    cat.speed = spd / 1.5;

    // body bump — much gentler; can't clear the table by jogging
    const catPos = cat.group.position;
    for (const b of this.apartment.physics.bodies) {
      if (b.state === 'gone' || b.state === 'falling' || b.immovable) continue;
      const dx = b.pos.x - catPos.x;
      const dz = b.pos.z - catPos.z;
      const dist = Math.hypot(dx, dz);
      const reach = b.radiusXZ + 0.14;
      if (dist < reach && spd > 0.45) {
        const dir = new THREE.Vector3(dx / (dist || 1), 0, dz / (dist || 1));
        this.apartment.physics.kick(b, dir, 0.35 * spd);
      }
    }

    // committed paw swipe — contact-based, not a delayed teleport impulse
    if (push) {
      this.pushCooldown = 0.42;
      this.swipeT = 0.42;
      cat.push();
      audio.sfx('whoosh');
      this.swipeHit = false;
      this.swipeBlocked = false;
      if (this.fpCam) {
        this.buildFpPaw();
        this.fpPawT = 0.42;
      }
    }

    // while the paw is out, anything it touches gets a continuous shove whose
    // strength follows the swipe arc (wind-up → contact → follow-through)
    if (this.swipeT > 0) {
      const prev = this.swipeT;
      this.swipeT = Math.max(0, this.swipeT - dt);
      const u = 1 - this.swipeT / 0.42; // 0→1 over the swipe
      // contact phase: 0.18–0.62 of the arc, peak force mid-swing
      if (u > 0.16 && u < 0.66) {
        const phase = Math.sin(((u - 0.16) / 0.5) * Math.PI); // 0→1→0
        const facing = new THREE.Vector3(Math.sin(cat.yaw), 0, Math.cos(cat.yaw));
        // paw tip sweeps out ahead of the body
        const pawReach = 0.42 + 0.18 * phase;
        for (const b of this.apartment.physics.bodies) {
          if (b.state === 'gone' || b.state === 'falling') continue;
          const to = new THREE.Vector3().subVectors(b.pos, catPos);
          to.y = 0;
          const dist = to.length();
          if (dist > pawReach + b.radiusXZ) continue;
          const dir = to.clone().normalize();
          if (dir.dot(facing) < 0.2) continue; // behind the paw plane
          if (b.immovable) {
            this.swipeBlocked = true;
            continue;
          }
          this.apartment.physics.contactShove(b, facing.clone().add(dir.multiplyScalar(0.3)).normalize(), phase, dt);
          this.swipeHit = true;
        }
        // paw tip position for the FP camera / future FX
        this.pawTip.set(
          catPos.x + facing.x * pawReach,
          s.topY + 0.16 + 0.05 * phase,
          catPos.z + facing.z * pawReach,
        );
      }
      if (this.swipeT === 0 && prev > 0) {
        // swipe finished — resolve feedback once
        if (this.swipeBlocked && !this.swipeHit) {
          audio.sfx('thud-soft', { vol: 0.45 });
          this.ui.hint('Solid. Try something lighter.');
          // heavy immovable shoves back — weight goes both ways
          this.catVel.multiplyScalar(-0.25);
          this.fpPunch.z -= 0.03;
        } else if (!this.swipeHit && Math.random() < 0.4) {
          audio.meow('cute');
        }
      }
    }

    // date clock: clear the surface before he loses interest in the counter
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.ui.setTimeLeft(this.timeLeft, this.level.difficulty.timeLimit);
    if (this.timeLeft <= 0) {
      this.failReason = 'timeout';
      this.startFail();
      return;
    }

    // hazards: Heather's hand + mouse
    const hazardHit = this.hazards.update(dt, catPos, true);
    if (hazardHit) {
      this.hazardHits++;
      this.ui.setHazardHits(this.hazardHits, this.level.difficulty.lives);
      cat.hitReact?.();
      audio.meow('sassy');
      audio.sfx('thud-soft', { vol: 0.55 });
      this.fpJolt = 1;
      this.fpPunch.set((Math.random() - 0.5) * 0.05, 0.03, -0.05);
      // real knockback: she gets shoved away and tumbles, not teleported
      const away = new THREE.Vector3(catPos.x - (hazardHit === 'hand' ? 0 : catPos.x * 0.2), 0, catPos.z + 0.6);
      if (hazardHit === 'hand') away.set(catPos.x - 0, 0, 0.9); // hand sweeps from above/front
      this.apartment.cat.knockback(away.normalize(), 1.6);
      this.catVel.multiplyScalar(0.2);
      this.fx.heartBurst(catPos.clone().add(new THREE.Vector3(0, 0.35, 0)), 2, 0.15);
      this.shakeRot.z = (Math.random() - 0.5) * 0.08;
      if (hazardHit === 'hand') this.ui.hint("Heather's hand!");
      else this.ui.hint('Mouse bite!');
      if (this.hazardHits >= this.level.difficulty.lives) {
        this.failReason = hazardHit;
        this.startFail();
        return;
      }
    }

    // meow
    this.meowCooldown -= dt;
    if (meow && this.meowCooldown <= 0) {
      this.meowCooldown = 1.2;
      audio.meow(Math.random() < 0.5 ? 'cute' : 'sassy');
      this.apartment.cat.meowAnim?.();
      this.fx.heartBurst(catPos.clone().add(new THREE.Vector3(0, 0.4, 0)), 3, 0.2);
      audio.sfx('heart-pop', { vol: 0.5 });
      this.apartment.boyfriend?.lookAt(catPos.clone());
      this.apartment.boyfriend?.react();
      setTimeout(() => {
        if (this.phase === 'playing') this.apartment.boyfriend?.lookAt(null);
      }, 2000);
    }

    // combo decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.ui.combo(0);
      }
    }

    // first-person camera state (head bob + swipe kick)
    this.fpBobT += dt * (2.5 + spd * 5.5);
    if (push) {
      this.fpFovKick = Math.max(this.fpFovKick, 3.2);
      this.fpPunch.z += 0.045;
      this.fpPunch.y += 0.02;
    }

    this.apartment.physics.update(dt);

    if (!this.fpCam) {
      // follow camera
      const cx = catPos.x * 0.72;
      const desired = new THREE.Vector3(cx, s.topY + 1.45, s.cz + s.halfD + 2.25);
      this.camPos.lerp(desired, 1 - Math.exp(-3.2 * dt));
      const look = new THREE.Vector3(catPos.x * 0.8, s.topY + 0.02, catPos.z * 0.5 + s.cz * 0.5);
      this.camLook.lerp(look, 1 - Math.exp(-5 * dt));
    }
  }

  /** Build a chunky first-person paw (cream fur + pink beans) parented to the camera. */
  private buildFpPaw() {
    if (this.fpPaw) return;
    const g = new THREE.Group();
    const furMat = new THREE.MeshToonNodeMaterial({ color: 0xecd2ac, gradientMap: null as any });
    furMat.gradientMap = toonGradient();
    const beanMat = new THREE.MeshToonNodeMaterial({ color: 0xf0a0bc, gradientMap: toonGradient() });
    // forearm
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 10), furMat);
    arm.rotation.x = Math.PI / 2;
    arm.position.z = -0.16;
    g.add(arm);
    // paw proper — squashed sphere with toe beans
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), furMat);
    paw.scale.set(1.15, 0.62, 1.0);
    g.add(paw);
    for (let i = 0; i < 3; i++) {
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), beanMat);
      toe.position.set((i - 1) * 0.042, -0.032, 0.055);
      g.add(toe);
    }
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), beanMat);
    pad.scale.set(1.3, 0.5, 1.0);
    pad.position.set(0, -0.04, 0.005);
    g.add(pad);
    g.traverse((o) => ((o as any).frustumCulled = false));
    g.visible = false;
    this.fpPaw = g;
    this.engine.camera.add(g);
    this.engine.scene.add(this.engine.camera); // camera must be in-graph for children to render
    this.fpPawT = -1;
  }

  /** Animate the FP paw sweep: rest low-right → wind-up → arc across view → settle. */
  private updateFpPaw(dt: number) {
    if (!this.fpPaw) return;
    this.fpPaw.visible = this.fpCam && this.phase === 'playing' && this.fpPawT >= 0;
    if (!this.fpPaw.visible) {
      if (this.fpCam && this.phase !== 'playing') this.fpPawT = -1;
      return;
    }
    const u = Math.max(0, 1 - this.fpPawT / 0.42); // same arc timing as the swipe
    let reach: number, side: number, lift: number, roll: number;
    if (u < 0.25) {
      const k = u / 0.25; // wind-up: pull right and down
      reach = 0.34 - 0.06 * k;
      side = 0.30 + 0.08 * k;
      lift = -0.16 - 0.04 * k;
      roll = 0.35 * k;
    } else if (u < 0.7) {
      const k = (u - 0.25) / 0.45; // commit: arc left across the view
      const e = Math.sin(k * Math.PI);
      reach = 0.28 + 0.24 * e;
      side = 0.38 - 0.52 * k;
      lift = -0.20 + 0.13 * e;
      roll = 0.35 - 0.85 * k;
    } else {
      const k = (u - 0.7) / 0.3; // recover back to rest
      reach = 0.52 - 0.18 * k;
      side = -0.14 + 0.44 * k;
      lift = -0.07 - 0.09 * k;
      roll = -0.5 + 0.5 * k;
    }
    this.fpPaw.position.set(side, lift, -reach);
    this.fpPaw.rotation.set(0.15, side * 0.5, roll);
    void dt;
  }

  /** Position the camera between Suki's ears, facing where she faces. */
  private updateFirstPersonCam(dt: number) {
    const cat = this.apartment.cat;
    const p = cat.group.position;
    const yaw = cat.yaw;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // eye height above her feet origin — GLB scale accounted; head sits ~0.30 up
    const eye = p.y + 0.31;

    // head bob: gentle vertical sway while walking, still breathing when idle
    const moving = this.catVel.lengthSq() > 0.02;
    const bob = moving ? Math.abs(Math.sin(this.fpBobT)) * 0.016 : Math.sin(this.clock.elapsedTime * 1.8) * 0.004;
    // slight lateral roll-sway with the gait
    const sway = moving ? Math.sin(this.fpBobT * 0.5) * 0.010 : 0;

    this.camPos.set(p.x - sin * 0.05, eye + bob, p.z - cos * 0.05); // tiny pullback so muzzle doesn't clip
    this.camLook.set(
      p.x + sin * 1.4,
      eye + bob * 0.4 - 0.06,
      p.z + cos * 1.4,
    );

    // impact jolt / punch decay
    this.fpJolt = Math.max(0, this.fpJolt - dt * 4);
    this.fpPunch.multiplyScalar(Math.exp(-7 * dt));
    this.fpFovKick = THREE.MathUtils.damp(this.fpFovKick, 0, 6, dt);

    const cam = this.engine.camera;
    cam.position.copy(this.camPos).add(this.fpPunch);
    cam.lookAt(this.camLook);
    cam.rotation.z += sway + (Math.random() - 0.5) * 0.01 * this.fpJolt;
    cam.fov = 62 + this.fpFovKick + (moving ? Math.min(4, this.catVel.length() * 1.6) : 0);
    cam.updateProjectionMatrix();
  }

  /**
   * Map camera-local WASD / stick axes onto the live camera look.
   * W / stick-forward (`axes.z < 0`) walks along getWorldDirection flattened
   * to XZ — into the lens, which in first-person is also Suki's facing.
   */
  private playerWorldAxes(axes: { x: number; z: number }): { x: number; z: number } {
    if (axes.x === 0 && axes.z === 0) return axes;
    const cam = this.engine.camera;
    cam.updateMatrixWorld();
    cam.getWorldDirection(this.lookDir);
    return cameraRelativeMove(axes, lookToCamDir(this.lookDir, this.apartment.cat.yaw));
  }

  /** dumb-but-effective AI cat for headless testing */
  private autoInput(): { axes: { x: number; z: number }; push: boolean } {
    const catPos = this.apartment.cat.group.position;
    // dodge hand/mouse when close
    // (simple flee: if many hazard hits already, still play but slower)
    let best: { d: number; x: number; z: number } | null = null;
    for (const b of this.apartment.physics.bodies) {
      if (b.state === 'gone' || b.state === 'falling' || b.immovable) continue;
      const d = Math.hypot(b.pos.x - catPos.x, b.pos.z - catPos.z);
      if (!best || d < best.d) best = { d, x: b.pos.x, z: b.pos.z };
    }
    if (!best) return { axes: { x: 0, z: 0 }, push: false };
    // aim slightly past the prop toward the nearest edge
    const s = this.apartment.surface;
    const toEdgeX = s.cx + s.halfW - best.x < best.x - (s.cx - s.halfW) ? 1 : -1;
    const toEdgeZ = s.cz + s.halfD - best.z < best.z - (s.cz - s.halfD) ? 1 : -1;
    const shoveDir = Math.abs(toEdgeX) ? { x: toEdgeX * 0.7, z: toEdgeZ * 0.7 } : { x: 1, z: 0 };
    const target = { x: best.x - shoveDir.x * 0.2, z: best.z - shoveDir.z * 0.2 };
    const dx = target.x - catPos.x;
    const dz = target.z - catPos.z;
    const dist = Math.hypot(dx, dz);
    if (best.d < 0.42) return { axes: { x: shoveDir.x, z: shoveDir.z }, push: true };
    return { axes: { x: dx / (dist || 1), z: dz / (dist || 1) }, push: false };
  }

  // ── cutscene ─────────────────────────────────────────────────────────────

  private failPending = false;

  private startFail() {
    if (this.phase !== 'playing') return;
    this.haltProwl();
    this.hazards.clear();
    this.ui.showHud(false);
    this.ui.hideHint();
    const lines = FAIL_LINES[this.failReason] ?? FAIL_LINES.default;
    this.dlgLines = [
      { speaker: 'boy', text: lines.boy },
      { speaker: 'suki', text: lines.suki },
      {
        speaker: 'narrator',
        text: `${lines.reason} ${this.boy.name} scoops you off the surface like a tiny scandal.`,
      },
    ];
    this.dlgIndex = 0;
    this.failPending = true;
    this.apartment.boyfriend?.react();
    this.apartment.boyfriend?.lookAt(this.apartment.cat.group.position.clone());
    audio.music('cuddle');
    audio.meow('sassy');
    // short "punish" dialogue then fail card
    this.phase = 'dialogue';
    this.showDialogueLine();
  }

  private startCinematic() {
    if (this.phase !== 'playing') return;
    this.haltProwl();
    this.phase = 'cinematic';
    this.hazards.clear();
    this.camMode = 'cine';
    this.cineT = 0;
    this.cineFrom.copy(this.camPos);
    this.cineLookFrom.copy(this.camLook);
    const bf = this.apartment.boyfriend!;
    this.boyFrom.copy(bf.group.position);
    this.catFrom.copy(this.apartment.cat.group.position);
    this.cuddlePoint.copy(this.apartment.cuddleSpot);
    bf.lookAt(this.apartment.cat.group.position.clone());
    this.ui.showHud(false);
    this.ui.hideHint();
    audio.music('cuddle');
  }

  private updateCinematic(dt: number) {
    this.cineT += dt;
    const t = this.cineT;
    const bf = this.apartment.boyfriend!;
    const cat = this.apartment.cat;
    const s = this.apartment.surface;

    const ease = (x: number) => x * x * (3 - 2 * x);
    const seg = (a: number, b: number) => ease(THREE.MathUtils.clamp((t - a) / (b - a), 0, 1));

    // boyfriend: stand (0.2–1.0), walk (1.0–2.6), kneel (2.6–3.3), cuddle (3.6+)
    if (t < 0.2) bf.setPose('sit', 0.3);
    if (t >= 0.2 && t < 1.0 && this.cineT - dt < 0.2) bf.setPose('stand', 0.7);
    if (t >= 1.0 && this.cineT - dt < 1.0) bf.setPose('walk', 0.4);
    if (t >= 1.0 && t < 2.6) {
      const k = seg(1.0, 2.6);
      bf.group.position.lerpVectors(this.boyFrom, this.cuddlePoint, k);
      bf.group.rotation.y = Math.atan2(cat.group.position.x - bf.group.position.x, cat.group.position.z - bf.group.position.z);
    }
    if (t >= 2.6 && this.cineT - dt < 2.6) bf.setPose('kneel', 0.7);
    if (t >= 3.4 && this.cineT - dt < 3.4) {
      bf.setPose('cuddle', 0.8);
      bf.lookAt(cat.group.position.clone().add(new THREE.Vector3(0, 0.25, 0)));
      this.apartment.cat.cuddlePose?.();
    }

    // cat: hop to the counter edge nearest him (3.0–3.8), then face him
    if (t >= 3.0) {
      const k = seg(3.0, 3.8);
      const edge = new THREE.Vector3(this.cuddlePoint.x * 0.6, s.topY, s.cz + s.halfD - 0.12);
      cat.group.position.lerpVectors(this.catFrom, edge, k);
      const d = new THREE.Vector3().subVectors(bf.group.position, cat.group.position);
      cat.yaw = Math.atan2(d.x, d.z);
      cat.yawRate = 0;
      cat.speed = 0;
    }

    // camera keyframes
    const camKeys = [
      { t: 0, pos: this.cineFrom, look: this.cineLookFrom },
      { t: 1.2, pos: new THREE.Vector3(-2.6, 2.0, 3.3), look: new THREE.Vector3(-1.9, 1.0, -1.5) },
      { t: 2.8, pos: new THREE.Vector3(-1.6, 1.5, 3.0), look: new THREE.Vector3(0.1, 0.9, 1.2) },
      { t: 4.0, pos: new THREE.Vector3(1.95, 1.55, 3.7), look: new THREE.Vector3(0.4, 0.62, 1.45) },
    ];
    let a = camKeys[0];
    let b = camKeys[camKeys.length - 1];
    for (let i = 0; i < camKeys.length - 1; i++) {
      if (t >= camKeys[i].t && t <= camKeys[i + 1].t) {
        a = camKeys[i];
        b = camKeys[i + 1];
        break;
      }
    }
    const span = Math.max(0.001, b.t - a.t);
    const k = seg(a.t, a.t + span);
    this.camPos.lerpVectors(a.pos, b.pos, k);
    this.camLook.lerpVectors(a.look, b.look, k);

    // hearts during cuddle
    if (t > 3.5 && Math.random() < dt * 6) {
      const p = new THREE.Vector3().lerpVectors(bf.group.position, cat.group.position, 0.5);
      p.y = Math.max(bf.group.position.y + 1.0, s.topY + 0.5);
      this.fx.heartBurst(p, 2, 0.5);
      if (Math.random() < 0.3) audio.sfx('heart-pop', { vol: 0.4 });
    }
    if (t > 3.6 && this.cineT - dt <= 3.6) audio.sfx('purr', { vol: 0.8 });

    // → CG dialogue
    if (t >= 4.6) {
      this.phase = 'dialogue';
      this.dlgIndex = 0;
      this.dlgLines = this.boy.lines.cutscene;
      this.setCg(this.boy.cutsceneImg);
      this.showDialogueLine();
    }
  }

  private setCg(url: string | null) {
    const el = document.getElementById('cg-overlay')!;
    if (url) {
      el.style.backgroundImage = `url('${url}')`;
      el.classList.add('visible');
    } else {
      el.classList.remove('visible');
    }
  }

  private showDialogueLine() {
    const line = this.dlgLines[this.dlgIndex];
    this.ui.showDialogue(line, this.boy);
    if (line.voice) audio.voice(line.voice);
    if (line.speaker === 'suki') audio.meow(line.text.startsWith('Purr') ? 'triumph' : 'sassy');
  }

  private advanceDialogue() {
    if (this.phase !== 'dialogue') return;
    const line = this.dlgLines[this.dlgIndex];
    if (this.ui.finishTypewriter(line)) return;
    audio.sfx('ui-pop', { vol: 0.5 });
    this.dlgIndex++;
    if (this.dlgIndex >= this.dlgLines.length) {
      this.ui.hideDialogue();
      if (this.failPending) {
        this.failPending = false;
        this.showFail();
      } else {
        this.showComplete();
      }
    } else {
      this.showDialogueLine();
    }
  }

  private showFail() {
    this.phase = 'fail';
    const secs = Math.round((performance.now() - this.levelStart) / 1000);
    const lines = FAIL_LINES[this.failReason] ?? FAIL_LINES.default;
    this.ui.showFail(this.boy, this.level, lines.reason, this.hazardHits, this.broken, secs);
    audio.meow('sassy');
  }

  private showComplete() {
    this.phase = 'complete';
    const secs = Math.round((performance.now() - this.levelStart) / 1000);
    const [a, sRank, sPlus] = this.level.rankScores;
    const rank = this.score >= sPlus ? 'S+' : this.score >= sRank ? 'S' : this.score >= a ? 'A' : 'B';
    this.save.recordScore(this.level.id, this.levelIndex, this.score, rank);
    const isFinal = this.levelIndex >= LEVELS.length - 1;
    this.ui.showComplete(this.boy, this.level, this.score, rank, this.broken, secs, isFinal);
    this.ui.refreshTitleStartButton(true);
    audio.sfx('meow-triumph');
  }

  // ── frame loop ───────────────────────────────────────────────────────────

  private loop = () => {
    requestAnimationFrame(this.loop);
    if (!this.engine.renderer) return;
    const rawDt = Math.min(this.clock.getDelta(), 0.05);

    // slow-mo easing
    if (this.slowmoT > 0) {
      this.slowmoT -= rawDt;
      this.timeScale += (0.22 - this.timeScale) * Math.min(1, rawDt * 10);
    } else {
      this.timeScale += (1 - this.timeScale) * Math.min(1, rawDt * 4);
    }
    const dt = rawDt * this.timeScale;
    const t = this.clock.elapsedTime;

    if (this.phase === 'playing') this.updatePlaying(dt);
    else if (this.phase === 'cinematic') this.updateCinematic(dt);
    else if (this.phase !== 'pause' && this.phase !== 'loading') {
      // idle sim so the room stays alive behind menus
      this.apartment.physics.update(dt * 0.5);
    }

    if (this.phase !== 'loading' && this.phase !== 'pause') {
      this.apartment.update(dt, t, this.engine.camera);
      this.fx.update(dt, this.engine.camera);
      this.ui.update(rawDt);
    }

    // camera
    const cam = this.engine.camera;
    if (this.camMode === 'follow' && this.fpCam && this.phase === 'playing') {
      this.updateFirstPersonCam(rawDt);
      this.apartment.cat.setVisible(false);
      if (this.fpPawT >= 0) {
        this.fpPawT -= rawDt;
        this.updateFpPaw(rawDt);
      } else if (this.fpPaw) {
        this.fpPaw.visible = false;
      }
    } else {
      this.apartment.cat.setVisible(true);
      if (this.camMode === 'orbit') {
        const s = this.apartment.surface;
        const a = t * 0.14;
        const target = new THREE.Vector3(Math.sin(a) * 0.7, s.topY + 1.5, s.cz + s.halfD + 2.6 + Math.cos(a * 0.7) * 0.4);
        this.camPos.lerp(target, 1 - Math.exp(-1.5 * rawDt));
        this.camLook.lerp(new THREE.Vector3(0, s.topY + 0.2, s.cz), 1 - Math.exp(-2 * rawDt));
      }
      cam.position.copy(this.camPos);
      this.fx.applyShake(rawDt, cam.position, this.shakeRot);
      cam.lookAt(this.camLook);
      cam.rotation.z += this.shakeRot.z;
      if (Math.abs(cam.fov - (this.fpCam ? 62 : 40)) > 0.01) {
        // restore projection after FP mode exits
        cam.fov = 40;
        cam.updateProjectionMatrix();
      }
    }

    void this.engine.render();
  };

  // test hooks — used by tools/playthrough.mjs + indie-sprint play gate
  get state() {
    const cat = this.apartment?.cat?.group?.position;
    const bodies = this.apartment?.physics?.bodies ?? [];
    const bodySummary = bodies.map((b) => ({
      state: b.state,
      x: +b.pos.x.toFixed(3),
      y: +b.pos.y.toFixed(3),
      z: +b.pos.z.toFixed(3),
      speed: +Math.hypot(b.vel.x, b.vel.y, b.vel.z).toFixed(3),
    }));
    const elapsedMs =
      this.phase === 'playing' || this.phase === 'cinematic' || this.phase === 'dialogue' || this.phase === 'complete'
        ? Math.round(performance.now() - this.levelStart)
        : 0;
    return {
      phase: this.phase,
      level: this.levelIndex,
      levelId: this.level?.id ?? null,
      boyfriendId: this.boy?.id ?? null,
      score: this.score,
      broken: this.broken,
      total: this.level?.props.length ?? 0,
      remaining: bodies.filter((b) => b.state !== 'gone' && !b.immovable).length,
      targetBreak: this.targetBreak,
      hazardHits: this.hazardHits,
      hazardMax: this.level?.difficulty.lives ?? 0,
      timeLeft: +this.timeLeft.toFixed(1),
      elapsedMs,
      cat: cat
        ? { x: +cat.x.toFixed(3), y: +cat.y.toFixed(3), z: +cat.z.toFixed(3) }
        : null,
      bodies: bodySummary,
      webgpu: this.engine.usingWebGPU,
      autopilot: this.autopilot,
    };
  }

  debugStart(level: number) {
    this.showIntro(level);
    this.startPlaying();
  }

  debugBreakAll() {
    for (const b of this.apartment.physics.bodies) {
      if (b.state === 'gone') continue;
      const dir = new THREE.Vector3(b.pos.x >= 0 ? 1 : -1, 0, Math.random() - 0.5).normalize();
      this.apartment.physics.kick(b, dir, 4);
    }
  }
}
