webgpu + threejs pipeline

The post by @MrCollison showcases a browser-based FPS-style "horror" tech demo running in Three.js, featuring advanced real-time global illumination (GI) heavily inspired by idTech 8 (id Software's engine for titles like DOOM The Dark Ages).
It runs impressively in the browser (45-50+ FPS on an RTX 3050 at 1080p, higher on better hardware), with dynamic lighting, flashlight interactions, fog/froxel effects, and atmospheric horror elements. The creator emphasizes it's a work-in-progress personal project, with plans to open-source it after polishing.
Core Tech Stack (Inferred from Post, Thread, Videos, and Creator Context)

Rendering Engine: Three.js (primary) via WebGPU (for modern compute/shader capabilities).
Three.js handles the scene graph, materials, meshes, cameras, lighting basics, post-processing, and FPS controls.
WebGPU enables high-performance compute shaders, storage buffers, and custom pipelines critical for advanced GI. (WebGL would be too limited for this level of real-time GI.)

Global Illumination (GI) Implementation:
idTech 8-inspired "Fast as Hell" real-time GI: Cascaded radiance volumes/light grids (similar to DDGI/DDGI-like probes), irradiance volumes, and multi-bounce indirect lighting.
Froxels (frustum voxels): Volumetric representation for participating media/fog that interacts with lights (e.g., flashlight "activates" GI, occluded lights still affect volumes). This creates believable bounce lighting and atmospheric effects.
Software raytracing (in shaders): For indirect diffuse lookups, reflections (hybrid with SSR), and visibility. Likely uses acceleration structures like BVH (e.g., via three-mesh-bvh or custom WebGPU equivalents).
Bindirect Lighting (creator's term): Dynamic indirect bounce activation by local lights like flashlights, mimicking real-world light transport.
Temporal accumulation, denoising, and jitter for stability/noise reduction (with some acknowledged bugs in the demo).

Assets & Scene:
GLB models (e.g., environments, the Iron Giant model from Sketchfab for educational use).
PBR materials, textures (heavy network loading noted in one thread post due to LAN testing).
~2.2 million triangles in tested scenes, with local volumes for optimization.

Audio: Custom sound design (emphasized in the post) — likely Web Audio API or Howler.js integrated with Three.js for positional/ambient horror sounds.
Development/Performance Setup:
Browser-based (HTML/JS, served locally or via simple server).
Tested on RTX 3050 (45-50 FPS @ 1080p), M4 MacBook (high FPS at 4K in related posts), etc.
DevTools visible in one video (network tab showing heavy texture/script loads, Elements/Console for debugging).
No heavy Node.js backend in the demo (pure client-side for the showcase).

Other Likely Tools (based on creator's ultra-full-stack background):
Shader authoring in WGSL (WebGPU Shading Language).
Post-processing (fog, bloom/godrays?, DOF mentioned in community replies).
Possibly React/Next.js or vanilla for the hosting page, but the demo is a standalone Three.js canvas.


How It Was Probably Implemented (Best Practices Context)
Matt (@MrCollison) is an experienced full-stack builder (CTO background, pre-AI coding since age 8) who vibes with rapid iteration, often using AI tools for acceleration. Here's a reasoned breakdown:

Base Setup:
Standard Three.js WebGPU starter (e.g., via examples or three + @three/tsl for node-based shaders).
Load scene with GLTFLoader, set up Orbit/FirstPerson controls, basic directional/point lights, and PBR materials (MeshStandardMaterial or custom).

GI Pipeline (Core Innovation):
Probe/Volume Placement: Cascaded grids (multiple resolution levels, exponential distribution) for world-space irradiance. Update dynamically or on changes.
Compute Passes (WebGPU):
Trace rays in shaders against scene geometry (software RT or BVH).
Store radiance/irradiance in 3D textures/volumes.
Froxel pass for volumetric integration (light scattering in fog, visibility from occluded sources).

Hybrid Lighting: Combine direct lights + indirect from volumes + SSR/raytraced reflections.
Temporal & Denoising: Reproject previous frames, accumulate samples, apply spatial/temporal filters to reduce noise (common in real-time GI).
Inspired directly by Tiago Sousa's idTech 8 SIGGRAPH talk: Shift from baked to fully dynamic, performance-first volumes for large levels.
This took ~5 weeks part-time, aligning with focused graphics programming sprints.
Optimization Best Practices:
Local volumes to avoid global computation.
Level-of-detail for probes.
Careful with triangle counts (2.2M is manageable with WebGPU acceleration).
Network texture streaming (noted issue over LAN).
Targeting mobile/desktop scalability in future open-source version.

Horror/Polish Layer:
Dynamic flashlight as a key light source that triggers GI updates.
Fog, low lighting, sound design for immersion.
Post-effects for cinematic feel.


Challenges & Next Steps (from creator): Denoising/temporal improvements, artifact reduction at city scale, better optimization. He's open-sourcing once polished.
This is impressive solo work pushing browser limits—WebGPU + Three.js makes AAA-like GI feasible without a full native engine. It demonstrates the rapid evolution of web graphics in 2026, where techniques once exclusive to high-end game engines are now accessible in a browser tab.
If you want to experiment, start with Three.js WebGPU examples, add three-mesh-bvh for acceleration, and study idTech 8 SIGGRAPH materials + DDGI papers. Let me know if you'd like code sketches or help setting up a similar base!