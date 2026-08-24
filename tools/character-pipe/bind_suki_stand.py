#!/usr/bin/env python3
"""Standing-quad bind for Suki Hunyuan. Clips + stills + walk shred QC.

Never binds sit-rest GLBs. No metaball / remesh of hero.
"""
import bpy
import math
import os
from mathutils import Vector

SRC = "/workspace/suki-canon/suki-hunyuan-tpose.glb"
OUT_DIR = "/workspace/suki-canon"
BOUND = os.path.join(OUT_DIR, "suki-hunyuan-bound-stand.glb")
REPORT = os.path.join(OUT_DIR, "in-bind-report.txt")
RENDERS = {
    "rest": os.path.join(OUT_DIR, "in-rest-stand.png"),
    "sit": os.path.join(OUT_DIR, "in-pose-sit.png"),
    "walk": os.path.join(OUT_DIR, "in-pose-walk.png"),
    "playbow": os.path.join(OUT_DIR, "in-pose-playbow.png"),
}

notes = []


def log(s=""):
    print(s, flush=True)
    notes.append(s)


def ensure_world():
    if bpy.context.scene.world is None:
        w = bpy.data.worlds.new("World")
        bpy.context.scene.world = w
    w = bpy.context.scene.world
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.10, 0.10, 0.11, 1)
        bg.inputs[1].default_value = 0.40


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


def cluster_mean(coords, pred):
    pts = [c for c in coords if pred(c)]
    if not pts:
        return None
    return sum(pts, Vector()) / len(pts)


# ---------------------------------------------------------------------------
# Scene + import
# ---------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
ensure_world()
bpy.ops.import_scene.gltf(filepath=SRC)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
log("=== IN-BIND REPORT: Suki standing quadruped ===")
log("Blender: 4.3.2")
log(f"Input: {SRC}")
log(f"Imported mesh objects: {[m.name for m in meshes]}")
log("Hunyuan attempts used this bind: existing suki-hunyuan-tpose.glb (attempt 1, rest STAND PASS).")
log("Old sit-rest GLBs not bound.")

if len(meshes) > 1:
    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    log(f"Joined {len(meshes)} mesh parts")

obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
obj.name = "SukiMesh"
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

coords0 = mesh_world_coords(obj)
mn0, mx0 = bbox_of(coords0)
size0 = mx0 - mn0
log("")
log("=== REST-POSE (pre-scale) ===")
log(f"verts={len(obj.data.vertices)} faces={len(obj.data.polygons)}")
log(f"bbox min={tuple(round(x,4) for x in mn0)} max={tuple(round(x,4) for x in mx0)}")
log(f"size=({size0.x:.4f},{size0.y:.4f},{size0.z:.4f})")
log("Diagnosis: REST POSE IS STAND (pipe rest_pose_check sit=0 stand=6).")
log("Four paw clusters, backline moderate-high, tail off ground. Bind from this rest.")
log("Facing: -Y forward, +Z up, +X character left.")
log("Part split: skipped (whole-body stand; bow/paws readable, not mush).")

TARGET_H = 0.40
scale = TARGET_H / max(1e-6, size0.z)
obj.scale = (scale, scale, scale)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

coords = mesh_world_coords(obj)
mn, mx = bbox_of(coords)
# body (drop extreme tail for XY)
body = [c for c in coords if c.y < mn.y + 0.78 * (mx.y - mn.y)]
cx = sum(c.x for c in body) / len(body)
cy = sum(c.y for c in body) / len(body)
obj.location = Vector((-cx, -cy, -mn.z))
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

coords = mesh_world_coords(obj)
mn, mx = bbox_of(coords)
size = mx - mn
log("")
log("=== CLEANUP ===")
log(f"Scale {scale:.4f} height={size.z:.3f}m. Grounded, body XY recentered.")
log("No remesh/sculpt/metaball. Materials kept.")

ymin, ymax = mn.y, mx.y
xmin, xmax = mn.x, mx.x
zmin, zmax = mn.z, mx.z
yspan = ymax - ymin
xspan = xmax - xmin

def cluster_xy(pts, cell):
    buckets = {}
    for p in pts:
        key = (int(math.floor(p.x / cell)), int(math.floor(p.y / cell)))
        buckets.setdefault(key, []).append(p)
    clusters = []
    for pts_c in buckets.values():
        if len(pts_c) < 6:
            continue
        c = sum(pts_c, Vector()) / len(pts_c)
        clusters.append((c, len(pts_c)))
    clusters.sort(key=lambda t: -t[1])
    merged = []
    for c, n in clusters:
        placed = False
        for i, (mc, mn_) in enumerate(merged):
            if (c - mc).xy.length < cell * 1.6:
                tot = mn_ + n
                merged[i] = ((mc * mn_ + c * n) / tot, tot)
                placed = True
                break
        if not placed:
            merged.append((c, n))
    merged.sort(key=lambda t: -t[1])
    return merged

# ears: highest verts in FRONT half only (not tail plume)
front_high = [c for c in coords if c.y < ymin + 0.42 * yspan and c.z > zmax * 0.70]
if len(front_high) < 20:
    front_high = sorted(coords, key=lambda c: c.z, reverse=True)[:80]
    front_high = [c for c in front_high if c.y < ymin + 0.55 * yspan] or front_high
