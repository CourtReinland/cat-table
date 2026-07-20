# Cat Top Sim — Suki's Jealous Reign

An **otome comedy push-and-break game** rendered in **Three.js WebGPU**. You are **Suki**, a cream-apricot cat who refuses to share her apartment (or the attention of Heather's boyfriends) with anyone.

Each level, a new suitor arrives. Suki starts on a cluttered counter, desk, or vanity. Prowl, shove, and nudge every trinket onto the floor for spectacular ASMR crashes — and when the surface is clear, the boyfriend finally gets up from the couch and gives you the cuddles you earned.

## Play

```bash
npm install
npm run dev        # → http://localhost:5173
```

Production build:

```bash
npm run build
npm run preview
```

## Controls

| Input | Action |
|--------|--------|
| **WASD** / Arrows | Prowl across the surface |
| **Space** / Click | Paw-shove (aim at trinkets) |
| **Shift** | Sprint |
| **E** | Meow (demand attention) |
| **Esc** | Pause |
| Touch | Virtual stick + 🐾 / 🐱 buttons |

## The Suitors

1. **Eli Moreau**, the Soft-Spoken Neighbor — The Kitchen Island
2. **Jasper Hale**, Golden Retriever Energy — The Coffee Table
3. **Kai Voss**, the Midnight Artist — Heather's Desk
4. **Theo Lamb**, the Pastry Prince — The Bedroom Dresser
5. **Ren Ishikawa**, the Aloof Cellist — The Date-Night Table (finale)

Score combos by chaining shatters, earn ranks (B → A → S → S+), and unlock each boy's cuddle CG.

## Stack

- **Three.js WebGPURenderer** (WebGPU with automatic WebGL2 fallback), TSL bloom post-processing, PCF soft shadows, ACES tone mapping
- Custom arcade physics: push, slide, tip-over-the-edge, tumble, shatter — with instanced shard debris
- Procedural 3D cat + five boyfriend rigs with pose blending (sit → stand → walk → kneel → cuddle)
- Art: **Grok Imagine** (key art, portraits, cuddle CGs) — `tools/gen-assets.mjs`
- Voices, sound effects & music: **ElevenLabs** (TTS + sound generation), with procedural WebAudio fallbacks
- UI: hand-rolled otome visual-novel overlay, localStorage saves

## Dev harness

```bash
node tools/shot.mjs title play break cine complete ending   # screenshots → tools/out/
LEVEL=3 node tools/shot.mjs autoplay                        # AI cat playthrough test
node tools/gen-assets.mjs                                   # regenerate art/audio (needs .env keys)
```

URL debug params: `?auto=1&level=2` (autopilot), `window.__cat.state` in console.

## Deploy

Static site; `vite.config.ts` uses `base: './'`. GitHub Actions deploys `dist/` to Pages on every push to `main`.

**Live:** [courtreinland.github.io/cat-table](https://courtreinland.github.io/cat-table/)
**Source:** [github.com/CourtReinland/cat-table](https://github.com/CourtReinland/cat-table) (repo of record)

## Credits

- Game design & engineering: Cat Top Sim team
- Character & key art: Grok Imagine
- Voices & audio: ElevenLabs
- Inspiration: *Stray* (cat agency), classic otome affection loops, and the universal truth that cats own the counters

---

*Heather will buy more trinkets. Suki will be waiting.*
