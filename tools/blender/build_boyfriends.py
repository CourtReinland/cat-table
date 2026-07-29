"""
Boyfriend factory: builds a stylized low-poly humanoid rig in Blender,
authors animation clips programmatically, and exports 5 boyfriend GLBs.

Runs headless:  blender --background --python tools/blender/build_boyfriends.py
"""
import bpy
import math
import os
from mathutils import Vector, Euler

OUT_DIR = 'public/assets/models'
RENDER_DIR = 'tools/out/blender'

# ── boyfriend variants ──────────────────────────────────────────────────────
# Palettes read off the Grok portraits in public/assets/characters/.
# All values are display sRGB — lin() converts on the way into Blender.
BOYS = {
    'eli':    {'hair': 'sweep',  'hairColor': (0.42, 0.29, 0.19, 1), 'outfit': (0.90, 0.86, 0.76, 1), 'pants': (0.33, 0.31, 0.38, 1), 'skin': (0.95, 0.80, 0.68, 1), 'eyes': (0.42, 0.50, 0.52, 1)},
    'jasper': {'hair': 'spikes', 'hairColor': (0.85, 0.64, 0.36, 1), 'outfit': (0.34, 0.55, 0.72, 1), 'pants': (0.28, 0.27, 0.33, 1), 'skin': (0.96, 0.79, 0.65, 1), 'eyes': (0.35, 0.55, 0.42, 1)},
    'kai':    {'hair': 'long',   'hairColor': (0.80, 0.82, 0.86, 1), 'outfit': (0.26, 0.25, 0.32, 1), 'pants': (0.20, 0.19, 0.25, 1), 'skin': (0.92, 0.77, 0.65, 1), 'eyes': (0.52, 0.33, 0.58, 1)},
    'theo':   {'hair': 'curls',  'hairColor': (0.28, 0.19, 0.13, 1), 'outfit': (0.72, 0.56, 0.44, 1), 'pants': (0.36, 0.30, 0.26, 1), 'skin': (0.96, 0.81, 0.68, 1), 'eyes': (0.45, 0.31, 0.20, 1)},
    'ren':    {'hair': 'slick',  'hairColor': (0.14, 0.13, 0.17, 1), 'outfit': (0.36, 0.26, 0.42, 1), 'pants': (0.22, 0.19, 0.28, 1), 'skin': (0.93, 0.78, 0.66, 1), 'eyes': (0.30, 0.30, 0.36, 1)},
}

PINK = (0.94, 0.545, 0.69, 1)
DARK = (0.16, 0.11, 0.09, 1)
WHITE = (0.97, 0.95, 0.9, 1)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgba):
    """Palette entries are authored as display sRGB; Principled Base Color is
    scene-linear and the glTF exporter passes it through untouched. Without this
    every outfit shipped washed-out grey instead of its actual colour."""
    return (_srgb_to_linear(rgba[0]), _srgb_to_linear(rgba[1]),
            _srgb_to_linear(rgba[2]), rgba[3] if len(rgba) > 3 else 1.0)


def mat(name, color, rough=0.8):
    m = bpy.data.materials.get(name)
    if not m:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = lin(color)
    bsdf.inputs['Roughness'].default_value = rough
    m.diffuse_color = lin(color)
    return m


def set_mat(ob, m):
    ob.data.materials.clear()
    ob.data.materials.append(m)


# ── rig ─────────────────────────────────────────────────────────────────────
# character faces -Y (Blender front), +Z up. heights in meters.