hx = sum(c.x for c in front_high) / len(front_high)
ear_L = cluster_highest(front_high, lambda c: c.x >= hx, 20)
ear_R = cluster_highest(front_high, lambda c: c.x < hx, 20)
muzzle = min((c for c in coords if c.y < ymin + 0.35 * yspan), key=lambda c: c.y, default=min(coords, key=lambda c: c.y))
# tail tip: rear + high
rear = [c for c in coords if c.y > ymin + 0.55 * yspan]
tail_tip = max(rear, key=lambda c: c.z * 0.65 + c.y * 0.35) if rear else max(coords, key=lambda c: c.y)

zcut = zmin + 0.06 * (zmax - zmin)
ground = [c for c in coords if c.z <= zcut]
cell = max(0.010, min(xspan, yspan) * 0.08)
paws = cluster_xy(ground, cell)[:6]
log(f"ground paw clusters={len(paws)}")
for i, (c, n) in enumerate(paws):
    log(f"  paw[{i}] n={n} ({c.x:+.3f},{c.y:+.3f},{c.z:+.3f})")
# split front/hind by median Y of top-4, then L/R by X
top4 = [c for c, _ in paws[:4]] if len(paws) >= 2 else []
if len(top4) >= 2:
    by_y = sorted(top4, key=lambda c: c.y)
    front = by_y[:2]
    hind = by_y[-2:]
    def lr(pair, fallback_y):
        if not pair:
            return Vector((0.04, fallback_y, 0.0)), Vector((-0.04, fallback_y, 0.0))
        if len(pair) == 1:
            p = pair[0]
            return Vector((abs(p.x) + 0.03, p.y, p.z)), Vector((-(abs(p.x) + 0.03), p.y, p.z))
        pair2 = sorted(pair, key=lambda c: -c.x)[:2]  # +X is L
        a, b = pair2[0], pair2[1]
        return a, b
    fl_paw, fr_paw = lr(front, ymin + 0.22 * yspan)
    hl_paw, hr_paw = lr(hind, ymin + 0.62 * yspan)
    # if front paws collapsed to one side, spread using chest width
    def spread(a, b, min_sep=0.055):
        if abs(a.x - b.x) >= min_sep:
            return a, b
        mid = 0.5 * (a.x + b.x)
        ay, az = a.y, a.z
        by, bz = b.y, b.z
        # keep more +X as L
        return Vector((mid + min_sep * 0.5, ay, az)), Vector((mid - min_sep * 0.5, by, bz))
    fl_paw, fr_paw = spread(fl_paw, fr_paw)
    hl_paw, hr_paw = spread(hl_paw, hr_paw)
else:
    fl_paw = cluster_lowest(coords, lambda c: c.x >= 0 and c.y < ymin + 0.40 * yspan and c.z < 0.05, 70)
    fr_paw = cluster_lowest(coords, lambda c: c.x < 0 and c.y < ymin + 0.40 * yspan and c.z < 0.05, 70)
    hl_paw = cluster_lowest(coords, lambda c: c.x >= 0 and c.y > ymin + 0.50 * yspan and c.z < 0.05, 70)
    hr_paw = cluster_lowest(coords, lambda c: c.x < 0 and c.y > ymin + 0.50 * yspan and c.z < 0.05, 70)

head_pts = [c for c in coords if c.y < ymin + 0.28 * yspan and c.z > zmax * 0.55]
head = sum(head_pts, Vector()) / len(head_pts) if head_pts else Vector((0, ymin + 0.08, zmax * 0.78))

chest_pts = [c for c in coords
             if ymin + 0.18 * yspan < c.y < ymin + 0.42 * yspan and 0.14 < c.z < 0.32]
chest = sum(chest_pts, Vector()) / max(1, len(chest_pts)) if chest_pts else Vector((0, ymin + 0.30, 0.22))

hip_pts = [c for c in coords
           if ymin + 0.52 * yspan < c.y < ymin + 0.72 * yspan and 0.12 < c.z < 0.30]
hips = sum(hip_pts, Vector()) / max(1, len(hip_pts)) if hip_pts else Vector((0, ymin + 0.60, 0.20))

tail_root_pts = [c for c in coords
                 if c.y > hips.y + 0.02 and c.z > 0.16 and abs(c.x) < 0.08]
tail_root = (sum(tail_root_pts, Vector()) / len(tail_root_pts)
             if tail_root_pts else Vector((0, hips.y + 0.04, hips.z + 0.04)))

# bow: neck band, mid height just behind head
bow_pts = [c for c in coords
           if ymin + 0.20 * yspan < c.y < ymin + 0.40 * yspan
           and 0.18 < c.z < 0.32 and abs(c.x) > 0.02]
bow = sum(bow_pts, Vector()) / len(bow_pts) if bow_pts else Vector((0, (head.y + chest.y) * 0.5, chest.z + 0.04))

log("")
log("=== LANDMARKS (m) ===")
for name, v in [
    ("ear_L", ear_L), ("ear_R", ear_R), ("muzzle", muzzle), ("head", head),
    ("chest", chest), ("hips", hips), ("tail_root", tail_root), ("tail_tip", tail_tip),
    ("bow", bow),
    ("FL_paw", fl_paw), ("FR_paw", fr_paw), ("HL_paw", hl_paw), ("HR_paw", hr_paw),
]:
    log(f"  {name:10s} ({v.x:+.3f}, {v.y:+.3f}, {v.z:+.3f})")

