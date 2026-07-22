// The SMS conversation-identity BACKFILL, evaluated as a decision table.
//
// `20260721210000_sms_conversation_identity.sql` stamps every pre-existing row
// with a `counterparty_role`, and that stamp is durable — the read path never
// recomputes it. Getting the branch ORDER wrong is therefore not a cosmetic
// SQL nit: `claw_messaging_threads` holds exactly one MUTABLE row per
// (manager, phone) whose `topic` is overwritten on every thread touch, so a
// topic-first `case` retroactively applies TODAY's topic to YEARS of history.
// A current resident whose most recent Claw thread happens to be `leasing`
// gets every message re-labelled `prospect`, and
// `fetchManagerSmsConversations` deliberately refuses to fold a prospect
// thread into a directory resident's conversation — the history silently
// disappears from the named thread and resurfaces as an unnamed phone number.
//
// These tests read the real migration files and evaluate their `case`
// expressions against fixtures, so they fail if the ordering ever regresses.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

function migrationSource(fragment: string): { name: string; sql: string } {
  const name = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && f.includes(fragment))
    .sort()
    .at(-1);
  if (!name) throw new Error(`no migration matching "${fragment}"`);
  return { name, sql: readFileSync(path.join(MIGRATIONS_DIR, name), "utf8") };
}

/** Facts a single stored SMS row can carry at backfill time. */
type RowFacts = {
  /** The row itself is linked to an Axis account (resident_user_id / matched_sender_user_id). */
  linkedAccount: boolean;
  /** A Claw thread exists for (manager, phone) and its CURRENT topic is 'leasing'. */
  leasingTopic: boolean;
  /** A Claw thread exists for (manager, phone), any topic. */
  anyThread: boolean;
};

type Branch = { predicate: keyof RowFacts | "always"; role: string };

/**
 * Extract the ordered `when <cond> then '<role>'` branches of a
 * `set counterparty_role = case … end` block and classify each condition by
 * the fact it tests. This evaluates the migration's real decision ORDER
 * rather than matching its text.
 */
function roleBranches(sql: string): Branch[][] {
  const blocks = [...sql.matchAll(/set\s+counterparty_role\s*=\s*case([\s\S]*?)\bend\b/gi)].map(
    (m) => m[1] ?? "",
  );
  expect(blocks.length, "expected one counterparty_role backfill per table").toBe(2);

  return blocks.map((block) => {
    const branches: Branch[] = [];
    for (const m of block.matchAll(/when\s+([\s\S]*?)\s+then\s+'(\w+)'/gi)) {
      const cond = (m[1] ?? "").toLowerCase();
      const role = m[2] ?? "";
      const predicate: Branch["predicate"] = cond.includes("topic = 'leasing'")
        ? "leasingTopic"
        : /(resident_user_id|matched_sender_user_id)\s+is\s+not\s+null/.test(cond)
          ? "linkedAccount"
          : cond.includes("claw_messaging_threads")
            ? "anyThread"
            : "always";
      branches.push({ predicate, role });
    }
    expect(branches.length, "expected at least the leasing/linked/thread branches").toBeGreaterThan(2);
    return branches;
  });
}

function evaluate(branches: Branch[], facts: RowFacts): string {
  for (const branch of branches) {
    if (branch.predicate === "always" || facts[branch.predicate]) return branch.role;
  }
  return "unknown";
}

describe("sms conversation-identity backfill role classification", () => {
  const { name, sql } = migrationSource("sms_conversation_identity.sql");
  const tables = roleBranches(sql);

  it(`classifies an account-linked row as a resident even when today's Claw topic is 'leasing' (${name})`, () => {
    for (const branches of tables) {
      expect(
        evaluate(branches, { linkedAccount: true, leasingTopic: true, anyThread: true }),
      ).toBe("resident");
    }
  });

  it("still classifies an UNLINKED row on a leasing thread as a prospect", () => {
    for (const branches of tables) {
      expect(
        evaluate(branches, { linkedAccount: false, leasingTopic: true, anyThread: true }),
      ).toBe("prospect");
    }
  });

  it("classifies an unlinked row on a non-leasing Claw thread as a resident", () => {
    for (const branches of tables) {
      expect(
        evaluate(branches, { linkedAccount: false, leasingTopic: false, anyThread: true }),
      ).toBe("resident");
    }
  });

  it("leaves a row with no signal at all as unknown", () => {
    for (const branches of tables) {
      expect(
        evaluate(branches, { linkedAccount: false, leasingTopic: false, anyThread: false }),
      ).toBe("unknown");
    }
  });
});

describe("sms conversation-identity repair migration", () => {
  it("re-labels already-backfilled prospect rows that are account-linked, and sorts after the production head", () => {
    const { name, sql } = migrationSource("sms_conversation_identity_role_repair.sql");
    // Production records migrations under APPLY-TIME versions; its head was
    // 20260721200505, so anything new must sort strictly after it.
    expect(name.slice(0, 14) > "20260721200505").toBe(true);

    const lower = sql.toLowerCase();
    for (const idColumn of ["resident_user_id", "matched_sender_user_id"]) {
      expect(lower).toContain(`${idColumn} is not null`);
    }
    expect(lower).toContain("counterparty_role = 'prospect'");
    expect(lower).toContain("conversation_key");
  });
});
