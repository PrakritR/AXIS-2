import type { InboxScopedContact } from "@/data/inbox-scoped-directory";

/** To-section buckets in the scoped compose modal (excludes manager-only "other"). */
export type InboxComposeDirectoryCategory = "resident" | "management" | "admin" | "vendor";

/** Manager portal: management = co-managers; vendor only when the directory has vendors. */
export function composeDirectoryCategories(
  portal: "resident" | "manager" | "vendor",
  contacts: InboxScopedContact[],
): InboxComposeDirectoryCategory[] {
  if (portal === "manager") {
    const cats: InboxComposeDirectoryCategory[] = ["resident"];
    if (contacts.some((c) => c.role === "manager")) cats.push("management");
    cats.push("admin");
    if (contacts.some((c) => c.role === "vendor")) cats.push("vendor");
    return cats;
  }
  if (portal === "vendor") return ["management", "admin"];
  return ["resident", "management", "admin"];
}

/** PropLane admin is a single fixed recipient — no second picker step. */
export function isAdminOnlyDirectorySelection(categories: InboxComposeDirectoryCategory[]): boolean {
  return categories.length === 1 && categories[0] === "admin";
}

export function mergeAdminComposePersonKey<T extends string>(
  categories: InboxComposeDirectoryCategory[],
  keys: T[],
): T[] {
  if (!categories.includes("admin")) {
    return keys.filter((k) => k !== "admin");
  }
  if (keys.includes("admin" as T)) return keys;
  return [...keys, "admin" as T];
}
