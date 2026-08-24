#!/usr/bin/env python3
"""Bind a STANDING quadruped mesh. Never bind a sit rest. Never metaball.

Creates a quad armature, heat/envelope/voxel-proxy weights, normalize + limit,
and named clips: Idle, Idle_Look, Walk, Run, Swipe, Sit, Cuddle, Hit.

Usage:
  blender --background --python bind_quad.py -- \
    --input MESH.glb --output BOUND.glb --report report.txt \
    --render-rest rest.png --render-sit sit.png \
    --render-walk walk.png --render-playbow bow.png
"""
from __future__ import annotations

import math
import os
import sys

import bpy
from mathutils import Vector

CLIP_NAMES = ["Idle", "Idle_Look", "Walk", "Run", "Swipe", "Sit", "Cuddle", "Hit"]


def argv_after_dd():
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return []


def parse_args():
    args = argv_after_dd()
    d = {
        "input": None,
        "output": None,
        "report": None,
        "render_rest": None,
        "render_sit": None,
        "render_walk": None,
        "render_playbow": None,
        "weight": "auto",
        "target_h": 0.40,
        "allow_sit": False,
    }
    i = 0
    while i < len(args):
        a = args[i]
        if a in ("--input", "--output", "--report", "--weight") and i + 1 < len(args):
            d[a[2:].replace("-", "_")] = args[i + 1]; i += 2; continue
        if a == "--render-rest" and i + 1 < len(args):
            d["render_rest"] = args[i + 1]; i += 2; continue
        if a == "--render-sit" and i + 1 < len(args):
            d["render_sit"] = args[i + 1]; i += 2; continue
        if a == "--render-walk" and i + 1 < len(args):
            d["render_walk"] = args[i + 1]; i += 2; continue
        if a == "--render-playbow" and i + 1 < len(args):
            d["render_playbow"] = args[i + 1]; i += 2; continue
        if a == "--target-h" and i + 1 < len(args):
            d["target_h"] = float(args[i + 1]); i += 2; continue
        if a == "--allow-sit":
            d["allow_sit"] = True; i += 1; continue
        i += 1
    if not d["input"] or not d["output"]:
        print("need --input and --output")
        sys.exit(1)
    return d


notes = []


def log(s=""):
    print(s, flush=True)
    notes.append(s)


def mesh_world_coords(obj):
    mw = obj.matrix_world
    return [mw @ v.co for v in obj.data.vertices]


def bbox_of(coords):
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    zs = [c.z for c in coords]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def cluster_lowest(coords, pred, n=80):
    pts = [c for c in coords if pred(c)]
    if not pts:
        return Vector((0, 0, 0))
    pts = sorted(pts, key=lambda c: c.z)[:n]
    return sum(pts, Vector()) / len(pts)


def cluster_highest(coords, pred, n=40):
    pts = [c for c in coords if pred(c)]
    if not pts:
        return Vector((0, 0, 0))
    pts = sorted(pts, key=lambda c: c.z, reverse=True)[:n]
    return sum(pts, Vector()) / len(pts)


def percentile(vals, q):
    s = sorted(vals)
    i = int(round((len(s) - 1) * q))
    return s[max(0, min(len(s) - 1, i))]


def sit_like(coords):
    mn, mx = bbox_of(coords)
    size = mx - mn
    zspan = max(1e-6, size.z)
    yspan = max(1e-6, size.y)
    mid = [c for c in coords if mn.y + 0.22 * yspan < c.y < mn.y + 0.82 * yspan]
    back = percentile([c.z for c in mid], 0.92) if mid else mn.z
    back_frac = (back - mn.z) / zspan
    tail = max(coords, key=lambda c: c.y)
    tail_z_frac = (tail.z - mn.z) / zspan
    zcut = mn.z + 0.045 * zspan
    ground = [c for c in coords if c.z <= zcut]
    if ground:
        gy = [c.y for c in ground]
        paw_sep = (percentile(gy, 0.85) - percentile(gy, 0.15)) / yspan
    else:
        paw_sep = 0.0
    ridge = [c for c in coords if c.z >= mn.z + 0.78 * zspan]
    if ridge:
        ridge_frac = (max(c.y for c in ridge) - min(c.y for c in ridge)) / yspan
    else:
        ridge_frac = 0.0
    sit = (tail_z_frac < 0.14 and ridge_frac < 0.45) or (back_frac < 0.58) or (
        ridge_frac < 0.35 and tail_z_frac < 0.22)
    return sit, back_frac, tail_z_frac, paw_sep


def ensure_world():
    if bpy.context.scene.world is None:
        bpy.context.scene.world = bpy.data.worlds.new("World")
    w = bpy.context.scene.world
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.08, 0.08, 0.09, 1)
        bg.inputs[1].default_value = 0.35


