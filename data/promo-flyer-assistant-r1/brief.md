# Promo + lease modal assistant (r1)

## Goal

Managers use the PropLane Assistant strip inside **New promotion** and **Lease** modals without hitting opaque failures when attaching images or asking for flyer/lease changes.

## Promotion modal

- System prompt allows `create_promotion` / `generate_promotion_flyer` when context is New promotion.
- Rich `assistantContext` (propertyId, label, address, style notes).
- Reference images: best-effort upload; inline vision if storage fails; `referenceImageUrls` on tools.
- Model routing must read text from multipart (image + text) messages.

## Also fix: Lease modal

- `update_property_lease_config` write tool on listing submissions.
- `propertyId` in Lease modal assistant context.
- System prompt: Lease modal vs Leases page (packets).

## Reliability (captain priority)

The assistant must **never dead-end** on the generic copy  
`The assistant ran into an error. Please try again.`

1. **User-facing errors are specific and actionable** — rate limits, attachments too large, context too long, AI overload, network/timeouts, and a final fallback that tells the user what to try next (shorter message, fewer attachments, new chat).
2. **Central mapper** — `userFacingAssistantError` in `src/lib/agent/assistant-turn-error.ts`; every portal agent route and `handlePendingActionDecision` use it in `catch` blocks.
3. **No silent proposal loss** — if the model proposes a write but `createPendingAction` fails, append an explanation to `reply` (still HTTP 200) so the thread is not empty.
4. **Vision turns** — manager chat pins the standard-tier model when the turn includes images or PDFs so routing does not send vision payloads to a non-vision model.
5. **Promotion vs listing uploads** — listing-draft flows may fail closed on photo upload; promotion (and other non-draft) flows keep inline attachments when upload fails.
6. **Regression** — unit tests on the error mapper; repo test forbids the banned generic string in `src/app/api/agent/` and `pending-action-decision.ts`.
