"""
Suki restyle pipeline: Quaternius Fox -> cream cat with pink bow & collar.
Runs headless:  blender --background --python tools/blender/restyle_cat.py

Steps:
 1. import Fox.gltf
 2. cat-ify mesh in rest pose (shorten muzzle, slim tail, shorten ears, enlarge eyes)
 3. recolor materials to Suki's palette
 4. add collar + bow, bone-parented so they follow the animations
 5. export public/assets/models/suki.glb
 6. render turntable + animation stills to tools/out/blender/
"""
import bpy
import math
import os
from mathutils import Vector, Matrix

SRC = 'UltimateAnimatedAnimals/glTF/Fox.gltf'
GLB_OUT = 'public/assets/models/suki.glb'
RENDER_DIR = 'tools/out/blender'

CREAM = (0.925, 0.816, 0.675, 1.0)       # #ecd2ac
CREAM_LIGHT = (0.968, 0.902, 0.8, 1.0)   # #f7e6cc
APRICOT = (0.86, 0.66, 0.47, 1.0)        # #dca878
DARK = (0.29, 0.2, 0.15, 1.0)            # nose/paws
AMBER = (0.72, 0.48, 0.16, 1.0)          # eyes
PINK = (0.94, 0.545, 0.69, 1.0)          # bow & collar
GOLD = (0.96, 0.79, 0.35, 1.0)           # bell

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
fox = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name == 'Fox')
ico = next((o for o in bpy.data.objects if o.name == 'Icosphere'), None)

# The Icosphere is the eye-shine ball Quaternius includes; keep it but recolor white.
bpy.context.view_layer.objects.active = fox

# ── helpers ─────────────────────────────────────────────────────────────────

def vert_world(v, obj):
    return obj.matrix_world @ v.co

def set_vert_world(v, obj, p):
    v.co = obj.matrix_world.inverted() @ p

def group_index(obj, name):
    return obj.vertex_groups[name].index if name in obj.vertex_groups else -1

def max_weight_group(v, names, obj):
    best, bestw = None, 0.0
    for g in v.groups:
        try:
            name = obj.vertex_groups[g.group].name
        except IndexError:
            continue
        if name in names and g.weight > bestw:
            best, bestw = name, g.weight
    return best, bestw

def bone_head(name):
    b = arm.data.bones.get(name)
    return (arm.matrix_world @ Matrix.Translation(b.head_local)).to_translation() if b else None

# ── 1. cat-ify the mesh (rest pose, world space) ────────────────────────────

mesh = fox.data
tail_names = {f'Tail{i}' for i in range(1, 9)}
ear_names = {f'Ear{i}.{s}' for i in range(1, 5) for s in ('L', 'R')}

tail_base = bone_head('Tail1')
ear_base = {'L': bone_head('Ear1.L'), 'R': bone_head('Ear1.R')}
head_c = bone_head('Head')

# muzzle shorten: verts in front of the head, pulled back toward the skull
MUZZLE_Y = head_c.y - 0.22
for v in mesh.vertices:
    p = vert_world(v, fox)
    if p.y < MUZZLE_Y and p.z > head_c.z - 0.5:
        t = min(1.0, (MUZZLE_Y - p.y) / 0.75)
        p.y += (MUZZLE_Y - p.y) * 0.72 * t      # shorten hard
        p.x *= 1.0 + 0.18 * t                    # widen the cheeks
        p.z += 0.09 * t * t                      # tip the nose up
        set_vert_world(v, fox, p)

# rounder head overall
head_gi = group_index(fox, 'Head')
if head_gi >= 0:
    for v in mesh.vertices:
        w = next((g.weight for g in v.groups if g.group == head_gi), 0)
        if w > 0.45:
            p = vert_world(v, fox)
            p.x = head_c.x + (p.x - head_c.x) * 1.26
            p.z = head_c.z + (p.z - head_c.z) * 1.06
            set_vert_world(v, fox, p)

# tail slim: scale offset from the tail line, more toward the tip
for v in mesh.vertices:
    name, w = max_weight_group(v, tail_names, fox)
    if not name or w < 0.35:
        continue
    seg = int(name[4:])
    p = vert_world(v, fox)
    f = 0.62 - 0.34 * (seg - 1) / 7.0            # 0.62 at base -> 0.28 at tip
    # offset from the tail's central line (x=0 plane and the bone chain)
    p.x *= 1.0 + (f - 1.0) * 1.0
    p.z = tail_base.z + (p.z - tail_base.z) * (1.0 + (f - 1.0) * 0.8)
    p.y = tail_base.y + (p.y - tail_base.y) * (1.0 - 0.08)   # slight shorten
    set_vert_world(v, fox, p)

# ears shorter: scale around ear base per side
for v in mesh.vertices:
    name, w = max_weight_group(v, ear_names, fox)
    if not name or w < 0.3:
        continue
    side = name.split('.')[1]
    base = ear_base[side]
    p = vert_world(v, fox)
    p = base + (p - base) * 0.62
    set_vert_world(v, fox, p)

# bigger eyes: faces using the Eyes material, scaled per side
eye_mat_idx = next((i for i, m in enumerate(mesh.materials) if m and m.name == 'Eyes'), None)
eye_verts = {1: set(), -1: set()}
if eye_mat_idx is not None:
    for poly in mesh.polygons:
        if poly.material_index == eye_mat_idx:
            side = 1 if poly.center.x >= 0 else -1
            for vi in poly.vertices:
                eye_verts[side].add(vi)
    for side, vset in eye_verts.items():
        if not vset:
            continue
        center = Vector((0, 0, 0))
        for vi in vset:
            center += vert_world(mesh.vertices[vi], fox)
        center /= len(vset)
        for vi in vset:
            v = mesh.vertices[vi]
            p = vert_world(v, fox)
            p = center + (p - center) * 1.6
            set_vert_world(v, fox, p)

