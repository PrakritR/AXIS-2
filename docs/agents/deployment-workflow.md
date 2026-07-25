# Deployment workflow (all agents)

**Only `main` deploys to Vercel production.** Every agent must follow this ladder.

## Branch ladder

| Branch | Role | Vercel |
| --- | --- | --- |
| `claude`, `claude-2`, `cursor-1`, `cursor-2` | Per-agent sandbox | No deploy |
| `prakrit` | Integration / captain test (localhost :3000) | No deploy |
| `main` | Production (`prop-lane.space`) | **Production deploy** |

There is **no `production` git branch**. Do not recreate it.

## Ship path

```
agent branch  →  prakrit  →  main  →  git push origin main
     (review)      (integrate)   (promote)     (Vercel + TestFlight)
```

1. Land feature work on your agent branch only.
2. Merge to `prakrit` after captain approval; test on localhost **3000**.
3. Fast-forward `prakrit` → `main` after captain approval.
4. Apply Supabase migrations **before** pushing `main`.
5. `git push origin main` — triggers Vercel production **and** iOS TestFlight.
6. Confirm both succeeded before reporting done.

## Enforcement (do not weaken)

1. **Vercel project** `axis-2` → Production branch = **`main`**.
2. **`vercel.json`** `git.deploymentEnabled`: only `main` is `true`.
3. **`scripts/vercel-should-build.sh`**: skips every non-`main` ref.
4. **`.github/workflows/vercel-main-only-guard.yml`**: fails if `production` branch is pushed.

## Agent rules

- Never push feature branches expecting a Vercel deploy.
- Never merge directly to `main` without going through `prakrit`.
- Never recreate a `production` branch.
- Run `npm run ship:preflight` before promoting.
- See also `docs/ship-gate.md` and `AGENTS.md` § Branching & deployment.
