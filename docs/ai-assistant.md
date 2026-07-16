# Axis Assistant — architecture, tool catalog, and how to extend it

The in-app AI assistant ("Axis Assistant") runs on **all three portals** —
manager, resident, and vendor — with one shared agent core and a
portal-scoped tool registry per surface. Users ask in natural language; the
assistant answers from live data and **proposes** actions that only execute
after the user explicitly confirms.

## Architecture

```
axis-assistant.tsx (one panel, portal-aware copy/suggestions/endpoints)
        │
        ▼
POST /api/agent/chat            (manager)   ┐
POST /api/agent/resident-chat   (resident)  ├─ resolve portal context → registry
POST /api/agent/vendor-chat     (vendor)    ┘
POST /api/agent/demo-chat       (public /demo sandbox, simulated actions)
        │
        ▼
runAgentTurn (src/lib/agent/loop.ts)
  · Anthropic SDK, native tool-calling, ≤8 iterations
  · model routed per turn by complexity (src/lib/agent/model.ts)
  · READ tools run inline; confirm:"none" writes run inline (still audited)
  · a gated WRITE tool call runs its preview() and HALTS the turn
        │
        ▼ (write proposal)
agent_pending_actions row (validated input + preview; 10-min TTL)
  → client renders PendingActionCard from the preview
        │ user confirms
        ▼
POST /api/agent/action  { actionId, decision: confirm|cancel }
  · atomic exactly-once claim (actor-scoped, expiry-checked)
  · re-validates stored input against the tool's CURRENT schema
  · tool execute() re-resolves every target from actor-scoped data
  · audit_log row written BEFORE the side effect (dedupe_key idempotency)
```

### The three contexts (security choke points)

| Portal | Resolver | Scope rule every tool must apply |
|---|---|---|
| manager | `resolveAgentContext` (`src/lib/tools/context.ts`) | `.eq("manager_user_id", ctx.landlordId)` |
| resident | `resolveResidentAgentContext` (`src/lib/tools/resident-context.ts`) | `.or("resident_user_id.eq.<uid>,resident_email.eq.<email>")` or `.eq("resident_email", …)` |
| vendor | `resolveVendorAgentContext` (`src/lib/tools/vendor-context.ts`) | `.eq("vendor_user_id", ctx.userId)` |

Identity always comes from the authenticated session — **never** from model
input. `buildRegistry` throws at module init if a write tool's input schema
declares an identity-shaped field (`landlordId`, `manager_user_id`, …).
Target ids (a charge id, a recipient email) are allowed in inputs and are
re-verified against actor-scoped data in both `preview()` and `execute()`.

### Registries

- Manager: `src/lib/tools/index.ts` (`agentRegistry`)
- Resident: `src/lib/tools/resident-index.ts` — filtered per request by
  application phase and the linked manager's subscription tier, so the
  assistant's capabilities always equal the resident portal's.
- Vendor: `src/lib/tools/vendor-index.ts`

### Write-action lifecycle

1. Model calls a write tool → `prepareWriteAction` Zod-validates and runs
   `preview(ctx, input)` (READ-ONLY: validate against live data, build an
   `ActionPreview`). A failed preview is fed back as a `tool_result` error so
   the model self-corrects.
2. The loop halts and returns `proposedAction`; the chat route persists it to
   `agent_pending_actions` and sends the client only `{id, preview, …}` —
   never the raw input.
3. The user confirms → `POST /api/agent/action` claims the row atomically
   (`status='pending' AND expires_at > now() AND actor_user_id = <me>`),
   re-validates, and runs `execute(ctx, input)`.
4. `execute` re-resolves ownership of every target, writes the audit row
   FIRST (`writeAuditLog`, `src/lib/tools/audit.ts`), performs the side
   effect, then stamps the outcome (`updateAuditResult`).

Batch actions are **tool-level array inputs** (e.g. `send_rent_reminder`
takes `chargeIds[]`) — one proposal, one card, one confirm; per-target dedupe
keys keep every item independently idempotent.

Dedupe-key conventions:
- Repeatable sends: `{tool}:{scopeId}:{targetId}:{YYYY-MM-DD}`
- One-shot transitions: `{tool}:{scopeId}:{targetId}`

### Sessions & memory