mesh.update()

# ── 2. materials ────────────────────────────────────────────────────────────

def set_mat(name, color, rough=0.85):
    m = bpy.data.materials.get(name)
    if not m:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = rough
    m.diffuse_color = color
    return m

set_mat('Main', CREAM)
set_mat('Main_Light', CREAM_LIGHT)
set_mat('Grey', APRICOT)
set_mat('Black', DARK)
set_mat('Eyes', AMBER, rough=0.25)
# eyes shine ball
if ico:
    shine = set_mat('Shine', (1, 1, 1, 1), rough=0.1)
    ico.data.materials.clear()
    ico.data.materials.append(shine)
    # enlarge to match the bigger eyes
    ico.scale = (1.35, 1.35, 1.35)

# ── 3. collar + bow (bone-parented) ─────────────────────────────────────────

def make_prism_mesh(name, verts, faces, color):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(set_mat(name + 'Mat', color, rough=0.55))
    return ob

def bone_parent(ob, bone_name):
    mw = ob.matrix_world.copy()
    ob.parent = arm
    ob.parent_type = 'BONE'
    ob.parent_bone = bone_name
    ob.matrix_world = mw

# collar torus around Neck3
neck3 = arm.data.bones['Neck3']
neck_head = (arm.matrix_world @ Matrix.Translation(neck3.head_local)).to_translation()
neck_tail = (arm.matrix_world @ Matrix.Translation(neck3.tail_local)).to_translation()
neck_dir = (neck_tail - neck_head).normalized()
collar_c = neck_head + (neck_tail - neck_head) * 0.2

bpy.ops.mesh.primitive_torus_add(major_radius=0.33, minor_radius=0.075, major_segments=16, minor_segments=6, location=collar_c)
collar = bpy.context.active_object
collar.name = 'Collar'
collar.data.materials.append(set_mat('CollarMat', PINK, rough=0.5))
# orient torus axis to neck direction
q = Vector((0, 0, 1)).rotation_difference(neck_dir)
collar.rotation_mode = 'QUATERNION'
collar.rotation_quaternion = q
bone_parent(collar, 'Neck3')

# bell hanging below the collar's front
bell_c = collar_c + Vector((0, -0.04, -0.4))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.09, segments=10, ring_count=6, location=bell_c)
bell = bpy.context.active_object
bell.name = 'Bell'
bell.data.materials.append(set_mat('BellMat', GOLD, rough=0.25))
bell.scale = (1, 1, 1.15)
bone_parent(bell, 'Neck3')

# bow: two flattened ellipsoid wings + knot, hugging the right ear base
ear_r = ear_base['R']
knot_c = ear_r + Vector((-0.1, 0.04, 0.07))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06, segments=8, ring_count=6, location=knot_c)
knot = bpy.context.active_object
knot.name = 'BowKnot'
knot.data.materials.append(set_mat('BowMat', PINK, rough=0.55))
knot.scale = (1, 0.7, 1)
bone_parent(knot, 'Ear1.R')

for side, sgn in (('L', 1), ('R', -1)):
    loc = knot_c + Vector((sgn * 0.13, 0.01, -0.01))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, segments=8, ring_count=6, location=loc)
    wing = bpy.context.active_object
    wing.name = f'BowWing{side}'
    wing.data.materials.append(bpy.data.materials['BowMat'])
    wing.scale = (1.5, 0.32, 0.75)
    wing.rotation_mode = 'XYZ'
    wing.rotation_euler = (0, 0, sgn * math.radians(38))
    bone_parent(wing, 'Ear1.R')

# ── 4. export GLB ───────────────────────────────────────────────────────────

os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format='GLB',
    export_yup=True,
    export_animations=True,
    export_nla_strips=True,
    export_force_sampling=True,
    export_optimize_animation_size=True,
    export_materials='EXPORT',
)
print(f'[suki] exported {GLB_OUT} ({os.path.getsize(GLB_OUT)//1024} KB)')

# ── 5. preview renders ──────────────────────────────────────────────────────

os.makedirs(RENDER_DIR, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = 640
scene.render.resolution_y = 480
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new('W')
scene.world.color = (0.05, 0.04, 0.07)

cam_data = bpy.data.cameras.new('Cam')
cam = bpy.data.objects.new('Cam', cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam

def look_at(obj, target):
    d = target - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

target = Vector((0, -0.2, 1.1))

# freeze at rest for turntable
for i in range(8):
    a = math.radians(i * 45)
    cam.location = target + Vector((math.sin(a) * 7.5, math.cos(a) * 7.5, 1.8))
    look_at(cam, target)
    scene.render.filepath = f'{RENDER_DIR}/turn_{i:02d}.png'
    bpy.ops.render.render(write_still=True)

# animation stills
action_frames = {'Walk': 10, 'Attack': 6, 'Idle_2': 20, 'Eating': 15}
cam.location = target + Vector((4.5, -5.5, 1.6))
look_at(cam, target)
for act in bpy.data.actions:
    clean = act.name.replace('_AnimalArmature', '')
    if clean not in action_frames:
        continue
    arm.animation_data.action = act
    scene.frame_set(action_frames[clean])
    scene.render.filepath = f'{RENDER_DIR}/anim_{clean}.png'
    bpy.ops.render.render(write_still=True)
arm.animation_data.action = None

print('[suki] renders done')
