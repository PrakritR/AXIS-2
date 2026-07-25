# Promo + lease modal assistant (r1)

## Goal

Managers use the PropLane Assistant strip inside **New promotion** and **Lease** modals without hitting opaque failures when attaching images or asking for flyer/lease changes.

## Promotion modal

- [x] System prompt allows `create_promotion` / `generate_promotion_flyer` when context is New promotion.
- [x] Rich `assistantContext` (propertyId, label, address, style notes) via `buildPromotionNewModalAssistantContext`.
- [x] Reference images: best-effort upload; inline vision if storage fails; `referenceImageUrls` on tools.
- [x] Model routing reads text from multipart (image + text) messages (`tests/unit/agent/model-routing.test.ts`).

## Also fix: Lease modal

- [x] `update_property_lease_config` write tool on listing submissions (`src/lib/tools/domains/properties.ts`).
- [x] `propertyId` in Lease modal assistant context (`buildLeaseModalAssistantContext` + `ManagerLeaseEditorModal`).
- [x] System prompt: Lease modal vs Leases page (packets).

## Reliability (captain priority)

The assistant must **never dead-end** on the generic copy  
`The assistant ran into an error. Please try again.`

1. [x] **User-facing errors are specific and actionable** — rate limits, attachments, context length, overload, network/timeouts, actionable fallback.
2. [x] **Central mapper** — `formatAgentChatUserError` in `src/lib/agent/assistant-turn-error.ts`; every `src/app/api/agent/*` chat route and `handlePendingActionDecision` call it in `catch` blocks.
3. [x] **No silent proposal loss** — `PENDING_ACTION_SAVE_FAILED_NOTE` when `createPendingAction` fails.
4. [x] **Vision turns** — `messagesNeedVisionModel` pins standard tier on attachment turns.
5. [x] **Promotion vs listing uploads** — `enrichManagerChatImageAttachments` with `requireSuccessfulUpload` only for listing-draft context.
6. [x] **Regression** — `tests/unit/agent/assistant-turn-error.test.ts`, multipart test in `model-routing.test.ts`, banned-string scan in `portal-assistant-wiring.test.ts`.

## Ship

- PR to `prakrit`: #108 (`fm/promo-flyer-assistant-r1`) — merge when captain approves
