# Forge review (before PR)

Grok Ship factory rules as they apply to **cat-table**. Captain is Court.

## Who / when

1. **Scout** writes a docs / report. Never a game-feature PR. This SOP pack **is** a docs PR (`GS-SOP-1`).
2. **Ship** cloud agent implements, commits, **pushes the branch**.
3. **Reviewer** (a **fresh** subagent — not the ship) reads that branch via `gh` (no clone required) **before anyone opens a PR**. Do not open a PR just to make the branch visible.
4. **Captain (Court)** merges. Crew does not merge their own ship PRs.

## What the reviewer does

```bash
gh api repos/CourtReinland/cat-table/compare/main...cursor/<ship-branch>
gh api repos/CourtReinland/cat-table/contents/<path>?ref=<ship-branch>
```

Write findings as a short JSON list. Each finding:

- `severity`: `error` | `warning` | `info`
- `action`: `ask-user` | `auto-fix` | `no-op`

**error must not merge.** Empty findings, or only `info` → a crewmate may open the PR.

## Done

- Branch reviewed **before** the PR exists.
- No open `error` findings (auto-fix landed, or Court answered `ask-user`).
- Play-visible change? BUILD stamp bumped in **both** `src/buildStamp.ts` and `vite.config.ts` so Pages is unambiguous after hard-refresh. See [pages-playtest](pages-playtest.md).
- Result pointer is the **scout report path** or the **ship PR URL**. Task ids like `GS-SOP-1` live in the factory db — chat is not source of truth.
