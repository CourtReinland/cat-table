import * as THREE from 'three/webgpu';

const MAX_P = 400;

/** CPU-simulated point particles (sparkles / dust), one draw call per pool. */
class PointPool {
  points: THREE.Points;
  private pos: Float32Array;
  private vel: THREE.Vector3[] = [];
  private life: Float32Array;
  private maxLife: Float32Array;
  private gravity: number;
  private geo: THREE.BufferGeometry;
  private cursor = 0;

  constructor(scene: THREE.Scene, opts: { color: number; size: number; additive: boolean; gravity: number }) {
    this.pos = new Float32Array(MAX_P * 3).fill(-999);
    this.life = new Float32Array(MAX_P);
    this.maxLife = new Float32Array(MAX_P).fill(1);
    this.gravity = opts.gravity;
    for (let i = 0; i < MAX_P; i++) this.vel.push(new THREE.Vector3());
    this.geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(this.pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', attr);
    const mat = new THREE.PointsNodeMaterial({
      color: opts.color,
      size: opts.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(origin: THREE.Vector3, count: number, speed: number, life: number, up = 0.5) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_P;
      this.pos[i * 3] = origin.x + (Math.random() - 0.5) * 0.1;
      this.pos[i * 3 + 1] = origin.y + Math.random() * 0.06;
      this.pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.1;
      this.vel[i].set((Math.random() - 0.5) * speed, (Math.random() * 0.7 + up) * speed * 0.6, (Math.random() - 0.5) * speed);
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.7);
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -999;
        continue;
      }
      this.vel[i].y -= this.gravity * dt;
      this.pos[i * 3] += this.vel[i].x * dt;
      this.pos[i * 3 + 1] += this.vel[i].y * dt;
      this.pos[i * 3 + 2] += this.vel[i].z * dt;
      if (this.pos[i * 3 + 1] < 0.005) {
        this.pos[i * 3 + 1] = 0.005;
        this.vel[i].set(0, 0, 0);
      }
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

function heartTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = '52px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff6a9a';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ff9ec0';
  ctx.fillText('♥', 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const HEARTS = 24;

export class FX {
  sparkle!: PointPool;
  dust!: PointPool;
  hearts: { mesh: THREE.Mesh; life: number; max: number; vel: THREE.Vector3; wobble: number }[] = [];
  private trauma = 0;
  private shakeOffset = new THREE.Vector3();
  private heartTex = heartTexture();

  init(scene: THREE.Scene) {
    this.sparkle = new PointPool(scene, { color: 0xffe8b0, size: 0.03, additive: true, gravity: 3.5 });
    this.dust = new PointPool(scene, { color: 0x9a8f9a, size: 0.09, additive: false, gravity: 0.6 });

    for (let i = 0; i < HEARTS; i++) {
      const mat = new THREE.MeshBasicNodeMaterial({
        map: this.heartTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mat);
      m.visible = false;
      scene.add(m);
      this.hearts.push({ mesh: m, life: 0, max: 1, vel: new THREE.Vector3(), wobble: Math.random() * 6 });
    }
  }

  shatterBurst(pos: THREE.Vector3, kind: string) {
    const sparkleCount = kind === 'glass' || kind === 'grand' ? 26 : 10;
    const dustCount = kind === 'ceramic' ? 22 : kind === 'grand' ? 18 : 8;
    this.sparkle.burst(pos, sparkleCount, 2.2, 0.8, 0.9);
    this.dust.burst(pos, dustCount, 1.1, 1.4, 0.4);
    this.addTrauma(kind === 'grand' ? 0.55 : kind === 'metal' ? 0.22 : 0.3);
  }

  softBurst(pos: THREE.Vector3) {
    this.dust.burst(pos, 16, 1.0, 1.1, 0.5);
    this.addTrauma(0.12);
  }

  heartBurst(pos: THREE.Vector3, count = 6, spread = 0.25) {
    let spawned = 0;
    for (const h of this.hearts) {
      if (spawned >= count) break;
      if (h.life > 0) continue;
      h.life = h.max = 1.4 + Math.random() * 0.6;
      h.mesh.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.1, pos.z + (Math.random() - 0.5) * spread);
      h.vel.set((Math.random() - 0.5) * 0.15, 0.45 + Math.random() * 0.3, (Math.random() - 0.5) * 0.15);
      h.mesh.visible = true;
      spawned++;
    }
  }

  addTrauma(v: number) {
    this.trauma = Math.min(1, this.trauma + v);
  }

  /** camera shake offset, decays quadratically */
  applyShake(dt: number, target: THREE.Vector3, rotTarget: { z: number }) {
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const t2 = this.trauma * this.trauma;
    this.shakeOffset.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(t2 * 0.09);
    target.add(this.shakeOffset);
    rotTarget.z = (Math.random() - 0.5) * t2 * 0.05;
  }

  update(dt: number, camera: THREE.Camera) {
    this.sparkle?.update(dt);
    this.dust?.update(dt);
    for (const h of this.hearts) {
      if (h.life <= 0) continue;
      h.life -= dt;
      if (h.life <= 0) {
        h.mesh.visible = false;
        (h.mesh.material as any).opacity = 0;
        continue;
      }
      h.wobble += dt * 5;
      h.mesh.position.addScaledVector(h.vel, dt);
      h.mesh.position.x += Math.sin(h.wobble) * 0.12 * dt;
      h.mesh.quaternion.copy(camera.quaternion);
      const f = h.life / h.max;
      (h.mesh.material as any).opacity = Math.min(1, f * 3) * 0.95;
      const s = 0.8 + (1 - f) * 0.7;
      h.mesh.scale.setScalar(s);
    }
  }
}
