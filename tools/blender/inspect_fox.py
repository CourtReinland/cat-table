"""Dump the Fox model structure: bones, materials, mesh stats."""
import bpy
import sys

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='UltimateAnimatedAnimals/glTF/Fox.gltf')

print('=== OBJECTS ===')
for o in bpy.data.objects:
    print(f'{o.type:10s} {o.name:20s} parent={o.parent.name if o.parent else None}')

print('=== BONES ===')
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        for b in o.data.bones:
            head = b.head_local
            print(f'{b.name:24s} parent={b.parent.name if b.parent else "":24s} head=({head.x:.3f},{head.y:.3f},{head.z:.3f}) len={b.length:.3f}')

print('=== MATERIALS ===')
for m in bpy.data.materials:
    print(m.name)

print('=== MESH STATS ===')
for o in bpy.data.objects:
    if o.type == 'MESH':
        print(f'{o.name}: {len(o.data.vertices)} verts, {len(o.data.polygons)} polys')
        dims = o.dimensions
        print(f'  dimensions: ({dims.x:.3f}, {dims.y:.3f}, {dims.z:.3f})')
