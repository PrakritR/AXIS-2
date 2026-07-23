> Moved out of AGENTS.md to keep every-session context lean. This file is the
> source of truth for its area — READ IT BEFORE changing code in this area.

# SMS / phone system (Twilio)

## Conversation identity is per-counterparty, NOT the phone pair (read this first)

A conversation used to be derived from the phone-number pair on the wire
(`sms_from_number` = To, `profiles.phone` = From). On the shared agent line
that pair collapses — every manager shares one `To`, so distinct people/roles
folded into one thread and admin saw one flat stream. Conversation identity is
now **explicit and durable**, tied to the counterparty (person + role):

```
conversation_key = <owner_manager_user_id>:<counterparty_role>:<person_ref>
```

- `person_ref` = the counterparty's Axis `user id` when they have an account,
  else their normalized phone (`conversationPhoneRef`). Two different people on
  one shared line therefore ALWAYS get different keys — this is the tenant-
  isolation guarantee, covered by `tests/unit/sms-conversation-identity.test.ts`.
- `counterparty_role` ∈ `resident | applicant | prospect | vendor | manager |
  admin | unknown`. The SAME phone in two roles (a leasing prospect who later
  becomes a resident) is two threads, by design.
- Pure helpers live in `src/lib/sms-conversation-identity.ts`
  (`buildConversationKey`, `conversationPhoneRef`, `deriveCounterpartyRole`);
  the SQL twin is `public.axis_sms_phone_ref()` in
  `supabase/migrations/20260721210000_sms_conversation_identity.sql`, which adds
  `counterparty_role` + `conversation_key` to `manager_sms_messages` and
  `inbound_sms_log` and backfills existing history.

**Writes must stamp the role.** `logManagerSmsMessage` takes `counterpartyRole`
and computes `conversation_key`; `persistClawInboundSms` passes `"resident"`
from the known-resident hub and `"prospect"` from the leasing responder;
`sendFromManagerWorkNumber`/`sendPropLaneSms` thread it so outbound lands in the
SAME thread as the counterparty's inbound. Inbound `inbound_sms_log` rows use
`inboundLogIdentityFields(...)`. A write that omits the role degrades to a
conservative derivation (`unknown` → phone-grouped), never a wrong merge.

**Reads group by `conversation_key`.** `fetchManagerSmsConversations` folds a
directory resident's non-prospect threads (matched by owner + account id OR
phone) into one conversation and keeps prospect threads separate. It accepts a
`scopeManagerIdsOverride` so admin oversight (`fetchAdminSmsConversations`)
threads the same way across the mapped-manager cohort instead of returning one
flat feed. The manager/admin SMS UI keys rows on `conversationKey` and sorts via
`sortSmsConversationRows` (Newest / Oldest / Name A–Z / House).

**No Communication surface renders a raw phone number.** Every manager/admin SMS
row and thread header — the SMS panel and the unified Communication list alike —
takes its label from `smsConversationDisplayName` /
`smsConversationSubtitle` (`src/lib/manager-sms-messages.ts`): name → property
/ unit → email → a masked `Texter ····1234` handle → `Unknown contact`, where a
`name` that is itself a number (`isPhoneLikeLabel`) counts as no name. This is
a LABEL rule only — threading, replies and deletes still key on the phone /
`conversationKey`, and both search boxes keep the phone in their haystack, so a
manager typing a number still finds the thread. `sortSmsConversationRows` orders Name A–Z and
House on that rendered label rather than the raw `name` for the same reason:
sorting a value the list does not display makes the visible order look random.
Coverage: `tests/unit/manager-sms-messages.test.ts`.