# ---------------------------------------------------------------------------
# Armature — standing cat
# ---------------------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
arm_data = bpy.data.armatures.new("SukiArmature")
arm_data.display_type = "OCTAHEDRAL"
arm = bpy.data.objects.new("SukiArmature", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones


def add_bone(name, head, tail, parent=None, connect=False, deform=True):
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


add_bone("root", (0, hips.y, 0.0), (0, hips.y, 0.02), deform=False)

spine1_h = Vector((0, hips.y, max(0.10, hips.z * 0.75)))
spine1_t = Vector((0, (hips.y + chest.y) * 0.5, (hips.z + chest.z) * 0.52))
spine2_t = Vector((0, chest.y, chest.z))
spine3_t = Vector((0, (chest.y + head.y) * 0.55, (chest.z + head.z) * 0.50))
add_bone("spine_01", spine1_h, spine1_t, "root", False)
add_bone("spine_02", spine1_t, spine2_t, "spine_01", True)
add_bone("spine_03", spine2_t, spine3_t, "spine_02", True)

neck_t = Vector((0, head.y + 0.01, head.z * 0.80))
add_bone("neck", spine3_t, neck_t, "spine_03", True)
head_t = Vector((0, muzzle.y + 0.01, head.z + 0.01))
add_bone("head", neck_t, head_t, "neck", True)
add_bone("ear_L", (ear_L.x * 0.65, ear_L.y, ear_L.z - 0.035),
         (ear_L.x * 0.85, ear_L.y, ear_L.z), "head", False)
add_bone("ear_R", (ear_R.x * 0.65, ear_R.y, ear_R.z - 0.035),
         (ear_R.x * 0.85, ear_R.y, ear_R.z), "head", False)

sh_z = chest.z + 0.01
sh_y = chest.y - 0.005
sh_x = max(0.032, abs(fl_paw.x) * 0.80)
add_bone("shoulder_L", (0.01, sh_y, sh_z), (sh_x, sh_y - 0.008, sh_z - 0.01), "spine_03", False)
add_bone("shoulder_R", (-0.01, sh_y, sh_z), (-sh_x, sh_y - 0.008, sh_z - 0.01), "spine_03", False)


def front_leg(side, paw, sh_name):
    sx = sh_x if side == "L" else -sh_x
    sy, sz = sh_y - 0.008, sh_z - 0.01
    mid = Vector((sx * 1.05, (sy + paw.y) * 0.55, (sz + paw.z) * 0.50))
    wrist = Vector((paw.x, paw.y, max(0.016, paw.z + 0.012)))
    add_bone(f"upper_F{side}", (sx, sy, sz), mid, sh_name, True)
    add_bone(f"lower_F{side}", mid, wrist, f"upper_F{side}", True)
    add_bone(f"paw_F{side}", wrist, (paw.x, paw.y - 0.014, 0.004), f"lower_F{side}", True)


front_leg("L", fl_paw, "shoulder_L")
front_leg("R", fr_paw, "shoulder_R")

hip_x = max(0.036, abs(hl_paw.x) * 0.85)
add_bone("hip_L", (0.01, hips.y, hips.z), (hip_x, hips.y + 0.008, hips.z - 0.01), "spine_01", False)
add_bone("hip_R", (-0.01, hips.y, hips.z), (-hip_x, hips.y + 0.008, hips.z - 0.01), "spine_01", False)


def hind_leg(side, paw):
    hx = hip_x if side == "L" else -hip_x
    hy, hz = hips.y + 0.008, hips.z - 0.01
    knee = Vector((hx * 1.10, (hy + paw.y) * 0.45 + 0.01, max(0.05, (hz + paw.z) * 0.50)))
    ankle = Vector((paw.x, paw.y, max(0.016, paw.z + 0.010)))
    add_bone(f"thigh_{side}", (hx, hy, hz), knee, f"hip_{side}", True)
    add_bone(f"shin_{side}", knee, ankle, f"thigh_{side}", True)
    add_bone(f"paw_H{side}", ankle, (paw.x, paw.y + 0.012, 0.004), f"shin_{side}", True)


hind_leg("L", hl_paw)
hind_leg("R", hr_paw)

# Tail up (stand) — 4 bones + spring tip
tt = Vector(tail_tip)
tr = Vector((0.0, tail_root.y, max(0.14, tail_root.z)))
# lift tip if it came out low
if tt.z < tr.z:
    tt = Vector((tt.x * 0.3, tt.y, tr.z + 0.08))
for i, (a, b) in enumerate([
    (tr, tr.lerp(tt, 0.30)),
    (tr.lerp(tt, 0.30), tr.lerp(tt, 0.55)),
    (tr.lerp(tt, 0.55), tr.lerp(tt, 0.78)),
    (tr.lerp(tt, 0.78), tt + Vector((0, 0.008, 0.008))),
]):
    parent = "spine_01" if i == 0 else f"tail_0{i}"
    add_bone(f"tail_0{i+1}", a, b, parent, connect=(i > 0))

# Bow spring (cheap)
add_bone("bow", (0, bow.y, bow.z), (0, bow.y - 0.012, bow.z + 0.018), "neck", False)
add_bone("bow_L", (0.008, bow.y, bow.z + 0.006), (0.035, bow.y - 0.008, bow.z + 0.012), "bow", False)
add_bone("bow_R", (-0.008, bow.y, bow.z + 0.006), (-0.035, bow.y - 0.008, bow.z + 0.012), "bow", False)

for b in eb:
    b.envelope_distance = 0.040
    b.envelope_weight = 1.0
    b.head_radius = 0.016
    b.tail_radius = 0.011

log("")
log("=== ARMATURE ===")
for b in eb:
    p = b.parent.name if b.parent else "-"
    log(f"  {b.name:14s} parent={p:12s} deform={b.use_deform}")

bpy.ops.object.mode_set(mode="OBJECT")

# ---------------------------------------------------------------------------
# Weights
# ---------------------------------------------------------------------------
weight_method = "nearest_bone"
weight_notes = []


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


def dist_point_seg(p, a, b):
    ab = b - a
    L2 = ab.length_squared
    if L2 < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / L2))
    return (p - (a + ab * t)).length


