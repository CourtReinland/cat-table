"""
Suki, sculpted from scratch — CANON lock (Court, 2026-08-22).

Refs: sit-front / play-bow / loaf-sleep / prance / rooftop-toast
  fluffy white / pale-pink longhair kitten on a CAT skull,
  tufted cheeks (not a dumpling), big sapphire eyes, hero pink bow.

Pipeline:
  1. metaball skeleton -> one seamless organic volume (body, haunches, legs, neck, tail)
  2. remesh + shrink-smooth -> clean quad-ish mesh ~6k tris
  3. head furniture (ears, muzzle, eyes, nose) joined / parented
  4. per-vertex coat paint computed analytically (no UVs, no bake)
  5. armature + automatic weights
  6. scripted actions: Idle, Idle_Look, Walk, Run, Swipe, Sit, Cuddle, Hit
     + PlayBow, Loaf, Wink
  7. export public/assets/models/suki.glb

Headless:  blender --background --python tools/blender/sculpt_suki.py
Live (MCP): exec(open('.../sculpt_suki.py').read())
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix, Euler

# ─────────────────────────────────────────────────────────────── palette ────
# CANON: fluffy white / pale-pink. Cream-apricot and amber are dead.
FUR         = (0.985, 0.955, 0.962, 1.0)   # white with a pink breath
FUR_LIT     = (1.000, 0.990, 0.994, 1.0)
FUR_SHADE   = (0.930, 0.845, 0.868, 1.0)   # recess / under-fluff
M_MARK      = (0.780, 0.735, 0.755, 1.0)   # faint forehead M
EAR_PINK    = (0.965, 0.620, 0.680, 1.0)
NOSE_PINK   = (0.955, 0.520, 0.575, 1.0)
BLUSH       = (0.970, 0.560, 0.650, 1.0)
BEAN        = (0.960, 0.430, 0.560, 1.0)
BLUE        = (0.180, 0.460, 0.920, 1.0)   # sapphire iris
BLUE_DEEP   = (0.080, 0.250, 0.700, 1.0)
PUPIL       = (0.050, 0.040, 0.070, 1.0)
LASH        = (0.070, 0.045, 0.055, 1.0)
TONGUE      = (0.960, 0.420, 0.520, 1.0)
RIBBON      = (0.980, 0.340, 0.580, 1.0)   # hero bow — identity
RIBBON_DK   = (0.900, 0.220, 0.460, 1.0)
WHITE       = (1.0, 1.0, 1.0, 1.0)

# proportions (metres — real-cat scale, game rescales)
# domestic cat: short loin, long legs, high stand — not a dachshund barrel
BODY_LEN   = 0.34
SHOULDER_H = 0.225

# name of the per-vertex coat colour attribute (exported as COLOR_0)
COAT_ATTR = 'Col'

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) \
    if '__file__' in globals() else '/Users/capricorn/Projects/cat-table'
GLB_OUT = os.path.join(REPO, 'public/assets/models/suki.glb')


# ───────────────────────────────────────────────────────────────── utils ────
def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgba):
    """Palette entries are authored as display sRGB; Blender colour attributes
    and Principled inputs are scene-linear, and the glTF exporter writes them
    through untouched. Without this everything ships ~15% too pale."""
    return (_srgb_to_linear(rgba[0]), _srgb_to_linear(rgba[1]),
            _srgb_to_linear(rgba[2]), rgba[3] if len(rgba) > 3 else 1.0)


def view3d_ctx():
    """Context override so object ops work when driven over MCP (no 3D area focus)."""
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type == 'VIEW_3D':
                return {
                    'window': win, 'screen': win.screen, 'area': area,
                    'region': next(r for r in area.regions if r.type == 'WINDOW'),
                    'scene': bpy.context.scene,
                    'view_layer': bpy.context.view_layer,
                }
    return {'scene': bpy.context.scene, 'view_layer': bpy.context.view_layer}


def op(fn, *args, **kw):
    """Run a bpy operator under a valid 3D-viewport context."""
    with bpy.context.temp_override(**view3d_ctx()):
        return fn(*args, **kw)


def reset_scene():
    """Wipe the scene without a factory reset (which would drop the MCP addon)."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.metaballs, bpy.data.armatures,
                 bpy.data.materials, bpy.data.actions, bpy.data.images):
        for blk in list(coll):
            if blk.users == 0:
                coll.remove(blk)
    sc = bpy.context.scene
    sc.unit_settings.scale_length = 1.0


