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
  LEVELS,
  NARRATOR,
  PUSH_HINTS,
  getBoyfriend,
  type BoyDef,
  type LevelDef,
  type Line,
} from '../data/content';
import type { ShatterEvent } from './Physics';

type Phase =
  | 'loading'
  | 'title'
  | 'intro'
  | 'playing'
  | 'cinematic'
  | 'dialogue'
  | 'complete'
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
  private catVel = new THREE.Vector3();
  private camMode: 'follow' | 'orbit' | 'cine' = 'orbit';
  private camPos = new THREE.Vector3(0, 2.2, 4.2);
  private camLook = new THREE.Vector3(0, 1, 0);
  private shakeRot = { z: 0 };

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
  }

  async init() {
    await this.engine.init();
    this.fx.init(this.engine.scene);
    this.ui.init(this.save);
    this.input.bindCanvas(this.canvas);
    this.bindUI();
    this.bindUnlock();

    // URL test hooks: ?auto=1&level=2&instant=1
    const q = new URLSearchParams(location.search);
    this.autopilot = q.get('auto') === '1';
    const lvl = Math.min(parseInt(q.get('level') ?? '0', 10) || 0, LEVELS.length - 1);

    this.phase = 'title';
    this.ui.show('title');
    this.ui.refreshTitleStartButton((this.save.data.unlocked ?? 0) > 0);
    this.loadLevel(lvl, false);
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
    this.ui.on('resume', () => this.resume());
    this.ui.on('restart', () => {
      audio.sfx('ui-pop');
      this.resume();
      this.showIntro(this.levelIndex);
    });
    this.ui.on('quitTitle', () => {
      audio.sfx('ui-pop');
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
    this.catVel.set(0, 0, 0);
    this.timeScale = 1;
    this.slowmoT = 0;
    if (showIntro) this.showIntroCard();
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
    this.ui.buildHearts(this.level.props.length);
    this.ui.updateAttention(0);
    this.ui.score(0);
    this.ui.combo(0);
    this.ui.hint('WASD prowl · Space shove · E meow · Shift sprint');
    setTimeout(() => this.ui.hideHint(), 5200);
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
    this.ui.updateAttention(this.broken / this.level.props.length);
    if (Math.random() < 0.3) this.ui.hint(PUSH_HINTS[Math.floor(Math.random() * PUSH_HINTS.length)]);

    // boyfriend notices
    const pct = this.broken / this.level.props.length;
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

    // last object — dramatic slow-mo, then cutscene
    if (this.broken >= this.level.props.length) {
      this.slowmoT = 1.1;
      audio.sfx('success');
      setTimeout(() => this.startCinematic(), 1000);
    }
  }

  private updatePlaying(dt: number) {
    const cat = this.apartment.cat;
    const s = this.apartment.surface;

    // movement
    let axes = this.input.moveAxes();
    let push = this.input.pressed('Space') || this.input.pointerPressed();
    let meow = this.input.pressed('KeyE');

    if (this.autopilot) {
      const auto = this.autoInput();
      axes = auto.axes;
      push = auto.push;
    }

    const speed = this.input.sprint ? 2.5 : 1.5;
    const targetVel = new THREE.Vector3(axes.x, 0, axes.z).multiplyScalar(speed);
    this.catVel.lerp(targetVel, 1 - Math.exp(-10 * dt));
    cat.group.position.addScaledVector(this.catVel, dt);

    // clamp to counter top
    const m = 0.14;
    cat.group.position.x = THREE.MathUtils.clamp(cat.group.position.x, s.cx - s.halfW + m, s.cx + s.halfW - m);
    cat.group.position.z = THREE.MathUtils.clamp(cat.group.position.z, s.cz - s.halfD + m, s.cz + s.halfD - m);
    cat.group.position.y = s.topY;

    const spd = this.catVel.length();
    cat.speed = spd / 1.5;
    if (spd > 0.15) {
      const targetYaw = Math.atan2(this.catVel.x, this.catVel.z);
      let d = targetYaw - cat.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      cat.yaw += d * Math.min(1, dt * 10);
    }

    // cat–prop contact (gentle body shove while walking)
    const catPos = cat.group.position;
    for (const b of this.apartment.physics.bodies) {
      if (b.state === 'gone' || b.state === 'falling') continue;
      const dx = b.pos.x - catPos.x;
      const dz = b.pos.z - catPos.z;
      const dist = Math.hypot(dx, dz);
      const reach = b.radiusXZ + 0.16;
      if (dist < reach && spd > 0.3) {
        const dir = new THREE.Vector3(dx / (dist || 1), 0, dz / (dist || 1));
        this.apartment.physics.kick(b, dir, 0.9 * spd);
        audio.sfx('whoosh', { vol: 0.3 });
      }
    }

    // paw swipe
    if (push) {
      cat.push();
      audio.sfx('whoosh');
      const facing = new THREE.Vector3(Math.sin(cat.yaw), 0, Math.cos(cat.yaw));
      let hit = false;
      for (const b of this.apartment.physics.bodies) {
        if (b.state === 'gone' || b.state === 'falling') continue;
        const to = new THREE.Vector3().subVectors(b.pos, catPos);
        to.y = 0;
        const dist = to.length();
        if (dist < 0.55 + b.radiusXZ && to.normalize().dot(facing) > 0.35) {
          this.apartment.physics.kick(b, facing.clone().add(to.multiplyScalar(0.4)).normalize(), 3.4);
          hit = true;
        }
      }
      if (!hit && Math.random() < 0.5) audio.meow('cute');
    }

    // meow
    this.meowCooldown -= dt;
    if (meow && this.meowCooldown <= 0) {
      this.meowCooldown = 1.2;
      audio.meow(Math.random() < 0.5 ? 'cute' : 'sassy');
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

    this.apartment.physics.update(dt);

    // follow camera
    const cx = catPos.x * 0.72;
    const desired = new THREE.Vector3(cx, s.topY + 1.45, s.cz + s.halfD + 2.25);
    this.camPos.lerp(desired, 1 - Math.exp(-3.2 * dt));
    const look = new THREE.Vector3(catPos.x * 0.8, s.topY + 0.02, catPos.z * 0.5 + s.cz * 0.5);
    this.camLook.lerp(look, 1 - Math.exp(-5 * dt));
  }

  /** dumb-but-effective AI cat for headless testing */
  private autoInput(): { axes: { x: number; z: number }; push: boolean } {
    const catPos = this.apartment.cat.group.position;
    let best: { d: number; x: number; z: number } | null = null;
    for (const b of this.apartment.physics.bodies) {
      if (b.state === 'gone' || b.state === 'falling') continue;
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

  private startCinematic() {
    if (this.phase !== 'playing') return;
    this.phase = 'cinematic';
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
    }

    // cat: hop to the counter edge nearest him (3.0–3.8), then face him
    if (t >= 3.0) {
      const k = seg(3.0, 3.8);
      const edge = new THREE.Vector3(this.cuddlePoint.x * 0.6, s.topY, s.cz + s.halfD - 0.12);
      cat.group.position.lerpVectors(this.catFrom, edge, k);
      const d = new THREE.Vector3().subVectors(bf.group.position, cat.group.position);
      cat.yaw = Math.atan2(d.x, d.z);
      cat.speed = 0;
    }

    // camera keyframes
    const camKeys = [
      { t: 0, pos: this.cineFrom, look: this.cineLookFrom },
      { t: 1.2, pos: new THREE.Vector3(-2.6, 2.0, 3.3), look: new THREE.Vector3(-1.9, 1.0, -1.5) },
      { t: 2.8, pos: new THREE.Vector3(-1.6, 1.5, 3.0), look: new THREE.Vector3(0.1, 0.9, 1.2) },
      { t: 4.0, pos: new THREE.Vector3(1.75, 1.45, 3.3), look: new THREE.Vector3(0.35, 0.7, 1.4) },
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
      this.showComplete();
    } else {
      this.showDialogueLine();
    }
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

    void this.engine.render();
  };

  // test hooks
  get state() {
    return {
      phase: this.phase,
      level: this.levelIndex,
      score: this.score,
      broken: this.broken,
      total: this.level?.props.length ?? 0,
      webgpu: this.engine.usingWebGPU,
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
