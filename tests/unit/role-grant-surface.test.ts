import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Privilege-escalation regression guard.
 *
 * `public` is exposed through PostgREST (`supabase/config.toml`), so anything
 * `anon` / `authenticated` may write is reachable from a browser console with
 * the public anon key. On these three tables that was a direct route to admin:
 * the RLS policies constrained only *which row* you may write, never which
 * column or value, so `update profiles set role='admin' where id=<me>` passed
 * `USING (auth.uid() = id)` cleanly.
 *
 * The fix is 20260722120000_lock_role_grant_surface.sql. This test asserts the
 * *end state* across the whole migration directory, so a later migration that
 * re-adds a write policy or re-grants DML fails here rather than silently
 * reopening the hole. It is a static check — the live proof is
 * `scripts/verify-role-escalation-closed.mjs`, which runs the real attack
 * against a real database.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** Tables whose contents are read as a trust signal by the auth layer. */
const TRUST_TABLES = ["profiles", "profile_roles", "vendor_invites"] as const;

const CLIENT_ROLES = ["anon", "authenticated"] as const;

type Statement = { sql: string; file: string };

function loadStatements(): Statement[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const statements: Statement[] = [];
  for (const file of files) {
    const raw = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    // Strip line comments so commented-out SQL and the explanatory prose in
    // migration headers never register as statements.
    const stripped = raw
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    for (const chunk of stripped.split(";")) {
      const sql = chunk.trim().replace(/\s+/g, " ");
      if (sql) statements.push({ sql, file });
    }
  }
  return statements;
}

const STATEMENTS = loadStatements();

describe("role-grant surface on trust tables", () => {
  it("reads the migration directory", () => {
    expect(STATEMENTS.length).toBeGreaterThan(100);
  });

  for (const table of TRUST_TABLES) {
    describe(`public.${table}`, () => {
      it("ends with no INSERT/UPDATE/DELETE grant to anon or authenticated", () => {
        // Replay grants/revokes in migration order and check the final state.
        const held = new Map<string, Set<string>>(CLIENT_ROLES.map((r) => [r, new Set<string>()]));

        for (const { sql } of STATEMENTS) {
          const m = /^(grant|revoke)\s+(.+?)\s+(?:on|ON)\s+(.+?)\s+(?:to|TO|from|FROM)\s+(.+)$/i.exec(sql);
          if (!m) continue;
          const [, verb, privsRaw, targetRaw, granteesRaw] = m;

          const target = targetRaw.toLowerCase().replace(/\btable\b/g, "").replace(/public\./g, "").trim();
          const targetsThisTable =
            target === table || target.split(/\s*,\s*/).map((t) => t.trim()).includes(table);
          // `GRANT ... ON ALL TABLES IN SCHEMA public` also lands on this table.
          const targetsAllTables = /all\s+tables\s+in\s+schema\s+public/i.test(targetRaw);
          if (!targetsThisTable && !targetsAllTables) continue;

          const grantees = granteesRaw.toLowerCase().split(/\s*,\s*/).map((g) => g.trim().replace(/[";]/g, ""));
          const privs = privsRaw.toUpperCase();
          const writes = ["INSERT", "UPDATE", "DELETE"].filter(
            (p) => privs.includes(p) || /\ball\b/i.test(privsRaw),
          );

          for (const role of CLIENT_ROLES) {
            if (!grantees.includes(role)) continue;
            for (const p of writes) {
              if (verb.toLowerCase() === "grant") held.get(role)!.add(p);
              else held.get(role)!.delete(p);
            }
          }
        }

        for (const role of CLIENT_ROLES) {
          expect(
            [...held.get(role)!].sort(),
            `${role} must hold no write privilege on ${table} — a self-service write here is a self-service admin grant`,
          ).toEqual([]);
        }
      });

      it("ends with no policy permitting a client-side write", () => {
        // A policy is only reachable if the grant exists, but a future migration
        // that re-grants DML must not find a permissive write policy waiting.
        const live = new Map<string, string>();

        for (const { sql, file } of STATEMENTS) {
          const drop = /^drop\s+policy\s+(?:if\s+exists\s+)?"?([\w-]+)"?\s+on\s+(?:public\.)?"?(\w+)"?/i.exec(sql);
          if (drop && drop[2].toLowerCase() === table) {
            live.delete(drop[1].toLowerCase());
            continue;
          }
          const create = /^create\s+policy\s+"?([\w-]+)"?\s+on\s+(?:public\.)?"?(\w+)"?\s+(.*)$/i.exec(sql);
          if (create && create[2].toLowerCase() === table) {
            live.set(create[1].toLowerCase(), `${create[3]} [${file}]`);
          }
        }

        const writePolicies = [...live.entries()].filter(([, body]) =>
          /\bfor\s+(all|insert|update|delete)\b/i.test(body),
        );

        expect(
          writePolicies.map(([name, body]) => `${name}: ${body}`),
          `${table} must expose only SELECT policies to client roles; writes belong to service-role routes`,
        ).toEqual([]);
      });

      it("keeps an owner-scoped SELECT policy so the app can still read", () => {
        const live = new Map<string, string>();
        for (const { sql } of STATEMENTS) {
          const drop = /^drop\s+policy\s+(?:if\s+exists\s+)?"?([\w-]+)"?\s+on\s+(?:public\.)?"?(\w+)"?/i.exec(sql);
          if (drop && drop[2].toLowerCase() === table) {
            live.delete(drop[1].toLowerCase());
            continue;
          }
          const create = /^create\s+policy\s+"?([\w-]+)"?\s+on\s+(?:public\.)?"?(\w+)"?\s+(.*)$/i.exec(sql);
          if (create && create[2].toLowerCase() === table) {
            live.set(create[1].toLowerCase(), create[3]);
          }
        }
        const selects = [...live.values()].filter((body) => /\bfor\s+select\b/i.test(body));
        expect(selects.length, `${table} lost its SELECT policy — the portal reads this table on boot`).toBeGreaterThan(0);
        // Every surviving SELECT policy must still be scoped to the caller.
        for (const body of selects) {
          expect(body, `${table} SELECT policy must stay scoped to auth.uid()`).toMatch(/auth\.uid\(\)/);
        }
      });
    });
  }

  it("vendor_invites.expires_at is NOT NULL so redemption cannot skip the TTL", () => {
    const setsNotNull = STATEMENTS.some(({ sql }) =>
      /alter\s+table\s+(?:public\.)?vendor_invites\s+alter\s+column\s+expires_at\s+set\s+not\s+null/i.test(sql),
    );
    expect(setsNotNull).toBe(true);
  });
});