BONES = {
    # name: (head, tail, parent)
    'Root':        ((0, 0, 0.92), (0, 0, 1.0), None),
    'Spine':       ((0, 0, 1.0), (0, 0, 1.12), 'Root'),
    'Chest':       ((0, 0, 1.12), (0, 0, 1.3), 'Spine'),
    'Neck':        ((0, 0, 1.3), (0, 0, 1.42), 'Chest'),
    'Head':        ((0, 0, 1.42), (0, 0, 1.62), 'Neck'),
    'Shoulder.L':  ((0.06, 0, 1.3), (0.22, 0, 1.28), 'Chest'),
    'UpperArm.L':  ((0.22, 0, 1.28), (0.28, 0, 1.02), 'Shoulder.L'),
    'Forearm.L':   ((0.28, 0, 1.02), (0.31, 0, 0.8), 'UpperArm.L'),
    'Hand.L':      ((0.31, 0, 0.8), (0.33, 0, 0.68), 'Forearm.L'),
    'Shoulder.R':  ((-0.06, 0, 1.3), (-0.22, 0, 1.28), 'Chest'),
    'UpperArm.R':  ((-0.22, 0, 1.28), (-0.28, 0, 1.02), 'Shoulder.R'),
    'Forearm.R':   ((-0.28, 0, 1.02), (-0.31, 0, 0.8), 'UpperArm.R'),
    'Hand.R':      ((-0.31, 0, 0.8), (-0.33, 0, 0.68), 'Forearm.R'),
    'UpperLeg.L':  ((0.09, 0, 0.9), (0.1, 0, 0.48), 'Root'),
    'LowerLeg.L':  ((0.1, 0, 0.48), (0.1, 0, 0.12), 'UpperLeg.L'),
    'Foot.L':      ((0.1, 0, 0.12), (0.1, -0.12, 0.05), 'LowerLeg.L'),
    'UpperLeg.R':  ((-0.09, 0, 0.9), (-0.1, 0, 0.48), 'Root'),
    'LowerLeg.R':  ((-0.1, 0, 0.48), (-0.1, 0, 0.12), 'UpperLeg.R'),
    'Foot.R':      ((-0.1, 0, 0.12), (-0.1, -0.12, 0.05), 'LowerLeg.R'),
}


