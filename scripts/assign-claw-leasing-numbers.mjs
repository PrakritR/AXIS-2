#!/usr/bin/env node
/**
 * @deprecated Use scripts/backfill-manager-work-numbers.ts instead.
 *
 * This script stamped the shared Claw Messenger line onto manager profiles.
 * Public listing CTAs now require per-manager Twilio work numbers.
 *
 * Migration:
 *   npm run admin:backfill-work-numbers
 *   # or POST /api/admin/backfill-manager-work-numbers (admin session)
 */

console.error(
  "assign-claw-leasing-numbers.mjs is deprecated. Run: npm run admin:backfill-work-numbers",
);
process.exit(1);