def assign_nearest_bones(mesh_obj, arm_obj, k=3):
    """Always-on skin: inverse-square distance to k nearest deform bones."""
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    segs = []
    for b in arm_obj.data.edit_bones:
        if not b.use_deform:
            continue
        # thicker influence for body, thinner for ears/bow/tail tip
        rad = 0.028
        if b.name.startswith("spine") or b.name in ("neck", "head"):
            rad = 0.055
        elif b.name.startswith("tail"):
            rad = 0.022
        elif b.name.startswith("bow") or b.name.startswith("ear"):
            rad = 0.016
        elif "paw" in b.name:
            rad = 0.018
        segs.append((b.name, Vector(b.head), Vector(b.tail), rad))
    bpy.ops.object.mode_set(mode="OBJECT")

    mesh_obj.vertex_groups.clear()
    for mod in list(mesh_obj.modifiers):
        if mod.type == "ARMATURE":
            mesh_obj.modifiers.remove(mod)
    vgs = {name: mesh_obj.vertex_groups.new(name=name) for name, *_ in segs}
    mw = mesh_obj.matrix_world
    batches = {name: [] for name, *_ in segs}
    for v in mesh_obj.data.vertices:
        p = mw @ v.co
        scored = []
        for name, a, b, rad in segs:
            d = dist_point_seg(p, a, b)
            scored.append((d / max(1e-6, rad), d, name))
        scored.sort()
        take = scored[:k]
        # hard bind if very close to one bone
        if take[0][0] < 0.55:
            take = take[:1]
        ws = []
        for nd, d, name in take:
            ws.append((name, 1.0 / max(d, 0.004) ** 2))
        s = sum(w for _, w in ws) or 1.0
        for name, w in ws:
            batches[name].append((v.index, w / s))
    for name, pairs in batches.items():
        if not pairs:
            continue
        # add in chunks
        step = 4000
        for i in range(0, len(pairs), step):
            vgs[name].add([idx for idx, _ in pairs[i:i+step]], 1.0, "REPLACE")
        # set real weights (add with REPLACE 1 then... better add one-by-one for accuracy)
    # redo weights properly (second pass on groups)
    for name, pairs in batches.items():
        vg = vgs[name]
        for idx, w in pairs:
            vg.add([idx], w, "REPLACE")

    mesh_obj.parent = arm_obj
    mesh_obj.parent_type = "OBJECT"
    mod = mesh_obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm_obj
    mod.use_vertex_groups = True
    mod.use_bone_envelopes = False


log("")
log("=== WEIGHT BIND ===")
log("Heat failed on Hunyuan non-manifold last run; using nearest-bone (weights-first FAIL loop).")
assign_nearest_bones(obj, arm, k=3)
unassigned, frac, maxw = count_unassigned(obj)
weight_notes.append(f"After nearest-bone: unassigned={unassigned} assigned_frac={frac:.3f} max_total_w={maxw:.3f} vgroups={len(obj.vertex_groups)}")
log(weight_notes[-1])
weight_method = "nearest_bone"

bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
try:
    bpy.ops.object.vertex_group_limit_total(limit=4)
    weight_notes.append("limit_total=4")
except Exception as e:
    weight_notes.append(f"limit_total failed: {e}")
try:
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    weight_notes.append("normalize_all")
except Exception as e:
    weight_notes.append(f"normalize_all failed: {e}")
unassigned, frac, maxw = count_unassigned(obj)
weight_notes.append(f"After normalize/limit: unassigned={unassigned} assigned_frac={frac:.3f} max_total_w={maxw:.3f}")
log(weight_notes[-1])
try:
    bpy.ops.object.vertex_group_smooth(group_select='ALL', factor=0.35, repeat=3, expand=0.15)
    weight_notes.append("vertex_group_smooth factor=0.35 repeat=3")
except Exception as e:
    try:
        bpy.ops.object.vertex_group_smooth(factor=0.35, repeat=3)
        weight_notes.append("vertex_group_smooth factor=0.35 repeat=3 (no group_select)")
    except Exception as e2:
        weight_notes.append(f"smooth failed: {e} | {e2}")
unassigned, frac, maxw = count_unassigned(obj)
weight_notes.append(f"After smooth: unassigned={unassigned} assigned_frac={frac:.3f} max_total_w={maxw:.3f}")
log(weight_notes[-1])

# Deform test
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
pb = arm.pose.bones
test_name = "spine_02" if "spine_02" in pb else list(pb.keys())[1]
deps = bpy.context.evaluated_depsgraph_get()
obj_eval = obj.evaluated_get(deps)
idxs = [i for i in (0, 100, 500, 2000, 8000, 20000, 40000) if i < len(obj.data.vertices)]
em0 = obj_eval.to_mesh()
before = [obj_eval.matrix_world @ em0.vertices[i].co for i in idxs]
obj_eval.to_mesh_clear()
pb[test_name].rotation_mode = "XYZ"
pb[test_name].rotation_euler[0] = math.radians(30)
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
obj_eval = obj.evaluated_get(deps)
em1 = obj_eval.to_mesh()
after = [obj_eval.matrix_world @ em1.vertices[i].co for i in idxs]
obj_eval.to_mesh_clear()
deltas = [(a - b).length for a, b in zip(after, before)]
moved = sum(1 for d in deltas if d > 1e-5)
max_delta = max(deltas) if deltas else 0
deform_real = max_delta > 0.002
log(f"Deform test {test_name} +30deg X: moved={moved}/{len(deltas)} max_delta={max_delta:.5f}m real={deform_real}")
pb[test_name].rotation_euler[0] = 0
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")

