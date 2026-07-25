# Deployment workflow (all agents)

**`production` deploys to Vercel production; `main` builds previews.** Every
agent must follow this ladder. (The Production Branch was flipped from `main` to
`production` on Jul 25, 2026 — see `AGENTS.md` § Branching & deployment.)

## Branch ladder

| Branch | Role | Vercel |
| --- | --- | --- |
| `claude`, `claude-2`, `cursor-1`, `cursor-2` | Per-agent sandbox | No deploy |
| `main` | Dev / integration (localhost :3000, preview deploys) | **Preview deploy** |
| `production` | Production (`prop-lane.space`) | **Production deploy** |

`prakrit` is retired — do not merge new work into it.

## Ship path

```
agent branch  →  main  →  production  →  git push origin production
     (review)    (integrate)  (promote)      (Vercel prod + TestFlight)
```

1. Land feature work on your agent branch only.
2. Merge to `main` after captain approval; verify on the preview / localhost **3000**.
3. Fast-forward `main` → `production` after captain approval.
4. Apply Supabase migrations **before** pushing `production`.
5. `git push origin production` — triggers Vercel production **and** iOS TestFlight.
6. Confirm both succeeded before reporting done.

## Enforcement (do not weaken)

1. **Vercel project** `axis-2` → Production branch = **`production`**.
2. **`vercel.json`** `git.deploymentEnabled`: only `main` and `production` are `true`.
3. **`scripts/vercel-should-build.sh`**: builds only `main` and `production` refs.

## Agent rules

- Never push feature branches expecting a Vercel deploy.
- Never merge directly to `production` without going through `main`.
- Keep `production` a strict fast-forward of `main` (never commit unique work to it).
- Run `npm run ship:preflight` before promoting.
- See also `docs/ship-gate.md` and `AGENTS.md` § Branching & deployment.
