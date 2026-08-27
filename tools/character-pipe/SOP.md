# Steph character pipe (Court playbook)

House recipe: [Steph](https://youtu.be/8PnuTqUYQgo). Cat is a **quadruped**. Stay **three.js**. Game only on **PASS**.

Longer recipe (do not rewrite): [`tools/character-pipe/README.md`](README.md). Flags below are from the scripts, not a paraphrase.

**Superseded (do not run):** `tools/blender/sculpt_suki.py` metaball. Mentioned once; the living pipe replaces it.

## Never

- Sit-as-rest. Loaf / play-bow as bind pose.
- Mixamo / AccuRIG a cat (those are **boys only**).
- Metaball / remesh the hero.
- Hunyuan the biped T-pose ortho (`suki-imagine-tpose-front-ortho.png`) — that makes a cat-girl.
- Bind old sit-rest files: `suki-hunyuan-stand.glb`, `suki-hunyuan.glb`, `suki-hunyuan-bound.glb`.
- Unity.
- PR / overwrite `public/assets/models/suki.glb` on FAIL.

## Drop-in + clips

- Play mesh: `public/assets/models/suki.glb`
- Clips: `Idle`, `Idle_Look`, `Walk`, `Run`, `Swipe`, `Sit`, `Cuddle`, `Hit`
- Blender: 4.3.2
- Hunyuan endpoint: `fal-ai/hunyuan-3d/v3.1/pro/image-to-3d` from **four-on-floor FRONT** (optional left / back / right)

## 1. Canon still

Approved 2D (Imagine sheet / play-art). Do not redo Imagine unless Hunyuan sit-fails **twice**.

Optional Imagine (script **requires** `--ref`, `--out-sheet`, `--out-front`):

```bash
python tools/character-pipe/imagine_tpose.py \
  --ref <approved-still.png> \
  --out-sheet suki-imagine-tpose-sheet.png \
  --out-front suki-imagine-tpose-front.png \
  --out-left  suki-imagine-tpose-left.png \
  --out-back  suki-imagine-tpose-back.png
```

Also real: `--out-right`, `--identity`, `--extra`, `--secrets-json`, `--skip-sheet`, `--front-only`. Key from `XAI_API_KEY` / `--secrets-json` / connector store. Never print secrets.

## 2. Hunyuan (four-on-floor FRONT)

```bash
python tools/character-pipe/hunyuan_mesh.py \
  --front suki-sheet-crop-front.png \
  --left  suki-sheet-crop-left.png \
  --back  suki-sheet-crop-back.png \
  --out   suki-hunyuan-tpose.glb \
  --thumb suki-hunyuan-tpose-thumb.png \
  --face-count 80000
```

Also real: `--right`, `--no-pbr`, `--generate-type` (default `Normal`), `--secrets-json`. Key from `FAL_KEY`. Needs `fal_client` (script note: `/workspace/.venv-fal/bin/python`). Writes `<out>.json` next to the GLB.

Attempt N → keep `attempts/hunyuan-N.glb`, promote only on STAND. Max **3** Hunyuan attempts. Sit = discard, retry with a stricter standing front.

## 3. Rest QC

```bash
blender --background --python tools/character-pipe/rest_pose_check.py -- \
  --glb  suki-hunyuan-tpose.glb \
  --json attempts/rest-qc.json \
  --thumb attempts/rest-qc.png
```

Also real: positional GLB (`-- /path/to.glb`). Exit **0** STAND PASS, **2** SIT FAIL, **1** unknown / error.

**PASS:** four paws down, backline high, tail off ground. **FAIL sit:** ears-high + tucked haunches + tail on ground.

## 4. Bind (standing rest only)

House Suki bind (no CLI flags — hardcoded paths in the script):

```bash
blender --background --python tools/character-pipe/bind_suki_stand.py
```

Reads `/workspace/suki-canon/suki-hunyuan-tpose.glb`. On PASS writes `/workspace/suki-canon/suki-hunyuan-bound-stand.glb`. Stills / report next to the run: `in-rest-stand.png`, `in-pose-sit.png`, `in-pose-walk.png`, `in-pose-playbow.png`, `in-bind-report.txt`.

Calls `rest_pose_check.diagnose`. **Refuses sit rest** (exit 2). **Will not write BOUND on WALK GATE FAIL** (exit 1).

Generic standing-quad bind (same sit refuse; do **not** pass `--allow-sit`):

```bash
blender --background --python tools/character-pipe/bind_quad.py -- \
  --input MESH.glb --output BOUND.glb \
  --report report.txt \
  --render-rest rest.png --render-sit sit.png \
  --render-walk walk.png --render-playbow bow.png
```

Also real: `--weight auto|envelope|voxel`, `--target-h` (default `0.40`). House rule still: do not ship a WALK GATE FAIL mesh.

**Walk PASS:** verts follow bones (sample max delta ≳ 2 mm) **and** no shredded fur cards. FAIL loop: weights first (normalize, limit influences, envelope / voxel-proxy). If still shredded, new Hunyuan. Do not overwrite BOUND.

## 5. Game only on PASS

```bash
cp /workspace/suki-canon/suki-hunyuan-bound-stand.glb public/assets/models/suki.glb
```

Then bump the BUILD stamp in **both** `src/buildStamp.ts` and `vite.config.ts` ([pages-playtest](../../docs/sop/pages-playtest.md)). Isolation stills vs approved art (rest + walk + one personality pose). Walk must not shred. Then swap into game.

## Boys / humanoids

Mixamo or AccuRIG. Existing kit: `blender --background --python tools/blender/build_boyfriends.py` → `public/assets/models/boy-*.glb`. Do **not** Mixamo a cat.

## Boy / human heads (Tripo)

Hunyuan is **body-only**. Head / bust cards go through `tripo_mesh.py` at `--face-limit 5000`.

```bash
python tools/character-pipe/tripo_mesh.py \
  --front bust.png \
  --out head.glb \
  --thumb head-thumb.png \
  --face-limit 5000
```

Also real: `--no-pbr`, `--no-texture`, `--quad` (may return FBX), `--auto-size`, `--orientation default|align_image`, `--model-seed`, `--secrets-json`, `--backend fal|official`, `--tripo-secrets-json`. House path is Fal `tripo3d/h3.1/image-to-3d` (`FAL_KEY`, `fal_client`). Official Studio Smart Mesh P1 (`P1-20260311` on `openapi.tripo3d.ai`) needs a Tripo key we do not have — do not invent one.

Steph: lashes as mesh; closed mouth already has teeth/tongue if the mesher is logical. Assemble untextured, keep parts separate.

Do **not** overwrite `public/assets/models/boy-*.glb` from a first inspect. Ren owns **GS-ELI-BEAUTY**. Mixamo / AccuRIG only after **PASS** islands (logical parts or real cavity / lashes).