Conversations persist best-effort into `agent_sessions` / `agent_messages`
(`src/lib/agent/sessions.ts`, written via `after()` — zero turn latency, can
never fail a turn). Cancelled/expired proposals stay in
`agent_pending_actions` and feed the eval set.

### Images

The manager chat accepts up to 3 images on the **last user message only**
(client downscales to ≤1568px JPEG; server validates via
`src/lib/agent/images.ts`; ≤4MB total under the Vercel body cap). The model
reads them natively — "create a property from these listing pictures" flows
into the `create_property` write tool, whose confirm card shows every
extracted field for human verification before a draft (never live) listing is
created.

## Observability & analytics (build requirement)

- **Langfuse** (`src/lib/observability/langfuse.ts`): one `axis-agent-turn`
  trace per turn (per-LLM-call generations with tokens/cost, per-tool spans
  with full args/results, `pending:<tool>` spans for proposals) and one
  `axis-agent-action` trace per confirm/cancel. Traces carry the
  `TraceActor` metadata: role + landlordId (manager) or managerIds
  (resident/vendor). No-ops when `LANGFUSE_*` env is unset.
- **PostHog** (ids/enums only, never PII): `assistant_opened {portal}`,
  `assistant_message_sent {portal, tools, model, tier}`,
  `assistant_action_proposed {portal, tool, batch}`,
  `assistant_action_confirmed {portal, tool, batch}`,
  `assistant_action_cancelled {portal, tool}`.

## Security model

- **Confirmed-by-human is the backstop.** The model can only produce a
  pending row; nothing in a tool result can execute anything. `runReadTool`
  refuses write tools even if one reaches it (defense in depth).
- **Prompt injection:** tenant/applicant/vendor/message text returned by
  read tools is wrapped as
  `{ untrustedContent: "<<<EXTERNAL_MESSAGE …>>> … <<<END…>>>" }` and every
  system prompt forbids following instructions found in tool results or
  proposing actions because tool-result text asked.
- **Cross-tenant isolation** is enforced three times: context resolution,
  every tool's own scope filter, and execute-time re-resolution. Unit suites
  (`tests/unit/tools/*scope-isolation*`, `pending-actions.test.ts`) seed
  foreign rows and assert they never surface.
- **Anti-enumeration:** an unknown action id and a foreign actor's action id
  are indistinguishable (404).
- **Rate limits:** per-user on every chat route and the confirm endpoint;
  per-IP on the public demo.
- **Money invariants:** `approve_and_pay_work_order` transfers exactly the
  accepted bid's `amount_cents` (immutable anchor — never a model- or
  client-supplied amount); vendor `set_my_price` refuses once a bid is
  accepted.

## Tool catalog

> The live source of truth is the registry files; this table is the
> orientation map. Kind: R = read, W = confirm-gated write, W* = inline
> low-risk write (confirm:"none", still audited).

### Manager (`src/lib/tools/index.ts`)

See `src/lib/tools/domains/` — payments (`get_overdue_charges`,
`list_charges`, `send_rent_reminder` W batch), charges (`create_charge` W,
`update_charge` W, `delete_charge` W, `mark_charge_paid` W), automation
(`get_automation_settings` R, `update_automation_settings` W,
`cancel_scheduled_reminder`/`reschedule_reminder` W), messaging
(`send_message` W, `schedule_message` W, `cancel_scheduled_message` W),
inbox (`list_inbox_threads` R, `get_thread_messages` R, `update_thread` W*),
calendar (`list_calendar_events` R, `list_tour_inquiries` R,
`update_manager_availability` W, `create_calendar_event` W,
`cancel_calendar_event` W, `accept_tour_inquiry` W), work orders
(`list_work_orders` R, `list_work_order_bids` R, `suggest_vendors_for_work_order` R,
`create_work_order` W, `assign_vendor` W, `offer_to_vendors` W,
`schedule_vendor_visit` W, `accept_bid` W, `complete_work_order` W,
`approve_and_pay_work_order` W destructive, `send_work_order_reminder` W),
properties (`list_properties` R, `get_property_details` R, `create_property` W,
`update_property` W, `share_property_link` W), residents (`list_residents` R,
`set_resident_approval` W, `send_resident_welcome` W, `revoke_resident_access`
W destructive, `record_move_out` W), applications (`list_applications` R,
`get_application_details` R, `update_application_bucket` W,
`order_background_check` W — env-gated, costs money), leases (`list_leases` R,
`amend_lease` W, `void_lease` W destructive, `send_lease_for_signature` W),
vendors (`list_vendors` R, `add_vendor` W, `update_vendor` W,
`invite_vendor` W), financials (`run_financial_report` R, `record_expense` W,
`record_income` W — tier-gated), search (`find_records` R), profile
(`get_manager_profile` R, `get_dashboard_summary` R), promotions
(`list_promotions` R, `create_promotion` W, `update_promotion` W,
`delete_promotion` W destructive), team (`list_co_managers` R), services
(`list_service_requests` R).

