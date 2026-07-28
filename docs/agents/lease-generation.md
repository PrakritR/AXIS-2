> Moved out of AGENTS.md to keep every-session context lean. This file is the
> source of truth for its area — READ IT BEFORE changing code in this area.

# Lease templates are private (Jul 2026)

A manager-uploaded lease template is the manager's own legal document — often
their attorney's work product, carrying their entity details and their terms.
It is not listing marketing. Two independent things used to make it public;
both are closed.

## What was confirmed empirically, before any edit

Against the dev/test project, with the dev server running:

- `GET /api/property-records/public` returned **17 listings, every one carrying
  the full `listingSubmission` blob** — `getPublicListings()` spread
  `property_data` with no field allowlist. 64.5 KB of manager-owned JSON to
  anonymous callers.
- **5 of those listings published `wifiPassword`** (`AxisHome-5G` /
  `welcome-home-2026`) in that payload. The reported lease-template leak is one
  symptom of a wider "the whole submission is public" defect, not the whole bug.
- `listing-photos` is **public** and its objects are anonymously readable
  (`ANON GET 200 image/jpeg` on an existing object with no credentials). Note the
  live bucket has `allowed_mime_types: null` and `file_size_limit: null` — the
  values in `20260504120000_listing_photos_bucket.sql` never applied because the
  bucket pre-existed and the insert is `on conflict do nothing`. So the migration
  appears to restrict uploads to images/video, and in reality PDFs upload fine.
- **No live dev listing currently holds an uploaded template**, top-level or
  inside `propertyLeaseTemplates[]` — so the leak was structural and live, but
  had no realized instance in dev. Production was not checked (its credentials
  live only in Vercel, by design). See "Legacy objects" below.
- A second anonymous route, `GET /api/public/property-lead?propertyId=…`, reached
  the same stored blob the same way. Fixing only `getPublicListings()` would have
  been bypassable by asking for a property by id.

Also found while tracing, both fixed here:

- Only the create-listing wizard ever uploaded a template. The three lease
  modals (`manager-lease-editor-modal`, `property-lease-form-modal`,
  `property-lease-upload-modal`) persisted the **base64 `data:` URL straight
  into `manager_property_records.property_data`** — a multi-megabyte PDF inlined
  into the blob public surfaces read.
- Neither the wizard's uploader nor `collectSubmissionMediaUrls` walked
  `propertyLeaseTemplates[]`, so per-property templates were never uploaded and
  never garbage-collected.

## Part 1 — the public payload is an explicit allowlist

`publicListingProjection` in `src/lib/public-listings.server.ts` is now the ONE
projection every anonymous read runs through: `getPublicListings()` (which backs
both `/api/property-records/public` and the AI housing-search + leasing SMS
tools, so "what the search sees" still cannot drift from "what the AI sees") and
`/api/public/property-lead`.

Deny by default, at every depth: `PUBLIC_PROPERTY_KEYS` for `MockProperty`,
`PUBLIC_SUBMISSION_KEYS` for the submission, and per-row lists for rooms,
bathrooms, shared spaces, bundles, quick facts and custom fees. Each list is
`as const satisfies readonly (keyof T)[]`, so a renamed field fails the build
rather than silently dropping out of the payload.

The rule for adding a field: it belongs on a list when a prospect-facing surface
reads it, or it is pure listing marketing metadata. It stays off when it is
manager- or resident-internal — access credentials and instructions (wifi,
`moveInInstructions`), lease configuration, billing policy, add-on service
offers (which carry `residentEmails`), proration internals. A compliance field
like `yearBuilt` added next month is public only when someone adds it here.

**`listingSubmission` is still present in the payload, allowlisted, not
removed.** Removing it outright fails the "browse, listing detail and the apply
wizard still work" requirement: the public apply wizard reads its custom
application questions, fee sheet and lease terms from it, and
`listing-rich-from-submission.ts` calls `.trim()` / `.map()` on the required
fields unguarded — a missing one throws into `getListingRichContent`'s catch and
silently renders a **generic demo listing** in place of the real one. Every
required submission field is therefore on the allowlist (they are all benign
listing copy or pricing), and `tests/unit/public-listing-projection.test.ts`
asserts that.

## Part 2 — the object

New PRIVATE bucket `lease-templates`
(`supabase/migrations/20260728120000_lease_templates_bucket.sql`): 8 MB,
`application/pdf` only, **no storage policy at all**, copying
`application-documents` rather than `manager-documents`. Storage RLS default-denies
`anon`/`authenticated` when no policy grants them, so the shipped public anon key
cannot reach the objects even though the PostgREST surface is browser-reachable.
A folder-scoped `auth.uid()` policy would be strictly weaker here, because a
resident who may read their own lease template is not the folder owner. Like
`application-documents` there is no metadata table — the object path lives on the
submission, so it persists through the same autosave path as every other listing
field and ownership is re-derived at request time.