def mat(name, rgba, rough=0.85, metal=0.0, emit=None, emit_str=0.0, vcol=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = lin(rgba)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = lin(emit)
        bsdf.inputs['Emission Strength'].default_value = emit_str
    if vcol and not any(n.type == 'ATTRIBUTE' for n in m.node_tree.nodes):
        # drives Base Color from the painted coat, so previews match the GLB
        cn = m.node_tree.nodes.new('ShaderNodeAttribute')
        cn.attribute_type = 'GEOMETRY'
        cn.attribute_name = COAT_ATTR
        cn.location = (-300, 200)
        m.node_tree.links.new(cn.outputs['Color'], bsdf.inputs['Base Color'])
    m.diffuse_color = rgba
    return m


def new_mesh_obj(name, verts, faces, material=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if material:
        ob.data.materials.append(material)
    return ob


def prim(kind, name, loc, scale, rot=(0, 0, 0), material=None, **kw):
    """UV sphere / cone / cylinder / torus helper, always shade-smooth."""
    if kind == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=kw.get('seg', 24), ring_count=kw.get('ring', 14),
            radius=1.0, location=loc)
    elif kind == 'cone':
        bpy.ops.mesh.primitive_cone_add(
            vertices=kw.get('seg', 16), radius1=1.0, radius2=kw.get('r2', 0.0),
            depth=2.0, location=loc)
    elif kind == 'cyl':
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=kw.get('seg', 16), radius=1.0, depth=2.0, location=loc)
    elif kind == 'torus':
        bpy.ops.mesh.primitive_torus_add(
            major_segments=kw.get('mseg', 24), minor_segments=kw.get('nseg', 10),
            major_radius=1.0, minor_radius=kw.get('minor', 0.2), location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    ob.rotation_euler = Euler(rot, 'XYZ')
    if material:
        ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def apply_transforms(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def join(objs, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    return ob


# ──────────────────────────────────────────────────────── 1. body volume ────
# (x = right, y = forward is -Y in Blender front view, z = up)
# Suki faces -Y so that glTF export (+Y up) lands her facing +Z in three.js.

# each entry: (x, y, z, radius, stiffness) — mirrored automatically when x != 0
# Strokes: polylines of (x, y, z, radius) resampled into dense metaball chains,
# so limbs come out as continuous tapered tubes instead of strings of beads.
STROKES = {
    # ── barrel: SHORT loin, high stand — a cat in space, not a dumpling ──
    # sit-front / prance: withers→hip ~0.14m; legs drop ~0.20m to the paw
    'spine': [
        (0.000, -0.062, 0.208, 0.038),   # chest / withers
        (0.000, -0.022, 0.204, 0.034),
        (0.000,  0.016, 0.200, 0.028),   # short waist — visible tuck
        (0.000,  0.050, 0.202, 0.036),   # hip
        (0.000,  0.078, 0.192, 0.040),   # compact haunch
    ],
    'keel': [
        (0.000, -0.060, 0.172, 0.026),
        (0.000, -0.070, 0.154, 0.020),
    ],
    'shoulder': [
        (0.038, -0.058, 0.210, 0.024),
        (0.034, -0.038, 0.204, 0.018),
    ],
    # ribcage width — she occupies cat-space, not a noodle
    'ribcage': [
        (0.042, -0.052, 0.188, 0.022),
        (0.038, -0.024, 0.186, 0.018),
    ],
    # chest ruff — high bib, not a hanging dumpling
    'ruff': [
        (0.000, -0.068, 0.200, 0.030),
        (0.000, -0.084, 0.184, 0.026),
        (0.000, -0.092, 0.170, 0.018),
    ],
    # visible kitten neck between withers and occiput
    'neck': [
        (0.000, -0.074, 0.220, 0.020),
        (0.000, -0.102, 0.240, 0.018),
        (0.000, -0.128, 0.256, 0.022),
    ],
    # CAT SKULL — sit-front. Cute kitten, flattened crown, tapers to muzzle.
    # Not a sphere. Not HEAD_SCALE 1.16. Width comes from modest cheek tufts.
    'skull': [
        (0.000, -0.140, 0.256, 0.024),   # occiput
        (0.000, -0.160, 0.280, 0.034),   # crown — taller than wide
        (0.000, -0.180, 0.274, 0.030),   # forehead
        (0.000, -0.192, 0.258, 0.022),   # brow
    ],
    'muzzle': [
        (0.000, -0.198, 0.256, 0.016),
        (0.000, -0.212, 0.250, 0.012),
        (0.000, -0.222, 0.246, 0.009),
    ],
    'chin': [
        (0.000, -0.196, 0.242, 0.012),
        (0.000, -0.208, 0.240, 0.010),
    ],
    'pad': [
        (0.012, -0.210, 0.250, 0.010),
        (0.016, -0.200, 0.248, 0.011),
    ],
    # cheek tufts taper to the chin — fluffy, not planet-wide
    'cheek': [
        (0.026, -0.160, 0.264, 0.012),
        (0.028, -0.176, 0.254, 0.014),
        (0.022, -0.190, 0.246, 0.010),
    ],
    # short limb stumps only — real legs are separate bone-parented meshes
    # so Sit / PlayBow / Walk can fold without smearing the torso
    'forestump': [
        (0.038, -0.056, 0.188, 0.016),
        (0.038, -0.056, 0.168, 0.012),
    ],
    'hindstump': [
        (0.042,  0.070, 0.180, 0.022),
        (0.043,  0.078, 0.158, 0.016),
    ],
    # fluffy C plume on a cat rump — thick, not a balloon
    'tail': [
        (0.000,  0.090, 0.194, 0.026),
        (0.000,  0.132, 0.220, 0.028),
        (0.000,  0.164, 0.256, 0.026),
        (0.000,  0.178, 0.296, 0.024),
        (0.000,  0.164, 0.334, 0.022),
        (0.000,  0.128, 0.360, 0.020),
        (0.000,  0.086, 0.366, 0.016),
        (0.000,  0.050, 0.350, 0.012),
        (0.000,  0.028, 0.328, 0.008),
    ],
}
MIRRORED = {'cheek', 'pad', 'shoulder', 'ribcage', 'forestump', 'hindstump'}

# Head is authored at final kitten size. Do not inflate.
HEAD_STROKES = {'skull', 'muzzle', 'chin', 'pad', 'cheek'}
HEAD_PIVOT = Vector((0.0, -0.128, 0.256))
HEAD_SCALE = 1.00


def _scale_head(p):
    v = Vector((p[0], p[1], p[2]))
    s = HEAD_PIVOT + (v - HEAD_PIVOT) * HEAD_SCALE
    return (s.x, s.y, s.z, p[3] * HEAD_SCALE)


def head_point(p):
    """Map a point authored in head-local space through the same scaling."""
    return HEAD_PIVOT + (Vector(p) - HEAD_PIVOT) * HEAD_SCALE

# metaball influence radius -> visible surface radius is ~0.62x at stiffness 2
MB_R = 1.58
MB_STIFF = 2.0
STEP = 0.009          # resample spacing along each stroke


def resample(points, step=STEP):
    """Linear resample of a (x,y,z,r) polyline so neighbouring balls overlap."""
    out = []
    for i in range(len(points) - 1):
        a, b = points[i], points[i + 1]
        seg = Vector((b[0] - a[0], b[1] - a[1], b[2] - a[2])).length
        n = max(1, int(math.ceil(seg / step)))
        for k in range(n):
            t = k / n
            out.append(tuple(a[j] + (b[j] - a[j]) * t for j in range(4)))
    out.append(tuple(points[-1]))
    return out


def body_balls():
    balls = []
    for name, pts in STROKES.items():
        head = name in HEAD_STROKES
        for p in resample(pts):
            if head:
                p = _scale_head(p)
            balls.append(p)
            if name in MIRRORED:
                balls.append((-p[0], p[1], p[2], p[3]))
    return balls


def _add_meta(mb, x, y, z, r, typ='BALL', size=None):
    el = mb.elements.new()
    el.type = typ
    el.co = Vector((x, y, z))
    el.radius = r * MB_R
    el.stiffness = MB_STIFF
    if size:
        el.size_x, el.size_y, el.size_z = size
    return el


def build_volume():
    mb = bpy.data.metaballs.new('SukiMeta')
    mb.resolution = 0.0054
    mb.render_resolution = 0.0054
    mb.threshold = 0.6
    ob = bpy.data.objects.new('SukiMeta', mb)
    bpy.context.collection.objects.link(ob)

    for (x, y, z, r) in body_balls():
        _add_meta(mb, x, y, z, r)

    # slight flatten on crown / hips / paws only — no dumpling cheek ellipsoids
    skull = head_point((0.0, -0.164, 0.274))
    _add_meta(mb, skull.x, skull.y, skull.z, 0.028, 'ELLIPSOID', (1.08, 0.92, 0.88))
    for side in (1, -1):
        _add_meta(mb, side * 0.040, 0.072, 0.186, 0.024, 'ELLIPSOID', (1.10, 1.02, 1.06))

    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    op(bpy.ops.object.convert, target='MESH')
    body = bpy.context.view_layer.objects.active
    body.name = 'SukiBody'
    return body


def apply_mod(ob, m):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    op(bpy.ops.object.modifier_apply, modifier=m.name)


def cleanup_volume(body, voxel=0.0042, smooth_iters=3, ratio=0.28):
    """Voxel remesh for even topology, then relax + decimate to a game budget."""
    rm = body.modifiers.new('Remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    rm.adaptivity = 0.0
    apply_mod(body, rm)

    sm = body.modifiers.new('Smooth', 'SMOOTH')
    sm.factor = 0.7
    sm.iterations = smooth_iters
    apply_mod(body, sm)

    dec = body.modifiers.new('Decimate', 'DECIMATE')
    dec.ratio = ratio
    apply_mod(body, dec)

    for p in body.data.polygons:
        p.use_smooth = True
    return body


# ──────────────────────────────────────────────────── 2. head furniture ────
# Ears, eyes, nose and whiskers are separate shells: they need crisp edges the
# metaball volume can't hold, and their own flat colours.

# Face furniture is *seated by raycast* against the finished volume rather than
# guessed — retuning the metaball strokes can no longer bury the eyes.
HEAD_C = head_point((0.0, -0.164, 0.274))
EYE_DIR = Vector((0.42, -0.86, 0.06))
NOSE_DIR = Vector((0.0, -1.0, -0.32))
EAR_DIR = Vector((0.34, -0.10, 0.94))
MOUTH_DIR = Vector((0.0, -1.0, -0.55))


def cast_out(body, origin, direction, max_d=0.30):
    """March from inside the volume out along `direction`; return (point, normal)."""
    d = Vector(direction).normalized()
    ok, loc, nrm, _ = body.ray_cast(Vector(origin), d, distance=max_d)
    if not ok:
        return None, None
    return loc.copy(), nrm.copy()


def seat(body, origin, direction, sink, fallback):
    """Surface point along a ray, pushed back into the mesh by `sink`."""
    loc, _ = cast_out(body, origin, direction)
    if loc is None:
        print('[suki] seat: ray missed, using fallback', fallback)
        return Vector(fallback)
    return loc - Vector(direction).normalized() * sink


def build_ears(body):
    """Rounded triangular ears — short like the key art, tilted out and forward."""
    parts = []
    fur = mat('SukiFur', WHITE, rough=0.92, vcol=True)
    pink = mat('SukiEarPink', EAR_PINK, rough=0.85)
    for side in (1, -1):
        tag = 'L' if side > 0 else 'R'
        d = Vector((EAR_DIR.x * side, EAR_DIR.y, EAR_DIR.z))
        # negative sink pushes the cone centre just proud of the skull, so the
        # base stays buried while a decent triangle shows above it
        base = seat(body, HEAD_C, d, -0.008,
                    (side * 0.034, -0.176, 0.300))
        outer = prim('cone', f'Ear{tag}', base,
                     (0.024, 0.013, 0.036), (0.20, 0, -side * 0.26),
                     material=fur, seg=18, r2=0.10)
        apply_transforms(outer)
        parts.append(outer)
        # inner sits slightly forward and *shorter*, so it never pokes through
        inner = prim('cone', f'EarIn{tag}',
                     (base.x - side * 0.002, base.y - 0.008, base.z - 0.002),
                     (0.014, 0.007, 0.024), (0.20, 0, -side * 0.26),
                     material=pink, seg=14, r2=0.12)
        apply_transforms(inner)
        parts.append(inner)
    return parts


def build_face(body):
    """Canon face: big sapphire eyes, lashes, blush, tiny nose.
    Personality lives here — not a generic white cat."""
    parts = []
    iris = mat('SukiIris', BLUE, rough=0.18)
    pupil = mat('SukiPupil', PUPIL, rough=0.28)
    glint = mat('SukiGlint', WHITE, rough=0.08, emit=WHITE, emit_str=2.0)
    nose = mat('SukiNose', NOSE_PINK, rough=0.50)
    lid = mat('SukiLid', FUR, rough=0.92, vcol=True)
    lash_m = mat('SukiLash', LASH, rough=0.45)
    blush_m = mat('SukiBlush', BLUSH, rough=0.75)

    ER = 0.0165                            # big kitten eyes on a cat skull
    for side in (1, -1):
        tag = 'L' if side > 0 else 'R'
        d = Vector((EYE_DIR.x * side, EYE_DIR.y, EYE_DIR.z)).normalized()
        base = seat(body, HEAD_C, d, ER * 0.45, (side * 0.026, -0.214, 0.268))
        e = prim('sphere', f'Eye{tag}', base, (ER * 1.02, ER * 0.86, ER),
                 material=iris, seg=24, ring=14)
        e.rotation_euler = Euler((0.06, 0, side * 0.14), 'XYZ')
        apply_transforms(e)
        parts.append(e)
        pu = prim('sphere', f'Pupil{tag}', base + d * (ER * 0.68),
                  (0.0052, 0.0052, 0.0094), material=pupil, seg=14, ring=10)
        apply_transforms(pu)
        parts.append(pu)
        gl = prim('sphere', f'Glint{tag}',
                  base + d * (ER * 0.86) + Vector((side * 0.0038, 0, 0.0044)),
                  (0.0030, 0.0030, 0.0030), material=glint, seg=10, ring=8)
        apply_transforms(gl)
        parts.append(gl)
        gl2 = prim('sphere', f'Glint2{tag}',
                   base + d * (ER * 0.80) + Vector((-side * 0.0032, 0, -0.0016)),
                   (0.0015, 0.0015, 0.0015), material=glint, seg=8, ring=6)
        apply_transforms(gl2)
        parts.append(gl2)
        br = prim('sphere', f'Brow{tag}', base + Vector((0, 0.0018, 0.0100)),
                  (ER * 1.05, ER * 0.64, 0.0036),
                  (0.30, 0, side * 0.16), material=lid, seg=16, ring=10)
        apply_transforms(br)
        parts.append(br)
        # closed lid — hidden at rest (Lid bone scale ~0), covers the iris on wink
        shut = prim('sphere', f'LidShut{tag}', base + Vector((0, 0.0004, 0.0008)),
                    (ER * 1.10, ER * 0.22, ER * 0.55),
                    (0.35, 0, side * 0.08), material=lid, seg=16, ring=10)
        apply_transforms(shut)
        parts.append(shut)
        for i, (lift, flare) in enumerate(((0.011, 0.16), (0.008, 0.30), (0.005, 0.44))):
            la = prim('cone', f'Lash{tag}{i}',
                      base + Vector((side * (0.010 + i * 0.003), -0.0015, lift)),
                      (0.0010, 0.0010, 0.0062),
                      (0.55, side * flare, 0), material=lash_m, seg=5, r2=0.15)
            apply_transforms(la)
            parts.append(la)
        bl = prim('sphere', f'Blush{tag}',
                  base + Vector((side * 0.012, 0.004, -0.014)),
                  (0.010, 0.005, 0.0036), material=blush_m, seg=12, ring=8)
        apply_transforms(bl)
        parts.append(bl)

    npos = seat(body, HEAD_C, NOSE_DIR, 0.0022, (0, -0.224, 0.248))
    n = prim('cone', 'Nose', npos, (0.0072, 0.0058, 0.0060),
             (math.pi / 2, 0, 0), material=nose, seg=10)
    apply_transforms(n)
    parts.append(n)
    return parts, npos


def build_ribbon():
    """Hero pink bow on the throat — the identity piece. Thin collar only."""
    parts = []
    band_m = mat('SukiRibbon', RIBBON, rough=0.52)
    knot_m = mat('SukiRibbonDk', RIBBON_DK, rough=0.52)

    band = prim('torus', 'Collar', (0, -0.100, 0.214), (0.032, 0.032, 0.032),
                (1.10, 0, 0), material=band_m, mseg=28, nseg=8, minor=0.055)
    apply_transforms(band)
    parts.append(band)

    bx, by, bz = 0.000, -0.122, 0.178
    for side in (1, -1):
        tag = 'L' if side > 0 else 'R'
        loop = prim('sphere', f'BowLoop{tag}',
                    (bx + side * 0.024, by - 0.010, bz + 0.008),
                    (0.024, 0.010, 0.018),
                    (0.10, side * 0.36, side * 0.05), material=band_m, seg=18, ring=12)
        apply_transforms(loop)
        parts.append(loop)
        tl = prim('cone', f'BowTail{tag}',
                  (bx + side * 0.014, by - 0.003, bz - 0.022),
                  (0.009, 0.005, 0.020),
                  (0.95, side * 0.16, 0), material=band_m, seg=8, r2=0.40)
        apply_transforms(tl)
        parts.append(tl)
    knot = prim('sphere', 'BowKnot', (bx, by - 0.012, bz + 0.005),
                (0.010, 0.008, 0.010), material=knot_m, seg=14, ring=10)
    apply_transforms(knot)
    parts.append(knot)
    return parts


def build_mouth(npos):
    """Open happy smile + tiny fangs + tongue — rooftop-toast / prance face."""
    lips = mat('SukiLips', (0.55, 0.26, 0.32, 1.0), rough=0.42)
    fang_m = mat('SukiFang', WHITE, rough=0.25)
    tongue_m = mat('SukiTongue', TONGUE, rough=0.55)
    parts = []
    # wide upturned smile
    segs = [
        ((-0.010, npos.y + 0.003, npos.z - 0.008), (-0.004, npos.y - 0.001, npos.z - 0.014)),
        ((-0.004, npos.y - 0.001, npos.z - 0.014), (0.004, npos.y - 0.001, npos.z - 0.014)),
        ((0.004, npos.y - 0.001, npos.z - 0.014), (0.010, npos.y + 0.003, npos.z - 0.008)),
    ]
    for i, (a, b) in enumerate(segs):
        mid = tuple((a[j] + b[j]) * 0.5 for j in range(3))
        d = Vector(b) - Vector(a)
        cyl = prim('cyl', f'Mouth{i}', mid, (0.0018, 0.0018, d.length * 0.58),
                   material=lips, seg=6)
        cyl.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        apply_transforms(cyl)
        parts.append(cyl)
    for side in (1, -1):
        fang = prim('cone', f'Fang{"L" if side > 0 else "R"}',
                    (side * 0.0038, npos.y - 0.001, npos.z - 0.010),
                    (0.0018, 0.0018, 0.0044),
                    (2.4, 0, 0), material=fang_m, seg=6, r2=0.2)
        apply_transforms(fang)
        parts.append(fang)
    tongue = prim('sphere', 'Tongue',
                  (0.0, npos.y - 0.003, npos.z - 0.016),
                  (0.0044, 0.0028, 0.0024), material=tongue_m, seg=10, ring=8)
    apply_transforms(tongue)
    parts.append(tongue)
    return parts


def build_pads():
    """Pink toe beans on every paw — sells 'pettable cat' on the close shot."""
    pad_m = mat('SukiPad', BEAN, rough=0.55)
    parts = []
    # (name, centre, yaw-ish forward)
    paws = [
        ('PawFL', (0.038, -0.084, 0.004), -1),
        ('PawFR', (-0.038, -0.084, 0.004), -1),
        ('PawHL', (0.042, 0.052, 0.004), 1),
        ('PawHR', (-0.042, 0.052, 0.004), 1),
    ]
    for name, (x, y, z), fwd in paws:
        main = prim('sphere', f'{name}Main', (x, y + fwd * 0.002, z - 0.004),
                    (0.012, 0.014, 0.0055), material=pad_m, seg=12, ring=8)
        apply_transforms(main)
        parts.append(main)
        for i, dx in enumerate((-0.009, -0.003, 0.003, 0.009)):
            toe = prim('sphere', f'{name}Toe{i}', (x + dx, y + fwd * 0.013, z - 0.003),
                       (0.0044, 0.0050, 0.0032), material=pad_m, seg=8, ring=6)
            apply_transforms(toe)
            parts.append(toe)
    return parts


def build_legs():
    """Separate cat-leg columns, bone-parented so Sit actually folds."""
    fur = mat('SukiFur', WHITE, rough=0.92, vcol=True)
    parts = []
    for side, tag in ((1, 'L'), (-1, 'R')):
        x = 0.038 * side
        up = prim('cyl', f'ForeUp{tag}', (x, -0.056, 0.148), (0.013, 0.013, 0.048),
                  material=fur, seg=12)
        apply_transforms(up)
        parts.append(up)
        low = prim('cyl', f'ForeLow{tag}', (x, -0.065, 0.068), (0.011, 0.011, 0.046),
                   material=fur, seg=12)
        apply_transforms(low)
        parts.append(low)
        paw = prim('sphere', f'ForePaw{tag}', (x, -0.082, 0.012), (0.016, 0.019, 0.011),
                   material=fur, seg=12, ring=8)
        apply_transforms(paw)
        parts.append(paw)
        hx = 0.043 * side
        th = prim('cyl', f'HindUp{tag}', (hx, 0.078, 0.145), (0.017, 0.017, 0.048),
                  (0.18, 0, 0), material=fur, seg=12)
        apply_transforms(th)
        parts.append(th)
        sh = prim('cyl', f'HindLow{tag}', (hx, 0.072, 0.066), (0.012, 0.012, 0.044),
                  material=fur, seg=12)
        apply_transforms(sh)
        parts.append(sh)
        fp = prim('sphere', f'HindPaw{tag}', (hx, 0.050, 0.012), (0.015, 0.018, 0.010),
                  material=fur, seg=12, ring=8)
        apply_transforms(fp)
        parts.append(fp)
    return parts


def build_whiskers(npos):
    """Three fine whiskers per side, rooted at the whisker pads."""
    parts = []
    wm = mat('SukiWhisker', (1.0, 0.98, 0.94, 1.0), rough=0.4)
    for side in (1, -1):
        for i in range(3):
            w = prim('cone', f'Whisker{"L" if side > 0 else "R"}{i}',
                     (side * 0.030, npos.y + 0.012, npos.z + 0.004 - i * 0.006),
                     (0.0007, 0.030, 0.0007),
                     (0, 0, 0), material=wm, seg=4)
            w.rotation_euler = Euler((0, side * (1.25 - i * 0.12),
                                      -side * (0.34 + i * 0.18)), 'XYZ')
            apply_transforms(w)
            parts.append(w)
    return parts


# ─────────────────────────────────────────── 3. analytic white/pale-pink coat ─
def _mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))


def _smoothstep(e0, e1, x):
    if e1 == e0:
        return 0.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def _hash_noise(x, y, z):
    """Cheap deterministic value noise — quiet fur-like mottle, not tabby."""
    n = math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
    return n - math.floor(n)          # 0..1


def coat_colour(p):
    """Canon coat: fluffy white with a pale-pink breath.
    Recess shade + faint forehead M only. Cream / apricot / tabby are dead."""
    x, y, z = p.x, p.y, p.z
    c = FUR

    # lit crown / muzzle / outer fluff
    crown = _smoothstep(0.250, 0.310, z) * _smoothstep(-0.120, -0.180, y)
    c = _mix(c, FUR_LIT, crown * 0.55)

    # pale-pink shade in recesses: under-ruff, belly, inner cheeks, paw wells
    under = _smoothstep(0.210, 0.140, z)
    ruff_hollow = _smoothstep(-0.070, -0.130, y) * _smoothstep(0.230, 0.140, z)
    cheek_well = _smoothstep(0.040, 0.070, abs(x)) * _smoothstep(0.320, 0.250, z)
    c = _mix(c, FUR_SHADE, max(under * 0.22, ruff_hollow * 0.28, cheek_well * 0.18))

    # faint forehead M — two brows + a short center stroke
    if y < -0.140 and z > 0.268:
        brow = _smoothstep(0.010, 0.020, abs(x)) * _smoothstep(0.038, 0.026, abs(x))
        brow *= _smoothstep(0.270, 0.300, z)
        center = _smoothstep(0.010, 0.000, abs(x)) * _smoothstep(0.268, 0.292, z)
        c = _mix(c, M_MARK, max(brow * 0.42, center * 0.28))

    # tail plume slightly warmer in the core, never banded apricot
    if y > 0.090 and z > 0.200:
        c = _mix(c, FUR_SHADE, 0.10)

    n = _hash_noise(x * 55, y * 55, z * 55) - 0.5
    c = _mix(c, FUR_SHADE if n > 0 else FUR_LIT, abs(n) * 0.04)
    c = _mix(c, FUR_SHADE, _smoothstep(0.08, 0.018, z) * 0.10)
    return c


def paint_coat(body):
    me = body.data
    attr = me.color_attributes.get(COAT_ATTR)
    if attr is None:
        attr = me.color_attributes.new(name=COAT_ATTR, type='FLOAT_COLOR', domain='POINT')
    mw = body.matrix_world
    for i, v in enumerate(me.vertices):
        attr.data[i].color = lin(coat_colour(mw @ v.co))
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = 0
    return attr


def paint_flat(ob, rgba):
    """Give non-body parts a matching colour attribute so COLOR_0 stays valid."""
    me = ob.data
    attr = me.color_attributes.get(COAT_ATTR)
    if attr is None:
        attr = me.color_attributes.new(name=COAT_ATTR, type='FLOAT_COLOR', domain='POINT')
    for d in attr.data:
        d.color = lin(rgba)
    me.color_attributes.active_color = attr


# ────────────────────────────────────────────────── 4. armature + weights ────
# (name, head, tail, parent)  — head/tail in world space, -Y forward
BONES = [
    ('Root',      (0, 0.000, 0.000), (0, -0.050, 0.000), None),
    ('Hips',      (0, 0.070, 0.194), (0, 0.016, 0.202), 'Root'),
    ('Spine',     (0, 0.016, 0.202), (0, -0.032, 0.206), 'Hips'),
    ('Chest',     (0, -0.032, 0.206), (0, -0.078, 0.220), 'Spine'),
    ('Neck',      (0, -0.078, 0.220), (0, -0.128, 0.256), 'Chest'),
    ('Head',      (0, -0.128, 0.256), (0, -0.210, 0.272), 'Neck'),
    ('Ear.L',     (0.034, -0.168, 0.300), (0.046, -0.162, 0.352), 'Head'),
    ('Ear.R',     (-0.034, -0.168, 0.300), (-0.046, -0.162, 0.352), 'Head'),
    ('Eye.L',     (0.026, -0.198, 0.270), (0.026, -0.214, 0.270), 'Head'),
    ('Eye.R',     (-0.026, -0.198, 0.270), (-0.026, -0.214, 0.270), 'Head'),
    ('Lid.L',     (0.026, -0.198, 0.276), (0.026, -0.210, 0.284), 'Head'),
    ('Lid.R',     (-0.026, -0.198, 0.276), (-0.026, -0.210, 0.284), 'Head'),
    ('Tail1',     (0, 0.090, 0.194), (0, 0.130, 0.216), 'Hips'),
    ('Tail2',     (0, 0.130, 0.216), (0, 0.160, 0.250), 'Tail1'),
    ('Tail3',     (0, 0.160, 0.250), (0, 0.174, 0.288), 'Tail2'),
    ('Tail4',     (0, 0.174, 0.288), (0, 0.162, 0.324), 'Tail3'),
    ('Tail5',     (0, 0.162, 0.324), (0, 0.124, 0.348), 'Tail4'),
    ('Tail6',     (0, 0.124, 0.348), (0, 0.072, 0.346), 'Tail5'),
    ('Arm.L',     (0.038, -0.058, 0.176), (0.038, -0.058, 0.104), 'Chest'),
    ('Forearm.L', (0.038, -0.058, 0.104), (0.038, -0.072, 0.038), 'Arm.L'),
    ('Paw.L',     (0.038, -0.072, 0.038), (0.038, -0.090, 0.008), 'Forearm.L'),
    ('Arm.R',     (-0.038, -0.058, 0.176), (-0.038, -0.058, 0.104), 'Chest'),
    ('Forearm.R', (-0.038, -0.058, 0.104), (-0.038, -0.072, 0.038), 'Arm.R'),
    ('Paw.R',     (-0.038, -0.072, 0.038), (-0.038, -0.090, 0.008), 'Forearm.R'),
    ('Thigh.L',   (0.040, 0.072, 0.174), (0.042, 0.088, 0.100), 'Hips'),
    ('Shin.L',    (0.042, 0.088, 0.100), (0.042, 0.068, 0.038), 'Thigh.L'),
    ('Foot.L',    (0.042, 0.068, 0.038), (0.042, 0.048, 0.008), 'Shin.L'),
    ('Thigh.R',   (-0.040, 0.072, 0.174), (-0.042, 0.088, 0.100), 'Hips'),
    ('Shin.R',    (-0.042, 0.088, 0.100), (-0.042, 0.068, 0.038), 'Thigh.R'),
    ('Foot.R',    (-0.042, 0.068, 0.038), (-0.042, 0.048, 0.008), 'Shin.R'),
]


def build_armature():
    arm_data = bpy.data.armatures.new('SukiRig')
    arm = bpy.data.objects.new('SukiRig', arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.selected_objects:
        o.select_set(False)
    arm.select_set(True)
    op(bpy.ops.object.mode_set, mode='EDIT')
    eb = arm_data.edit_bones
    for name, head, tail, parent in BONES:
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        b.use_connect = False
        if parent:
            b.parent = eb[parent]
    op(bpy.ops.object.mode_set, mode='OBJECT')
    return arm


def bind(mesh_obj, arm):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    mesh_obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    op(bpy.ops.object.parent_set, type='ARMATURE_AUTO')


def bone_parent(ob, arm, bone_name):
    """Rigid-attach a shell (eye, bow, whisker) to one bone."""
    ob.parent = arm
    ob.parent_type = 'BONE'
    ob.parent_bone = bone_name
    b = arm.data.bones[bone_name]
    # cancel Blender's bone-tail parenting offset so the shell keeps its place
    ob.matrix_parent_inverse = (arm.matrix_world @ b.matrix_local
                                @ Matrix.Translation((0, b.length, 0))).inverted()


# ──────────────────────────────────────────────────────── 5. animation ──────
def start_action(arm, name):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    return act


def key(arm, bone, frame, rot=None, loc=None, scale=None):
    pb = arm.pose.bones.get(bone)
    if pb is None:
        return
    pb.rotation_mode = 'XYZ'
    if rot is not None:
        pb.rotation_euler = Euler(rot, 'XYZ')
        pb.keyframe_insert('rotation_euler', frame=frame)
    if loc is not None:
        pb.location = Vector(loc)
        pb.keyframe_insert('location', frame=frame)
    if scale is not None:
        pb.scale = Vector(scale)
        pb.keyframe_insert('scale', frame=frame)


def rest_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = Euler((0, 0, 0), 'XYZ')
        pb.location = Vector((0, 0, 0))
        # closed-lid meshes stay hidden unless Wink / Loaf scales them up
        if pb.name.startswith('Lid'):
            pb.scale = Vector((0.02, 0.02, 0.02))
        else:
            pb.scale = Vector((1, 1, 1))


LID_HIDE = (0.02, 0.02, 0.02)
LID_SHUT = (1.20, 1.05, 1.20)
EYE_HIDE = (0.02, 0.02, 0.02)
EYE_SHOW = (1.0, 1.0, 1.0)


def lids_open(arm, frame):
    key(arm, 'Lid.L', frame, scale=LID_HIDE)
    key(arm, 'Lid.R', frame, scale=LID_HIDE)
    key(arm, 'Eye.L', frame, scale=EYE_SHOW)
    key(arm, 'Eye.R', frame, scale=EYE_SHOW)


def lids_wink_r(arm, frame):
    """Close the RIGHT eye: lid covers, iris/glint scale out."""
    key(arm, 'Lid.L', frame, scale=LID_HIDE)
    key(arm, 'Lid.R', frame, scale=LID_SHUT)
    key(arm, 'Eye.L', frame, scale=EYE_SHOW)
    key(arm, 'Eye.R', frame, scale=EYE_HIDE)


def lids_squint(arm, frame):
    key(arm, 'Lid.L', frame, scale=LID_SHUT)
    key(arm, 'Lid.R', frame, scale=LID_SHUT)
    key(arm, 'Eye.L', frame, scale=EYE_HIDE)
    key(arm, 'Eye.R', frame, scale=EYE_HIDE)


FRONT_LEGS = ['Arm.L', 'Forearm.L', 'Paw.L', 'Arm.R', 'Forearm.R', 'Paw.R']
HIND_LEGS = ['Thigh.L', 'Shin.L', 'Foot.L', 'Thigh.R', 'Shin.R', 'Foot.R']
TAIL = [f'Tail{i}' for i in range(1, 7)]


def tail_wave(arm, frame, amp, phase, curl=0.0):
    for i, b in enumerate(TAIL):
        key(arm, b, frame,
            rot=(curl * (0.25 + i * 0.10),
                 0,
                 math.sin(phase + i * 0.55) * amp * (0.35 + i * 0.16)))


def anim_idle(arm):
    """Breathing, slow tail sway, subtle weight shift. 60f loop."""
    rest_pose(arm)
    start_action(arm, 'Idle')
    for f, ph in ((1, 0.0), (15, 0.8), (30, 1.6), (45, 2.4), (60, 3.2)):
        b = math.sin(ph) * 0.020
        key(arm, 'Spine', f, rot=(b, 0, 0))
        key(arm, 'Chest', f, rot=(b * 0.7, 0, 0))
        key(arm, 'Neck', f, rot=(-b * 0.5, 0, math.sin(ph * 0.5) * 0.05))
        key(arm, 'Head', f, rot=(math.sin(ph * 0.7) * 0.05, 0,
                                 math.sin(ph * 0.4) * 0.09))
        tail_wave(arm, f, 0.16, ph * 1.2, curl=0.10)
        lids_open(arm, f)
    # ear flick at the tail of the loop
    for f, e in ((1, 0.0), (36, 0.0), (40, 0.55), (44, 0.0), (60, 0.0)):
        key(arm, 'Ear.L', f, rot=(0, 0, e))


def anim_idle_look(arm):
    """Longer idle: looks around the counter, tail curls. 90f."""
    rest_pose(arm)
    start_action(arm, 'Idle_Look')
    poses = [(1, 0.0, 0.0), (20, 0.0, 0.55), (40, -0.10, 0.55),
             (55, 0.05, -0.50), (75, 0.0, -0.20), (90, 0.0, 0.0)]
    for f, px, pz in poses:
        key(arm, 'Head', f, rot=(px, 0, pz))
        key(arm, 'Neck', f, rot=(px * 0.4, 0, pz * 0.35))
        key(arm, 'Spine', f, rot=(math.sin(f * 0.07) * 0.02, 0, 0))
        tail_wave(arm, f, 0.22, f * 0.09, curl=0.14)
        lids_open(arm, f)


def anim_walk(arm):
    """Prance, not a dog trot — high front lift, bounce, head up, tail plume high."""
    rest_pose(arm)
    start_action(arm, 'Walk')
    N = 28
    for i in range(9):
        f = 1 + i * (N / 8)
        ph = (i / 8) * math.tau
        sw = math.sin(ph)
        sw2 = math.sin(ph + math.pi)
        # prance: high front lift so one paw shows beans
        key(arm, 'Arm.L', f, rot=(sw * 1.05, 0, 0))
        key(arm, 'Forearm.L', f, rot=(max(0, -sw) * 0.55, 0, 0))
        key(arm, 'Paw.L', f, rot=(sw * 0.55, 0, 0))
        key(arm, 'Arm.R', f, rot=(sw2 * 1.05, 0, 0))
        key(arm, 'Forearm.R', f, rot=(max(0, -sw2) * 0.55, 0, 0))
        key(arm, 'Paw.R', f, rot=(sw2 * 0.55, 0, 0))
        key(arm, 'Thigh.L', f, rot=(sw2 * 0.40, 0, 0))
        key(arm, 'Shin.L', f, rot=(-max(0, sw2) * 0.42, 0, 0))
        key(arm, 'Foot.L', f, rot=(sw2 * 0.16, 0, 0))
        key(arm, 'Thigh.R', f, rot=(sw * 0.40, 0, 0))
        key(arm, 'Shin.R', f, rot=(-max(0, sw) * 0.42, 0, 0))
        key(arm, 'Foot.R', f, rot=(sw * 0.16, 0, 0))
        bounce = abs(math.sin(ph * 2)) * 0.014
        key(arm, 'Hips', f, rot=(0.04, math.sin(ph * 2) * 0.04, sw * 0.06),
            loc=(0, 0, bounce))
        key(arm, 'Spine', f, rot=(-0.04, -math.sin(ph * 2) * 0.03, -sw * 0.04))
        key(arm, 'Chest', f, rot=(-0.03, 0, sw * 0.03))
        key(arm, 'Neck', f, rot=(-0.06, 0, -sw * 0.03))
        key(arm, 'Head', f, rot=(-0.08, 0, -sw * 0.04))
        tail_wave(arm, f, 0.18, ph * 1.2, curl=-0.22)
        lids_open(arm, f)


def anim_run(arm):
    """Bounding gallop — front pair / hind pair together. 20f loop."""
    rest_pose(arm)
    start_action(arm, 'Run')
    N = 20
    for i in range(6):
        f = 1 + i * (N / 5)
        ph = (i / 5) * math.tau
        gather = math.sin(ph)          # -1 extended, +1 gathered
        key(arm, 'Hips', f, rot=(gather * 0.16, 0, 0),
            loc=(0, 0, max(0.0, math.sin(ph + 0.8)) * 0.022))
        key(arm, 'Spine', f, rot=(-gather * 0.20, 0, 0))
        key(arm, 'Chest', f, rot=(-gather * 0.12, 0, 0))
        key(arm, 'Neck', f, rot=(gather * 0.10, 0, 0))
        for b, s in (('Arm.L', 1), ('Arm.R', 1)):
            key(arm, b, f, rot=(-gather * 0.85, 0, 0))
        for b in ('Forearm.L', 'Forearm.R'):
            key(arm, b, f, rot=(max(0, gather) * 0.9, 0, 0))
        for b in ('Thigh.L', 'Thigh.R'):
            key(arm, b, f, rot=(gather * 0.85, 0, 0))
        for b in ('Shin.L', 'Shin.R'):
            key(arm, b, f, rot=(-max(0, -gather) * 1.0, 0, 0))
        tail_wave(arm, f, 0.14, ph * 2.0, curl=-0.28)
        lids_open(arm, f)


def anim_swipe(arm):
    """The money move: rear back, wind up, whip the right paw across. 30f once."""
    rest_pose(arm)
    start_action(arm, 'Swipe')
    stages = [
        # f,  spine, chest,  headP, armR,  foreR, pawR,  armL,  twist
        (1,   0.00,  0.00,   0.00,  0.00,  0.00,  0.00,  0.00,  0.00),
        (7,  -0.22, -0.18,  -0.14, -1.15,  0.55,  0.30, -0.35,  0.22),   # wind up
        (12, -0.26, -0.22,  -0.18, -1.45,  0.70,  0.42, -0.45,  0.30),   # peak
        (18,  0.16,  0.14,   0.12,  0.75, -0.35, -0.30, -0.10, -0.34),   # strike
        (23,  0.06,  0.05,   0.05,  0.35, -0.15, -0.12,  0.00, -0.14),
        (30,  0.00,  0.00,   0.00,  0.00,  0.00,  0.00,  0.00,  0.00),
    ]
    for (f, sp, ch, hp, ar, fo, pw, al, tw) in stages:
        key(arm, 'Spine', f, rot=(sp, 0, tw * 0.5))
        key(arm, 'Chest', f, rot=(ch, 0, tw))
        key(arm, 'Neck', f, rot=(hp * 0.5, 0, tw * 0.4))
        key(arm, 'Head', f, rot=(hp, 0, tw * 0.6))
        key(arm, 'Arm.R', f, rot=(ar, 0, tw * 0.8))
        key(arm, 'Forearm.R', f, rot=(fo, 0, 0))
        key(arm, 'Paw.R', f, rot=(pw, 0, 0))
        key(arm, 'Arm.L', f, rot=(al, 0, 0))
        key(arm, 'Hips', f, rot=(-sp * 0.4, 0, 0))
        tail_wave(arm, f, 0.30, f * 0.35, curl=0.10 + abs(tw))
        lids_open(arm, f)


def pose_sit(arm, f, k=1.0):
    """Haunches down, chest up, front paws planted together — sit-front.jpg.
    Sit is a hind-leg fold + a small root drop. Do not pitch the spine."""
    key(arm, 'Root', f, loc=(0, 0, -k * 0.042))
    key(arm, 'Hips', f, rot=(0, 0, 0), loc=(0, 0, 0))
    key(arm, 'Spine', f, rot=(-k * 0.10, 0, 0))
    key(arm, 'Chest', f, rot=(0, 0, 0))
    key(arm, 'Neck', f, rot=(k * 0.06, 0, 0))
    key(arm, 'Head', f, rot=(k * 0.04, 0, 0))
    for b in ('Thigh.L', 'Thigh.R'):
        key(arm, b, f, rot=(k * 1.75, 0, 0))
    for b in ('Shin.L', 'Shin.R'):
        key(arm, b, f, rot=(-k * 2.20, 0, 0))
    for b in ('Foot.L', 'Foot.R'):
        key(arm, b, f, rot=(k * 0.90, 0, 0))
    # front columns stay planted and parallel
    key(arm, 'Arm.L', f, rot=(0, 0, k * 0.08))
    key(arm, 'Arm.R', f, rot=(0, 0, -k * 0.08))
    key(arm, 'Forearm.L', f, rot=(0, 0, 0))
    key(arm, 'Forearm.R', f, rot=(0, 0, 0))
    key(arm, 'Paw.L', f, rot=(0, 0, 0))
    key(arm, 'Paw.R', f, rot=(0, 0, 0))
    for i, b in enumerate(TAIL):
        key(arm, b, f, rot=(k * (0.04 + i * 0.06), 0, k * (0.65 + i * 0.22)))
    lids_open(arm, f)


def anim_sit(arm):
    """Held sit from frame 1 — beauty/sit stills must not sample a stand."""
    rest_pose(arm)
    start_action(arm, 'Sit')
    for f in (1, 24, 48):
        pose_sit(arm, f, 1.0)


def anim_cuddle(arm):
    """Sitting, head-butting the boy's hand, tail curled. 80f loop."""
    rest_pose(arm)
    start_action(arm, 'Cuddle')
    for i in range(9):
        f = 1 + i * 10
        ph = (i / 8) * math.tau
        k = 1.0
        pose_sit(arm, f, 1.0)
        key(arm, 'Spine', f, rot=(-0.55 + math.sin(ph) * 0.05, 0, math.sin(ph) * 0.06))
        key(arm, 'Chest', f, rot=(-0.28, 0, math.sin(ph) * 0.05))
        key(arm, 'Neck', f, rot=(0.18 - abs(math.sin(ph)) * 0.22, 0, math.sin(ph) * 0.10))
        key(arm, 'Head', f, rot=(0.08 - abs(math.sin(ph)) * 0.28, 0, math.sin(ph) * 0.30))
        tail_wave(arm, f, 0.24, ph, curl=0.50)


def anim_hit(arm):
    """Flinch when the hand or the mouse catches her. 24f once."""
    rest_pose(arm)
    start_action(arm, 'Hit')
    stages = [(1, 0.0), (4, 1.0), (9, -0.45), (15, 0.25), (24, 0.0)]
    for f, k in stages:
        key(arm, 'Spine', f, rot=(k * 0.30, 0, -k * 0.22))
        key(arm, 'Chest', f, rot=(k * 0.22, 0, -k * 0.18))
        key(arm, 'Neck', f, rot=(-k * 0.35, 0, k * 0.20))
        key(arm, 'Head', f, rot=(-k * 0.40, 0, k * 0.34))
        key(arm, 'Hips', f, rot=(k * 0.18, 0, 0), loc=(0, 0, -abs(k) * 0.014))
        for b in ('Arm.L', 'Arm.R'):
            key(arm, b, f, rot=(-k * 0.55, 0, 0))
        for b in ('Ear.L', 'Ear.R'):
            key(arm, b, f, rot=(k * 0.6, 0, 0))
        tail_wave(arm, f, 0.55, f * 0.8, curl=-0.30)
        lids_open(arm, f)


def anim_play_bow(arm):
    """Held play-bow: chest planted, haunches high, tail a fluffy C."""
    rest_pose(arm)
    start_action(arm, 'PlayBow')
    for f in (1, 24, 40):
        key(arm, 'Hips', f, rot=(0.22, 0, 0), loc=(0, 0.012, 0.010))
        key(arm, 'Spine', f, rot=(0.58, 0, 0))
        key(arm, 'Chest', f, rot=(0.78, 0, 0))
        key(arm, 'Neck', f, rot=(-0.55, 0, 0))
        key(arm, 'Head', f, rot=(-0.16, 0, 0))
        for b in ('Arm.L', 'Arm.R'):
            key(arm, b, f, rot=(0.38, 0, 0))
        for b in ('Forearm.L', 'Forearm.R'):
            key(arm, b, f, rot=(0.18, 0, 0))
        for b in ('Paw.L', 'Paw.R'):
            key(arm, b, f, rot=(-0.10, 0, 0))
        for b in ('Thigh.L', 'Thigh.R'):
            key(arm, b, f, rot=(-0.32, 0, 0))
        for b in ('Shin.L', 'Shin.R'):
            key(arm, b, f, rot=(0.12, 0, 0))
        tail_wave(arm, f, 0.06, 0.4, curl=-0.70)
        lids_open(arm, f)


def anim_loaf(arm):
    """Held loaf: curled oval, tail wrapped, both lids happy-squint."""
    rest_pose(arm)
    start_action(arm, 'Loaf')
    for f in (1, 24, 40):
        key(arm, 'Root', f, loc=(0, 0, -0.050))
        key(arm, 'Hips', f, rot=(0.08, 0, 0), loc=(0, 0.020, 0))
        key(arm, 'Spine', f, rot=(0.22, 0, 0))
        key(arm, 'Chest', f, rot=(0.12, 0, 0))
        key(arm, 'Neck', f, rot=(0.18, 0, 0))
        key(arm, 'Head', f, rot=(0.12, 0, 0))
        for b in ('Thigh.L', 'Thigh.R'):
            key(arm, b, f, rot=(1.70, 0, 0))
        for b in ('Shin.L', 'Shin.R'):
            key(arm, b, f, rot=(-2.20, 0, 0))
        for b in ('Foot.L', 'Foot.R'):
            key(arm, b, f, rot=(1.00, 0, 0))
        for side, z in (('L', 0.28), ('R', -0.16)):
            key(arm, f'Arm.{side}', f, rot=(0.85, 0, z))
            key(arm, f'Forearm.{side}', f, rot=(1.05, 0, 0))
            key(arm, f'Paw.{side}', f, rot=(0.50, 0, 0))
        for i, b in enumerate(TAIL):
            key(arm, b, f, rot=(0.20 + i * 0.14, 0, 1.00 + i * 0.32))
        lids_squint(arm, f)


def anim_wink(arm):
    """Held wink: RIGHT lid shut, iris gone, sassy head tilt."""
    rest_pose(arm)
    start_action(arm, 'Wink')
    for f in (1, 16, 32):
        key(arm, 'Head', f, rot=(0.06, 0, 0.16))
        key(arm, 'Neck', f, rot=(0, 0, 0.08))
        key(arm, 'Ear.R', f, rot=(0, 0, 0.32))
        lids_wink_r(arm, f)
        tail_wave(arm, f, 0.10, 0.2, curl=0.12)


ACTIONS = [anim_idle, anim_idle_look, anim_walk, anim_run,
           anim_swipe, anim_sit, anim_cuddle, anim_hit,
           anim_play_bow, anim_loaf, anim_wink]


# ─────────────────────────────────────────────────────────── 6. export ──────
def export_glb(arm, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in bpy.data.objects:
        o.select_set(True)
    kw = dict(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_bake_animation=True,
        export_yup=True,
    )
    for extra in ({'export_vertex_color': 'ACTIVE'},
                  {'export_all_vertex_colors': True},
                  {}):
        try:
            op(bpy.ops.export_scene.gltf, **{**kw, **extra})
            print('[suki] exported', path, 'with', extra)
            return
        except TypeError as e:
            print('[suki] export kwarg unsupported, retrying:', e)
    raise RuntimeError('glTF export failed')


# ─────────────────────────────────────────────────── 7. preview renders ─────
def setup_preview():
    sc = bpy.context.scene
    sc.render.resolution_x = 900
    sc.render.resolution_y = 900
    sc.render.film_transparent = False
    world = bpy.data.worlds.get('SukiWorld') or bpy.data.worlds.new('SukiWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.09, 0.07, 0.11, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    sc.world = world

    # Standard transform + softer key — white fur clips if the key is hot
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.exposure = -0.15
    for name, loc, energy, size in (
        ('KeyL', (0.6, -0.7, 0.75), 3.4, 0.7),
        ('FillL', (-0.8, -0.3, 0.35), 1.8, 1.0),
        ('RimL', (0.1, 0.9, 0.7), 2.2, 0.6),
    ):
        lamp = bpy.data.lights.new(name, 'AREA')
        lamp.energy = energy
        lamp.size = size
        ob = bpy.data.objects.new(name, lamp)
        ob.location = loc
        bpy.context.collection.objects.link(ob)
        d = Vector((0, 0, 0.18)) - Vector(loc)
        ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

    cam_data = bpy.data.cameras.new('Cam')
    cam_data.lens = 62
    cam = bpy.data.objects.new('Cam', cam_data)
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    return cam


def aim_cam(cam, loc, target=(0, 0, 0.175)):
    cam.location = Vector(loc)
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def render_views(out_dir, tag='suki'):
    os.makedirs(out_dir, exist_ok=True)
    sc = bpy.context.scene
    # Headless cloud boxes often lack EGL; Cycles CPU is the reliable path.
    try:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
        sc.eevee.taa_render_samples = 24
        # probe: if GPU context is missing this still "succeeds" until render
    except Exception:
        pass
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = False
    cam = sc.camera
    C = (0, 0, 0.200)
    HEAD = (0, -0.196, 0.290)
    PAW = (0.044, -0.092, 0.012)
    views = {
        'beauty': ((0.55, -0.58, 0.34), C),
        'side':   ((0.95, -0.02, 0.21), C),    # profile — the key-art angle
        'threeq': ((0.62, -0.62, 0.36), C),
        'front':  ((0.06, -0.88, 0.30), C),
        'head':   ((0.22, -0.48, 0.30), HEAD),  # close on the face
        'paw':    ((0.22, -0.28, 0.10), PAW),
        'top':    ((0.30, -0.30, 0.86), C),
    }
    shots = []
    for name, (loc, target) in views.items():
        aim_cam(cam, loc, target)
        path = os.path.join(out_dir, f'{tag}-{name}.png')
        sc.render.filepath = path
        try:
            bpy.ops.render.render(write_still=True)
            shots.append(path)
        except Exception as e:
            print('[suki] render failed', name, e)
    return shots


# ────────────────────────────────────────────────────────────── 8. main ─────
def build_suki(render=True):
    reset_scene()
    body = build_volume()
    body = cleanup_volume(body)
    body.data.materials.append(mat('SukiFur', WHITE, rough=0.92, vcol=True))
    paint_coat(body)

    body.name = 'Suki'

    ears = build_ears(body)
    face, npos = build_face(body)
    ribbon = build_ribbon()
    whisk = build_whiskers(npos)
    mouth = build_mouth(npos)
    pads = build_pads()
    legs = build_legs()

    # every shell keeps its own flat material; white COLOR_0 so the vertex-colour
    # attribute is uniform across the file and three.js can multiply safely
    for ob in ears + face + ribbon + whisk + mouth + pads + legs:
        paint_flat(ob, WHITE)
    for ob in ears + legs + [o for o in face if o.name.startswith('Brow')]:
        if 'EarIn' not in ob.name:
            attr = ob.data.color_attributes[COAT_ATTR]
            for i, v in enumerate(ob.data.vertices):
                attr.data[i].color = lin(coat_colour(ob.matrix_world @ v.co))

    arm = build_armature()
    bind(body, arm)

    # rigid shells ride their nearest bone
    for ob in ears:
        bone_parent(ob, arm, 'Ear.L' if ob.name.endswith('L') else 'Ear.R')
    eye_bits = ('Eye', 'Pupil', 'Glint', 'Brow', 'Lash')
    for ob in face + whisk + mouth:
        bone = 'Head'
        if ob.name.startswith('LidShut'):
            bone = 'Lid.R' if 'R' in ob.name else 'Lid.L'
        elif any(ob.name.startswith(p) for p in eye_bits):
            bone = 'Eye.R' if 'R' in ob.name else 'Eye.L'
        bone_parent(ob, arm, bone)
    for ob in ribbon:
        bone_parent(ob, arm, 'Neck')
    for ob in pads:
        if 'PawFL' in ob.name:
            bone_parent(ob, arm, 'Paw.L')
        elif 'PawFR' in ob.name:
            bone_parent(ob, arm, 'Paw.R')
        elif 'PawHL' in ob.name:
            bone_parent(ob, arm, 'Foot.L')
        else:
            bone_parent(ob, arm, 'Foot.R')
    for ob in legs:
        n = ob.name
        side = 'L' if n.endswith('L') else 'R'
        if n.startswith('ForeUp'):
            bone_parent(ob, arm, f'Arm.{side}')
        elif n.startswith('ForeLow'):
            bone_parent(ob, arm, f'Forearm.{side}')
        elif n.startswith('ForePaw'):
            bone_parent(ob, arm, f'Paw.{side}')
        elif n.startswith('HindUp'):
            bone_parent(ob, arm, f'Thigh.{side}')
        elif n.startswith('HindLow'):
            bone_parent(ob, arm, f'Shin.{side}')
        else:
            bone_parent(ob, arm, f'Foot.{side}')

    for fn in ACTIONS:
        fn(arm)
    rest_pose(arm)
    arm.animation_data.action = bpy.data.actions.get('Idle')

    export_glb(arm, GLB_OUT)
    if render:
        setup_preview()
        render_views(os.path.join(REPO, 'tools/out/blender'))
    return body, arm


if __name__ == '__main__':
    build_suki(render=True)
