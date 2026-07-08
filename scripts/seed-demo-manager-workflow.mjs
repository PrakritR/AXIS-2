#!/usr/bin/env node
/**
 * Rich workflow DB seeding for dev/test was removed.
 * E2E still uses tests/helpers/seed-test-db.mjs for minimal test accounts.
 * Product exploration uses /demo (in-browser sandbox).
 */
console.error(
  "seed-demo-manager-workflow.mjs is disabled.\n" +
    "  E2E: npm run test:seed\n" +
    "  Demo UI: visit /demo on the site",
);
process.exit(1);