def count_unassigned(mesh_obj):
    if not mesh_obj.vertex_groups:
        return len(mesh_obj.data.vertices), 0.0, 0.0
    n = len(mesh_obj.data.vertices)
    assigned = 0
    maxw = 0.0
    for v in mesh_obj.data.vertices:
        tw = sum(g.weight for g in v.groups)
        if tw > 1e-4:
            assigned += 1
        maxw = max(maxw, tw)
    return n - assigned, assigned / n, maxw


def clear_weights(mesh_obj):
    mesh_obj.vertex_groups.clear()
    for mod in list(mesh_obj.modifiers):
        if mod.type == "ARMATURE":
            mesh_obj.modifiers.remove(mod)


def add_bone(eb, name, head, tail, parent=None, connect=False, deform=True):
    b = eb.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if (b.tail - b.head).length < 0.008:
        b.tail = b.head + Vector((0, 0, 0.012))
    b.use_connect = False
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    b.use_deform = deform
    return b


def set_e(arm, name, x=0, y=0, z=0):
    if name not in arm.pose.bones:
        return
    b = arm.pose.bones[name]
    b.rotation_mode = "XYZ"
    b.rotation_euler = (math.radians(x), math.radians(y), math.radians(z))


def zero_pose(arm):
    for b in arm.pose.bones:
        b.rotation_mode = "XYZ"
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)
        b.scale = (1, 1, 1)


def pose_idle(arm):
    zero_pose(arm)
    set_e(arm, "spine_02", x=-2)
    set_e(arm, "tail_01", z=4)
    set_e(arm, "tail_02", z=-3)


def pose_idle_look(arm):
    zero_pose(arm)
    set_e(arm, "neck", z=18, y=6)
    set_e(arm, "head", z=12, x=4)
    set_e(arm, "ear_L", z=-8)
    set_e(arm, "tail_01", z=-10)


def pose_walk(arm, t=0.35):
    """Standing walk: opposite-diagonal, modest lift. t in 0..1 phase."""
    zero_pose(arm)
    s = math.sin(t * math.tau)
    c = math.cos(t * math.tau)
    set_e(arm, "spine_01", x=4, z=-3 * s)
    set_e(arm, "spine_02", x=2, z=3 * s)
    set_e(arm, "spine_03", z=-2 * s)
    set_e(arm, "neck", x=-6, z=4 * s)
    set_e(arm, "head", x=4, z=-3 * s)
    set_e(arm, "shoulder_L", x=-14 * s)
    set_e(arm, "upper_FL", x=-22 * s)
    set_e(arm, "lower_FL", x=-8 * max(0, s))
    set_e(arm, "paw_FL", x=10 * max(0, s))
    set_e(arm, "shoulder_R", x=14 * s)
    set_e(arm, "upper_FR", x=18 * s)
    set_e(arm, "lower_FR", x=6 * max(0, -s))
    set_e(arm, "hip_L", x=8 * s)
    set_e(arm, "thigh_L", x=16 * s)
    set_e(arm, "shin_L", x=8 * max(0, -s))
    set_e(arm, "hip_R", x=-8 * s)
    set_e(arm, "thigh_R", x=-16 * s)
    set_e(arm, "shin_R", x=-8 * max(0, s))
    set_e(arm, "tail_01", x=-12, z=6 * c)
    set_e(arm, "tail_02", x=-8, z=-4 * c)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0, 0, 0.004 + 0.006 * abs(s))


def pose_run(arm):
    pose_walk(arm, t=0.28)
    set_e(arm, "spine_01", x=8)
    set_e(arm, "spine_03", x=-6)
    set_e(arm, "upper_FL", x=-32)
    set_e(arm, "upper_FR", x=18)
    set_e(arm, "thigh_L", x=22)
    set_e(arm, "thigh_R", x=-24)
    set_e(arm, "tail_01", x=-22)


def pose_swipe(arm):
    zero_pose(arm)
    set_e(arm, "spine_03", z=-8, y=6)
    set_e(arm, "neck", z=10)
    set_e(arm, "head", z=8)
    set_e(arm, "shoulder_L", x=-8, y=20, z=12)
    set_e(arm, "upper_FL", x=-40, y=18)
    set_e(arm, "lower_FL", x=-10)
    set_e(arm, "paw_FL", x=16)
    set_e(arm, "tail_01", z=-16)


