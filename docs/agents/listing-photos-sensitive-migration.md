# Migration plan: sensitive objects still in `listing-photos`

**Status:** proposed — do not run without captain approval.

New uploads land in private buckets (`vendor-documents`, `bug-feedback-attachments`)
after the `20260730150000_vendor_and_bug_feedback_private_buckets.sql` migration
ships. **Existing objects and stored URLs are unchanged** until a deliberate
backfill runs.

## What exists in production today

Objects under these prefixes in the **public** `listing-photos` bucket:

| Prefix | Source | Stored references |
| --- | --- | --- |
| `vendor-documents/{vendorUserId}/…` | Vendor compliance uploads | `manager_vendor_records.row_data.vendorDocuments[].storagePath` (and `url` is already `/api/vendor/documents/file?kind=…`, not a public URL) |
| `bug-feedback/{userId}/…` | Bug/feedback attachments | `portal_bug_feedback_records.row_data.attachmentUrls[]` — **full public Supabase URLs** |

Anyone with a direct `…/storage/v1/object/public/listing-photos/…` URL can still
read legacy objects until they are moved or deleted.

## Target state

| Prefix | Destination bucket | Stored reference after backfill |
| --- | --- | --- |
| `vendor-documents/…` | `vendor-documents` (private) | `storagePath` unchanged; no URL change needed |
| `bug-feedback/…` | `bug-feedback-attachments` (private) | Replace each public URL with `/api/bug-feedback-attachments?path=…` |

## Proposed script (not checked in as executable — captain runs manually)

```bash
# 1. Dry-run: list legacy objects (service role, dev/staging first)
node --env-file=.env scripts/migrate-listing-photos-sensitive-objects.mjs --dry-run

# 2. Copy objects listing-photos → private buckets, then update DB references
ALLOW_MIGRATE_TARGET=<project-ref> \
  node --env-file=.env scripts/migrate-listing-photos-sensitive-objects.mjs
```

Sketch for `scripts/migrate-listing-photos-sensitive-objects.mjs`:

1. **Guard:** refuse unless `ALLOW_MIGRATE_TARGET` matches the Supabase project ref
   parsed from `NEXT_PUBLIC_SUPABASE_URL` (same pattern as
   `scripts/verify-role-escalation-closed.mjs`).
2. **Vendor docs:** for each `manager_vendor_records` row with
   `vendorDocuments[].storagePath` starting with `vendor-documents/`:
   - `storage.copy` (or download + upload) from `listing-photos` → `vendor-documents`
     at the **same path**
   - verify download works via service role on the new bucket
   - delete the `listing-photos` copy only after verify
3. **Bug feedback:** for each `portal_bug_feedback_records` row with
   `attachmentUrls` containing `/listing-photos/` and path segment `bug-feedback/`:
   - parse object path from URL
   - copy to `bug-feedback-attachments` at the same path
   - rewrite `attachmentUrls` to `/api/bug-feedback-attachments?path=…`
   - upsert `row_data` + top-level columns via service role
4. **Log** moved / skipped / failed counts; exit non-zero if any copy failed.

## What breaks during the move

| Window | Risk |
| --- | --- |
| After deploy, before backfill | **New** uploads are private; **old** vendor docs still readable via public URL if the path was leaked. Bug-feedback thumbnails using old public URLs keep working until URLs are rewritten. |
| During copy, before DB update | Old public URL still works; new private bucket has a duplicate — safe. |
| After copy, before delete from `listing-photos` | Both URLs work — safe. |
| After delete from `listing-photos`, before bug-feedback URL rewrite | **Broken images** in feedback UI for affected rows until `attachmentUrls` are updated. Run copy + DB update in one transaction per row, or rewrite URLs before deleting sources. |
| Vendor docs | UI already uses `/api/vendor/documents/file`; after copy to `vendor-documents` bucket the route must be deployed **first** so reads hit the new bucket. Old public URLs for vendor paths become stale after delete from `listing-photos`. |

## Rollback

- Keep a CSV log of `{bucket, path, sourceUrl}` before delete.
- Re-upload to `listing-photos` from log if a rollback is required (restores public
  exposure — only for emergency).

## Verification after backfill

- Spot-check vendor Documents panel: view/download each kind.
- Spot-check admin Feedback tab: attachment thumbnails for pre-migration reports.
- Confirm no remaining `vendor-documents/` or `bug-feedback/` objects in
  `listing-photos` via Storage dashboard or `storage.list` with prefix filter.
