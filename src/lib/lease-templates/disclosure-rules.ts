import { z } from "zod";
import disclosureClauseRules from "../../../leases/disclosure-clause-rules.json";
import {
  jurisdictionRuleScopes,
  type JurisdictionKey,
} from "@/lib/lease-jurisdiction";

const triggerLogicSchema = z.union([
  z.object({ always: z.literal(true) }).strict(),
  z.object({ event: z.string().min(1) }).strict(),
  z
    .object({
      field: z.string().min(1),
      op: z.enum(["==", "<", ">", ">=", "in"]),
      value: z.unknown(),
    })
    .strict(),
]);

const ruleSchema = z
  .object({
    id: z.string().min(1),
    jurisdiction: z.string().min(1),
    applies_to: z.array(z.string().min(1)),
    lifecycle: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    trigger: z.string().min(1),
    trigger_logic: triggerLogicSchema,
    statute_cite: z.string(),
    cite_verified: z.boolean(),
    source_url: z.string(),
    verbatim_required: z.boolean(),
    verbatim_text: z.string().nullable(),
    attachment: z.string().nullable(),
    effective_date: z.string().nullable(),
    template_section: z.string().nullable(),
    font_min_pt: z.number().positive().optional(),
    sibling_rule_id: z.string().min(1).optional(),
    validator: z.unknown().optional(),
    validators: z.array(z.unknown()).optional(),
    notes: z.string(),
  })
  .strict();

const disclosureCatalogSchema = z
  .object({
    schema_version: z.string().min(1),
    generated_date: z.string().min(1),
    scope: z.string().min(1),
    legal_review_required: z.boolean(),
    global_notes: z.array(z.string()),
    jurisdiction_inheritance: z.record(z.array(z.string().min(1))),
    trigger_field_dictionary: z.record(
      z
        .object({
          type: z.string().min(1),
          description: z.string().min(1),
          values: z.array(z.string()).optional(),
        })
        .strict(),
    ),
    lifecycle_events: z.record(z.string()),
    rules: z.array(ruleSchema).min(1),
  })
  .strict();

export type DisclosureRule = z.infer<typeof ruleSchema>;
export type DisclosureCatalog = z.infer<typeof disclosureCatalogSchema>;

/**
 * The one policy switch for legal-review status. Unverified citations are intentionally
 * excluded from generated leases until a reviewer verifies the catalog entry. They remain
 * visible in the evaluation result so that exclusion cannot be mistaken for coverage.
 */
export const DISCLOSURE_RULE_POLICY = {
  includeUnverifiedRules: false,
} as const;

export const disclosureRulesCatalog: DisclosureCatalog = disclosureCatalogSchema.parse(disclosureClauseRules);

export function parseDisclosureRulesCatalog(value: unknown): DisclosureCatalog {
  return disclosureCatalogSchema.parse(value);
}

export type DisclosureMergeFields = Record<string, unknown>;

export type DisclosureRuleEvaluationInput = {
  jurisdiction: JurisdictionKey;
  fields: DisclosureMergeFields;
  lifecycle?: string;
  catalog?: DisclosureCatalog | unknown;
  policy?: { includeUnverifiedRules?: boolean };
};

type TriggerResult =
  | { state: "matched" }
  | { state: "not_matched" }
  | { state: "unknown"; field: string };

function isUnknownFieldValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

function matchesComparison(value: unknown, op: "==" | "<" | ">" | ">=" | "in", expected: unknown): boolean {
  if (op === "==") return value === expected;
  if (op === "in") return Array.isArray(expected) && expected.includes(value);

  if (typeof value === "number" && typeof expected === "number") {
    if (op === "<") return value < expected;
    if (op === ">") return value > expected;
    return value >= expected;
  }
  if (typeof value === "string" && typeof expected === "string") {
    if (op === "<") return value < expected;
    if (op === ">") return value > expected;
    return value >= expected;
  }
  return false;
}

function evaluateTrigger(rule: DisclosureRule, fields: DisclosureMergeFields, lifecycle: string): TriggerResult {
  const logic = rule.trigger_logic;
  if ("always" in logic) return { state: "matched" };
  if ("event" in logic) return { state: fields.event === logic.event || lifecycle === logic.event ? "matched" : "not_matched" };

  const value = fields[logic.field];
  if (isUnknownFieldValue(value)) return { state: "unknown", field: logic.field };
  return matchesComparison(value, logic.op, logic.value) ? { state: "matched" } : { state: "not_matched" };
}

