# Cat Top Sim — Suki's Jealous Reign

An otome comedy push-and-break game. You are **Suki**, a cream-apricot cat who refuses to share her apartment (or her attention) with Heather’s revolving door of boyfriends.

Each level places you on a cluttered counter, desk, or vanity. Gently nudge every trinket onto the floor for spectacular ASMR crashes. When the surface is clear, the boyfriend finally gets up and gives you the cuddles you earned.

## Play

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build
npm run preview
```

## Controls

| Input | Action |
|--------|--------|
| **WASD** / Arrows | Move Suki on the surface |
| **Space** / Click | Strong nudge / push |
| **Esc** | Pause |

## Stack

- **Three.js** rendering with **WebGPU** when the browser supports it (WebGL fallback)
- **cannon-es** physics for push, fall, and shatter
- Procedural ASMR crashes + soft mysterious pad ambience
- Grok Imagine key art, portraits, and cuddle cutscenes
- Otome-style dialogue after each surface is cleared

## Levels

1. **Kitchen Island** — Eli Moreau, the soft-spoken neighbor  
2. **Heather’s Desk** — Kai Voss, the midnight artist  
3. **Bathroom Vanity** — Jasper Hale, golden-retriever energy  

## Deploy

Built for static hosting (GitHub Pages friendly). `vite.config.ts` uses `base: './'`.

```bash
npm run build
# upload dist/ or enable Pages from /docs or gh-actions
```

## Credits

- Game design & engineering: Cat Top Sim team  
- Character & key art: Grok Imagine  
- Inspiration: *Stray* (tone of cat agency), classic otome affection loops, the universal truth that cats own the counters  

---

*Heather will buy more trinkets. You will break them again.*