**Path convention:** `<manager user id>/<timestamp>-<rand>.pdf`. The folder is
the authenticated uploader's id, never a name from the request.

**Stored reference:** `leaseTemplateDocUrl` holds
`/api/portal/lease-template?path=<object path>` — a stable, root-relative URL
onto the authorizing route, **not** a signed storage URL. That is deliberate and
it is the one place this deviates from the documents module:
`buildManagerTemplateLeaseHtml` (`generated-lease.ts`) bakes the value into a
persisted `<object data=…>` inside `portal_lease_pipeline_records.row_data.generatedHtml`,
which outlives any signed-URL TTL by years. A stable URL that re-authorizes on
every request gives the same privacy guarantee without touching the lease
router, the signing modal, or the generated HTML. Root-relative so the same
stored value resolves on localhost, previews, production, and inside the
Capacitor WebView, including from the `srcDoc` iframes that render leases.

**`GET /api/portal/lease-template?path=…`** streams the bytes (service-role
`download()`, `Cache-Control: private, no-store`, `X-Content-Type-Options:
nosniff`), the same shape as `/api/portal/application-photos` — not a 302, which
the documents module already learned opens a new tab in the Capacitor WebView
instead of rendering. Authorization is by RELATIONSHIP, not portal role, so a
multi-role account is judged on each relationship it actually holds:

1. the manager who uploaded it, by the object's own folder;
2. the OWNING manager of a property whose submission references that exact path,
   re-derived from `manager_user_id` and deliberately NOT from the folder — the
   two genuinely differ, because a co-manager's upload lands in the co-manager's
   folder while the URL is stored on the owner's listing, and a transferred
   property changes hands without moving any object;
3. a co-manager with the `properties` module on such a property;
4. the APPROVED resident of such a property. Approval is checked explicitly
   (`residentHasApprovedResidency`) because `resolveResidentFilingScope` falls
   back to unapproved rows, which would hand the grant to anyone who merely
   applied to a live listing. `/api/portal/resident-property` draws the same
   line — it strips `listingSubmission` for an unapproved applicant — and the
   two routes must not disagree about one trust boundary;
5. either party to a lease document that already embeds the path. Required
   because the generated lease HTML bakes the URL in permanently and is never
   rewritten: when a manager REPLACES a property's template the listing stops
   referencing the old object, and without this branch every resident who
   already signed against it would 404 on their own lease — something the old
   public URL never did.

Membership is **two** conditions, and both are load-bearing: a property (or
lease row) must reference the path AND the object's FOLDER OWNER must be someone
who could have attached it there — the row's own manager, or a co-manager of it.
"A property I can see references this path" alone is not authorization, because
`leaseTemplateDocUrl` is a manager-editable blob field: a manager can write any
string onto their OWN listing and the wizard mirrors `property_data` verbatim,
so without the second condition they could paste another manager's path onto
their own property and read the document back. The folder id is not secret
either — `managerUserId` ships in the public listing payload — so the path is a
weak secret and never the gate. The same pair applies to the lease-row branch,
since a lease row is client-writable too. Every denial is a 404, never a 403, so
the route never confirms a path exists. `POST` (multipart) uploads into the
caller's own folder after a manager/admin role check and a per-user
`rateLimit` — an uploaded object carries no property association, so nothing
else bounds how many a manager can push into a free-plan storage budget.
`DELETE` removes only paths whose folder is the caller's id.

**Writes funnel through one function.** `readLeaseTemplateFile`
(`lease-config-form.tsx`) is the single picker all three lease modals use; it now
uploads and hands back the route URL instead of a `data:` URL, so fixing it
fixed all three. `/demo` keeps the in-memory data URL (it must never write real
rows). A failed upload surfaces a toast and stores nothing — base64 is never
persisted as a fallback. The wizard's `uploadSubmissionMedia` routes the
template (and every `propertyLeaseTemplates[]` entry) through
`uploadLeaseTemplateDataUrl` instead of the generic `uploadOne`, so a legacy
draft resumed with base64 lands in the private bucket rather than the public
photo bucket.

**Deletion still reclaims, and still skips.** `deleteSubmissionMediaObjects`
calls `deleteSubmissionLeaseTemplates` with the same `stillReferencedBy` set, so
a path a surviving submission references is left alone — the shared-object rule
from the property-drafts notes in AGENTS.md, which matters most for the two draft
rows a partially-failed id re-key leaves behind. `collectSubmissionMediaUrls`
still pushes `leaseTemplateDocUrl` and now walks `propertyLeaseTemplates[]`,
which is what reclaims a LEGACY template still sitting in `listing-photos`.

## The projection and the manager's own catalog share one localStorage map

