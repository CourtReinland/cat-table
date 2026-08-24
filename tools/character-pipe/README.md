# Suki house pipe (Steph)

GS-SUKI-IN. Cat is a **quadruped**. Never sit-as-rest. Never Mixamo/AccuRIG on the cat (those are boys-only). Never metaball. Never Unity in this pipe. Game only on **PASS**.

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
11. **Game** — bind GLB is shippable only on **PASS**.

## On-disk canon (do not redo Imagine first)

| Asset | Path |
| --- | --- |
| Standing quad sheet | `/workspace/suki-canon/suki-imagine-tpose-sheet.png` |
| FRONT crop (Hunyuan front) | `/workspace/suki-canon/suki-sheet-crop-front.png` |
| LEFT crop | `/workspace/suki-canon/suki-sheet-crop-left.png` |
| BACK crop | `/workspace/suki-canon/suki-sheet-crop-back.png` |
| 3Q crop | `/workspace/suki-canon/suki-sheet-crop-3q.png` |
| Biped ortho — **do not Hunyuan** | `/workspace/suki-canon/suki-imagine-tpose-front-ortho.png` |
| Sit-rest GLBs — **do not bind** | `suki-hunyuan-stand.glb`, `suki-hunyuan.glb`, `suki-hunyuan-bound.glb` |

Scripts: `pipe/imagine_tpose.py`, `pipe/hunyuan_mesh.py`, `pipe/rest_pose_check.py`  
Venv: `/workspace/.venv-fal`  
Blender: 4.3.2 (`/usr/bin/blender`)  
Secrets (never print): connector `fal.json` / `xai.json` under `/home/box/agent-data/connector-secrets/3ffb7cad-0a29-4270-8502-71eeb1aa2526/`

## Exact commands

```bash
# 0) optional Imagine (only if Hunyuan sit-failed 2x)
/workspace/.venv-fal/bin/python /workspace/suki-canon/pipe/imagine_tpose.py \
  --out /workspace/suki-canon/suki-imagine-tpose-sheet.png

# 1) Hunyuan from four-on-floor FRONT (+ left/back)
#    attempt N → write attempts/hunyuan-N.glb then copy to suki-hunyuan-tpose.glb on STAND
/workspace/.venv-fal/bin/python /workspace/suki-canon/pipe/hunyuan_mesh.py \
  --front /workspace/suki-canon/suki-sheet-crop-front.png \
  --left  /workspace/suki-canon/suki-sheet-crop-left.png \
  --back  /workspace/suki-canon/suki-sheet-crop-back.png \
  --out   /workspace/suki-canon/suki-hunyuan-tpose.glb \
  --thumb /workspace/suki-canon/suki-hunyuan-tpose-thumb.png \
  --face-count 80000

# 2) Rest-pose QC (exit 0 STAND PASS, 2 SIT FAIL, 1 unknown)
blender --background --python /workspace/suki-canon/pipe/rest_pose_check.py -- \
  --glb  /workspace/suki-canon/suki-hunyuan-tpose.glb \
  --json /workspace/suki-canon/attempts/rest-qc.json \
  --thumb /workspace/suki-canon/attempts/rest-qc.png

# Sit = discard that GLB, retry Hunyuan with a stricter standing front. Max 3 Hunyuan attempts.
# Do not bind old sit-rest files.

# 3) Quad bind + clips + stills (standing rest only)
blender --background --python /workspace/suki-canon/pipe/bind_suki_stand.py
```

Outputs from bind:

- `/workspace/suki-canon/suki-hunyuan-bound-stand.glb`
- `/workspace/suki-canon/in-rest-stand.png`
- `/workspace/suki-canon/in-pose-sit.png`
- `/workspace/suki-canon/in-pose-walk.png`
- `/workspace/suki-canon/in-pose-playbow.png`
- `/workspace/suki-canon/in-bind-report.txt`

Clips on the bound GLB: `Idle`, `Idle_Look`, `Walk`, `Run`, `Swipe`, `Sit`, `Cuddle`, `Hit`.

## PASS gate (game only on PASS)

**Rest**

- PASS: four paws down, backline high, tail off ground, not loaf / sit / play-bow as bind pose.
- FAIL sit: ears-high + tucked haunches + tail on ground → discard mesh, new Hunyuan (max 3).

**Walk (and any clip used in game)**

- PASS only if **real deform** (verts follow bones; sample max delta ≳ 2 mm) **and** no shredded fur cards (no exploding shells, no card fans at folds).
- FAIL loops: fix **weights first** (normalize, limit influences, envelope / voxel-proxy transfer). If still shredded / smear, **new Hunyuan** (stricter standing front). Do not ship.

**Do not**

- Bind sit-rest GLBs.
- Mixamo / AccuRIG the cat.
- Metaball / remesh the hero.
- Unity import until this gate is PASS.
- Notify / PR / clone cat-table from this pipe.
