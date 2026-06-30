<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics across the Axis Housing platform. Client-side initialization was added via `instrumentation-client.ts` (Next.js 15.3+ pattern), the Next.js config was updated with PostHog ingest rewrites for performance, and 12 events were instrumented across 11 files covering the three core user journeys: manager onboarding, resident activation, and property/payment operations. Users are identified on sign-in and account creation so server- and client-side events correlate correctly under a single distinct ID.

| Event | Description | File |
|---|---|---|
| `manager_account_created` | Manager completes account creation after paying via Stripe checkout | `src/app/api/auth/manager-signup/route.ts` |
| `manager_signup_oauth_completed` | Manager finishes signing up through Google OAuth | `src/app/api/auth/manager-signup-oauth/route.ts` |
| `resident_account_created` | Resident creates portal account using their Axis application ID | `src/app/api/auth/register-resident/route.ts` |
| `user_signed_out` | A user signs out of the platform | `src/app/api/auth/sign-out/route.ts` |
| `rental_application_submitted` | Prospective resident submits a rental application through the public wizard | `src/components/marketing/rental-application-wizard.tsx` |
| `lead_invite_sent` | Manager sends a prospect an invitation to apply, tour, or view a listing | `src/app/api/portal/send-lead-invite/route.ts` |
| `payment_reminder_sent` | Manager sends a payment reminder to a resident | `src/app/api/portal/send-payment-reminder/route.ts` |
| `work_order_completed` | Manager marks a work order complete and logs its expenses | `src/app/api/portal/work-orders/complete/route.ts` |
| `manager_subscription_purchased` | Manager's Stripe checkout for a subscription plan completes | `src/app/api/stripe/webhook/route.ts` |
| `application_fee_paid` | Rental applicant's application fee is confirmed via Stripe | `src/app/api/stripe/webhook/route.ts` |
| `household_charge_paid` | Resident's household charge payment is confirmed via Stripe | `src/app/api/stripe/webhook/route.ts` |
| `resident_approval_updated` | Manager approves or denies a resident's portal access | `src/app/api/portal/resident-approval/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) dashboard](https://us.posthog.com/project/492655/dashboard/1782127)
- [Rental applications submitted](https://us.posthog.com/project/492655/insights/eTpIXPXK)
- [Manager signups](https://us.posthog.com/project/492655/insights/j8Wnjolo)
- [Resident account activations](https://us.posthog.com/project/492655/insights/p1Uo5oM4)
- [Manager subscription conversion funnel](https://us.posthog.com/project/492655/insights/PE9dRESM)
- [Payment & charge activity](https://us.posthog.com/project/492655/insights/1rB832la)

## LLM analytics

PostHog AI Observability is now wired into the Axis AI agent. Every agent turn emits a `$ai_generation` event carrying the model name, input/output token counts, latency, total cost in USD, and the list of tools invoked — all safe, non-PII metadata. Input/output message content is intentionally omitted to comply with the platform's PII policy.

**Implementation:**

| File | Change |
|---|---|
| `src/lib/analytics/posthog.ts` | Added `capture()` helper accepting `Record<string, unknown>` for AI events with array-typed properties |
| `src/lib/observability/posthog-ai.ts` | New module — `captureAiTurn()` wraps agent turns and emits `$ai_generation` on success or error |
| `src/app/api/agent/chat/route.ts` | Added `captureAiTurn` as an outer wrapper around `traceAgentTurn` so PostHog and Langfuse both receive the turn result |

The `$ai_generation` event includes:

| Property | Source |
|---|---|
| `$ai_model` | Model ID selected by the routing heuristic in `model.ts` |
| `$ai_provider` | `"anthropic"` (hardcoded — only provider in use) |
| `$ai_input_tokens` | Accumulated across all loop iterations in `loop.ts` |
| `$ai_output_tokens` | Accumulated across all loop iterations |
| `$ai_latency` | Wall-clock seconds for the full turn |
| `$ai_total_cost_usd` | Calculated from `MODEL_PRICING` in `model.ts` |
| `$ai_input_token_price` / `$ai_output_token_price` | Per-token prices from `MODEL_PRICING` |
| `$ai_tools` | Array of tool names called during the turn |
| `landlord_id` | Manager scope key for filtering by account |
| `model_tier` | `simple` / `standard` / `complex` routing tier |

View AI generations in PostHog: [AI Observability → Generations](https://us.posthog.com/project/492655/ai-observability/generations)

## Verify before merging

- [ ] Run a full production build (`npm run build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite (`npm test`) — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify in PostHog Error Tracking.
- [ ] Confirm the returning-visitor path also calls `identify` — the current sign-in handler identifies on fresh login, but sessions that resume via cookie without re-signing in will remain on anonymous distinct IDs until the next explicit login.
- [ ] Trigger the AI agent chat path and confirm `$ai_generation` events appear in PostHog AI Observability (Traces and Generations tabs).

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
