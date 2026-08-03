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

As of `main` @`94cfc09f` (run `30778729243`) 18 of the 20 failures are
**long-standing**, and they are not a long tail of unrelated bugs — they are
**two root causes**. Evidence: each one also fails in the four earlier `main`
runs that got as far as executing `e2e` (`30766248350`, `30741321358`,
`30739338457`, `30736186602`), while the two dark-mode cases fail only in this
run. So neither cause is CI infrastructure, and neither came from the
Communication/portal work. Tracked externally as
`axis-ci-e2e-persistent-failure`, which has no in-repo counterpart.

**Cause 1 — one `data-attr` is in the DOM twice, so Playwright strict mode
throws (12 cases).** Portal headers render the *same* action node twice and let
CSS hide one per breakpoint — e.g. `manager-promotion.tsx` passes one
`promotionNewButton` to both `PortalPageHeaderMobileActionsRow` and the desktop
`titleAside`. `locator('[data-attr="promotion-new"]')` therefore resolves to 2
elements and the call throws before asserting anything.

```text
promotion-new-modal.spec.ts:54/66/99/144   [data-attr=promotion-new] ×2      (desktop+mobile = 8 cases)
manual-payment-verification.spec.ts:9      [data-attr=payments-setup] ×2
new-manager-full-journey.spec.ts:46        [data-attr=manager-properties-create] ×2
manager-portal.spec.ts:35                  getByRole('heading').first().or(locator('main')) ×2
resident-portal.spec.ts:33                 same ×2
```

To fix: scope the specs to the rendered twin with `:visible` — the pattern
`promotion-new-modal.spec.ts:36` already uses for `demo-nav-promotion` — or stop
double-rendering the node. Note the duplicate is *also* an analytics defect: a
`data-attr` is meant to name one element for PostHog autocapture (see
`AGENTS.md`), and two nodes double-count the Action.

**Cause 2 — the e2e web server is a production runtime, which deliberately hides
the seeded fixtures (6 cases).** `playwright.config.ts` starts
`npm run build && npm run start`, so `NODE_ENV=production` and `VERCEL_ENV` is
unset, making `isProductionRuntime()` true. Every seeded property is owned by a
`@test.proplane.local` manager, which `isPortalSandboxEmail()` classifies as
sandbox, so `/api/public/property-lead` returns **404 "Property not found."**
(`src/app/api/public/property-lead/route.ts`, the `isSandboxPublicListing`
branch) and every public prospect page renders `ManagerLinkGate` — "This
property link is invalid or no longer active."

```text
tour-scheduling.spec.ts:10/:17             /rent/tours-contact?propertyId=mgr-test-fir
public-apply.spec.ts:13                    /rent/apply?propertyId=mgr-test-fir
resident-login-and-application.spec.ts:10/:19
bundle-group-manual-chrome.spec.ts:53
```

This is why the specs fail even though the row is present and `status = 'live'`
— confirm with a direct query before assuming the seed is at fault. To fix:
either give the `e2e` job a non-production runtime (`VERCEL_ENV: preview` in
`.github/workflows/test.yml`) or seed the public-facing fixtures under a
non-sandbox manager domain. The guard itself is correct and must not be relaxed:
it is what keeps test listings off the real rent catalog.

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