def pose_sit(arm):
    """From STAND rest: fold hind, drop hips, keep front planted."""
    zero_pose(arm)
    set_e(arm, "spine_01", x=-22)
    set_e(arm, "spine_02", x=-8)
    set_e(arm, "spine_03", x=10)
    set_e(arm, "neck", x=-8)
    set_e(arm, "head", x=10)
    set_e(arm, "hip_L", x=-28, z=6)
    set_e(arm, "hip_R", x=-28, z=-6)
    set_e(arm, "thigh_L", x=-36)
    set_e(arm, "thigh_R", x=-36)
    set_e(arm, "shin_L", x=40)
    set_e(arm, "shin_R", x=40)
    set_e(arm, "paw_HL", x=12)
    set_e(arm, "paw_HR", x=12)
    set_e(arm, "tail_01", x=8, z=24)
    set_e(arm, "tail_02", z=28)
    set_e(arm, "tail_03", z=18)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0, 0.01, -0.02)


def pose_cuddle(arm):
    zero_pose(arm)
    set_e(arm, "spine_01", x=-8, z=8)
    set_e(arm, "spine_02", z=6)
    set_e(arm, "neck", z=16, x=8)
    set_e(arm, "head", z=10, x=6)
    set_e(arm, "shoulder_L", y=8)
    set_e(arm, "shoulder_R", y=-8)
    set_e(arm, "tail_01", z=20, x=-10)
    set_e(arm, "tail_02", z=16)


def pose_hit(arm):
    zero_pose(arm)
    set_e(arm, "spine_01", x=10, z=-8)
    set_e(arm, "spine_03", x=-6)
    set_e(arm, "neck", x=12, z=-14)
    set_e(arm, "head", x=-8, z=-8)
    set_e(arm, "ear_L", z=10)
    set_e(arm, "ear_R", z=-10)
    set_e(arm, "tail_01", x=16, z=-20)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0.004, 0.006, 0)


def pose_playbow(arm):
    zero_pose(arm)
    set_e(arm, "spine_01", x=16)
    set_e(arm, "spine_02", x=8)
    set_e(arm, "spine_03", x=-18)
    set_e(arm, "neck", x=-8)
    set_e(arm, "head", x=14)
    set_e(arm, "shoulder_L", x=14)
    set_e(arm, "shoulder_R", x=14)
    set_e(arm, "upper_FL", x=12)
    set_e(arm, "upper_FR", x=12)
    set_e(arm, "hip_L", x=8)
    set_e(arm, "hip_R", x=8)
    set_e(arm, "thigh_L", x=14)
    set_e(arm, "thigh_R", x=14)
    set_e(arm, "tail_01", x=-28)
    set_e(arm, "tail_02", x=-12)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0, 0.006, -0.004)


def insert_keys(arm, frame):
    for b in arm.pose.bones:
        b.keyframe_insert(data_path="rotation_euler", frame=frame)
        b.keyframe_insert(data_path="location", frame=frame)
        b.keyframe_insert(data_path="scale", frame=frame)


