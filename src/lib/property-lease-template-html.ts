import {
  applyLeaseSectionBodyEdits,
  parseLeaseHtmlSections,
  type LeaseHtmlSection,
} from "@/lib/lease-html-sections";
import { buildPropertyLeasePreview } from "@/lib/property-lease-preview";
import { resolvePropertyLeaseEditHtml } from "@/lib/property-lease-edit";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  readPropertyLeaseTemplates,
  type PropertyLeaseTemplate,
  type PropertyLeaseTemplateKind,
} from "@/lib/property-lease-templates";
import { leaseSourceFromDraft, type PropertyLeaseSource } from "@/lib/property-lease-source";
import { isEditableLeaseSection } from "@/lib/lease-section-text";

export function resolvePropertyLeaseTemplateHtml(args: {
  sub: ManagerListingSubmissionV1;
  template: PropertyLeaseTemplate;
  hint?: { buildingName?: string; unitLabel?: string };
}): string {
  const source: PropertyLeaseSource = leaseSourceFromDraft({
    leaseConfigMode: args.template.leaseConfigMode,
    leaseCustomKind: args.template.leaseCustomKind,
  });
  return resolvePropertyLeaseEditHtml({
    sub: args.sub,
    draft: args.template,
    source,
    templateKind: args.template.kind,
    hint: args.hint,
  });
}

export function readPropertyLeaseTemplateSections(html: string): LeaseHtmlSection[] {
  return parseLeaseHtmlSections(html);
}

export function applyPropertyLeaseTemplateSectionEdit(
  html: string,
  sectionId: string,
  bodyHtml: string,
): string {
  return applyLeaseSectionBodyEdits(html, { [sectionId]: bodyHtml });
}

export function findPropertyLeaseTemplate(
  sub: ManagerListingSubmissionV1,
  templateKind: PropertyLeaseTemplateKind,
): PropertyLeaseTemplate | null {
  const templates = readPropertyLeaseTemplates(sub);
  return (
    templates.find((t) => t.kind === templateKind) ??
    templates.find((t) => t.listingSeedKey === (templateKind === "short-term" ? "short-term" : "primary")) ??
    null
  );
}

export function propertyLeaseTemplateSectionIsEditable(section: LeaseHtmlSection): boolean {
  return isEditableLeaseSection(section);
}

export function baselinePropertyLeaseTemplateHtml(
  sub: ManagerListingSubmissionV1,
  templateKind: PropertyLeaseTemplateKind,
): string {
  const preview = buildPropertyLeasePreview(sub, { templateKind });
  return preview.html?.trim() ?? "";
}
