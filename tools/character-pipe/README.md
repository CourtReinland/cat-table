# Suki house pipe (Steph)

GS-SUKI-IN. Cat is a **quadruped**. Never sit-as-rest. Never Mixamo/AccuRIG on the cat (those are boys-only). Never metaball. Stay **three.js** — never Unity. Game only on **PASS**.

## Recipe (order)

1. **Canon still** — approved 2D (Imagine sheet / play-art). Do not redo Imagine unless Hunyuan sit-fails twice.
2. **Split parts** (optional) — head / body / paws / hair / bow. Skip if the whole-body stand mesh is clean.
3. **Tripo / Hunyuan** — image-to-3D from **four-on-floor FRONT**. Optional left/back/right.  
   **Never** send the biped T-pose ortho (`suki-imagine-tpose-front-ortho.png`) — that makes a cat-girl.  
   Endpoint: `fal-ai/hunyuan-3d/v3.1/pro/image-to-3d`
4. **Blender assemble** — join untextured parts if split; otherwise keep the one stand mesh. No remesh / sculpt / metaball.
5. **UV** — keep Hunyuan UVs/PBR if present; only unwrap if parts were rebuilt.
6. **Texture / patch** — identity (white fluff, blue eyes, pink bow). Patch holes, do not regenerate the body.
7. **Quad rig** — custom cat armature in Blender. Mixamo / AccuRIG **only for boys**.
8. **Spring bones** — tail + bow (cheap extra bones + idle sway).
9. **Toon** — stylized EEVEE stills; keep PBR maps.
10. **Stills vs approved art** — rest stand + sit + walk + play-bow. Walk must **deform** and must **not shred fur cards**.
11. **Game** — bind GLB is shippable only on **PASS**. Play drop-in: `public/assets/models/suki.glb`.

## Scripts (repo-relative)

All pipe code lives in `tools/character-pipe/`:

| Script | Role |
| --- | --- |
| `tools/character-pipe/imagine_tpose.py` | optional Imagine standing-quad sheet |
| `tools/character-pipe/hunyuan_mesh.py` | image-to-3D from four-on-floor FRONT |
| `tools/character-pipe/rest_pose_check.py` | rest QC (exit 0 STAND PASS, 2 SIT FAIL, 1 unknown) |
| `tools/character-pipe/bind_suki_stand.py` | Suki bind + clips; refuses sit rest; WALK GATE before BOUND |
| `tools/character-pipe/bind_quad.py` | generic standing-quad bind (same sit refuse) |

Canon stills / Hunyuan working files are local inputs next to the run (sheet crops, attempt GLBs). Do not bind sit-rest files (`suki-hunyuan-stand.glb`, `suki-hunyuan.glb`, `suki-hunyuan-bound.glb`). Biped ortho (`suki-imagine-tpose-front-ortho.png`) is **do not Hunyuan**.

Blender: 4.3.2. Imagine / Hunyuan secrets stay in the connector store (never print).

## Exact commands

```bash
# 0) optional Imagine (only if Hunyuan sit-failed 2x)
python tools/character-pipe/imagine_tpose.py \
  --out suki-imagine-tpose-sheet.png

# 1) Hunyuan from four-on-floor FRONT (+ left/back)
#    attempt N → write attempts/hunyuan-N.glb then promote on STAND
python tools/character-pipe/hunyuan_mesh.py \
  --front suki-sheet-crop-front.png \
  --left  suki-sheet-crop-left.png \
  --back  suki-sheet-crop-back.png \
  --out   suki-hunyuan-tpose.glb \
  --thumb suki-hunyuan-tpose-thumb.png \
  --face-count 80000

# 2) Rest-pose QC (exit 0 STAND PASS, 2 SIT FAIL, 1 unknown)
blender --background --python tools/character-pipe/rest_pose_check.py -- \
  --glb  suki-hunyuan-tpose.glb \
  --json attempts/rest-qc.json \
  --thumb attempts/rest-qc.png

# Sit = discard that GLB, retry Hunyuan with a stricter standing front. Max 3 Hunyuan attempts.
# Do not bind old sit-rest files.

# 3) Quad bind + clips + stills (standing rest only).
#    bind_suki_stand.py calls rest_pose_check and will not write BOUND on sit or WALK GATE FAIL.
blender --background --python tools/character-pipe/bind_suki_stand.py
```

Bind stills / report land next to the bind run (`in-rest-stand.png`, `in-pose-sit.png`, `in-pose-walk.png`, `in-pose-playbow.png`, `in-bind-report.txt`). On **PASS** only, copy the bound GLB to the play drop-in:

`public/assets/models/suki.glb`

Clips on the bound GLB: `Idle`, `Idle_Look`, `Walk`, `Run`, `Swipe`, `Sit`, `Cuddle`, `Hit`.

## PASS gate (game only on PASS)

**Rest**

- PASS: four paws down, backline high, tail off ground, not loaf / sit / play-bow as bind pose.
- FAIL sit: ears-high + tucked haunches + tail on ground → discard mesh, new Hunyuan (max 3). `bind_suki_stand.py` / `bind_quad.py` refuse the bind (exit 2).

**Walk (and any clip used in game)**

- PASS only if **real deform** (verts follow bones; sample max delta ≳ 2 mm) **and** no shredded fur cards (no exploding shells, no card fans at folds).
- FAIL loops: fix **weights first** (normalize, limit influences, envelope / voxel-proxy transfer). If still shredded / smear, **new Hunyuan** (stricter standing front). Do not ship — do not overwrite BOUND.

**Do not**

- Bind sit-rest GLBs.
- Mixamo / AccuRIG the cat.
- Metaball / remesh the hero.
- Use Unity (stay three.js).
- Notify / PR / clone cat-table from this pipe.