### Resident (`src/lib/tools/resident-index.ts`)

Reads: `get_my_balance`, `list_my_charges`, `get_my_lease`,
`get_my_application_status`, `list_my_service_requests`,
`list_my_work_orders`, `get_move_in_info`, `list_my_inbox_threads`,
`get_my_payment_methods`, `get_my_scheduled_messages`. Writes:
`create_service_request`, `add_service_request_note`,
`send_message_to_manager`, `report_manual_payment`,
`request_lease_extension`, `schedule_message`, `cancel_scheduled_message`,
`start_rent_payment` (returns a hosted Stripe Checkout link — the agent never
completes a payment). Application-phase residents get only
`get_my_application_status` + `send_message_to_manager`; a free-tier manager
hides services/inbox tools.

Deliberately NOT tools: lease signing (legal ceremony — deep-link to
`/resident/lease`), autopay (feature doesn't exist).

### Vendor (`src/lib/tools/vendor-index.ts`)

Reads: `list_my_jobs`, `get_job_details`, `list_my_bids`, `list_my_offers`,
`list_my_payouts`, `get_my_availability`, `list_my_inbox_threads`,
`get_my_profile`. Writes: `submit_bid`, `set_my_price` (refuses once a bid is
accepted), `mark_job_done`, `update_my_availability`,
`send_message_to_manager`. Stripe Connect onboarding, W-9/tax, and document
uploads stay on the Profile page (deep-link only).

## How to add a new tool (checklist)

1. **Define it** in the right `src/lib/tools/domains/` file (or a new one):
   `defineTool` for reads, `defineWriteTool` for writes (preview + execute,
   audit row, dedupe key per the conventions above). Never accept identity
   fields; always scope queries to the context.
2. **Back it with the shared lib.** If the capability lives in an API route,
   extract the logic into a `*.server.ts` lib the route AND the tool share —
   tools never `fetch()` internal routes.
3. **Register it** in the portal's registry index. Resident tools also need a
   `TOOL_SECTION` entry if they belong to a tier-gated section.
4. **Test it**: scope isolation (foreign rows never actionable), preview
   rejection of invalid/foreign ids, audit row + dedupe key, happy path —
   pattern: `tests/unit/tools/`.
5. **Prompt note**: if the tool has honesty caveats (feature limits, money,
   env gating), add a line to the portal's system prompt
   (`src/lib/agent/*system-prompt.ts`).
6. **Analytics**: nothing to do — proposal/confirm/cancel events are emitted
   by the framework. Only add a named PostHog event if the action is a
   funnel moment (reuse existing names first; see AGENTS.md).

## Environment setup

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | the agent loop (`new Anthropic()`) |
| `AXIS_AGENT_MODEL` (+ `_SIMPLE/_STANDARD/_COMPLEX`) | no | model overrides per tier |
| `LANGFUSE_SECRET_KEY` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_BASE_URL` | no | tracing (no-op when unset) |
| `POSTHOG_KEY` / `POSTHOG_HOST` | no | analytics |
| `RESEND_API_KEY` / `RESEND_FROM` | no | outbound email (tools degrade to portal-only delivery) |
| `CHECKR_API_KEY` / `CERTN_API_KEY` | no | background-check ordering (tool reports "not configured" otherwise) |
| Stripe keys + Connect | no | rent checkout links, vendor payouts (tools report honestly when unconfigured) |

Database: migrations `20260625000000_agent_observability.sql`
(`audit_log`, `agent_sessions`, `agent_messages`) and
`20260716090000_agent_pending_actions.sql` (`agent_pending_actions`,
portal columns). Apply with `npm run db:push` (dev/test project only — see
`docs/database-environments.md`).