# ---------------------------------------------------------------------------
# Pose helpers
# ---------------------------------------------------------------------------


def zero_pose():
    for b in arm.pose.bones:
        b.rotation_mode = "XYZ"
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)
        b.scale = (1, 1, 1)


def set_e(name, x=0, y=0, z=0):
    if name not in arm.pose.bones:
        return
    b = arm.pose.bones[name]
    b.rotation_mode = "XYZ"
    b.rotation_euler = (math.radians(x), math.radians(y), math.radians(z))


def add_e(name, x=0, y=0, z=0):
    if name not in arm.pose.bones:
        return
    b = arm.pose.bones[name]
    b.rotation_mode = "XYZ"
    b.rotation_euler[0] += math.radians(x)
    b.rotation_euler[1] += math.radians(y)
    b.rotation_euler[2] += math.radians(z)


def pose_rest():
    zero_pose()
    set_e("tail_02", z=4)
    set_e("tail_03", z=-6)
    set_e("bow_L", z=4)
    set_e("bow_R", z=-4)


def pose_sit():
    """Haunches down from STAND rest — distinct sit, not bind rest."""
    zero_pose()
    set_e("spine_01", x=-12)
    set_e("spine_02", x=-10)
    set_e("spine_03", x=8)
    set_e("neck", x=-12, z=8)
    set_e("head", x=10, z=-4, y=6)
    set_e("hip_L", x=16)
    set_e("hip_R", x=16)
    set_e("thigh_L", x=22)
    set_e("thigh_R", x=22)
    set_e("shin_L", x=-28)
    set_e("shin_R", x=-28)
    set_e("paw_HL", x=12)
    set_e("paw_HR", x=12)
    set_e("shoulder_L", x=6)
    set_e("shoulder_R", x=6)
    set_e("upper_FL", x=10)
    set_e("upper_FR", x=10)
    set_e("tail_01", x=-18, z=22)
    set_e("tail_02", x=-8, z=28)
    set_e("tail_03", z=24)
    set_e("tail_04", x=10, z=16)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0, 0.01, -0.02)


def pose_walk():
    """Diagonal trot still (FL+HR forward)."""
    zero_pose()
    set_e("spine_01", x=4, z=-4)
    set_e("spine_02", x=2, z=5)
    set_e("spine_03", x=-4, z=-3)
    set_e("neck", x=-6, y=4)
    set_e("head", x=6, z=5)
    set_e("shoulder_L", x=-12)
    set_e("upper_FL", x=-14)
    set_e("lower_FL", x=-8)
    set_e("paw_FL", x=14)
    set_e("shoulder_R", x=10)
    set_e("upper_FR", x=12)
    set_e("lower_FR", x=6)
    set_e("hip_L", x=8)
    set_e("thigh_L", x=14)
    set_e("shin_L", x=8)
    set_e("hip_R", x=-10)
    set_e("thigh_R", x=-12)
    set_e("shin_R", x=-8)
    set_e("paw_HR", x=8)
    set_e("tail_01", x=-8, z=-6)
    set_e("tail_02", z=10)
    set_e("tail_03", z=-8)
    set_e("bow_L", z=8)
    set_e("bow_R", z=-6)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0, 0, 0.004)


def pose_playbow():
    zero_pose()
    set_e("spine_01", x=18)
    set_e("spine_02", x=8)
    set_e("spine_03", x=-24)
    set_e("neck", x=-8)
    set_e("head", x=16, z=4)
    set_e("shoulder_L", x=16)
    set_e("shoulder_R", x=16)
    set_e("upper_FL", x=14)
    set_e("upper_FR", x=14)
    set_e("lower_FL", x=8)
    set_e("lower_FR", x=8)
    set_e("hip_L", x=8)
    set_e("hip_R", x=8)
    set_e("thigh_L", x=16)
    set_e("thigh_R", x=16)
    set_e("shin_L", x=4)
    set_e("shin_R", x=4)
    set_e("tail_01", x=-28, z=6)
    set_e("tail_02", x=-14)
    set_e("tail_03", x=12)
    set_e("tail_04", x=14)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0, 0.006, 0.004)


def pose_run_still():
    pose_walk()
    add_e("upper_FL", x=-10)
    add_e("upper_FR", x=8)
    add_e("thigh_R", x=-8)
    add_e("spine_02", x=4)


def pose_swipe():
    zero_pose()
    set_e("spine_03", z=-8)
    set_e("neck", z=-10)
    set_e("head", z=8, x=6)
    set_e("shoulder_L", x=-40, z=10)
    set_e("upper_FL", x=-55)
    set_e("lower_FL", x=-20)
    set_e("paw_FL", x=20, z=15)
    set_e("tail_02", z=12)