def make_action(arm, name, pose_fn, frames=24):
    zero_pose(arm)
    act = bpy.data.actions.new(name)
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    # rest at 1, posed mid, rest end (loopable)
    pose_fn(arm)
    # for walk/run sample two phases
    if name == "Walk":
        for fr, t in ((1, 0.0), (8, 0.25), (16, 0.5), (24, 0.75), (32, 1.0)):
            pose_walk(arm, t)
            insert_keys(arm, fr)
        act.frame_range = (1, 32)
    elif name == "Run":
        pose_run(arm)
        insert_keys(arm, 1)
        pose_walk(arm, 0.5)
        set_e(arm, "spine_01", x=8)
        insert_keys(arm, 10)
        pose_run(arm)
        insert_keys(arm, 20)
        act.frame_range = (1, 20)
    else:
        zero_pose(arm)
        insert_keys(arm, 1)
        pose_fn(arm)
        insert_keys(arm, max(8, frames // 2))
        if name in ("Idle", "Idle_Look"):
            zero_pose(arm)
            insert_keys(arm, frames)
        else:
            pose_fn(arm)
            insert_keys(arm, frames)
        act.frame_range = (1, frames)
    act.use_fake_user = True
    return act


def eval_bbox(obj):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    mesh = ev.to_mesh()
    coords = [ev.matrix_world @ v.co for v in mesh.vertices]
    ev.to_mesh_clear()
    return bbox_of(coords)


def walk_shred_qc(obj, arm):
    zero_pose(arm)
    bpy.context.view_layer.update()
    rmn, rmx = eval_bbox(obj)
    rsz = rmx - rmn
    pose_walk(arm, 0.35)
    bpy.context.view_layer.update()
    pmn, pmx = eval_bbox(obj)
    psz = pmx - pmn
    # sample deltas
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    mesh = ev.to_mesh()
    # compare to rest via undeformed
    rest_coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    posed = [ev.matrix_world @ v.co for v in mesh.vertices]
    ev.to_mesh_clear()
    n = min(len(rest_coords), len(posed))
    step = max(1, n // 4000)
    deltas = [(posed[i] - rest_coords[i]).length for i in range(0, n, step)]
    max_d = max(deltas) if deltas else 0
    mean_d = sum(deltas) / max(1, len(deltas))
    grow = (
        psz.x / max(1e-6, rsz.x),
        psz.y / max(1e-6, rsz.y),
        psz.z / max(1e-6, rsz.z),
    )
    shredded = max(grow) > 2.4 or max_d > max(rsz) * 0.85
    zero_pose(arm)
    bpy.context.view_layer.update()
    return {
        "rest_size": tuple(round(x, 4) for x in rsz),
        "walk_size": tuple(round(x, 4) for x in psz),
        "grow": tuple(round(x, 3) for x in grow),
        "max_delta": round(max_d, 4),
        "mean_delta": round(mean_d, 4),
        "shredded": shredded,
        "walk_gate": "FAIL" if shredded else "PASS",
    }


def setup_render(scene, obj, size, ymin):
    ensure_world()
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 1080
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    try:
        scene.eevee.taa_render_samples = 24
    except Exception:
        pass
    if "Ground" not in bpy.data.objects:
        bpy.ops.mesh.primitive_plane_add(size=6.0, location=(0.0, 0.0, -0.001))
        ground = bpy.context.active_object
        ground.name = "Ground"
        gmat = bpy.data.materials.new("GroundMat")
        gmat.use_nodes = True
        pr = gmat.node_tree.nodes.get("Principled BSDF")
        if pr:
            pr.inputs["Base Color"].default_value = (0.07, 0.07, 0.075, 1)
            pr.inputs["Roughness"].default_value = 0.85
        ground.data.materials.append(gmat)

    def add_area(name, loc, energy, size_l=1.2, color=(1, 1, 1)):
        if name in bpy.data.objects:
            return
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.size = size_l
        data.color = color
        o = bpy.data.objects.new(name, data)
        o.location = loc
        bpy.context.collection.objects.link(o)
        direction = Vector((0, 0, 0.15)) - Vector(loc)
        o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    add_area("key", (0.55, -0.85, 0.75), 180, 1.1, (1.0, 0.98, 0.95))
    add_area("fill", (-0.7, -0.45, 0.45), 70, 1.4, (0.85, 0.90, 1.0))
    add_area("rim", (0.15, 0.9, 0.55), 90, 1.0, (1.0, 0.95, 1.0))
    if "SukiCam" not in bpy.data.objects:
        camd = bpy.data.cameras.new("SukiCam")
        camd.lens = 55
        cam = bpy.data.objects.new("SukiCam", camd)
        bpy.context.collection.objects.link(cam)
        scene.camera = cam
        target = Vector((0.0, 0.0, size.z * 0.42))
        cam.location = Vector((0.42, ymin - 0.72, size.z * 0.42))
        direction = target - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    else:
        scene.camera = bpy.data.objects["SukiCam"]


def render_pose(scene, arm, name, pose_fn, path):
    if not path:
        return
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    pose_fn(arm)
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    log(f"Rendered {name} -> {path} exists={os.path.isfile(path)} "
        f"size={os.path.getsize(path) if os.path.isfile(path) else 0}")


def parent_auto(obj, arm):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def parent_envelope(obj, arm):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")


def parent_voxel_proxy(obj, arm, weight_notes):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    proxy = obj.copy()
    proxy.data = obj.data.copy()
    proxy.name = "WeightProxy"
    bpy.context.collection.objects.link(proxy)
    bpy.ops.object.select_all(action="DESELECT")
    proxy.select_set(True)
    bpy.context.view_layer.objects.active = proxy
    vr = proxy.modifiers.new("VoxelTmp", "REMESH")
    vr.mode = "VOXEL"
    vr.voxel_size = 0.012
    bpy.ops.object.modifier_apply(modifier="VoxelTmp")
    bpy.ops.object.select_all(action="DESELECT")
    proxy.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    except Exception as e:
        weight_notes.append(f"voxel proxy auto-weight exception: {e}")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_NAME")
    bpy.ops.object.select_all(action="DESELECT")
    proxy.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.data_transfer(
            data_type="VGROUP_WEIGHTS",
            vert_mapping="POLYINTERP_NEAREST",
            layers_select_src="ALL",
            layers_select_dst="NAME",
            mix_mode="REPLACE",
        )
    except Exception as e:
        weight_notes.append(f"data_transfer failed: {e}")
        try:
            bpy.ops.object.data_transfer(
                data_type="VGROUP_WEIGHTS",
                vert_mapping="NEAREST",
                layers_select_src="ALL",
                layers_select_dst="NAME",
                mix_mode="REPLACE",
            )
        except Exception as e2:
            weight_notes.append(f"nearest transfer failed: {e2}")
    bpy.data.objects.remove(proxy, do_unlink=True)


def normalize_weights(obj, weight_notes):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for kwargs in (
        {"group_select": "ALL", "limit": 4},
        {"limit": 4},
    ):
        try:
            bpy.ops.object.vertex_group_limit_total(**kwargs)
            weight_notes.append(f"limit_total {kwargs}")
            break
        except Exception as e:
            weight_notes.append(f"limit_total failed {kwargs}: {e}")
    try:
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)
        weight_notes.append("normalize_all ok")
    except Exception as e:
        weight_notes.append(f"normalize_all failed: {e}")


def main():
    cfg = parse_args()
    src = cfg["input"]
    if not os.path.isfile(src):
        print(f"missing input {src}")
        sys.exit(1)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    ensure_world()
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    log("=== BIND REPORT: quadruped bind (standing rest only) ===")
    log("Blender: 4.3.2")
    log(f"Input: {src}")
    log(f"Imported mesh objects: {[m.name for m in meshes]}")
    if not meshes:
        log("ERROR no mesh")
        sys.exit(1)
    if len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for m in meshes:
            m.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
    obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
    obj.name = "HeroMesh"
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    coords0 = mesh_world_coords(obj)
    mn0, mx0 = bbox_of(coords0)
    size0 = mx0 - mn0
    sit, bf, tf, pf = sit_like(coords0)
    log("")
    log("=== REST-POSE GATE ===")
    log(f"verts={len(obj.data.vertices)} faces={len(obj.data.polygons)}")
    log(f"bbox min={tuple(round(x,4) for x in mn0)} max={tuple(round(x,4) for x in mx0)}")
    log(f"backline_frac={bf:.3f} tail_z_frac={tf:.3f} paw_sep_frac={pf:.3f} sit_like={sit}")
    if sit and not cfg["allow_sit"]:
        log("REFUSE BIND: rest pose is SIT. Never bind a sit. Re-imagine / re-mesh.")
        if cfg["report"]:
            with open(cfg["report"], "w") as f:
                f.write("\n".join(notes) + "\n")
        sys.exit(2)

    TARGET_H = cfg["target_h"]
    scale = TARGET_H / max(1e-6, size0.z)
    obj.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    coords = mesh_world_coords(obj)
    mn, mx = bbox_of(coords)
    # body center exclude long tail: front 70% of Y
    body = [c for c in coords if c.y < mn.y + 0.70 * (mx.y - mn.y)]
    cx = sum(c.x for c in body) / max(1, len(body))
    cy = sum(c.y for c in body) / max(1, len(body))
    obj.location = Vector((-cx, -cy, -mn.z))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    coords = mesh_world_coords(obj)
    mn, mx = bbox_of(coords)
    size = mx - mn
    log("")
    log("=== CLEANUP ===")
    log(f"scale={scale:.4f} height={size.z:.3f}m target={TARGET_H:.2f}m (0.30–0.50 kitten band)")
    log(f"origin ground, body XY recentered. bbox min={tuple(round(x,4) for x in mn)} max={tuple(round(x,4) for x in mx)}")
    log("No remesh/sculpt/metaball. Silhouette unchanged. Materials kept.")
    log("Forward: -Y, up: +Z.")

    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    zs = [c.z for c in coords]
    xmin, xmax = min(xs), max(xs)
    ymin, ymax = min(ys), max(ys)
    zmin, zmax = min(zs), max(zs)
    yspan = ymax - ymin
    zspan = zmax - zmin

    ear_L = cluster_highest(coords, lambda c: c.x > 0.015 and c.z > zmax * 0.72, 30)
    ear_R = cluster_highest(coords, lambda c: c.x < -0.015 and c.z > zmax * 0.72, 30)
    muzzle = min(coords, key=lambda c: c.y)
    tail_tip = max(coords, key=lambda c: c.y)

    y_front = ymin + 0.32 * yspan
    y_hind0 = ymin + 0.42 * yspan
    y_hind1 = ymin + 0.78 * yspan
    fl_paw = cluster_lowest(coords, lambda c: c.x > 0.012 and c.y < y_front and c.z < 0.05, 70)
    fr_paw = cluster_lowest(coords, lambda c: c.x < -0.012 and c.y < y_front and c.z < 0.05, 70)
    hl_paw = cluster_lowest(coords, lambda c: c.x > 0.012 and y_hind0 < c.y < y_hind1 and c.z < 0.05, 70)
    hr_paw = cluster_lowest(coords, lambda c: c.x < -0.012 and y_hind0 < c.y < y_hind1 and c.z < 0.05, 70)

    head_pts = [c for c in coords if c.y < ymin + 0.22 * yspan and c.z > zmax * 0.50]
    head = sum(head_pts, Vector()) / len(head_pts) if head_pts else Vector((0, ymin + 0.08, zmax * 0.75))
    chest_pts = [c for c in coords if ymin + 0.12 * yspan < c.y < ymin + 0.36 * yspan
                 and zmax * 0.28 < c.z < zmax * 0.72]
    chest = sum(chest_pts, Vector()) / max(1, len(chest_pts)) if chest_pts else Vector((0, ymin + 0.22 * yspan, zmax * 0.45))
    hip_pts = [c for c in coords if ymin + 0.48 * yspan < c.y < ymin + 0.70 * yspan
               and zmax * 0.22 < c.z < zmax * 0.70]
    hips = sum(hip_pts, Vector()) / max(1, len(hip_pts)) if hip_pts else Vector((0, ymin + 0.58 * yspan, zmax * 0.40))
    tail_root_pts = [c for c in coords if c.y > hips.y + 0.01 and c.y < hips.y + 0.18 * yspan
                     and c.z < zmax * 0.55]
    tail_root = sum(tail_root_pts, Vector()) / len(tail_root_pts) if tail_root_pts else Vector((0, hips.y + 0.04, hips.z * 0.7))

    log("")
    log("=== LANDMARKS ===")
    for name, v in [
        ("ear_L", ear_L), ("ear_R", ear_R), ("muzzle", muzzle), ("head", head),
        ("chest", chest), ("hips", hips), ("tail_root", tail_root), ("tail_tip", tail_tip),
        ("FL_paw", fl_paw), ("FR_paw", fr_paw), ("HL_paw", hl_paw), ("HR_paw", hr_paw),
    ]:
        log(f"  {name:10s} ({v.x:+.3f}, {v.y:+.3f}, {v.z:+.3f})")

    # Armature — standing columns
    bpy.ops.object.select_all(action="DESELECT")
    arm_data = bpy.data.armatures.new("QuadArmature")
    arm_data.display_type = "OCTAHEDRAL"
    arm = bpy.data.objects.new("QuadArmature", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    add_bone(eb, "root", (0, hips.y, 0.0), (0, hips.y, 0.02), deform=False)
    spine1_h = Vector((0, hips.y, max(0.08, hips.z * 0.75)))
    spine1_t = Vector((0, (hips.y + chest.y) * 0.5, (hips.z + chest.z) * 0.5))
    spine2_t = Vector((0, chest.y, chest.z))
    spine3_t = Vector((0, (chest.y + head.y) * 0.55, (chest.z + head.z) * 0.45))
    add_bone(eb, "spine_01", spine1_h, spine1_t, "root", False)
    add_bone(eb, "spine_02", spine1_t, spine2_t, "spine_01", True)
    add_bone(eb, "spine_03", spine2_t, spine3_t, "spine_02", True)
    neck_t = Vector((0, head.y + 0.01, head.z * 0.82))
    add_bone(eb, "neck", spine3_t, neck_t, "spine_03", True)
    head_t = Vector((0, muzzle.y + 0.01, head.z + 0.005))
    add_bone(eb, "head", neck_t, head_t, "neck", True)
    add_bone(eb, "ear_L", (ear_L.x * 0.7, ear_L.y, ear_L.z - 0.035),
             (ear_L.x * 0.85, ear_L.y, ear_L.z), "head")
    add_bone(eb, "ear_R", (ear_R.x * 0.7, ear_R.y, ear_R.z - 0.035),
             (ear_R.x * 0.85, ear_R.y, ear_R.z), "head")

    sh_z = chest.z + 0.005
    sh_y = chest.y - 0.005
    sh_x = max(0.03, abs(fl_paw.x) * 0.85)
    add_bone(eb, "shoulder_L", (0.01, sh_y, sh_z), (sh_x, sh_y - 0.005, sh_z - 0.005), "spine_03")
    add_bone(eb, "shoulder_R", (-0.01, sh_y, sh_z), (-sh_x, sh_y - 0.005, sh_z - 0.005), "spine_03")

    def front_leg(side, paw):
        sx = sh_x if side == "L" else -sh_x
        sy, sz = sh_y - 0.005, sh_z - 0.005
        mid = Vector((sx * 1.02, (sy + paw.y) * 0.55, (sz + paw.z) * 0.50))
        wrist = Vector((paw.x, paw.y, max(0.016, paw.z + 0.012)))
        add_bone(eb, f"upper_F{side}", (sx, sy, sz), mid, f"shoulder_{side}", True)
        add_bone(eb, f"lower_F{side}", mid, wrist, f"upper_F{side}", True)
        add_bone(eb, f"paw_F{side}", wrist, (paw.x, paw.y - 0.012, 0.004), f"lower_F{side}", True)

    front_leg("L", fl_paw)
    front_leg("R", fr_paw)

    hip_x = max(0.035, abs(hl_paw.x) * 0.9)
    add_bone(eb, "hip_L", (0.01, hips.y, hips.z), (hip_x, hips.y + 0.008, hips.z - 0.008), "spine_01")
    add_bone(eb, "hip_R", (-0.01, hips.y, hips.z), (-hip_x, hips.y + 0.008, hips.z - 0.008), "spine_01")

    def hind_leg(side, paw):
        hx = hip_x if side == "L" else -hip_x
        hy, hz = hips.y + 0.008, hips.z - 0.008
        knee = Vector((hx * 1.08, (hy + paw.y) * 0.45, max(0.05, (hz + paw.z) * 0.48)))
        ankle = Vector((paw.x, paw.y, max(0.016, paw.z + 0.012)))
        add_bone(eb, f"thigh_{side}", (hx, hy, hz), knee, f"hip_{side}", True)
        add_bone(eb, f"shin_{side}", knee, ankle, f"thigh_{side}", True)
        add_bone(eb, f"paw_H{side}", ankle, (paw.x, paw.y + 0.012, 0.004), f"shin_{side}", True)

    hind_leg("L", hl_paw)
    hind_leg("R", hr_paw)

    tt = Vector(tail_tip)
    tr = Vector((0, tail_root.y, max(0.05, tail_root.z)))
    for i, (a, b) in enumerate([
        (tr, tr.lerp(tt, 0.28)),
        (tr.lerp(tt, 0.28), tr.lerp(tt, 0.52)),
        (tr.lerp(tt, 0.52), tr.lerp(tt, 0.76)),
        (tr.lerp(tt, 0.76), tt + Vector((0, 0.008, 0.008))),
    ]):
        parent = "spine_01" if i == 0 else f"tail_0{i}"
        add_bone(eb, f"tail_0{i+1}", a, b, parent, connect=(i > 0))

    for b in eb:
        b.envelope_distance = 0.05
        b.envelope_weight = 1.0
        b.head_radius = 0.016
        b.tail_radius = 0.011

    log("")
    log("=== ARMATURE BONES ===")
    for b in eb:
        par = b.parent.name if b.parent else "-"
        log(f"  {b.name:14s} parent={par:12s} head=({b.head.x:+.3f},{b.head.y:+.3f},{b.head.z:+.3f}) "
            f"tail=({b.tail.x:+.3f},{b.tail.y:+.3f},{b.tail.z:+.3f}) deform={b.use_deform}")
    bpy.ops.object.mode_set(mode="OBJECT")

    weight_notes = []
    weight_method = "none"
    log("")
    log("=== WEIGHT BIND ===")
    prefer = cfg["weight"]
    try:
        if prefer == "envelope":
            parent_envelope(obj, arm)
            weight_method = "envelope"
        elif prefer == "voxel":
            parent_voxel_proxy(obj, arm, weight_notes)
            weight_method = "voxel_proxy_transfer"
        else:
            parent_auto(obj, arm)
            weight_method = "automatic_heat"
    except Exception as e:
        weight_notes.append(f"primary bind exception: {e}")

    unassigned, frac, maxw = count_unassigned(obj)
    weight_notes.append(f"After primary: unassigned={unassigned} assigned_frac={frac:.3f} max_total_w={maxw:.3f} vgroups={len(obj.vertex_groups)}")
    log(weight_notes[-1])

    if frac < 0.85 or unassigned > 8000:
        log("AUTO weak — envelope")
        clear_weights(obj)
        obj.parent = None
        try:
            parent_envelope(obj, arm)
            weight_method = "envelope"
        except Exception as e:
            weight_notes.append(f"ENVELOPE exception: {e}")
        unassigned, frac, maxw = count_unassigned(obj)
        weight_notes.append(f"After ENVELOPE: unassigned={unassigned} assigned_frac={frac:.3f} max_total_w={maxw:.3f}")
        log(weight_notes[-1])

    if frac < 0.75:
        log("Envelope weak — voxel-proxy heat + transfer (hero unchanged)")
        clear_weights(obj)
        obj.parent = None
        parent_voxel_proxy(obj, arm, weight_notes)
        weight_method = "voxel_proxy_transfer"
        unassigned, frac, maxw = count_unassigned(obj)
        weight_notes.append(f"After VOXEL PROXY: unassigned={unassigned} assigned_frac={frac:.3f} max_total_w={maxw:.3f}")
        log(weight_notes[-1])

    has_arm_mod = any(m.type == "ARMATURE" for m in obj.modifiers)
    if not has_arm_mod:
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        mod.use_vertex_groups = True
    else:
        for m in obj.modifiers:
            if m.type == "ARMATURE":
                m.object = arm
                m.use_vertex_groups = True
    if obj.parent != arm:
        obj.parent = arm
        obj.parent_type = "OBJECT"

    normalize_weights(obj, weight_notes)
    unassigned, frac, maxw = count_unassigned(obj)
    weight_notes.append(f"After normalize/limit: unassigned={unassigned} assigned_frac={frac:.3f} max_total_w={maxw:.3f}")
    log(weight_notes[-1])
    log(f"Weight method: {weight_method}")
    log(f"Vertex groups: {[g.name for g in obj.vertex_groups]}")

    # deform test
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    pb = arm.pose.bones
    test_name = "spine_02" if "spine_02" in pb else list(pb.keys())[1]
    deps = bpy.context.evaluated_depsgraph_get()
    obj_eval = obj.evaluated_get(deps)
    before = [obj_eval.matrix_world @ obj_eval.data.vertices[i].co
              for i in (0, 100, 500, 2000, 8000, 20000) if i < len(obj_eval.data.vertices)]
    pb[test_name].rotation_mode = "XYZ"
    pb[test_name].rotation_euler[0] = math.radians(35)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    obj_eval = obj.evaluated_get(deps)
    emesh = obj_eval.to_mesh()
    after = [obj_eval.matrix_world @ emesh.vertices[i].co
             for i in (0, 100, 500, 2000, 8000, 20000) if i < len(emesh.vertices)]
    obj_eval.to_mesh_clear()
    deltas = [(a - b).length for a, b in zip(after, before)]
    moved = sum(1 for d in deltas if d > 1e-5)
    max_delta = max(deltas) if deltas else 0
    log(f"Deform test {test_name} +35deg X: sample_moved={moved}/{len(deltas)} max_delta={max_delta:.5f}m")
    log(f"Vertices actually move with bones: {max_delta > 0.002}")
    pb[test_name].rotation_euler[0] = 0
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")

    wqc = walk_shred_qc(obj, arm)
    log("")
    log("=== WALK SHRED QC (geometry) ===")
    for k, v in wqc.items():
        log(f"  {k}={v}")

    # clips
    log("")
    log("=== CLIPS ===")
    pose_map = {
        "Idle": pose_idle,
        "Idle_Look": pose_idle_look,
        "Walk": pose_walk,
        "Run": pose_run,
        "Swipe": pose_swipe,
        "Sit": pose_sit,
        "Cuddle": pose_cuddle,
        "Hit": pose_hit,
    }
    created = []
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for name in CLIP_NAMES:
        make_action(arm, name, pose_map[name])
        created.append(name)
        log(f"  clip {name}")
    # stash NLA
    if arm.animation_data is None:
        arm.animation_data_create()
    for name in created:
        act = bpy.data.actions.get(name)
        if not act:
            continue
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        start = 1
        strip = track.strips.new(name, start, act)
        strip.action = act
    arm.animation_data.action = bpy.data.actions.get("Idle")
    bpy.ops.object.mode_set(mode="OBJECT")
    log(f"clip_list={created}")

    scene = bpy.context.scene
    setup_render(scene, obj, size, ymin)
    log("")
    log("=== RENDERS ===")
    render_pose(scene, arm, "rest", zero_pose, cfg["render_rest"])
    render_pose(scene, arm, "sit", pose_sit, cfg["render_sit"])
    render_pose(scene, arm, "walk", lambda a: pose_walk(a, 0.35), cfg["render_walk"])
    render_pose(scene, arm, "playbow", pose_playbow, cfg["render_playbow"])

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    zero_pose(arm)
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    arm.hide_set(False)
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    out = cfg["output"]
    os.makedirs(os.path.dirname(os.path.abspath(out)) or ".", exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_nla_strips=True,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )
    log("")
    log("=== EXPORT ===")
    log(f"Bound GLB: {out} exists={os.path.isfile(out)} bytes={os.path.getsize(out) if os.path.isfile(out) else 0}")
    log("")
    log("=== WEIGHT NOTES ===")
    for w in weight_notes:
        log(f"  {w}")
    log(f"Method: {weight_method}")
    log("No metaball. No sit-rest bind.")
    log(f"WALK_GATE={wqc['walk_gate']}")

    if cfg["report"]:
        with open(cfg["report"], "w") as f:
            f.write("\n".join(notes) + "\n")
        log(f"Report written: {cfg['report']}")


if __name__ == "__main__":
    main()