**The backfill orders IDENTITY before TOPIC — never the other way round.**
`claw_messaging_threads` holds exactly ONE mutable row per (manager, phone)
(`unique (manager_user_id, resident_phone)`) and `topic` is overwritten on every
thread touch, so it describes the thread *today*, not what any given message
was. The row's own `resident_user_id` / `matched_sender_user_id` is the
per-message fact. The first version of the backfill tested `topic = 'leasing'`
first, which re-stamped a current resident's ENTIRE history as `prospect` the
moment their latest Claw thread happened to be a leasing one — and because the
read path deliberately refuses to fold a prospect thread into a directory
resident, that history vanished from the named conversation with nothing in the
UI disclosing the loss (it resurfaced as an unnamed raw phone number, and the
resident detail page's SMS tab went blank).
`20260721220000_sms_conversation_identity_role_repair.sql` corrects databases
that applied the bad version.
Regression coverage: `tests/unit/sms-conversation-identity-backfill.test.ts`
evaluates the migration's `case` branches as a decision table. Any future
role-derivation change must keep account linkage ahead of thread topic.

**Deletes and replies are scoped by `conversation_key`, not the phone.** One
phone is now potentially two threads, and `deleteManagerSmsConversation` is an
irreversible hard DELETE of both tables — scoping it to the phone destroyed the
other role's correspondence while the confirm dialog named only one thread. The
client sends `conversationKey` on DELETE and POST; the phone-variant match
survives only for legacy rows with a NULL key, and as the fallback when no key
is supplied. The panel's local "hidden" set is keyed on the conversation id
(`axis_manager_sms_hidden_v2`) for the same reason.

Scope by the thread's `memberKeys`, NOT its `conversationKey` alone. A directory
resident's conversation is a MERGE of every non-prospect key matching that owner
by account id or phone, surfaced under one canonical key — so deleting only the
canonical key leaves the phone-keyed and unknown-role halves stored and still
rendering for a co-manager behind an `ok: true`. `fetchManagerSmsConversations`
publishes `memberKeys` for exactly this, and the route forwards it.

Two consequences of the delete being irreversible: legacy NULL-key rows are
swept by phone only when that phone hosts no OTHER thread (a null key carries no
role and cannot be attributed, and under-deleting is recoverable where a hard
delete is not); and once any row is gone, a later failing pass is reported as
`partial: true` with the count, never as a flat failure the manager would retry
against history that no longer exists.

**Admin can message a resident or a manager.** `POST /api/admin/sms-conversations`
routes by recipient phone only (never model input): it logs into the owning
manager's thread and sends a COPY to the admin oversight phone
(`resolveAdminForwardPhone`, the admin profile's own number — `+15103098345` on
the test/prod admin account, resolved from `admin-role.ts`, never hardcoded).
"Phone only" is literal: the recipient number selects the candidate threads, and
`conversationKey` may only disambiguate *within* that set (one shared-line phone
can be both a prospect and a resident thread). A body `residentUserId` never
picks the thread — it is accepted solely as log attribution, and only when it
names a resident in the cohort belonging to the resolved owning manager;
otherwise it is dropped. Letting either field select the thread lets the caller
choose the `ownerManagerUserId` a message is sent *as*, and threads it under an
unrelated resident's `conversation_key`. Coverage:
`tests/integration/admin/sms-conversations-attribution.test.ts`.

The admin SMS surface reuses `ManagerSmsPanel` with `endpoint="/api/admin/…"`
and `allowDelete={false}`: the admin route has no `DELETE` handler, and the
panel's swipe/trash affordances would otherwise confirm a destructive dialog and
then always 405 behind a generic toast. Mounting `ManagerSmsPanel` on a new
endpoint means checking BOTH — does it implement DELETE, and should that
surface be able to delete at all.

**Admin oversight must never PROVISION a number.** `fetchAdminSmsConversations`
passes `managerIds[0]` as the "viewer", which is a threading anchor, not the
person at the keyboard — and `resolveManagerWorkNumber` falls through to
`ensureManagerSmsNumber`, a paid Twilio purchase. It therefore passes
`provisionWorkNumber: false`, and the display number is resolved read-only (the
shared line constant, else `profiles.sms_from_number` already on file). Only a
manager loading their OWN tab may provision on demand. Guarded by
`tests/unit/admin-sms-no-provisioning.test.ts`.


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

**Claw shared agent line (mapped-manager trial + admin oversight).**
`src/lib/claw-resident-messaging.server.ts` / `claw-relay.server.ts` run a
SEPARATE transport from the Twilio work-number system above: when Claw is
enabled (`isClawTransportEnabled()`), all sends route through one shared
agent line. A small trial cohort (`clawMappedManagerEmails()`, env
`CLAW_MESSENGER_MANAGER_EMAILS`) shares that line; forwarding targets for
their threads are the env `CLAW_MESSENGER_MANAGER_FORWARD_PHONES` list plus
`resolveAdminForwardPhone()` — the Axis admin account's own `profiles.phone`
(any account holding the admin role per `src/lib/auth/admin-role.ts`:
`profile_roles`, legacy `profiles.role`, or the primary-admin email), NOT a
hardcoded constant. Set the admin's phone from admin Settings
(`/admin/profile`) to change where these forwards land; when no admin
profile has a phone on file it falls back to the first env forward phone,
then the hardcoded `+15103098345` trial default. Admin views
these same threads read-only at `/admin/communication` → SMS
(`fetchAdminSharedLineSmsConversation` in `manager-sms-messages.server.ts`,
merging `inbound_sms_log` + `manager_sms_messages` across the mapped
managers) — Admin Communication → Email is the pre-existing admin inbox
(`AdminInboxClient`), just reachable at `/admin/communication/email/*` now
(old `/admin/inbox/*` links redirect via the generic "Inbox → Communication"
legacy-path handler in `render-portal-section.tsx`).

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

## Claw Messenger (production shared line, `+12053690702`)

The live PropLane messaging system today is ONE shared agent line (Twilio
per-manager numbers above are provisioned but dormant while Claw is primary —
`ensureManagerSmsNumber` deliberately keeps `sms_from_number` on the Claw
line and does not buy a Twilio number while `isClawSharedLineBridgeEnabled()`).
Inbound flow: `scripts/claw-messenger-gateway.mjs` (a long-running WS client,
NOT a Vercel function) → `POST /api/webhooks/claw-messenger` →
`handleClawLeasingInbound` (`src/lib/claw-leasing-bot.server.ts`) → either the
resident/payment/lease hub (`claw-resident-actions.server.ts`) or the
cross-catalog leasing agent (`src/lib/agent/leasing-sms-agent.server.ts` +
`src/lib/tools/domains/leasing-sms.ts`) depending on sender/thread state.

**Manager registration is DB-driven, not env-driven.** Every manager gets
`profiles.sms_from_number` stamped to the shared Claw line at onboarding
(`assignSharedClawLeasingNumberToManager`) and swept nightly for stragglers
(`backfillManagerWorkNumbers` cron) — so "has an account" already means
"participates in the shared line," no separate opt-in step.
`resolveRegisteredClawManagers()` / `resolveMappedManagerContacts()`
(`claw-resident-messaging.server.ts`) are the single choke point that reads
this: they exclude sandbox/demo accounts (`isPortalSandboxEmail` —
`@axis.local` / `@test.axis.local`), require `profiles.role` to be one of
`manager`/`pro`/`admin`/`owner`, and only trust a manager's `profiles.phone`
as their identity when `phone_verified_at` is set (an unverified phone is
user-editable and forgeable). The role check matters because
`sms_from_number` and `phone_verified_at` are themselves settable by ANY
authenticated user through `/api/manager/phone` (no role gate there — a
resident verifying their own phone is legitimate) — without the role filter,
that would let a non-manager account self-register onto the shared-line
roster. `CLAW_MESSENGER_MANAGER_EMAILS`
is now an optional ADDITIVE override (e.g. an ops cell not yet fully
provisioned) — empty by default, never a replacement for DB registration, and
never able to re-admit a sandbox email. A tenant text about a listing routes
to that listing's actual owning manager via the cross-catalog property-hint
match in `claw-leasing-bot.server.ts` regardless of this roster; the roster
only decides the deterministic default/anchor manager (oldest-registered
first) when a text names no specific listing, and who a personal-phone text
is recognized as.

**Reply pacing — never instant.** Inbound prospect texts are buffered PER
CONVERSATION inside the gateway process (not the webhook — Vercel functions
here are Hobby-tier, so even Cron is once-per-day only; see the pool-topup
note above) and forwarded as one consolidated frame after
`CLAW_MESSENGER_DEBOUNCE_SECONDS` (default 150) of quiet from the last inbound
message in that thread — a new message resets the window. Manager-authored
texts and WS history replays always bypass the buffer (fetched from
`GET /api/webhooks/claw-messenger/manager-phones`, bearer-authed with
`CLAW_MESSENGER_API_KEY`, refreshed every `CLAW_MESSENGER_MANAGER_PHONES_REFRESH_MS`,
default 5 min). That endpoint returns HMAC digests of phone numbers, not raw
phone numbers — `CLAW_MESSENGER_API_KEY` also travels in the relay WS URL
(upstream logs can capture it, per the sibling webhook route's own comment),
so it must never double as a way to bulk-harvest real managers' cell numbers;
the gateway hashes each inbound `from` with the same key to check membership.
SIGTERM/SIGINT flush pending buffers immediately (awaited, capped at 8s) so a
redeploy doesn't add latency or drop the flush. Hard-crash durability is
deliberately bounded: `sinceIso` never advances past the oldest still-pending
buffered/in-flight frame, so Claw Messenger replays the buffered window on
reconnect — but the webhook skips replay frames unless
`CLAW_MESSENGER_PROCESS_REPLAYS=1` (default off), so a hard crash with a
non-empty buffer loses at most one quiet window of prospect texts. Frequent
gateway restarts make duplicate replies a worse failure mode than that rare
<=150s loss window; durable webhook-side messageId idempotency is the
prerequisite for flipping `CLAW_MESSENGER_PROCESS_REPLAYS` on later.

**Two-way logging is the single persistence model.** Every message on the
Claw line — inbound (prospect or resident) and outbound (agent or manager) —
is written to `manager_sms_messages` (+ `inbound_sms_log` for inbound) keyed
by `manager_user_id` + the counterparty phone; `fetchManagerSmsConversations`
(`manager-sms-messages.server.ts`) is what the portal Communication → SMS
panel reads, merged with `sms_relay_*` (the separate Twilio proxy-pair
system above) and sorted into one thread by `direction` + timestamp. Outbound
is logged for free inside `sendFromManagerWorkNumber` /
`sendPropLaneSms({ log })`. Inbound must be logged EXPLICITLY at each entry
point that receives it — the cross-catalog leasing-prospect path and the
known-resident hub path (`handleClawLeasingInbound`) each do this themselves;
a new inbound entry point that skips it will silently render as a one-sided
("outbound only") thread in the portal, which is exactly the bug this system
was built to fix.

**Public listing CTAs split by environment (interim, until A2P clears).** The
Twilio A2P campaign is still in carrier review, so the shared Claw line cannot
reliably carry production leasing traffic. `resolveListingCtaSmsPhone`
(`src/lib/listing-cta-phone.server.ts`) is the ONE place that branch is made,
keyed on the existing `isProductionRuntime()`:

- **production** → that listing's OWN manager's `profiles.phone`, and only when
  `phone_verified_at` is set (an unverified phone is user-editable and
  forgeable — same rule as `resolveRegisteredClawManagers`). Resolved per row
  from the owning `manager_user_id`, never a catalog-wide default, so a
  multi-manager fleet cannot cross-route a prospect to the wrong manager.
- **localhost / preview / test** → the shared Claw leasing line, unchanged, so
  the leasing-agent flow stays exercisable in development.

Everything downstream just carries the resolved number: `getPublicListings()`
and `/api/public/property-lead` stamp it onto `contactSmsPhone` (overwriting,
never defaulting — the stored property JSON's own `contactSmsPhone` is
manager-editable and is deliberately ignored), `/api/manager/phone` returns it
as `listingCtaPhone` for manager-side previews, and the browser's
`listingCtaSmsPhone` only normalizes/rejects. The browser must NEVER substitute
a number of its own: `null` means render the "Schedule a tour" / "Apply online"
web links that already sit under those buttons, not an `sms:` to the shared
line. Note `managerContactSmsPhoneForPublicCta` still collapses everything onto
the Claw line — it backs the SEND transport (`proplane-sms-transport.server.ts`)
and work-number UI, not CTAs. Coverage:
`tests/unit/listing-cta-manager-phone.test.ts`,
`tests/unit/public-listings-cta-phone.test.ts`.

**Defensive catalog filter.** `getPublicListings()`
(`src/lib/public-listings.server.ts`) already drops sandbox/demo listings from
the public catalog in production via `filterSandboxFromPublicCatalog`; the
manager-registration choke point above extends that same guarantee to the
Claw line's OTHER lookups (a manager's own-listing tools, the default/anchor
listing, notification fan-out) by ensuring `landlordId` is never resolved to
a sandbox manager in the first place. Do not add a second, independent
sandbox filter inside the listing tools themselves (`leasing-sms.ts`) — the
registration choke point is the intended single source of truth; duplicating
the check there would just be another place to forget to update.
