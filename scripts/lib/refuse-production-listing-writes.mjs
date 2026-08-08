/**
 * Fail closed when a script would write `manager_property_records` (listing rows)
 * against the production Supabase project. Agents and local tooling must use the
 * dev/test project unless the captain explicitly opts in.
 *
 * Set ALLOW_PRODUCTION_LISTING_WRITE=1 only for a deliberate, captain-approved
 * production change — never for routine agent work or schema experiments.
 */
export function refuseProductionListingWrites(supabaseUrl, label = "This script") {
  const url = (supabaseUrl ?? "").trim();
  if (!url) return;

  const prodRef = (process.env.AXIS_PROD_SUPABASE_REF ?? "qahnczmilgptcedaqype").trim();
  const targetsProduction = url.includes(`${prodRef}.supabase.co`);
  if (!targetsProduction) return;

  if (process.env.ALLOW_PRODUCTION_LISTING_WRITE === "1") return;

  console.error(
    `${label} refuses to run: NEXT_PUBLIC_SUPABASE_URL points at the production ` +
      `Supabase project (${prodRef}). Listing rows (including 5259 Brooklyn) must ` +
      `not be changed from agent tooling. Use the dev/test project (.env / .env.local) ` +
      `or set ALLOW_PRODUCTION_LISTING_WRITE=1 only with explicit captain approval.`,
  );
  process.exit(1);
}
