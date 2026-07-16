> Moved out of AGENTS.md to keep every-session context lean. This file is the
> source of truth for its area — READ IT BEFORE changing code in this area.

# SMS / phone system (Twilio)

**Design: outbound sends from a per-manager work number; replies land in Axis.**
Carriers do not allow sending SMS *from* a personal number — do not fake it.
- Outbound: `sendSms` (`src/lib/twilio.ts`; optional `mediaUrls` for MMS) via
  `deliverPortalInboxMessage`'s `deliverViaSms` path — from
  `profiles.sms_from_number` (the manager's provisioned work number) to
  recipients' `profiles.phone`. Work-order lifecycle copy lives in
  `src/lib/work-order-notification.server.ts`.
- Inbound: `POST /api/twilio/inbound` (Twilio Messaging webhook; signature
  validated, `TWILIO_WEBHOOK_URL` overrides the URL behind proxies). Tries a
  proxy-pair relay binding FIRST (below); only when `To` is outside the relay
  pool does it fall back to the work-number path: resolves the manager by
  `sms_from_number = To`, the sender by `profiles.phone = From`, logs to
  `inbound_sms_log`, writes a manager inbox notice + email + push
  (`src/lib/sms-inbox-notice.server.ts`), and forwards to the manager's
  personal phone only when `profiles.sms_forward_inbound` is on AND that
  phone is OTP-verified.
- MMS capture: inbound attachments are copied out of Twilio (whose media URLs
  need Basic auth and expire) into the PRIVATE `sms-media` bucket
  (`src/lib/sms-media.server.ts`). The durable identifier is the bucket PATH —
  inbox bodies carry `/api/sms-media?path=` links that mint a fresh signed URL
  after an ownership check (the manager-documents model); immediate signed
  URLs feed only the outbound SMS/email legs.
- Personal-number verification: `/api/manager/phone` (GET settings /
  POST send code / PUT confirm / PATCH prefs). When `TWILIO_VERIFY_SERVICE_SID`
  is set, OTPs go through Twilio Verify (needs no owned number and no A2P
  campaign, so verification works while the campaign is in carrier review);
  otherwise the fallback is the hashed 6-digit OTP in `phone_verifications`
  (10-min TTL, 5 attempts, 60s resend throttle — the row's throttles apply on
  both paths). UI: `manager-phone-settings-panel.tsx` on manager Settings.
- Env required before anything sends: `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, optional `TWILIO_DEFAULT_FROM` +
  `TWILIO_WEBHOOK_URL` + `TWILIO_VERIFY_SERVICE_SID`; per-manager numbers go
  in `profiles.sms_from_number`. Everything no-ops gracefully without them.

**Proxy-pair relay: manager ↔ resident text from their personal phones through
a pooled number, neither seeing the other's real number**
(`src/lib/sms-relay.server.ts`; schema + rationale in
`supabase/migrations/20260718120000_sms_relay_pool.sql`). Routing is the
globally unique active pair `(participant_phone, proxy_phone)` → thread + role
in `sms_relay_bindings`; one proxy number serves unlimited residents but only
one active thread per manager (`allocate_sms_proxy_number`, concurrency-safe,
service-role only). Relay numbers are DISJOINT from work numbers — a number
must never be in both systems. Manager API: `/api/manager/sms-relay` (GET
threads / POST provision — requires a VERIFIED personal phone; caps: 5 active
threads per manager, 60s between provisions / PATCH close). Closing a thread
puts its number on a 30-day cooldown so a former tenant texting the old number
can never land in a new tenant's thread; in-app account deletion
(`/api/account/delete`) sweeps the user's bindings via
`closeRelayThreadsForUser` (bindings hold real cells with no auth-users FK).
Relayed messages are stored idempotently (`sms_relay_messages.twilio_sid`
unique — Twilio retries webhooks) and mirrored into the manager's Axis inbox.
Pool maintenance: daily cron `/api/cron/sms-pool-topup` (Vercel Hobby crons
must be once-per-day; an hourly schedule fails the whole deploy) always releases
expired cooldowns, but the auto-buy loop (target 5 free, hard cap 100) stays
dark unless `SMS_RELAY_POOL_AUTOBUY=1` — the current Sole Proprietor A2P brand
allows exactly ONE local number, so extra buys would be carrier-filtered.
Bought numbers must join the Messaging Service
(`TWILIO_MESSAGING_SERVICE_SID`) to inherit the A2P campaign; a failed attach
releases the number. A2P compliance pages: `/sms-terms` + the SMS opt-in
section on `/privacy`.