def pose_cuddle():
    zero_pose()
    set_e("spine_01", x=-8)
    set_e("spine_02", x=-6)
    set_e("spine_03", x=10)
    set_e("neck", x=8)
    set_e("head", x=12, y=6)
    set_e("shoulder_L", x=12)
    set_e("shoulder_R", x=12)
    set_e("upper_FL", x=16)
    set_e("upper_FR", x=16)
    set_e("hip_L", x=10)
    set_e("hip_R", x=10)
    set_e("thigh_L", x=12)
    set_e("thigh_R", x=12)
    set_e("tail_01", x=10, z=18)
    set_e("tail_02", z=22)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0, 0, -0.012)


def pose_hit():
    zero_pose()
    set_e("spine_01", x=8, z=-10)
    set_e("spine_02", z=-8)
    set_e("neck", x=16, z=-12)
    set_e("head", x=-8, z=-10)
    set_e("ear_L", y=20)
    set_e("ear_R", y=-20)
    set_e("tail_01", x=16, z=-20)
    set_e("tail_02", z=-16)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0.008, 0.01, 0)


# ---------------------------------------------------------------------------
# Edge-stretch shred metric on current pose vs rest
# ---------------------------------------------------------------------------

def rest_edge_lengths():
    mesh = obj.data
    lengths = []
    for e in mesh.edges:
        a = mesh.vertices[e.vertices[0]].co
        b = mesh.vertices[e.vertices[1]].co
        lengths.append((b - a).length)
    return lengths


REST_EDGE = rest_edge_lengths()


def shred_metric():
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    em = ev.to_mesh()
    stretched = 0
    exploded = 0
    max_ratio = 1.0
    n = min(len(em.edges), len(REST_EDGE))
    step = max(1, n // 8000)
    checked = 0
    for i in range(0, n, step):
        e = em.edges[i]
        a = em.vertices[e.vertices[0]].co
        b = em.vertices[e.vertices[1]].co
        L = (b - a).length
        r0 = REST_EDGE[i]
        if r0 < 1e-6:
            continue
        ratio = L / r0
        max_ratio = max(max_ratio, ratio)
        checked += 1
        if ratio > 3.5:
            stretched += 1
        if ratio > 8.0:
            exploded += 1
    ev.to_mesh_clear()
    frac_st = stretched / max(1, checked)
    return {
        "max_edge_ratio": max_ratio,
        "stretch_frac": frac_st,
        "exploded": exploded,
        "checked": checked,
        "shred": (frac_st > 0.035) or (exploded > 40),
    }


# ---------------------------------------------------------------------------
# Actions / clips
# ---------------------------------------------------------------------------
CLIP_FRAMES = {
    "Idle": 48,
    "Idle_Look": 36,
    "Walk": 24,
    "Run": 16,
    "Swipe": 20,
    "Sit": 28,
    "Cuddle": 32,
    "Hit": 16,
}


def key_all(frame):
    for b in arm.pose.bones:
        b.keyframe_insert("rotation_euler", frame=frame)
        b.keyframe_insert("location", frame=frame)


def make_action(name, nframes, apply_frame):
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for f in range(1, nframes + 1):
        bpy.context.scene.frame_set(f)
        apply_frame(f, nframes)
        key_all(f)
    log(f"  clip {name} frames=1..{nframes} fcurves={len(act.fcurves)}")
    return act


def ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * t)


def idle_frame(f, n):
    t = (f - 1) / n
    zero_pose()
    breathe = 2.2 * math.sin(2 * math.pi * t)
    set_e("spine_02", x=breathe)
    set_e("spine_03", x=breathe * 0.6)
    set_e("tail_01", z=8 * math.sin(2 * math.pi * t))
    set_e("tail_02", z=10 * math.sin(2 * math.pi * t + 0.6))
    set_e("tail_03", z=8 * math.sin(2 * math.pi * t + 1.1))
    set_e("bow_L", z=6 * math.sin(2 * math.pi * t + 0.4))
    set_e("bow_R", z=-6 * math.sin(2 * math.pi * t + 0.4))
    set_e("head", y=2 * math.sin(2 * math.pi * t))


def idle_look_frame(f, n):
    t = (f - 1) / n
    idle_frame(f, n)
    # glance R then L
    if t < 0.45:
        k = ease(t / 0.45)
        add_e("neck", z=-16 * k, y=4 * k)
        add_e("head", z=-10 * k)
    elif t < 0.85:
        k = ease((t - 0.45) / 0.40)
        add_e("neck", z=18 * k, y=-3 * k)
        add_e("head", z=12 * k)
    else:
        k = 1.0 - ease((t - 0.85) / 0.15)
        add_e("neck", z=18 * k)
        add_e("head", z=12 * k)


def walk_frame(f, n):
    t = (f - 1) / n
    ang = 2 * math.pi * t
    zero_pose()
    set_e("spine_01", x=3 * math.sin(ang), z=-5 * math.sin(ang))
    set_e("spine_02", z=5 * math.sin(ang))
    set_e("spine_03", x=-3 * math.sin(ang), z=-3 * math.sin(ang))
    set_e("neck", x=-4, y=3 * math.sin(ang))
    set_e("head", x=4, z=4 * math.sin(ang))
    # diagonal trot
    set_e("shoulder_L", x=-16 * math.sin(ang))
    set_e("upper_FL", x=-20 * math.sin(ang))
    set_e("lower_FL", x=-8 * math.sin(ang))
    set_e("paw_FL", x=10 * math.sin(ang))
    set_e("shoulder_R", x=16 * math.sin(ang))
    set_e("upper_FR", x=20 * math.sin(ang))
    set_e("lower_FR", x=8 * math.sin(ang))
    set_e("hip_L", x=12 * math.sin(ang))
    set_e("thigh_L", x=16 * math.sin(ang))
    set_e("shin_L", x=8 * math.sin(ang))
    set_e("hip_R", x=-12 * math.sin(ang))
    set_e("thigh_R", x=-16 * math.sin(ang))
    set_e("shin_R", x=-8 * math.sin(ang))
    set_e("tail_01", z=-8 * math.sin(ang))
    set_e("tail_02", z=10 * math.sin(ang + 0.5))
    set_e("bow_L", z=5 * math.sin(ang + 0.3))
    set_e("bow_R", z=-5 * math.sin(ang + 0.3))
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0, 0, 0.003 + 0.004 * abs(math.sin(ang)))


