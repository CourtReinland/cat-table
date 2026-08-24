# Pages + playtest gate

Live: https://courtreinland.github.io/cat-table/  
Source: https://github.com/CourtReinland/cat-table

## BUILD stamp

HUD / title show `BUILD N` + `git rev-parse --short HEAD`. Vite injects it.

Bump the integer in **both** files when a play mesh or feel change ships:

- `src/buildStamp.ts` (fallback string + comment)
- `vite.config.ts` (`export const BUILD_STAMP = \`BUILD N ${gitShort()}\``)

**Read both files. Do not trust this SOP's number.** As of this writing `main` is BUILD 8; it has been 7, then 5, at different times. Bump both files plus any tests that assert the integer (`src/game/CameraRig.test.ts`, `src/game/RoomLook.test.ts`). `src/ui/UI.ts` paints the stamp on play HUD and title.

`vite.config.ts` uses `base: './'`.

## Pages

`.github/workflows/deploy.yml` builds on push to `main` (and `workflow_dispatch`) and deploys `dist/` to GitHub Pages. Hard-refresh the phone after merge; the stamp must match the ship.

## Local

```bash
npm install
npm run dev        # http://localhost:5173
npm run build && npm run preview
```

## Playtest (already in repo)

```bash
node tools/shot.mjs title play break cine complete ending
LEVEL=3 node tools/shot.mjs autoplay
node tools/playthrough.mjs [--levels 0,1] [--interval 1500] [--timeout 90000]
```

Env (playthrough; shot also reads `BASE`, `LEVEL`, `VIEW`):

```bash
# BASE=http://127.0.0.1:5173 OUT=tools/out/play START_DEV=1 VIEW=1280x720
```

`tools/shot.mjs` writes `tools/out/L{level}-*.png` (default `BASE=http://localhost:5173`). `tools/playthrough.mjs` writes `tools/out/play/` (`report.json`, interval shots). `START_DEV=1` or `--dev` spawns `npm run dev`.

Approved-art portraits used by playthrough (`PORTRAITS` in `tools/playthrough.mjs`):

- `public/assets/characters/suki-portrait.jpg`
- `public/assets/characters/boy-eli.jpg`
- `public/assets/characters/boy-jasper.jpg`
- `public/assets/characters/boy-kai.jpg`
- `public/assets/characters/boy-theo.jpg`
- `public/assets/characters/boy-ren.jpg`

## Gate

1. Isolation stills vs approved art: **rest + walk + one personality pose**.
2. Walk must **not shred**.
3. Swap into `public/assets/models/suki.glb` only on PASS.
4. Phone / Pages screenshots until the live cat **is** the approved cat.
5. FAIL loops. Do not PR a shredded or wrong-cat mesh.