function appliesInScope(rule: DisclosureRule, scopes: readonly string[]): boolean {
  // `jurisdiction` is the primary catalog scope. `applies_to` adds an explicitly named
  // destination scope, which lets a future rule target a city without duplicating it.
  return scopes.includes(rule.jurisdiction) || rule.applies_to.some((scope) => scopes.includes(scope));
}

export type UnknownDisclosureTrigger = {
  rule: DisclosureRule;
  field: string;
};

export type DisclosureRuleEvaluation = {
  jurisdiction: JurisdictionKey;
  scopes: string[];
  lifecycle: string;
  firedRules: DisclosureRule[];
  unknownTriggers: UnknownDisclosureTrigger[];
  triggeredUnverifiedRules: DisclosureRule[];
  unknownUnverifiedTriggers: UnknownDisclosureTrigger[];
  excludedUnverifiedRuleCount: number;
  attachmentRequirements: DisclosureRule[];
  contentGaps: DisclosureRule[];
  nonLeaseLifecycleRules: DisclosureRule[];
  canCompleteLease: boolean;
};

/**
 * Evaluate data from the JSON catalog. The return value deliberately preserves unknown
 * trigger values instead of coercing them to false, which keeps incomplete lease data from
 * silently suppressing a disclosure.
 */
export function evaluateDisclosureRules(input: DisclosureRuleEvaluationInput): DisclosureRuleEvaluation {
  const catalog = input.catalog ? parseDisclosureRulesCatalog(input.catalog) : disclosureRulesCatalog;
  const lifecycle = input.lifecycle ?? "lease_signing";
  const scopes = jurisdictionRuleScopes(input.jurisdiction);
  const scopedRules = catalog.rules.filter((rule) => appliesInScope(rule, scopes));
  const leaseRules = scopedRules.filter((rule) => rule.lifecycle === lifecycle);
  const includeUnverified = input.policy?.includeUnverifiedRules ?? DISCLOSURE_RULE_POLICY.includeUnverifiedRules;
  const firedRules: DisclosureRule[] = [];
  const unknownTriggers: UnknownDisclosureTrigger[] = [];
  const triggeredUnverifiedRules: DisclosureRule[] = [];
  const unknownUnverifiedTriggers: UnknownDisclosureTrigger[] = [];

  for (const rule of leaseRules) {
    const trigger = evaluateTrigger(rule, input.fields, lifecycle);
    if (!rule.cite_verified && !includeUnverified) {
      if (trigger.state === "matched") triggeredUnverifiedRules.push(rule);
      if (trigger.state === "unknown") unknownUnverifiedTriggers.push({ rule, field: trigger.field });
      continue;
    }
    if (trigger.state === "matched") firedRules.push(rule);
    if (trigger.state === "unknown") unknownTriggers.push({ rule, field: trigger.field });
  }

  const attachmentRequirements = firedRules.filter((rule) => Boolean(rule.attachment));
  const contentGaps = firedRules.filter(
    (rule) => Boolean(rule.template_section) && (!rule.verbatim_required || !rule.verbatim_text),
  );
  return {
    jurisdiction: input.jurisdiction,
    scopes,
    lifecycle,
    firedRules,
    unknownTriggers,
    triggeredUnverifiedRules,
    unknownUnverifiedTriggers,
    excludedUnverifiedRuleCount: leaseRules.filter((rule) => !rule.cite_verified).length,
    attachmentRequirements,
    contentGaps,
    nonLeaseLifecycleRules: scopedRules.filter((rule) => rule.lifecycle !== lifecycle),
    canCompleteLease:
      unknownTriggers.length === 0 && unknownUnverifiedTriggers.length === 0 && attachmentRequirements.length === 0,
  };
}

/** Catalog-authored verbatim body. Do not escape, transform, or summarize this content. */
export function disclosureVerbatimHtml(rules: readonly DisclosureRule[]): string {
  return rules
    .filter((rule) => rule.verbatim_required && rule.verbatim_text)
    .map((rule) => {
      const font = rule.font_min_pt ? ` style="font-size:${rule.font_min_pt}pt"` : "";
      return `<p data-disclosure-rule="${rule.id}"${font}>${rule.verbatim_text}</p>`;
    })
    .join("\n");
}

export function disclosureVerbatimHtmlForSection(
  evaluation: DisclosureRuleEvaluation,
  templateSection: string,
): string {
  return disclosureVerbatimHtml(evaluation.firedRules.filter((rule) => rule.template_section === templateSection));
}