def build_rig():
    arm_data = bpy.data.armatures.new('BFRig')
    arm = bpy.data.objects.new('BFRig', arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (head, tail, parent) in BONES.items():
        b = arm_data.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


# ── body parts (bone-parented) ──────────────────────────────────────────────

def bone_parent(ob, arm, bone_name):
    mw = ob.matrix_world.copy()
    ob.parent = arm
    ob.parent_type = 'BONE'
    ob.parent_bone = bone_name
    ob.matrix_world = mw


def sphere(name, loc, scale, material, seg=14, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=seg, ring_count=rings, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    set_mat(ob, material)
    bpy.ops.object.shade_smooth()
    return ob


def capsule(name, loc, radius, depth, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    set_mat(ob, material)
    bevel = ob.modifiers.new('round', 'BEVEL')
    bevel.width = radius * 0.55
    bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier='round')
    bpy.ops.object.shade_smooth()
    return ob


def box(name, loc, scale, material, rot=(0, 0, 0), bevel_w=0.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel_w:
        bevel = ob.modifiers.new('round', 'BEVEL')
        bevel.width = bevel_w
        bevel.segments = 2
        bpy.ops.object.modifier_apply(modifier='round')
    set_mat(ob, material)
    return ob


def torus(name, loc, major, minor, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=16, minor_segments=6, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    set_mat(ob, material)
    return ob


def cone(name, loc, r1, r2, depth, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    set_mat(ob, material)
    bpy.ops.object.shade_smooth()
    return ob


def build_body(arm, boy_id):
    v = BOYS[boy_id]
    skin = mat('skin', v['skin'])
    outfit = mat('outfit', v['outfit'])
    pants = mat('pants', v['pants'])
    hair_m = mat('hair', v['hairColor'], rough=0.65)
    dark = mat('dark', DARK)
    white = mat('white', WHITE, rough=0.3)
    parts = []

    # pelvis + torso — deliberately overlapping so no seam shows at the waist
    parts.append(capsule('Pelvis', (0, 0, 0.94), 0.150, 0.18, pants))
    chest = capsule('Torso', (0, 0, 1.18), 0.158, 0.38, outfit)
    parts.append(chest)
    # shoulders pad
    parts.append(capsule('Shoulders', (0, 0, 1.30), 0.072, 0.36, outfit, rot=(0, math.pi / 2, 0)))
    # collar so the shirt reads as clothing rather than paint
    parts.append(torus('Collar', (0, -0.01, 1.345), 0.062, 0.018, outfit, rot=(math.pi / 2, 0, 0)))
    # neck + head
    parts.append(capsule('NeckM', (0, 0, 1.37), 0.048, 0.10, skin))
    head = sphere('HeadM', (0, 0, 1.53), (0.115, 0.105, 0.125), skin)
    parts.append(head)
    # jaw hint
    parts.append(sphere('Jaw', (0, -0.02, 1.47), (0.075, 0.08, 0.07), skin, 12, 8))
    # nose
    parts.append(sphere('Nose', (0, -0.105, 1.52), (0.014, 0.014, 0.02), skin, 8, 6))
    # eyes — wide and short (anime read); the old tall ovals looked doll-like
    eye_m = mat('iris', v.get('eyes', (0.29, 0.24, 0.2, 1)), rough=0.25)
    for s, sx in (('L', 0.046), ('R', -0.046)):
        parts.append(sphere(f'EyeW.{s}', (sx, -0.086, 1.548), (0.027, 0.011, 0.017), white, 12, 8))
        parts.append(sphere(f'Iris.{s}', (sx, -0.094, 1.546), (0.013, 0.006, 0.013), eye_m, 10, 8))
        parts.append(sphere(f'Pupil.{s}', (sx, -0.097, 1.546), (0.006, 0.004, 0.007), dark, 8, 6))
        # upper lash line does most of the expression work at game scale
        parts.append(box(f'Lash.{s}', (sx, -0.090, 1.559), (0.030, 0.010, 0.005), dark,
                         rot=(0, 0, -sx * 1.6), bevel_w=0))
        parts.append(box(f'Brow.{s}', (sx, -0.086, 1.582), (0.030, 0.008, 0.006), hair_m,
                         rot=(0, 0, -sx * 2.2), bevel_w=0))
    # a small closed mouth, not a clown grin
    parts.append(box('Mouth', (0, -0.100, 1.492), (0.022, 0.008, 0.004),
                     mat('lip', (0.72, 0.48, 0.35, 1)), bevel_w=0.002))

    # arms & legs — segments deliberately overrun their joints so the limbs read
    # as continuous instead of as a ball-joint doll
    for s, sx in (('L', 1), ('R', -1)):
        parts.append(capsule(f'UpperArm.{s}', (sx * 0.25, 0, 1.15), 0.053, 0.31, outfit))
        parts.append(capsule(f'Forearm.{s}', (sx * 0.295, 0, 0.91), 0.046, 0.25, skin))
        # sleeve cuff hides the sweater/skin transition at the wrist
        parts.append(capsule(f'Cuff.{s}', (sx * 0.283, 0, 1.015), 0.052, 0.05, outfit))
        parts.append(sphere(f'Hand.{s}', (sx * 0.32, 0, 0.745), (0.046, 0.038, 0.058), skin, 10, 8))
        parts.append(capsule(f'UpperLeg.{s}', (sx * 0.095, 0, 0.68), 0.068, 0.44, pants))
        parts.append(capsule(f'LowerLeg.{s}', (sx * 0.1, 0, 0.30), 0.056, 0.40, pants))
        parts.append(box(f'Shoe.{s}', (sx * 0.1, -0.04, 0.045), (0.088, 0.17, 0.055), dark, bevel_w=0.022))

    # joint masking spheres, sized to match the limbs they bridge
    joint_balls = [
        ((0.212, 0, 1.285), 'Shoulder.L', outfit, 0.066), ((-0.212, 0, 1.285), 'Shoulder.R', outfit, 0.066),
        ((0.28, 0, 1.02), 'UpperArm.L', outfit, 0.050), ((-0.28, 0, 1.02), 'UpperArm.R', outfit, 0.050),
        ((0.31, 0, 0.8), 'Forearm.L', skin, 0.044), ((-0.31, 0, 0.8), 'Forearm.R', skin, 0.044),
        ((0.1, 0, 0.48), 'UpperLeg.L', pants, 0.058), ((-0.1, 0, 0.48), 'UpperLeg.R', pants, 0.058),
        ((0.1, 0, 0.12), 'LowerLeg.L', pants, 0.050), ((-0.1, 0, 0.12), 'LowerLeg.R', pants, 0.050),
    ]
    for (loc, bone, m, r) in joint_balls:
        ob = sphere(f'Joint.{bone}', loc, (r, r, r), m, 10, 8)
        bone_parent(ob, arm, bone)

    parents = {
        'Pelvis': 'Root', 'Torso': 'Chest', 'Shoulders': 'Chest', 'Collar': 'Chest',
        'NeckM': 'Neck',
        'HeadM': 'Head', 'Jaw': 'Head', 'Nose': 'Head', 'Mouth': 'Head',
        'EyeW.L': 'Head', 'EyeW.R': 'Head', 'Pupil.L': 'Head', 'Pupil.R': 'Head',
        'Iris.L': 'Head', 'Iris.R': 'Head', 'Lash.L': 'Head', 'Lash.R': 'Head',
        'Brow.L': 'Head', 'Brow.R': 'Head',
        'UpperArm.L': 'UpperArm.L', 'Forearm.L': 'Forearm.L', 'Hand.L': 'Hand.L',
        'UpperArm.R': 'UpperArm.R', 'Forearm.R': 'Forearm.R', 'Hand.R': 'Hand.R',
        'Cuff.L': 'UpperArm.L', 'Cuff.R': 'UpperArm.R',
        'UpperLeg.L': 'UpperLeg.L', 'LowerLeg.L': 'LowerLeg.L', 'Shoe.L': 'Foot.L',
        'UpperLeg.R': 'UpperLeg.R', 'LowerLeg.R': 'LowerLeg.R', 'Shoe.R': 'Foot.R',
    }
    for ob in parts:
        bone_parent(ob, arm, parents[ob.name])
    return parts, hair_m


def build_hair(arm, boy_id):
    v = BOYS[boy_id]
    hair_m = mat('hair', v['hairColor'], rough=0.65)
    style = v['hair']
    parts = []
    # Every style starts from a skull-cap that actually wraps the crown, sides and
    # nape (the old versions perched a ball on top and read as a bald man in a hat).
    def crown(z=1.556, s=(0.125, 0.120, 0.112), y=0.008):
        return sphere('HairCrown', (0, y, z), s, hair_m, 16, 12)

    if style == 'sweep':
        parts.append(crown())
        parts.append(sphere('HairSweep', (0.042, -0.062, 1.598), (0.098, 0.062, 0.048), hair_m, 12, 8))
        parts.append(sphere('HairSide.L', (0.098, -0.010, 1.545), (0.038, 0.085, 0.070), hair_m, 10, 8))
        parts.append(sphere('HairSide.R', (-0.098, -0.010, 1.545), (0.038, 0.085, 0.070), hair_m, 10, 8))
    elif style == 'spikes':
        parts.append(crown(1.560, (0.122, 0.118, 0.108)))
        for i in range(5):
            a = (i - 2) * 0.32
            parts.append(cone(f'Spike{i}', ((i - 2) * 0.044, -0.012 - abs(i - 2) * 0.010, 1.665),
                              0.036, 0.004, 0.085, hair_m, rot=(0.25, -a * 0.6, 0)))
    elif style == 'long':
        parts.append(crown(1.556, (0.126, 0.122, 0.114)))
        parts.append(box('HairBack', (0, 0.075, 1.455), (0.115, 0.075, 0.20), hair_m, bevel_w=0.035))
        parts.append(sphere('HairFringe', (0.020, -0.078, 1.600), (0.095, 0.048, 0.045), hair_m, 12, 8))
        parts.append(box('HairLock.L', (0.088, -0.048, 1.470), (0.030, 0.030, 0.14), hair_m, bevel_w=0.012))
        parts.append(box('HairLock.R', (-0.088, -0.048, 1.470), (0.030, 0.030, 0.14), hair_m, bevel_w=0.012))
    elif style == 'curls':
        parts.append(crown(1.558, (0.120, 0.116, 0.108)))
        for i in range(9):
            a = (i / 9) * math.tau
            parts.append(sphere(f'Curl{i}',
                                (math.cos(a) * 0.098, 0.010 + math.sin(a) * 0.088,
                                 1.600 + math.sin(a * 2) * 0.018),
                                (0.044, 0.044, 0.040), hair_m, 8, 6))
    elif style == 'slick':
        parts.append(crown(1.560, (0.122, 0.124, 0.104)))
        parts.append(sphere('HairBack', (0, 0.072, 1.535), (0.108, 0.078, 0.098), hair_m, 12, 8))
        # swept-back widow's peak
        parts.append(box('HairPeak', (0, -0.070, 1.610), (0.090, 0.050, 0.030), hair_m,
                         rot=(0.35, 0, 0), bevel_w=0.012))
    for ob in parts:
        bone_parent(ob, arm, 'Head')
    return parts


def build_accessories(arm, boy_id):
    parts = []
    if boy_id == 'kai':
        parts.append(torus('Scarf', (0, -0.01, 1.345), 0.105, 0.028, mat('scarf', (0.54, 0.16, 0.23, 1), rough=0.9), rot=(math.pi / 2, 0, 0)))
        parts.append(box('ScarfTail', (0.06, -0.12, 1.18), (0.045, 0.02, 0.14), mat('scarf', (0.54, 0.16, 0.23, 1), rough=0.9), rot=(0.15, 0, 0.1), bevel_w=0.008))
        bone_parent(parts[-2], arm, 'Neck')
        bone_parent(parts[-1], arm, 'Chest')
    elif boy_id == 'theo':
        apron = box('Apron', (0, -0.145, 1.1), (0.14, 0.02, 0.2), mat('apron', (0.96, 0.94, 0.89, 1), rough=0.95), bevel_w=0.01)
        parts.append(apron)
        strap = box('ApronStrap', (0, -0.13, 1.33), (0.1, 0.015, 0.05), mat('apron', (0.96, 0.94, 0.89, 1), rough=0.95), bevel_w=0.005)
        parts.append(strap)
        bone_parent(apron, arm, 'Chest')
        bone_parent(strap, arm, 'Neck')
    elif boy_id == 'ren':
        cravat = box('Cravat', (0, -0.135, 1.3), (0.035, 0.02, 0.055), mat('cravat', (0.85, 0.81, 0.75, 1), rough=0.8), bevel_w=0.01)
        parts.append(cravat)
        bone_parent(cravat, arm, 'Chest')
    elif boy_id == 'jasper':
        watch = torus('Watch', (0.31, 0, 0.83), 0.035, 0.014, mat('watch', (0.2, 0.2, 0.24, 1), rough=0.3), rot=(math.pi / 2, 0, 0))
        parts.append(watch)
        bone_parent(watch, arm, 'Forearm.L')
    elif boy_id == 'eli':
        # cardigan elbow patches — on the *sleeve*, i.e. the upper arm at the
        # elbow, not floating halfway down the bare forearm
        for s, sx in (('L', 0.281), ('R', -0.281)):
            patch = sphere(f'Patch.{s}', (sx, -0.030, 1.035), (0.030, 0.038, 0.030),
                           mat('patch', (0.54, 0.44, 0.32, 1)), 10, 8)
            parts.append(patch)
            bone_parent(patch, arm, f'UpperArm.{s}')
    return parts


# ── animation authoring ─────────────────────────────────────────────────────
# pose space: bones bend around their local axes. Rest pose = standing T-pose-ish (arms down).

D2R = math.pi / 180


def author_clip(arm, name, frames, loop=True):
    """frames: list of (frame, {bone: (euler_xyz_degrees, loc)})"""
    action = bpy.data.actions.new(name + '_BFRig')
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    for f, pose in frames:
        for bone, (rot_deg, loc) in pose.items():
            pb = arm.pose.bones[bone]
            if rot_deg is not None:
                pb.rotation_mode = 'XYZ'
                pb.rotation_euler = Euler((rot_deg[0] * D2R, rot_deg[1] * D2R, rot_deg[2] * D2R), 'XYZ')
                pb.keyframe_insert('rotation_euler', frame=f)
            if loc is not None:
                pb.location = loc
                pb.keyframe_insert('location', frame=f)
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action)
    arm.animation_data.action = None
    return action


def add_clips(arm):
    L = {}  # helper pose dicts

    # ── Idle_Stand: gentle breathing sway, 60f loop ──
    stand_frames = []
    for f in [1, 15, 30, 45, 60]:
        k = math.sin((f - 1) / 59 * math.pi * 2)
        stand_frames.append((f, {
            'Chest': ((1.5 + k * 1.2, 0, k * 0.8), None),
            'Head': ((k * 2, k * 3, 0), None),
            'UpperArm.L': ((0, 0, 3 + k), None),
            'UpperArm.R': ((0, 0, -3 - k), None),
        }))
    stand_frames.append((61, stand_frames[0][1]))
    author_clip(arm, 'Idle_Stand', stand_frames)

    # ── Idle_Sit: seated on couch, breathing, 60f loop ──
    sit_base = {
        'Root': ((0, 0, 0), (0, 0, -0.42)),
        'UpperLeg.L': ((-80, 0, -4), None),
        'UpperLeg.R': ((-80, 0, 4), None),
        'LowerLeg.L': ((78, 0, 0), None),
        'LowerLeg.R': ((78, 0, 0), None),
        'Foot.L': ((10, 0, 0), None),
        'Foot.R': ((10, 0, 0), None),
        'UpperArm.L': ((22, 0, 4), None),
        'UpperArm.R': ((22, 0, -4), None),
        'Forearm.L': ((30, 0, 0), None),
        'Forearm.R': ((30, 0, 0), None),
        'Chest': ((6, 0, 0), None),
    }
    sit_frames = []
    for f in [1, 15, 30, 45, 60]:
        k = math.sin((f - 1) / 59 * math.pi * 2)
        pose = dict(sit_base)
        pose['Chest'] = ((6 + k * 1.5, 0, 0), None)
        pose['Head'] = ((k * 2.5, k * 2, 0), None)
        sit_frames.append((f, pose))
    sit_frames.append((61, sit_frames[0][1]))
    author_clip(arm, 'Idle_Sit', sit_frames)

    # ── Walk: 32f cycle ──
    walk_frames = []
    for i, f in enumerate([1, 9, 17, 25, 33]):
        phase = (f - 1) / 32 * math.pi * 2
        s = math.sin(phase)
        c = math.sin(phase + math.pi)
        walk_frames.append((f, {
            'Root': ((0, 0, 0), (0, 0, abs(math.sin(phase * 2)) * 0.03)),
            'UpperLeg.L': ((s * 26, 0, 0), None),
            'UpperLeg.R': ((c * 26, 0, 0), None),
            'LowerLeg.L': ((max(0, -s) * 35 + 4, 0, 0), None),
            'LowerLeg.R': ((max(0, -c) * 35 + 4, 0, 0), None),
            'UpperArm.L': ((c * 18, 0, 3), None),
            'UpperArm.R': ((s * 18, 0, -3), None),
            'Chest': ((3, s * 3, 0), None),
            'Head': ((-2, 0, 0), None),
        }))
    author_clip(arm, 'Walk', walk_frames)

    # ── StandUp: sit → stand, 24f ──
    stand_base = {
        'Root': ((0, 0, 0), (0, 0, 0)),
        'UpperLeg.L': ((0, 0, 0), None), 'UpperLeg.R': ((0, 0, 0), None),
        'LowerLeg.L': ((4, 0, 0), None), 'LowerLeg.R': ((4, 0, 0), None),
        'Foot.L': ((0, 0, 0), None), 'Foot.R': ((0, 0, 0), None),
        'UpperArm.L': ((0, 0, 3), None), 'UpperArm.R': ((0, 0, -3), None),
        'Forearm.L': ((8, 0, 0), None), 'Forearm.R': ((8, 0, 0), None),
        'Chest': ((2, 0, 0), None),
    }
    author_clip(arm, 'StandUp', [(1, sit_base), (12, {
        'Root': ((0, 0, 0), (0, 0, -0.2)),
        'UpperLeg.L': ((-40, 0, -2), None), 'UpperLeg.R': ((-40, 0, 2), None),
        'LowerLeg.L': ((45, 0, 0), None), 'LowerLeg.R': ((45, 0, 0), None),
        'UpperArm.L': ((15, 0, 5), None), 'UpperArm.R': ((15, 0, -5), None),
        'Forearm.L': ((20, 0, 0), None), 'Forearm.R': ((20, 0, 0), None),
        'Chest': ((10, 0, 0), None),
    }), (24, stand_base)])

    # ── Kneel: stand → kneeling, 24f ──
    kneel_base = {
        'Root': ((0, 0, 0), (0, 0, -0.44)),
        'UpperLeg.L': ((-95, 0, -3), None),
        'UpperLeg.R': ((-30, 0, 3), None),
        'LowerLeg.L': ((115, 0, 0), None),
        'LowerLeg.R': ((55, 0, 0), None),
        'Foot.L': ((30, 0, 0), None),
        'Foot.R': ((20, 0, 0), None),
        'Chest': ((12, 0, 0), None),
        'UpperArm.L': ((20, 0, 8), None),
        'UpperArm.R': ((20, 0, -8), None),
        'Forearm.L': ((25, 0, 0), None),
        'Forearm.R': ((25, 0, 0), None),
        'Head': ((8, 0, 0), None),
    }
    author_clip(arm, 'Kneel', [(1, stand_base), (14, {
        'Root': ((0, 0, 0), (0, 0, -0.25)),
        'UpperLeg.L': ((-60, 0, -2), None), 'UpperLeg.R': ((-15, 0, 2), None),
        'LowerLeg.L': ((80, 0, 0), None), 'LowerLeg.R': ((35, 0, 0), None),
        'Chest': ((8, 0, 0), None),
        'UpperArm.L': ((10, 0, 6), None), 'UpperArm.R': ((10, 0, -6), None),
    }), (24, kneel_base)])

    # ── Cuddle: kneel + reach forward with open arms, 60f loop ──
    cuddle_base = dict(kneel_base)
    cuddle_base.update({
        'UpperArm.L': ((64, 0, 10), None),
        'UpperArm.R': ((64, 0, -10), None),
        'Forearm.L': ((22, 0, 8), None),
        'Forearm.R': ((22, 0, -8), None),
        'Head': ((14, 0, 0), None),
        'Chest': ((16, 0, 0), None),
    })
    cuddle_frames = []
    for f in [1, 15, 30, 45, 60]:
        k = math.sin((f - 1) / 59 * math.pi * 2)
        pose = dict(cuddle_base)
        pose['Chest'] = ((16 + k * 2, 0, 0), None)
        pose['UpperArm.L'] = ((64 + k * 3, 0, 10), None)
        pose['UpperArm.R'] = ((64 + k * 3, 0, -10), None)
        cuddle_frames.append((f, pose))
    cuddle_frames.append((61, cuddle_frames[0][1]))
    author_clip(arm, 'Cuddle', cuddle_frames)

    # ── React: startle + look, 36f ──
    react_frames = [
        (1, stand_base),
        (8, {
            'Root': ((0, 0, 0), (0, 0, 0.03)),
            'Chest': ((-6, 0, 0), None),
            'Head': ((-10, 25, 0), None),
            'UpperArm.L': ((-12, 0, 14), None),
            'UpperArm.R': ((-12, 0, -14), None),
            'Forearm.L': ((20, 0, 0), None),
            'Forearm.R': ((20, 0, 0), None),
        }),
        (24, {
            'Chest': ((-2, 0, 0), None),
            'Head': ((-4, 20, 0), None),
            'UpperArm.L': ((-4, 0, 8), None),
            'UpperArm.R': ((-4, 0, -8), None),
        }),
        (36, stand_base),
    ]
    author_clip(arm, 'React', react_frames)


# ── render helpers ──────────────────────────────────────────────────────────

def setup_render():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.render.resolution_x = 560
    scene.render.resolution_y = 640
    scene.world = bpy.data.worlds.new('W')
    scene.world.color = (0.05, 0.04, 0.07)
    cam_data = bpy.data.cameras.new('Cam')
    cam = bpy.data.objects.new('Cam', cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam


def look_at(obj, target):
    d = target - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


# ── build all ───────────────────────────────────────────────────────────────

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(RENDER_DIR, exist_ok=True)

for boy_id in BOYS:
    reset()
    arm = build_rig()
    parts, hair_m = build_body(arm, boy_id)
    build_hair(arm, boy_id)
    build_accessories(arm, boy_id)
    add_clips(arm)

    out = f'{OUT_DIR}/boy-{boy_id}.glb'
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_yup=True,
        export_animations=True,
        export_nla_strips=True,
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_materials='EXPORT',
    )
    print(f'[bf] exported {out} ({os.path.getsize(out)//1024} KB)')

    # preview: 3/4 view + sit + cuddle stills
    scene, cam = setup_render()
    target = Vector((0, 0, 1.0))
    cam.location = Vector((2.1, -2.6, 1.5))
    look_at(cam, target)
    scene.render.filepath = f'{RENDER_DIR}/bf_{boy_id}_stand.png'
    bpy.ops.render.render(write_still=True)

    for clip, frame in [('Idle_Sit', 10), ('Cuddle', 10), ('Walk', 9)]:
        act = bpy.data.actions.get(clip + '_BFRig')
        if act:
            arm.animation_data.action = act
            scene.frame_set(frame)
            scene.render.filepath = f'{RENDER_DIR}/bf_{boy_id}_{clip}.png'
            bpy.ops.render.render(write_still=True)
    arm.animation_data.action = None

print('[bf] all boyfriends built')
