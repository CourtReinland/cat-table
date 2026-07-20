/**
 * refine-code pass for the img2threejs candelabra.
 * Replaces the generator's box fallbacks with the spec's real profiles:
 * lathed dome foot + baluster stem, S-curve tube arms (x2), cup/candle/flame x3.
 * Standalone module so it survives factory regeneration.
 */
import * as THREE from 'three/webgpu';

const lathe = (pts: [number, number][], seg = 24) =>
  new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function refineCandelabra(root: THREE.Group) {
  const rt = (root as any).userData?.sculptRuntime;
  if (!rt) return { flames: [] as THREE.Object3D[] };
  const { meshes, nodes } = rt as {
    meshes: Record<string, THREE.Mesh>;
    nodes: Record<string, THREE.Object3D>;
  };
  const brass = meshes['base_foot']?.material as THREE.Material;
  const wax = meshes['candle']?.material as THREE.Material;
  const flames: THREE.Object3D[] = [];

  // root proxy: hide (assembly node, not a visible part)
  if (meshes['root']) meshes['root'].visible = false;

  // ── domed foot with embossed rings ──
  if (meshes['base_foot']) {
    meshes['base_foot'].geometry = lathe([
      [0.001, 0.0], [0.082, 0.0], [0.096, 0.006], [0.097, 0.012], [0.082, 0.024], [0.058, 0.035], [0.032, 0.043], [0.026, 0.045],
    ]);
    meshes['base_foot'].position.set(0, 0, 0);
    for (const [r, y] of [[0.075, 0.016], [0.09, 0.008]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0032, 8, 32), brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      ring.castShadow = true;
      nodes['base_foot']?.add(ring);
    }
  }

  // ── baluster stem ──
  if (meshes['stem']) {
    meshes['stem'].geometry = lathe([
      [0.019, 0.0], [0.024, 0.008], [0.014, 0.03], [0.0125, 0.055], [0.028, 0.085], [0.03, 0.092], [0.019, 0.106], [0.011, 0.12], [0.015, 0.133], [0.012, 0.14],
    ]);
    meshes['stem'].position.set(0, 0.045, 0);
  }

  // ── S-curve arms ×2 ──
  if (meshes['arm']) {
    // the generator's pivot carries an attachment quaternion — reset it
    if (nodes['arm']) {
      nodes['arm'].rotation.set(0, 0, 0);
      nodes['arm'].position.set(0, 0, 0);
    }
    const mkArm = (sgn: number) => {
      const curve = new THREE.CatmullRomCurve3([
        v(0, 0, 0),
        v(sgn * 0.022, 0.016, 0),
        v(sgn * 0.055, 0.03, 0),
        v(sgn * 0.088, 0.03, 0),
        v(sgn * 0.108, 0.045, 0),
        v(sgn * 0.11, 0.055, 0),
      ]);
      const geo = new THREE.TubeGeometry(curve, 24, 0.0065, 8);
      const mesh = new THREE.Mesh(geo, brass);
      mesh.position.set(0, 0.175, 0);
      mesh.castShadow = true;
      // leaf tip flare
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.022, 8), brass);
      tip.position.set(sgn * 0.11, 0.175 + 0.058, 0);
      tip.castShadow = true;
      return [mesh, tip] as const;
    };
    const [armR, tipR] = mkArm(1);
    meshes['arm'].geometry = armR.geometry;
    meshes['arm'].position.copy(armR.position);
    meshes['arm'].quaternion.identity();
    meshes['arm'].rotation.set(0, 0, 0);
    nodes['arm']?.add(tipR);
    const [armL, tipL] = mkArm(-1);
    nodes['root']?.add(armL, tipL);
    meshes['arm_left'] = armL;
  }

  // ── cups ×3 (lathe + bobeche pan) ──
  const cupProfile = lathe([
    [0.011, 0.0], [0.016, 0.002], [0.02, 0.008], [0.021, 0.014], [0.017, 0.02], [0.019, 0.024], [0.023, 0.026],
  ]);
  const panGeo = lathe([
    [0.001, 0.02], [0.02, 0.022], [0.028, 0.026], [0.027, 0.029], [0.02, 0.03],
  ]);
  const cupPlacements: [number, number, number][] = [
    [0, 0.232, 0],
    [0.11, 0.23, 0],
    [-0.11, 0.23, 0],
  ];
  const cupIds = ['cup', 'cup_left', 'cup_right'];
  if (meshes['cup']) {
    meshes['cup'].geometry = cupProfile;
    meshes['cup'].position.set(...cupPlacements[0]);
    const pan = new THREE.Mesh(panGeo, brass);
    pan.position.set(...cupPlacements[0]);
    pan.castShadow = true;
    nodes['root']?.add(pan);
    for (let i = 1; i < 3; i++) {
      const c = meshes['cup'].clone();
      c.position.set(...cupPlacements[i]);
      nodes['root']?.add(c);
      meshes[cupIds[i]] = c;
      const p = pan.clone();
      p.position.set(...cupPlacements[i]);
      nodes['root']?.add(p);
    }
  }

  // ── candles ×3 (center tallest) + wicks ──
  const candleDefs = [
    { h: 0.085, p: [0, 0.252, 0] as const },
    { h: 0.068, p: [0.11, 0.25, 0] as const },
    { h: 0.068, p: [-0.11, 0.25, 0] as const },
  ];
  const candleIds = ['candle', 'candle_left', 'candle_right'];
  if (meshes['candle']) {
    candleDefs.forEach((def, i) => {
      const geo = new THREE.CylinderGeometry(0.009, 0.0095, def.h, 14);
      let mesh: THREE.Mesh;
      if (i === 0) {
        mesh = meshes['candle'];
        mesh.geometry = geo;
      } else {
        mesh = new THREE.Mesh(geo, wax);
        mesh.castShadow = true;
        nodes['root']?.add(mesh);
        meshes[candleIds[i]] = mesh;
      }
      mesh.position.set(def.p[0], def.p[1] + def.h / 2, def.p[2]);
      // blackened wick
      const wick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0015, 0.0015, 0.007, 6),
        new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 }),
      );
      wick.position.set(def.p[0], def.p[1] + def.h + 0.003, def.p[2]);
      nodes['root']?.add(wick);
    });
  }

  // ── flames ×3 (emissive teardrops) ──
  const flameMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc46a,
    emissive: 0xffa030,
    emissiveIntensity: 2.4,
    roughness: 0.5,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const flameGeo = new THREE.SphereGeometry(0.0075, 10, 10);
  flameGeo.scale(1, 2.1, 1);
  candleDefs.forEach((def, i) => {
    const mesh = new THREE.Mesh(flameGeo.clone(), flameMaterial);
    mesh.name = `flame_${i}`;
    mesh.position.set(def.p[0], def.p[1] + def.h + 0.016, def.p[2]);
    mesh.castShadow = false;
    nodes['root']?.add(mesh);
    flames.push(mesh);
  });
  // hide the generator's fallback flame mesh if it exists
  if (meshes['flame']) meshes['flame'].visible = false;

  return { flames };
}
