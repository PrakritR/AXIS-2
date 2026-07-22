# Axis Housing

Property management software for listing units, screening applicants, signing leases, collecting rent, and running day-to-day operations. The product ships as a **Next.js** web app at [axis-seattle-housing.com](https://www.axis-seattle-housing.com), plus **iOS and Android** native shells (Capacitor) that load the live site.

## Product surfaces

| Surface | Path | Who |
| --- | --- | --- |
| **Marketing** | `/`, `/partner`, `/pricing`, `/contact` | Prospective property managers |
| **Manager workspace** | `/portal` | Property managers (Free, Pro, Business tiers) |
| **Resident portal** | `/resident` | Tenants linked to a manager |
| **Admin portal** | `/admin` | Platform operators |
| **Public apply & tour flows** | `/rent/apply`, `/rent/tours`, `/rent/listings/[id]` | Applicants (manager-shared links) |

### Manager workspace (`/portal`)

Properties, tour scheduling, rental applications, resident & lease management, household charges, Stripe Connect payouts, work orders & vendors, inbox, documents & tax reporting, co-managers, and subscription billing (Free / Pro / Business).

### Resident portal (`/resident`)

Rent & utility payments (card incl. Apple Pay / Google Pay, ACH, Link via Stripe Connect), move-in checklist, services & work orders, inbox, lease & receipts, financial statements. Full workspace unlocks after lease approval.

### Platform capabilities

- **Auth** — Supabase (email/password, Google OAuth), role-based portals
- **Payments** — Stripe Checkout subscriptions for managers; Stripe Connect for resident rent & fees
- **Comms** — Resend email, Twilio SMS, Firebase push (native apps)
- **Screening** — Certn credit & background checks (optional)
- **Cron jobs** — Payment reminders, move-in reminders, scheduled inbox (Vercel Cron)

## Tech stack

- **Framework** — Next.js 16, React 19, TypeScript
- **Styling** — Tailwind CSS v4, Radix UI
- **Data** — Supabase (Auth + Postgres), SQL migrations in `supabase/migrations/`
- **Payments** — Stripe (subscriptions + Connect)
- **Native** — Capacitor 8 (`com.axisseattlehousing.app`)
- **Tests** — Vitest (unit + integration), Playwright (e2e)

Requires **Node 22.x** and **npm 10.x** (see `package.json` `engines`).

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in the required values in `.env.local` — at minimum:

- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `Supabase_Database_Password` (for applying migrations)

Optional integrations (email, SMS, push, screening) are documented in `.env.example` with comments.

### 3. Database

Apply Supabase migrations:

```bash
npm run db:apply-sql
```

Bootstrap an admin account (after Supabase vars are set):

```bash
npm run admin:sync-account -- you@example.com 'YourPassword'
```

Create or verify Stripe subscription prices:

```bash
node --env-file=.env.local scripts/setup-stripe-plan-prices.mjs
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For Stripe webhooks locally, use `node scripts/stripe-listen.mjs` (see `docs/stripe-ach-local-test.md`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js dev server |
| `npm run build` / `npm start` | Production build & serve |
| `npm run lint` | ESLint |
| `npm run check` | Lint + unit tests + build |
| `npm run test:unit` | Vitest unit tests |
| `npm run test:integration` | Vitest API integration tests |
| `npm run test:e2e` | Playwright browser tests |
| `npm run test:all` | All Vitest + Playwright |
| `npm run db:apply-sql` | Apply `supabase/migrations/` to Postgres |
| `npm run cap:sync` / `cap:ios` / `cap:android` | Capacitor sync & open native IDEs |

Admin utilities: `admin:sync-account`, `admin:set-manager-plan`, `admin:ensure-demo-manager`, `admin:purge-managers`.

## Testing

Use a **dedicated Supabase test project** — never production credentials.

```bash
# Configure .env.test with a dedicated Supabase test project (see tests/README.md)
npm run test:unit
npm run test:integration
npm run test:e2e                 # requires running app + .env.test
```

Full details: [`tests/README.md`](tests/README.md).

## Native apps (iOS + Android)

Capacitor shells load the production site in a WebView and add push notifications, camera capture, status bar, and splash screen. Web/UI changes deploy via Vercel with no app-store review; native-shell changes require rebuild and resubmission.

See [`docs/mobile-app.md`](docs/mobile-app.md) and [`docs/firebase-push-setup.md`](docs/firebase-push-setup.md).

## Documentation

| Doc | Topic |
| --- | --- |
| [`SUPABASE_STRIPE_SETUP.md`](SUPABASE_STRIPE_SETUP.md) | Supabase Auth, Google OAuth, Stripe subscriptions |
| [`docs/stripe-connect-ach-setup.md`](docs/stripe-connect-ach-setup.md) | Resident payments via Stripe Connect |
| [`docs/stripe-go-live.md`](docs/stripe-go-live.md) | Production Stripe checklist |
| [`docs/stripe-apple-pay-subscriptions.md`](docs/stripe-apple-pay-subscriptions.md) | Apple Pay for manager subscriptions |
| [`docs/stripe-apple-pay-payments.md`](docs/stripe-apple-pay-payments.md) | Apple Pay for rent & rental-application fees |
| [`docs/stripe-ach-local-test.md`](docs/stripe-ach-local-test.md) | Local ACH / webhook testing |
| [`docs/design.md`](docs/design.md) | Blue Steel design system |
| [`docs/mobile-app.md`](docs/mobile-app.md) | Capacitor native app workflow |
| [`docs/web-and-native-parity.md`](docs/web-and-native-parity.md) | Shared web + app changes, registries, CI checks |

## Deployment

The app is designed for [Vercel](https://vercel.com). Set all production env vars from `.env.example`, configure Supabase redirect URLs for your domain, and set `CRON_SECRET` for `/api/cron/*` routes (see `vercel.json`).
