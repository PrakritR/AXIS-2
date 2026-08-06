"use client";

import {
  extractDisclosureReviewFromLeaseHtml,
  LEASE_AI_REVIEW_DISCLAIMER,
  reviewPropertyLeaseDocument,
} from "@/lib/property-lease-document-display";
import { cn } from "@/lib/utils";

type Props = {
  html: string;
  className?: string;
};

/** AI + disclosure notices shown outside the lease document body in property editors. */
export function PropertyLeaseDocumentNotice({ html, className }: Props) {
  const disclosureHtml = extractDisclosureReviewFromLeaseHtml(html);
  const review = reviewPropertyLeaseDocument(html);

  return (
    <div className={cn("space-y-2", className)}>
      <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm leading-relaxed text-amber-950">
        <strong className="font-semibold">AI-generated draft.</strong> {LEASE_AI_REVIEW_DISCLAIMER}
      </p>
      {disclosureHtml ? (
        <div
          className="rounded-xl border border-border bg-accent/40 px-3 py-2 text-sm leading-relaxed text-foreground [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: disclosureHtml }}
        />
      ) : null}
      {review.issues.length > 0 && !disclosureHtml ? (
        <p className="text-sm text-muted">{review.issues[0]}</p>
      ) : null}
    </div>
  );
}

export function propertyLeaseNeedsAssistantReview(html: string): boolean {
  return reviewPropertyLeaseDocument(html).issues.length > 0;
}
