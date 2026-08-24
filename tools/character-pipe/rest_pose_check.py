#!/usr/bin/env python3
"""Blender rest-pose inspector.

FAIL sit: ears-high + tucked haunches + tail on ground.
PASS stand: four paws down, backline high.

Usage:
  blender --background --python rest_pose_check.py -- /path/to.glb
  blender --background --python rest_pose_check.py -- --glb PATH --json PATH --thumb PATH

Exit 0 = STAND PASS, 2 = SIT FAIL, 1 = error / unknown.
"""
from __future__ import annotations

import json
import math
import os
import sys

import bpy
from mathutils import Vector


def argv_after_dd():
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return []


def parse():
    args = argv_after_dd()
    glb = None
    js = None
    thumb = None
    i = 0
    positional = []
    while i < len(args):
        if args[i] == "--glb" and i + 1 < len(args):
            glb = args[i + 1]; i += 2; continue
        if args[i] == "--json" and i + 1 < len(args):
            js = args[i + 1]; i += 2; continue
        if args[i] == "--thumb" and i + 1 < len(args):
            thumb = args[i + 1]; i += 2; continue
        if not args[i].startswith("-"):
            positional.append(args[i])
        i += 1
    if not glb and positional:
        glb = positional[0]
    return glb, js, thumb


def mesh_world_coords(obj):
    mw = obj.matrix_world
    return [mw @ v.co for v in obj.data.vertices]


def bbox_of(coords):
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    zs = [c.z for c in coords]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def cluster_xy(pts, cell):
    buckets = {}
    for p in pts:
        key = (int(math.floor(p.x / cell)), int(math.floor(p.y / cell)))
        buckets.setdefault(key, []).append(p)
    clusters = []
    for pts_c in buckets.values():
        if len(pts_c) < 8:
            continue
        c = sum(pts_c, Vector()) / len(pts_c)
        clusters.append((c, len(pts_c)))
    clusters.sort(key=lambda t: -t[1])
    # merge nearby
    merged = []
    for c, n in clusters:
        placed = False
        for i, (mc, mn) in enumerate(merged):
            if (c - mc).xy.length < cell * 1.6:
                tot = mn + n
                merged[i] = ((mc * mn + c * n) / tot, tot)
                placed = True
                break
        if not placed:
            merged.append((c, n))
    merged.sort(key=lambda t: -t[1])
    return merged


def percentile(vals, q):
    if not vals:
        return 0.0
    s = sorted(vals)
    i = int(round((len(s) - 1) * q))
    return s[max(0, min(len(s) - 1, i))]


