#!/usr/bin/env node
/**
 * Live RLS/grant probe for the privilege-escalation surface.
 *
 * Signs up a throwaway `resident` through the ordinary auth flow, then — using
 * ONLY that user's JWT and the public anon key, exactly as a browser console
 * would — attempts every write that would grant elevated privilege. Each probe
 * MUST be denied.
 *
 * Usage:
 *   node --env-file=.env scripts/verify-role-escalation-closed.mjs
 *
 * Exit code 0 = every escalation probe was denied (surface is closed).
 * Exit code 1 = at least one probe succeeded (privilege escalation is OPEN).
 *
 * Point this at the dev/test project only — it creates and deletes a user.
 * See docs/database-environments.md; never run it against production.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !anonKey || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const stamp = process.env.PROBE_STAMP?.trim() || String(process.hrtime.bigint());
const email = `privesc-probe-${stamp}@axis-security-probe.invalid`;
const password = `Probe!${stamp}aA1`;

const svcHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

async function admin(path, init = {}) {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...svcHeaders, ...(init.headers ?? {}) } });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** A write attempted with the attacker's own JWT + the public anon key. */
async function asAttacker(token, path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

let userId = null;
const results = [];

function record(name, res, { succeededWhen }) {
  const escalated = succeededWhen(res);
  results.push({ name, status: res.status, escalated, detail: JSON.stringify(res.body).slice(0, 160) });
  return escalated;
}

/** PostgREST answers 2xx on a permitted write; a denied write is 401/403/404/42501. */
const wroteSomething = (res) => res.status >= 200 && res.status < 300;

try {
  // ── Set up a throwaway ordinary resident ────────────────────────────────────
  const created = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (created.status >= 300) throw new Error(`could not create probe user: ${JSON.stringify(created.body)}`);
  userId = created.body.id;

  await admin("/rest/v1/profiles", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: userId, email, role: "resident" }),
  });
  await admin("/rest/v1/profile_roles", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: userId, role: "resident" }),
  });

  const signedIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await signedIn.json();
  const token = session.access_token;
  if (!token) throw new Error(`could not sign in probe user: ${JSON.stringify(session)}`);

  // ── The escalation probes ───────────────────────────────────────────────────
  record(
    "profiles.role -> admin (UPDATE)",
    await asAttacker(token, `profiles?id=eq.${userId}`, { method: "PATCH", body: JSON.stringify({ role: "admin" }) }),
    { succeededWhen: wroteSomething },
  );

  record(
    "profiles.role -> manager (UPDATE)",
    await asAttacker(token, `profiles?id=eq.${userId}`, { method: "PATCH", body: JSON.stringify({ role: "manager" }) }),
    { succeededWhen: wroteSomething },
  );

  record(
    "profiles trust columns (sms_from_number / phone_verified_at)",
    await asAttacker(token, `profiles?id=eq.${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ sms_from_number: "+15555550100", phone_verified_at: new Date().toISOString() }),
    }),
    { succeededWhen: wroteSomething },
  );

  // `filterAdminUserIds` also treats PRIMARY_ADMIN_EMAIL as always-admin, and
  // `profiles.email` carries no unique constraint — so claiming the ops email
  // is a third, independent route to admin that never touches `role`.
  record(
    "profiles.email -> primary admin email (UPDATE)",
    await asAttacker(token, `profiles?id=eq.${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ email: "founders@axis-seattle-housing.com" }),
    }),
    { succeededWhen: wroteSomething },
  );

  record(
    "profile_roles admin grant (INSERT)",
    await asAttacker(token, "profile_roles", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, role: "admin" }),
    }),
    { succeededWhen: wroteSomething },
  );

  record(
    "profile_roles own row erase (DELETE)",
    await asAttacker(token, `profile_roles?user_id=eq.${userId}&role=eq.resident`, { method: "DELETE" }),
    { succeededWhen: wroteSomething },
  );

  record(
    "vendor_invites forged invite (INSERT, null expiry)",
    await asAttacker(token, "vendor_invites", {
      method: "POST",
      body: JSON.stringify({
        manager_user_id: userId,
        vendor_email: "victim@example.com",
        invite_token: `attacker-chosen-${stamp}`,
        expires_at: null,
        status: "pending",
      }),
    }),
    { succeededWhen: wroteSomething },
  );

  // Reading your own rows must keep working — the fix must not break the app.
  const ownRead = await asAttacker(token, `profiles?id=eq.${userId}&select=id,role`);
  const ownRolesRead = await asAttacker(token, `profile_roles?user_id=eq.${userId}&select=role`);
  const readsOk = ownRead.status === 200 && ownRolesRead.status === 200;

  // ── Ground truth: what does the database actually hold now? ──────────────────
  const after = await admin(`/rest/v1/profiles?id=eq.${userId}&select=role,email,sms_from_number,phone_verified_at`);
  const afterRoles = await admin(`/rest/v1/profile_roles?user_id=eq.${userId}&select=role`);
  const afterInvites = await admin(`/rest/v1/vendor_invites?manager_user_id=eq.${userId}&select=id`);

  console.log("\nProbe results (each MUST be denied):");
  for (const r of results) {
    console.log(`  ${r.escalated ? "OPEN  ✗" : "denied ✓"}  [${r.status}] ${r.name}\n            ${r.detail}`);
  }
  console.log("\nDatabase state afterwards (service-role read, ground truth):");
  console.log(`  profiles row .......... ${JSON.stringify(after.body?.[0] ?? null)}`);
  console.log(`  profile_roles rows .... ${JSON.stringify(afterRoles.body ?? null)}`);
  console.log(`  vendor_invites rows ... ${JSON.stringify(afterInvites.body ?? null)}`);
  console.log(`  own-row SELECT still works ... ${readsOk ? "yes ✓" : "NO ✗ (fix broke legitimate reads)"}`);

  const escalations = results.filter((r) => r.escalated);
  const persistedAdmin =
    after.body?.[0]?.role !== "resident" ||
    after.body?.[0]?.email !== email ||
    (afterRoles.body ?? []).some((r) => r.role !== "resident");

  if (escalations.length || persistedAdmin || !readsOk) {
    console.error(
      `\nFAIL — ${escalations.length} escalation probe(s) succeeded` +
        `${persistedAdmin ? ", elevated state persisted" : ""}` +
        `${readsOk ? "" : ", legitimate self-reads broken"}.`,
    );
    process.exitCode = 1;
  } else {
    console.log("\nPASS — every escalation probe was denied and self-reads still work.");
  }
} catch (error) {
  console.error(`\nERROR: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 2;
} finally {
  if (userId) {
    await admin(`/rest/v1/vendor_invites?manager_user_id=eq.${userId}`, { method: "DELETE" }).catch(() => {});
    await admin(`/rest/v1/profile_roles?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => {});
    await admin(`/rest/v1/profiles?id=eq.${userId}`, { method: "DELETE" }).catch(() => {});
    await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" }).catch(() => {});
    console.log(`\nCleaned up probe user ${userId}.`);
  }
}