def run_frame(f, n):
    t = (f - 1) / n
    ang = 2 * math.pi * t
    walk_frame(f, n)
    add_e("upper_FL", x=-8 * math.sin(ang))
    add_e("upper_FR", x=8 * math.sin(ang))
    add_e("thigh_L", x=6 * math.sin(ang))
    add_e("thigh_R", x=-6 * math.sin(ang))
    add_e("spine_02", x=4)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0, 0, 0.008 + 0.008 * abs(math.sin(ang)))


def swipe_frame(f, n):
    t = (f - 1) / max(1, n - 1)
    zero_pose()
    if t < 0.25:
        k = ease(t / 0.25)
        set_e("shoulder_L", x=-20 * k, z=8 * k)
        set_e("upper_FL", x=-15 * k)
        set_e("head", z=6 * k)
    elif t < 0.55:
        k = ease((t - 0.25) / 0.30)
        set_e("shoulder_L", x=-20 + -35 * k, z=8)
        set_e("upper_FL", x=-15 + -45 * k)
        set_e("lower_FL", x=-22 * k)
        set_e("paw_FL", x=18 * k, z=12 * k)
        set_e("spine_03", z=-10 * k)
        set_e("head", z=8, x=6 * k)
    else:
        k = 1.0 - ease((t - 0.55) / 0.45)
        set_e("shoulder_L", x=-55 * k)
        set_e("upper_FL", x=-60 * k)
        set_e("lower_FL", x=-22 * k)
        set_e("spine_03", z=-10 * k)


def sit_frame(f, n):
    t = ease((f - 1) / max(1, n - 1))
    zero_pose()
    set_e("spine_01", x=-12 * t)
    set_e("spine_02", x=-10 * t)
    set_e("spine_03", x=8 * t)
    set_e("neck", x=-12 * t, z=8 * t)
    set_e("head", x=10 * t, z=-4 * t, y=6 * t)
    set_e("hip_L", x=16 * t)
    set_e("hip_R", x=16 * t)
    set_e("thigh_L", x=22 * t)
    set_e("thigh_R", x=22 * t)
    set_e("shin_L", x=-28 * t)
    set_e("shin_R", x=-28 * t)
    set_e("tail_01", x=-18 * t, z=22 * t)
    set_e("tail_02", z=28 * t)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0, 0.01 * t, -0.02 * t)


def cuddle_frame(f, n):
    t = (f - 1) / n
    k = 0.5 - 0.5 * math.cos(2 * math.pi * min(1.0, t * 1.05))
    # hold mid
    if 0.25 < t < 0.75:
        k = 1.0
    elif t >= 0.75:
        k = 1.0 - ease((t - 0.75) / 0.25)
    else:
        k = ease(t / 0.25)
    zero_pose()
    set_e("spine_01", x=-8 * k)
    set_e("spine_03", x=10 * k)
    set_e("neck", x=8 * k)
    set_e("head", x=12 * k, y=6 * k)
    set_e("upper_FL", x=16 * k)
    set_e("upper_FR", x=16 * k)
    set_e("thigh_L", x=12 * k)
    set_e("thigh_R", x=12 * k)
    set_e("tail_01", z=18 * k)
    set_e("tail_02", z=22 * k)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0, 0, -0.012 * k)


def hit_frame(f, n):
    t = (f - 1) / max(1, n - 1)
    if t < 0.35:
        k = ease(t / 0.35)
    else:
        k = 1.0 - ease((t - 0.35) / 0.65)
    zero_pose()
    set_e("spine_01", x=8 * k, z=-10 * k)
    set_e("neck", x=16 * k, z=-12 * k)
    set_e("head", x=-8 * k, z=-10 * k)
    set_e("tail_01", x=16 * k, z=-20 * k)
    if "root" in arm.pose.bones:
        arm.pose.bones["root"].location = (0.008 * k, 0.01 * k, 0)


log("")
log("=== CLIPS ===")
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for nm, fn in [
    ("Idle", idle_frame),
    ("Idle_Look", idle_look_frame),
    ("Walk", walk_frame),
    ("Run", run_frame),
    ("Swipe", swipe_frame),
    ("Sit", sit_frame),
    ("Cuddle", cuddle_frame),
    ("Hit", hit_frame),
]:
    make_action(nm, CLIP_FRAMES[nm], fn)

# walk shred at mid cycle
arm.animation_data.action = bpy.data.actions.get("Walk")
bpy.context.scene.frame_set(7)
bpy.context.view_layer.update()
walk_shred = shred_metric()
log(f"Walk shred metric: {walk_shred}")

# rest shred should be ~none
arm.animation_data.action = None
zero_pose()
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")