def diagnose(obj):
    coords = mesh_world_coords(obj)
    mn, mx = bbox_of(coords)
    size = mx - mn
    notes = []
    notes.append(f"object={obj.name} verts={len(obj.data.vertices)} faces={len(obj.data.polygons)}")
    notes.append(f"bbox_min=({mn.x:.4f},{mn.y:.4f},{mn.z:.4f}) bbox_max=({mx.x:.4f},{mx.y:.4f},{mx.z:.4f})")
    notes.append(f"size=({size.x:.4f},{size.y:.4f},{size.z:.4f})")

    zspan = max(1e-6, size.z)
    yspan = max(1e-6, size.y)
    xspan = max(1e-6, size.x)

    # Highest verts: ears if two L/R peaks
    high = sorted(coords, key=lambda c: c.z, reverse=True)[: max(40, len(coords) // 400)]
    hx = sum(c.x for c in high) / len(high)
    left_h = [c for c in high if c.x > hx]
    right_h = [c for c in high if c.x < hx]
    ears_pair = len(left_h) > 5 and len(right_h) > 5
    ear_y = sum(c.y for c in high) / len(high)
    ear_front = (ear_y - mn.y) / yspan < 0.38
    notes.append(f"highest_cluster_mean_y={ear_y:.4f} ears_L/R_pair={ears_pair} ears_front={ear_front}")

    # Ground contacts
    zcut = mn.z + 0.045 * zspan
    ground = [c for c in coords if c.z <= zcut]
    cell = max(0.012, min(xspan, yspan) * 0.08)
    clusters = cluster_xy(ground, cell)
    notes.append(f"ground_pts={len(ground)} paw_clusters={len(clusters)} cell={cell:.4f}")
    for i, (c, n) in enumerate(clusters[:6]):
        notes.append(f"  paw[{i}] n={n} ({c.x:+.3f},{c.y:+.3f},{c.z:+.3f})")

    # Front vs hind paws: split ground by Y
    if clusters:
        ys = [c.y for c, _ in clusters[:6]]
        y_med = sorted(ys)[len(ys) // 2]
        front = [c for c, _ in clusters[:6] if c.y <= y_med]
        hind = [c for c, _ in clusters[:6] if c.y > y_med]
        if front and hind:
            fy = sum(c.y for c in front) / len(front)
            hy = sum(c.y for c in hind) / len(hind)
            paw_sep = hy - fy
        else:
            paw_sep = 0.0
    else:
        paw_sep = 0.0
    paw_sep_frac = paw_sep / yspan
    notes.append(f"paw_y_separation={paw_sep:.4f} frac={paw_sep_frac:.3f}")

    # Tail tip = most +Y (Hunyuan cats typically face -Y)
    tail = max(coords, key=lambda c: c.y)
    muzzle = min(coords, key=lambda c: c.y)
    tail_z_frac = (tail.z - mn.z) / zspan
    muzzle_z_frac = (muzzle.z - mn.z) / zspan
    notes.append(f"tail=({tail.x:+.3f},{tail.y:+.3f},{tail.z:+.3f}) z_frac={tail_z_frac:.3f}")
    notes.append(f"muzzle=({muzzle.x:+.3f},{muzzle.y:+.3f},{muzzle.z:+.3f}) z_frac={muzzle_z_frac:.3f}")

    # Backline: high-Z of mid-body (exclude front 22% head/ears and last 18% tail)
    mid = [c for c in coords
           if mn.y + 0.22 * yspan < c.y < mn.y + 0.82 * yspan]
    back_z = percentile([c.z for c in mid], 0.92) if mid else mn.z
    back_frac = (back_z - mn.z) / zspan
    notes.append(f"backline_z={back_z:.4f} frac_of_height={back_frac:.3f}")

    # High-ridge Y span: standing cats keep a high back along the torso.
    # Sit: only the head/ears reach ~zmax; the ridge is a short front blob.
    ridge = [c for c in coords if c.z >= mn.z + 0.78 * zspan]
    if ridge:
        ry0 = min(c.y for c in ridge)
        ry1 = max(c.y for c in ridge)
        ridge_frac = (ry1 - ry0) / yspan
        ridge_mean_y = (sum(c.y for c in ridge) / len(ridge) - mn.y) / yspan
    else:
        ridge_frac = 0.0
        ridge_mean_y = 0.0
    notes.append(f"high_ridge_y_frac={ridge_frac:.3f} ridge_mean_y={ridge_mean_y:.3f}")

    # Body mass Y: sit is front-loaded with a thin low tail
    body = [c for c in coords if c.z > mn.z + 0.18 * zspan]
    if body:
        cy = sum(c.y for c in body) / len(body)
        mass_front = (cy - mn.y) / yspan < 0.38
    else:
        mass_front = False
    notes.append(f"mass_front_loaded={mass_front}")

    # Paw clusters excluding centerline tail-drag (|x| small and +Y)
    pawish = [(c, n) for c, n in clusters if abs(c.x) > xspan * 0.12 or (c.y - mn.y) / yspan < 0.72]
    notes.append(f"pawish_clusters={len(pawish)} (excl. centerline tail-drag)")

    sit = 0
    stand = 0
    evidence = []

    # Primary: ears-high + short front ridge = sit silhouette
    if ears_pair and ear_front and ridge_frac < 0.42:
        sit += 4
        evidence.append("SIT: ears-high L/R pair; high ridge is a short front blob (not a standing back)")
    elif ridge_frac >= 0.40 and back_frac >= 0.70:
        stand += 4
        evidence.append("STAND: long high backline ridge (shoulders through hips)")
    elif back_frac >= 0.72 and ridge_frac >= 0.32:
        stand += 3
        evidence.append("STAND: backline high")
    elif back_frac < 0.58:
        sit += 3
        evidence.append("SIT: collapsed backline (tucked haunches / loaf)")
    else:
        sit += 1
        evidence.append("weak SIT: backline not a standing ridge")

    if tail_z_frac < 0.16:
        sit += 3
        evidence.append("SIT: tail on or near the ground")
    elif tail_z_frac > 0.28:
        stand += 1
        evidence.append("STAND: tail off the ground")

    if paw_sep_frac < 0.16:
        sit += 2
        evidence.append("SIT: ground contacts bunched in Y (tucked haunches)")
    elif paw_sep_frac > 0.32 and tail_z_frac > 0.18:
        stand += 2
        evidence.append("STAND: front/hind paws well separated (legs extended)")

    if len(pawish) >= 4 and tail_z_frac > 0.18 and ridge_frac >= 0.32:
        stand += 2
        evidence.append("STAND: four distinct paw clusters without a ground tail")
    elif len(pawish) <= 2:
        sit += 1
        evidence.append("SIT: few ground clusters (haunches + fronts merged)")

    if mass_front and tail_z_frac < 0.2:
        sit += 2
        evidence.append("SIT: body mass front-loaded with low tail")

    if muzzle_z_frac > 0.55 and ridge_frac < 0.45:
        sit += 2
        evidence.append("SIT: muzzle mid/high while torso ridge is short (upright sit)")

    # Hard veto: classic sit triangle
    if tail_z_frac < 0.14 and ears_pair and ear_front and ridge_frac < 0.45:
        sit += 3
        evidence.append("SIT veto: ears-high + tail-on-ground + short ridge")

    pose = "UNKNOWN"
    if sit >= stand + 1 and sit >= 4:
        pose = "SIT"
    elif stand > sit and stand >= 4:
        pose = "STAND"
    elif sit > stand:
        pose = "SIT"
    elif stand > sit and stand >= 3:
        pose = "STAND"

    verdict = "PASS" if pose == "STAND" else "FAIL"
    notes.append("EVIDENCE:")
    notes.extend(["  - " + e for e in evidence])
    notes.append(f"scores sit={sit} stand={stand}")
    notes.append(f"DIAGNOSIS: REST POSE IS {pose}  gate={verdict}")
    return {
        "pose": pose,
        "verdict": verdict,
        "sit_score": sit,
        "stand_score": stand,
        "backline_frac": back_frac,
        "tail_z_frac": tail_z_frac,
        "paw_sep_frac": paw_sep_frac,
        "paw_clusters": len(clusters),
        "notes": notes,
        "evidence": evidence,
    }


def render_thumb(path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("W")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.02, 0.02, 0.02, 1)
        bg.inputs[1].default_value = 0.4
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        return
    # camera
    coords = []
    for o in meshes:
        coords.extend(mesh_world_coords(o))
    mn, mx = bbox_of(coords)
    center = (mn + mx) * 0.5
    size = (mx - mn).length
    camd = bpy.data.cameras.new("QCCam")
    cam = bpy.data.objects.new("QCCam", camd)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (center.x + size * 0.55, center.y - size * 0.95, center.z + size * 0.25)
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    sun = bpy.data.lights.new("QCSun", "SUN")
    sun.energy = 3
    so = bpy.data.objects.new("QCSun", sun)
    so.rotation_euler = (math.radians(50), 0, math.radians(-30))
    bpy.context.collection.objects.link(so)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    glb, js, thumb = parse()
    if not glb or not os.path.isfile(glb):
        print("usage: blender --background --python rest_pose_check.py -- --glb MESH.glb")
        sys.exit(1)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        print("ERROR: no mesh in glb")
        sys.exit(1)
    if len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for m in meshes:
            m.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
    obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    result = diagnose(obj)
    for line in result["notes"]:
        print(line, flush=True)
    if js:
        out = {k: v for k, v in result.items() if k != "notes"}
        out["glb"] = glb
        out["notes"] = result["notes"]
        os.makedirs(os.path.dirname(os.path.abspath(js)) or ".", exist_ok=True)
        with open(js, "w") as f:
            json.dump(out, f, indent=2)
        print(f"json {js}", flush=True)
    if thumb:
        try:
            render_thumb(thumb)
            print(f"thumb {thumb}", flush=True)
        except Exception as e:
            print(f"thumb failed: {e}", flush=True)

    if result["pose"] == "STAND":
        sys.exit(0)
    if result["pose"] == "SIT":
        sys.exit(2)
    sys.exit(1)


if __name__ == "__main__":
    main()
