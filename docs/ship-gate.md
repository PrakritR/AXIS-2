# Ship gate — web + iOS + reviews + feature testing

Use this checklist whenever promoting `prakrit` → `main`, or when finishing a
substantial feature. Agents must follow it (see `AGENTS.md` and
`.cursor/rules/ship-and-review-gate.mdc`).

## Why

- **Web (live)** deploys from Vercel on every push to **`production`** only.
- **`main`** builds **Preview** deployments (staging). Non-`main` / non-`production`
  pushes are skipped via the Vercel Ignored Build Step plus `vercel.json`.
- **iOS** builds, uploads **and distributes** to the internal TestFlight tester
  group from GitHub Actions on push to **`production`**
  (`.github/workflows/ios-testflight.yml`), keeping the Capacitor shell aligned
  with the repo while the WebView loads the live site. An upload alone is not a
  ship — see [`docs/mobile-app.md`](mobile-app.md#the-distribute-step-is-what-makes-a-build-installable).
- Reviews and full feature testing catch auth, cache, and edge regressions that
  unit tests miss.

## Preflight

```bash
npm run ship:preflight
```

Checks:

- On a clean promote path (or warns about dirty tree)
- `ios-testflight.yml` present and triggers on `production`
- Capacitor prod URL guard script present
- Reminds about App Store Connect secrets

## Reviews

Run before merge/promote (parallel OK):

1. **Security review** — `security-review` subagent, branch changes
2. **Bugbot** — `bugbot` subagent, branch changes
3. **Cache / rendering / performance** — Next.js caching, RSC vs client,
   bundle size, list rendering, images/fonts; fix obvious regressions
4. **Web ↔ native parity** — nav, deep links, push, safe area (see
   `docs/web-and-native-parity.md`)

## Feature testing template

Copy into the PR or chat handoff:

```text
Feature under test: <name>
Happy path: [ ] exercised on localhost as <role>
Edge cases:
  [ ] empty / invalid input
  [ ] unauthorized / wrong role
  [ ] expired or missing token/link (if applicable)
  [ ] duplicate submit / idempotency
  [ ] mobile viewport
  [ ] failure path (email/sync/API error) shows correct UI
Connected surfaces checked: <list>
Automated tests: <commands + result>
```

Do **not** use `/demo` as the only proof for production-like flows.

## Run e2e locally before you promote

The `e2e` job in `.github/workflows/test.yml` is gated on
`github.event_name == 'push' && github.ref == 'refs/heads/main' || schedule`, so
it is **skipped on every pull request** — a PR whose Test workflow is green has
had zero e2e signal, and the first real run happens after the merge lands on
`main`. That gap is why e2e breakage is only ever found post-merge, and why a
long tail of failures can persist unnoticed.

Pin the dev/test Supabase project first (a plain production build silently uses
the **production** project — see
[`docs/database-environments.md`](database-environments.md#a-local-production-build-can-silently-target-production)),
then:

```bash
npm run test:seed
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:<port> \
  E2E_TESTS_ENABLED=1 node --env-file=.env.test node_modules/.bin/playwright test
```

Locally `retries: 0` while CI uses `retries: 2`, so a local run surfaces flaky
tests that CI hides in its `flaky` bucket. Note `npm run test:seed` currently
aborts partway with a `profiles_manager_id_key` duplicate on a workflow
resident — the core role accounts are already provisioned by then, so the suite
still runs, but the later fixtures it would have created are missing.

### Known-failing specs — expect these, don't re-triage them

As of `main` @`94cfc09f` (run `30778729243`) the 18 failures below are
**long-standing**: present in the 18h-earlier nightly run, not caused by the
Communication/portal work, and reproducible locally against a correctly seeded
dev/test project — so they are product/test drift, not CI infrastructure.

```text
bundle-group-manual-chrome.spec.ts:53      [data-wizard-field=applyingAsGroup] never visible
manager-portal.spec.ts:35                  a manager section renders no heading or main landmark
manual-payment-verification.spec.ts:9      [data-attr=payments-setup] resolves to 2 elements (desktop + mobile copies)
new-manager-full-journey.spec.ts:46        [data-attr=manager-properties-create] never enabled
promotion-new-modal.spec.ts:54/66/99/144   [data-attr=promotion-new] / heading "Promotion" never visible (×desktop+mobile = 8 cases)
public-apply.spec.ts:13                    Continue button never visible
resident-login-and-application.spec.ts:10  "applying as part of a group" never visible
resident-login-and-application.spec.ts:19  searchbox never visible on tours-contact
resident-portal.spec.ts:33                 a resident section renders no heading or main landmark
tour-scheduling.spec.ts:10                 Continue button never visible
tour-scheduling.spec.ts:17                 "what do you need help with" never visible
```

The markup these selectors target **does** exist in `src`, so these are
runtime/data-state or duplicate-element problems — a section not reaching a
rendered state, tier/paywall gating, or one component rendering twice — rather
than deleted markup. Fixing them needs per-spec triage against a seeded local
run. Tracked externally as `axis-ci-e2e-persistent-failure`, which has no
in-repo counterpart.

`admin-portal.spec.ts:68` and `mobile-portal-layout.spec.ts:22` are **flaky**,
not failing — they pass on CI retry and pass locally. Do not file them as
failures.

## Promote prakrit → main (Vercel Preview)

Captain yes required. Never push `fm/*` branches.

```bash
bin/fm-proplane-promote-prakrit-to-main.sh
```

Pipeline order:

1. Local branch `integrate/prakrit-to-main` from `origin/main` + merge `origin/prakrit`
2. `bin/fm-proplane-security-review.sh` — blocks Critical/High (report under `state/`)
3. `no-mistakes axi run --skip=push,pr,ci` on the integrate branch (review, test, document, lint)
4. Fast-forward `main` and `git push origin main` only after captain approves localhost test:

```bash
bin/fm-proplane-promote-prakrit-to-main.sh --push-main
```

Never open a GitHub PR unless the captain explicitly asks.

Scripts restart dev servers and open the browser via `bin/fm-proplane-open-localhost.sh`.

If no-mistakes parks at a gate, drive `no-mistakes axi respond` then re-run with `--validate-only`.

## Promote main → production (live)

```bash
git checkout main
git pull
# merge agent/prakrit work into main first, verify preview
bash scripts/promote-main-to-production.sh
```

Or manually:

```bash
git checkout production
git pull
git merge --ff-only main
git push origin production
git checkout main
```

Then verify:

1. Vercel **Production** deployment succeeded (from `production` branch)
2. GitHub Action **iOS TestFlight** succeeded, including its "Distribute build to
   internal TestFlight group" step — that step, not the upload, is what proves the
   build is installable (or secrets missing — report it)
3. Spot-check the live site for the shipped feature

## Native-shell-only changes

If you changed `ios/`, `capacitor.config.ts`, native plugins, icons, or
permissions: TestFlight upload is required; App Store review may be required
for permission/string changes. Run `npm run cap:prod` locally before archiving
if building from Xcode by hand (`scripts/verify-cap-prod-config.sh` guards
Release builds).