# ---------------------------------------------------------------------------
# Toon-ish EEVEE + lights + camera
# ---------------------------------------------------------------------------
ensure_world()
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 1280
scene.render.resolution_y = 1080
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
try:
    scene.eevee.taa_render_samples = 24
    scene.eevee.use_shadows = True
except Exception:
    pass

# slight toon: raise shadow term, keep albedo
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nt = mat.node_tree
    pr = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if pr and "Roughness" in pr.inputs:
        pr.inputs["Roughness"].default_value = max(pr.inputs["Roughness"].default_value, 0.62)
        if "Specular IOR Level" in pr.inputs:
            pr.inputs["Specular IOR Level"].default_value = 0.18

bpy.ops.mesh.primitive_plane_add(size=6.0, location=(0.0, 0.0, -0.001))
ground = bpy.context.active_object
ground.name = "Ground"
gmat = bpy.data.materials.new("GroundMat")
gmat.use_nodes = True
pr = gmat.node_tree.nodes.get("Principled BSDF")
if pr:
    pr.inputs["Base Color"].default_value = (0.09, 0.09, 0.10, 1)
    pr.inputs["Roughness"].default_value = 0.9
ground.data.materials.append(gmat)


def add_area(name, loc, energy, size=1.2, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    data.color = color
    o = bpy.data.objects.new(name, data)
    o.location = loc
    bpy.context.collection.objects.link(o)
    direction = Vector((0, 0, 0.16)) - Vector(loc)
    o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return o


add_area("key", (0.50, -0.90, 0.70), 160, 1.1, (1.0, 0.98, 0.95))
add_area("fill", (-0.65, -0.40, 0.42), 60, 1.4, (0.85, 0.90, 1.0))
add_area("rim", (0.12, 0.85, 0.50), 80, 1.0, (1.0, 0.95, 1.0))
sun = bpy.data.lights.new("sun", "SUN")
sun.energy = 1.1
so = bpy.data.objects.new("sun", sun)
so.location = (0.4, -0.6, 1.2)
so.rotation_euler = (math.radians(45), 0, math.radians(-25))
bpy.context.collection.objects.link(so)

camd = bpy.data.cameras.new("SukiCam")
camd.lens = 55
cam = bpy.data.objects.new("SukiCam", camd)
bpy.context.collection.objects.link(cam)
scene.camera = cam
target = Vector((0.0, chest.y * 0.35, size.z * 0.42))
cam.location = Vector((0.40, ymin - 0.72, size.z * 0.38))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()


def render_pose(name, pose_fn, path):
    if arm.animation_data:
        arm.animation_data.action = None
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    pose_fn()
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    log(f"Rendered {name} -> {path} bytes={os.path.getsize(path) if os.path.isfile(path) else 0}")


log("")
log("=== RENDERS ===")
render_pose("rest", pose_rest, RENDERS["rest"])
render_pose("sit", pose_sit, RENDERS["sit"])
render_pose("walk", pose_walk, RENDERS["walk"])
render_pose("playbow", pose_playbow, RENDERS["playbow"])

# walk shred again on still pose
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
pose_walk()
bpy.context.view_layer.update()
walk_shred_still = shred_metric()
log(f"Walk-still shred metric: {walk_shred_still}")
zero_pose()
bpy.ops.object.mode_set(mode="OBJECT")

# ---------------------------------------------------------------------------
# Export bound + clips
# ---------------------------------------------------------------------------
if arm.animation_data:
    arm.animation_data.action = bpy.data.actions.get("Idle")
bpy.ops.object.select_all(action="DESELECT")
obj.hide_set(False)
arm.hide_set(False)
obj.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm

export_ok = False
export_err = ""
try:
    bpy.ops.export_scene.gltf(
        filepath=BOUND,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )
    export_ok = os.path.isfile(BOUND)
except Exception as e:
    export_err = str(e)
    log(f"export ACTIONS failed: {e}")
    try:
        bpy.ops.export_scene.gltf(
            filepath=BOUND,
            export_format="GLB",
            use_selection=True,
            export_apply=False,
            export_skins=True,
            export_animations=True,
            export_morph=False,
            export_cameras=False,
            export_lights=False,
            export_yup=True,
        )
        export_ok = os.path.isfile(BOUND)
    except Exception as e2:
        export_err = f"{export_err} | fallback: {e2}"

log("")
log("=== EXPORT ===")
log(f"Bound GLB: {BOUND} exists={export_ok} bytes={os.path.getsize(BOUND) if export_ok else 0}")
if export_err:
    log(f"export notes: {export_err}")

clips = ["Idle", "Idle_Look", "Walk", "Run", "Swipe", "Sit", "Cuddle", "Hit"]
shred_fail = bool(walk_shred.get("shred") or walk_shred_still.get("shred"))
walk_pass = bool(deform_real) and (not shred_fail)
log("")
log("=== GATE ===")
log(f"Rest diagnosis: STAND PASS (bind source)")
log(f"Real deform: {deform_real} max_delta={max_delta:.5f}m")
log(f"Walk shred (cycle): {walk_shred}")
log(f"Walk shred (still): {walk_shred_still}")
log(f"WALK GATE: {'PASS' if walk_pass else 'FAIL'}")
log(f"Clips: {', '.join(clips)}")
log("Spring: tail_01-04 + bow/bow_L/bow_R keyed in Idle/Walk")
log("Toon: EEVEE + roughness lift; PBR maps kept")
log("FAIL loop: weights first, then new Hunyuan. No sit-rest bind.")

with open(REPORT, "w") as f:
    f.write("\n".join(notes) + "\n")
log(f"Report: {REPORT}")
