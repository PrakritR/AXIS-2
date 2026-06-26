import type { RentalWizardFormState } from "@/lib/rental-application/types";
import type {
  ApplicationScreeningReport,
  ScreeningCreditRating,
  ScreeningProviderReport,
  ScreeningRecommendation,
} from "@/lib/screening/types";

export type RecommendationInput = {
  vendor: ScreeningProviderReport;
  application?: RentalWizardFormState | null;
  monthlyRentCents?: number | null;
};

const CREDIT_EXCELLENT = 740;
const CREDIT_GOOD = 670;
const CREDIT_FAIR = 580;

export function creditRatingFromScore(score: number | null | undefined): ScreeningCreditRating {
  if (score == null || !Number.isFinite(score)) return "unknown";
  if (score >= CREDIT_EXCELLENT) return "excellent";
  if (score >= CREDIT_GOOD) return "good";
  if (score >= CREDIT_FAIR) return "fair";
  return "poor";
}

function parseMonthlyIncome(application?: RentalWizardFormState | null): number | null {
  const raw = application?.monthlyIncome?.trim().replace(/[$,]/g, "") ?? "";
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function incomeRentRatio(monthlyIncome: number | null, monthlyRentCents: number | null | undefined): number | null {
  if (!monthlyIncome || !monthlyRentCents || monthlyRentCents <= 0) return null;
  const rent = monthlyRentCents / 100;
  return monthlyIncome / rent;
}

export function buildScreeningRecommendation(input: RecommendationInput): Pick<
  ApplicationScreeningReport,
  "recommendation" | "pros" | "cons" | "summary" | "adverseActionRequired" | "creditRating"
> {
  const { vendor, application, monthlyRentCents } = input;
  const pros: string[] = [];
  const cons: string[] = [];

  const creditScore = vendor.creditScore ?? null;
  const creditRating = vendor.creditRating ?? creditRatingFromScore(creditScore);
  const criminalFlags = vendor.criminalFlags ?? 0;
  const evictionFlags = vendor.evictionFlags ?? 0;
  const income = parseMonthlyIncome(application);
  const rentRatio = incomeRentRatio(income, monthlyRentCents);

  if (creditRating === "excellent" || creditRating === "good") {
    pros.push(creditScore ? `Credit score ${creditScore} (${creditRating}).` : `Credit profile rated ${creditRating}.`);
  } else if (creditRating === "fair") {
    cons.push(creditScore ? `Credit score ${creditScore} is below preferred range.` : "Credit profile is only fair.");
  } else if (creditRating === "poor") {
    cons.push(creditScore ? `Low credit score (${creditScore}).` : "Credit check returned a poor rating.");
  }

  if (criminalFlags === 0) {
    pros.push("No criminal records flagged in the vendor report.");
  } else {
    cons.push(`${criminalFlags} criminal record flag${criminalFlags === 1 ? "" : "s"} on the vendor report.`);
  }

  if (evictionFlags === 0) {
    pros.push("No eviction records flagged.");
  } else {
    cons.push(`${evictionFlags} eviction-related flag${evictionFlags === 1 ? "" : "s"} on the vendor report.`);
  }

  if (rentRatio != null) {
    if (rentRatio >= 3) {
      pros.push(`Reported income is ${rentRatio.toFixed(1)}× the monthly rent.`);
    } else if (rentRatio >= 2.5) {
      pros.push(`Income is ${rentRatio.toFixed(1)}× rent — acceptable but not strong.`);
    } else {
      cons.push(`Income is only ${rentRatio.toFixed(1)}× rent (3× preferred).`);
    }
  }

  if (application?.evictionHistory === "yes" && evictionFlags === 0) {
    cons.push("Applicant self-reported prior eviction — verify against the full report.");
  }
  if (application?.bankruptcyHistory === "yes") {
    cons.push("Applicant self-reported bankruptcy.");
  }
  if (application?.criminalHistory === "yes" && criminalFlags === 0) {
    cons.push("Applicant self-reported criminal history — review vendor detail and local fair-chance rules.");
  }

  if (!application?.notEmployed && application?.employer?.trim()) {
    pros.push(`Employed at ${application.employer.trim()}.`);
  } else if (application?.notEmployed) {
    cons.push("Applicant marked not currently employed.");
  }

  if (vendor.incomeVerified) {
    pros.push("Income verification passed with the screening vendor.");
  }

  if (vendor.rawResultLabel?.toLowerCase().includes("clear")) {
    pros.push(`Vendor overall result: ${vendor.rawResultLabel}.`);
  } else if (vendor.rawResultLabel && !vendor.rawResultLabel.toLowerCase().includes("none")) {
    cons.push(`Vendor overall result: ${vendor.rawResultLabel}.`);
  }

  let recommendation: ScreeningRecommendation = "review";
  const hasSeriousCons =
    creditRating === "poor" || criminalFlags > 0 || evictionFlags > 0 || (rentRatio != null && rentRatio < 2.5);

  if (vendor.status !== "complete") {
    recommendation = "not_available";
  } else if (!hasSeriousCons && (creditRating === "excellent" || creditRating === "good") && criminalFlags === 0) {
    recommendation = "strong_yes";
  } else if (hasSeriousCons) {
    recommendation = "concerns";
  }

  const summaryParts: string[] = [];
  if (recommendation === "strong_yes") {
    summaryParts.push("Strong applicant profile based on credit and background results.");
  } else if (recommendation === "concerns") {
    summaryParts.push("Review carefully — one or more screening factors need attention.");
  } else if (recommendation === "review") {
    summaryParts.push("Mixed signals — read the pros and cons before deciding.");
  } else {
    summaryParts.push("Screening is still processing or unavailable.");
  }
  if (creditScore) summaryParts.push(`Credit: ${creditScore}.`);
  if (criminalFlags > 0 || evictionFlags > 0) {
    summaryParts.push(`Flags: ${criminalFlags} criminal, ${evictionFlags} eviction.`);
  }

  const adverseActionRequired =
    recommendation === "concerns" && (creditRating === "poor" || criminalFlags > 0 || evictionFlags > 0);

  return {
    recommendation,
    pros: pros.slice(0, 6),
    cons: cons.slice(0, 6),
    summary: summaryParts.join(" "),
    adverseActionRequired,
    creditRating,
  };
}

export function recommendationLabel(recommendation: ScreeningRecommendation): string {
  switch (recommendation) {
    case "strong_yes":
      return "Strong fit";
    case "concerns":
      return "Concerns";
    case "not_available":
      return "Pending";
    case "review":
    default:
      return "Review";
  }
}
