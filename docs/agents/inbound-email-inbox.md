# Inbound support email → admin portal inbox

Mail sent to the public support address (**support@prop-lane.space**) shows up as
a message in the **admin portal inbox** (the founder/`PRIMARY_ADMIN_EMAIL` scope),
so support mail is handled inside the app next to the rest of the unified inbox.

## How it works

1. `support@prop-lane.space` is routed to **Resend Inbound**.
2. Resend POSTs a Svix-signed `email.received` webhook to
   `POST /api/webhooks/email/inbound`
   (`src/app/api/webhooks/email/inbound/route.ts`).
3. The route mirrors the Twilio SMS webhook posture: `runtime = "nodejs"`, Svix
   signature verification that **fails closed on Vercel** (unsigned inbound is
   allowed only in local dev), in-memory rate limiting, `after()` for the async
   ingest, service-role Supabase client.
4. Ingest (`src/lib/inbound-email/inbound-email.server.ts`) writes a
   `portal_inbox_thread_records` row under **`scope: "admin"`** — the same rail the
   public contact form uses (`src/app/api/public/contact-message/route.ts`). Admin
   scope is **owner-agnostic** (`owner_user_id = null`); every admin/founder sees
   `scope = admin` threads via `portalInboxThreadScopeFilter`. The external sender
   is stored as `participant_email` so an admin reply routes back to them.

No DB migration is required — this reuses the existing `portal_inbox_thread_records`
table and the `admin` inbox scope.

### Signature verification

Resend signs every webhook with Svix (`svix-id`, `svix-timestamp`,
`svix-signature`; secret `whsec_…`). We verify manually with node crypto
(`src/lib/inbound-email/verify-signature.ts`) rather than adding the `svix` SDK —
same choice as the inline Twilio verification. Signed content is
`${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 with the base64-decoded
secret, base64 output; any `v1,<sig>` entry in the header may match; the timestamp
is checked within a 5-minute tolerance to blunt replay.

### Idempotency

The thread id is deterministic: `inbound_email_<resend-email_id>`. Ingest checks
for an existing row first and **no-ops on re-delivery**, so a retried webhook never
duplicates a thread nor clobbers an admin's read/reply state.

### Body retrieval

Resend inbound webhooks are **metadata-only** (from/to/subject/id — no body). The
body is fetched from Resend's received-email API with the same `RESEND_API_KEY`
used for outbound. This is **best-effort**: if the fetch fails, the thread still
appears with subject + sender and a "(No message body could be retrieved)" note,
so support mail is never silently dropped. If Resend routes received mail through a
different API base for your account, set `RESEND_INBOUND_API_BASE`.

## Captain-side setup (infra to provision)

The code is ready; these steps must be done in the Resend dashboard + DNS:

1. **MX / inbound routing for `support@prop-lane.space`.**
   Resend Dashboard → **Receiving** → copy the receiving address, then add the
   shown **MX record**. Recommended: point MX at a **subdomain**
   (e.g. `inbound.prop-lane.space`) and forward `support@prop-lane.space` to the
   receiving address, so existing root-domain MX for other mail stays intact.
   > ⚠️ Pointing the **root** `prop-lane.space` MX at Resend captures **all** mail
   > for the domain. Only do that if no other mailbox needs root-domain mail.
2. **Webhook.** Resend Dashboard → **Webhooks** → add endpoint
   `https://www.prop-lane.space/api/webhooks/email/inbound`, subscribe the
   **`email.received`** event, and copy the endpoint's **signing secret** (`whsec_…`).
3. **Secret.** Set `RESEND_INBOUND_WEBHOOK_SECRET=<whsec_…>` in Vercel (Production,
   and Preview if you want staging to accept inbound). Confirm `RESEND_API_KEY` is
   already set (used to fetch the email body).

Until `RESEND_INBOUND_WEBHOOK_SECRET` is set in a deployed environment, the route
**rejects all inbound** (fail-closed) — that is intentional.

## Tests

`tests/unit/inbound-email-webhook.test.ts` — signature accept/reject (tamper, wrong
secret, replay, multi-signature), payload parsing, admin-scope row shape, a valid
inbound email creating an admin-scope thread, and idempotent re-delivery.