`cachePublicExtraListings` (`demo-property-pipeline.ts`) writes every public
fetch into `axis_manager_extras_by_user_v1` keyed by `managerUserId` — the SAME
map the manager portal reads, edits, and mirrors back into `property_data` via
`updateExtraListingFromSubmission`. That was harmless while the public payload
equalled the stored blob. The allowlist made it lossy: one visit to
`/rent/browse`, or a native app launch (which hydrates the public catalog for
every role), would replace the owner's own row with the stripped copy, and their
next House-details save would persist it — silently destroying lease config,
wifi, add-on services, room move-in instructions, and the lease template this
whole change exists to protect.

The cache now **merges**: public scalar fields refresh, but an existing row's
`listingSubmission` is never downgraded. Residual, accepted: a listing cached
for the first time from the public route before the owner's authoritative sync
runs (TTL 15s) is a projection until that sync fires. Coverage:
`tests/unit/public-listing-cache-merge.test.ts`. If you add another consumer of
the public payload, ask whether it writes anywhere the owner later saves from.

## Legacy objects: read-through, knowingly, with a backfill plan

**Decision: read-through.** Templates already in `listing-photos` keep working;
only new uploads go private.

Why, rather than a backfill:

- Dev holds **zero** of them (verified above), so a backfill there is a no-op.
- The Part 1 allowlist already removes the only discovery path — a legacy URL is
  no longer emitted by any anonymous endpoint.
- A backfill cannot stop at the submission. Every already-generated lease has the
  old public URL **frozen inside `generatedHtml`**, so deleting the public object
  breaks the document residents already signed. A correct backfill must rewrite
  `portal_lease_pipeline_records.row_data.generatedHtml` too, which is the lease
  and signing flow this change deliberately does not touch.

Residual risk, stated plainly: a legacy object stays anonymously readable to
anyone who already has its URL. Check production before deciding it is empty:

```js
// service-role, against the target project
const { data } = await db.from("manager_property_records").select("id, property_data");
for (const r of data) {
  const s = r.property_data?.listingSubmission ?? {};
  for (const u of [s.leaseTemplateDocUrl, ...(s.propertyLeaseTemplates ?? []).map(t => t?.leaseTemplateDocUrl)])
    if (typeof u === "string" && u.includes("/object/public/listing-photos/")) console.log(r.id, u);
}
```

If that prints rows, the backfill is: copy each object into `lease-templates`,
rewrite the submission URL, rewrite every `generatedHtml` containing the old
URL, then remove the public object — in that order, so a failure never strands a
lease pointing at nothing.

## The agent tool could re-open the hole one property at a time

`update_property_lease_config` (`src/lib/tools/domains/properties.ts`) accepted
a model-supplied `leaseTemplateDocUrl` and wrote it to `manager_property_records`
verbatim, with no scheme or host validation. It is behind the write-tool confirm
gate, but the preview rendered only the file NAME — so the human approving it
could not see what they were attaching. Applicant-submitted text is untrusted
(AGENTS.md), so a prompt injection could steer the model into proposing a
third-party URL or a base64 `data:` PDF behind a benign label and substitute the
document residents sign.

`validateLeaseConfigInput` now accepts only a value that resolves to a stored
object — `leaseTemplateObjectPath()` (private bucket) or `listingMediaObjectPath()`
(a legacy `listing-photos` template a property may still carry and legitimately
re-apply) — and the preview carries the resolved path as a "Stored file" field.
`data:` URLs and arbitrary links are rejected. Switching a property to
`axis_default` / `custom_comments` is untouched.

`leaseTemplateObjectPath` is anchored (`startsWith`), not a substring match: a
loose match would let `https://evil.example/api/portal/lease-template?path=…`
resolve to a real object path, which both this validation and the read route's
membership check would then have treated as genuine.

Two mitigations that already held, so this was never XSS: `escapeHtml`
attribute-escapes the URL in `generated-lease.ts`, and every lease iframe is
sandboxed without `allow-scripts`.

## Coverage

- `tests/unit/public-listing-projection.test.ts` — secrets dropped at any depth,
  a newly added field is not published, every load-bearing field survives.
- `tests/unit/public-listing-cache-merge.test.ts` — caching the projection never
  downgrades the owner's stored submission, but still refreshes public fields.
- `tests/unit/lease-template-storage.test.ts` — path round-trip, traversal
  rejection, nested `propertyLeaseTemplates[]` collection, deletion skips a path
  a survivor references.
- `tests/integration/portal/lease-template-access.test.ts` — anonymous denied,
  folder owner served, property owner served when a co-manager uploaded it,
  co-manager served, approved resident served only when their property
  references the path, PENDING applicant denied, a resident whose signed lease
  embeds a no-longer-referenced template still served, a different manager
  denied, a manager who planted another manager's path on their own listing or
  in their own lease row denied, traversal rejected before storage is touched,
  `DELETE` scoped to the caller's own folder.
- `tests/unit/lease-template-storage.test.ts` also asserts a foreign URL merely
  containing the route resolves to null.
