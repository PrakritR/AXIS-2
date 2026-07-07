import {
  validateAxisGroupId,
  validateDateRequired,
  validateEmail,
  validateFullName,
  validateHouseholdCount,
  validatePhone10,
  validateRequired,
  validateSsn,
  validateStateAbbrev,
  validateZip,
} from "@/app/(public)/rent/apply/apply-validation";
import { propertyAllowsShortTermRental, listingAllowedLeaseTerms, getPropertyById } from "./data";
import { listingApplicationFeeAmount } from "@/lib/household-charges";
import {
  isAchApplicationFeeChannel,
  resolveApplicationFeePayChannel,
} from "./application-fee-channel";
import type { RentalWizardErrors, RentalWizardFormState } from "./types";
import { digitsOnly, parseMoneyInput } from "./masks";
import { customFieldsForWizardStep, listingCustomApplicationFields, validateCustomFieldAnswers } from "./custom-fields";
import { isWizardFormFieldEnabled } from "./application-field-catalog";

function startOfTodayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

function parseLocalDate(iso: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isAtLeastAge(dobIso: string, minAge: number): boolean {
  const dob = parseLocalDate(dobIso);
  if (!dob) return false;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const mo = today.getMonth() - dob.getMonth();
  if (mo < 0 || (mo === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age >= minAge;
}

function hasIncomeValue(monthly: string, annual: string, other: string): boolean {
  const m = parseMoneyInput(monthly);
  const a = parseMoneyInput(annual);
  const o = parseMoneyInput(other);
  const mn = m ? Number(m) : 0;
  const an = a ? Number(a) : 0;
  const on = o ? Number(o) : 0;
  return (Number.isFinite(mn) && mn > 0) || (Number.isFinite(an) && an > 0) || (Number.isFinite(on) && on > 0);
}

export function validateRentalWizardStep(step: number, f: RentalWizardFormState): RentalWizardErrors {
  const prop = getPropertyById(f.propertyId);
  const sub = prop?.listingSubmission?.v === 1 ? prop.listingSubmission : undefined;
  const fieldEnabled = (key: string) => isWizardFormFieldEnabled(sub, key);
  const e = validateStandardWizardStep(step, f, fieldEnabled);
  // Manager custom questions are asked inside their configured section's step (untagged → step 9).
  const stepCustomFields = customFieldsForWizardStep(
    listingCustomApplicationFields(sub),
    step,
  );
  if (stepCustomFields.length > 0) {
    Object.assign(e, validateCustomFieldAnswers(stepCustomFields, f.customFieldAnswers));
  }
  return e;
}

function validateStandardWizardStep(
  step: number,
  f: RentalWizardFormState,
  fieldEnabled: (key: string) => boolean = () => true,
): RentalWizardErrors {
  const e: RentalWizardErrors = {};

  if (step === 1) {
    if (f.applyingAsGroup === null) {
      e.applyingAsGroup = "Please choose whether you are applying as part of a group.";
      return e;
    }
    if (f.applyingAsGroup === "no") return e;
    if (f.groupRole === null) {
      e.groupRole = "Select your role in the group.";
      return e;
    }
    if (f.groupRole === "first") {
      const c = validateHouseholdCount(f.groupSize);
      if (!c.ok) e.groupSize = c.message;
      return e;
    }
    const g = validateAxisGroupId(f.groupId);
    if (!g.ok) e.groupId = g.message;
    return e;
  }

  if (step === 2) {
    if (f.hasCosigner === null) e.hasCosigner = "Please choose whether a co-signer will be added.";
    return e;
  }

  if (step === 3) {
    if (fieldEnabled("propertyId") && !f.propertyId.trim()) e.propertyId = "Property is required.";
    if (fieldEnabled("roomChoice1") && !f.roomChoice1.trim()) e.roomChoice1 = "First choice room is required.";
    const r1 = f.roomChoice1.trim();
    const r2 = f.roomChoice2.trim();
    const r3 = f.roomChoice3.trim();
    if (fieldEnabled("roomChoice2") && r2 && r2 === r1) e.roomChoice2 = "Second choice must differ from your first choice.";
    if (fieldEnabled("roomChoice3") && r3 && (r3 === r1 || r3 === r2)) e.roomChoice3 = "Third choice must differ from your other choices.";
    if (fieldEnabled("leaseTerm") && !f.leaseTerm.trim()) e.leaseTerm = "Lease term is required.";
    if (
      fieldEnabled("leaseTerm") &&
      f.rentalType !== "short_term" &&
      f.propertyId.trim() &&
      f.leaseTerm.trim()
    ) {
      const allowed = listingAllowedLeaseTerms(f.propertyId);
      if (allowed.length > 0 && !allowed.includes(f.leaseTerm)) {
        e.leaseTerm = "This lease term is not offered for the selected property.";
      }
    }
    if (fieldEnabled("rentalType") && f.rentalType === "short_term" && !propertyAllowsShortTermRental(f.propertyId)) {
      e.leaseTerm = "This listing does not allow short-term stays.";
    }
    const start = f.leaseStart.trim();
    const end = f.leaseEnd.trim();
    if (fieldEnabled("leaseStart")) {
      const drs = validateDateRequired(start, "Lease start date");
      if (!drs.ok) e.leaseStart = drs.message;
    }
    const mtm = f.leaseTerm === "Month-to-Month";
    if (fieldEnabled("leaseEnd") && !mtm) {
      const dre = validateDateRequired(end, "Lease end date");
      if (!dre.ok) e.leaseEnd = dre.message;
    }
    const sd = parseLocalDate(start);
    const ed = parseLocalDate(end);
    const today = startOfTodayUTC();
    if (fieldEnabled("leaseStart") && sd) {
      const sMid = Date.UTC(sd.getFullYear(), sd.getMonth(), sd.getDate());
      if (sMid < today.getTime()) e.leaseStart = "Lease start date cannot be in the past.";
    }
    if (fieldEnabled("leaseEnd") && !mtm && sd && ed && !e.leaseStart && !e.leaseEnd) {
      if (ed.getTime() <= sd.getTime()) e.leaseEnd = "Lease end date must be after lease start date.";
    }
    return e;
  }

  if (step === 4) {
    if (fieldEnabled("fullLegalName")) {
      const n = validateFullName(f.fullLegalName);
      if (!n.ok) e.fullLegalName = n.message;
    }
    if (fieldEnabled("dateOfBirth")) {
      if (!f.dateOfBirth.trim()) e.dateOfBirth = "Date of birth is required.";
      else if (!isAtLeastAge(f.dateOfBirth, 18)) e.dateOfBirth = "You must be at least 18 years old to apply.";
    }
    if (fieldEnabled("ssn")) {
      const ss = validateSsn(f.ssn);
      if (!ss.ok) e.ssn = ss.message;
    }
    if (fieldEnabled("driversLicense")) {
      const dl = validateRequired(f.driversLicense, "Driver’s license or ID number");
      if (!dl.ok) e.driversLicense = dl.message;
    }
    if (fieldEnabled("phone")) {
      const ph = validatePhone10(f.phone);
      if (!ph.ok) e.phone = ph.message;
    }
    if (fieldEnabled("email")) {
      const em = validateEmail(f.email);
      if (!em.ok) e.email = em.message;
    }
    return e;
  }

  if (step === 5) {
    if (fieldEnabled("currentStreet")) {
      const st = validateRequired(f.currentStreet, "Street address");
      if (!st.ok) e.currentStreet = st.message;
    }
    if (fieldEnabled("currentCity")) {
      const ci = validateRequired(f.currentCity, "City");
      if (!ci.ok) e.currentCity = ci.message;
    }
    if (fieldEnabled("currentState")) {
      const sa = validateStateAbbrev(f.currentState);
      if (!sa.ok) e.currentState = sa.message;
    }
    if (fieldEnabled("currentZip")) {
      const z = validateZip(f.currentZip);
      if (!z.ok) e.currentZip = z.message;
    }
    if (fieldEnabled("currentLandlordPhone")) {
      const curLdDigits = digitsOnly(f.currentLandlordPhone);
      if (curLdDigits.length > 0 && curLdDigits.length !== 10) {
        e.currentLandlordPhone = "Enter a complete 10-digit number or leave this blank.";
      }
    }
    return e;
  }

  if (step === 6) {
    if (f.noPreviousAddress) return e;
    if (fieldEnabled("prevStreet")) {
      const st = validateRequired(f.prevStreet, "Previous street address");
      if (!st.ok) e.prevStreet = st.message;
    }
    if (fieldEnabled("prevCity")) {
      const ci = validateRequired(f.prevCity, "City");
      if (!ci.ok) e.prevCity = ci.message;
    }
    if (fieldEnabled("prevState")) {
      const sa = validateStateAbbrev(f.prevState);
      if (!sa.ok) e.prevState = sa.message;
    }
    if (fieldEnabled("prevZip")) {
      const z = validateZip(f.prevZip);
      if (!z.ok) e.prevZip = z.message;
    }
    if (fieldEnabled("prevLandlordPhone")) {
      const prevLdDigits = digitsOnly(f.prevLandlordPhone);
      if (prevLdDigits.length > 0 && prevLdDigits.length !== 10) {
        e.prevLandlordPhone = "Enter a complete 10-digit number or leave this blank.";
      }
    }
    return e;
  }

  if (step === 7) {
    if (!f.notEmployed) {
      if (fieldEnabled("employer")) {
        const emp = validateRequired(f.employer, "Employer name");
        if (!emp.ok) e.employer = emp.message;
      }
      if (fieldEnabled("supervisorPhone")) {
        const supDigits = digitsOnly(f.supervisorPhone);
        if (supDigits.length > 0 && supDigits.length !== 10) {
          e.supervisorPhone = "Enter a complete 10-digit number or leave this blank.";
        }
      }
    }
    if (
      !f.notEmployed &&
      (() => {
        const incomeEnabled = (["monthlyIncome", "annualIncome", "otherIncome"] as const).filter(fieldEnabled);
        if (incomeEnabled.length === 0) return false;
        return !hasIncomeValue(
          incomeEnabled.includes("monthlyIncome") ? f.monthlyIncome : "",
          incomeEnabled.includes("annualIncome") ? f.annualIncome : "",
          incomeEnabled.includes("otherIncome") ? f.otherIncome : "",
        );
      })()
    ) {
      e._general =
        "Enter at least one income amount (monthly, annual, or other). Amounts must be greater than zero.";
    }
    if (fieldEnabled("monthlyIncome") && f.monthlyIncome.trim()) {
      const n = Number(parseMoneyInput(f.monthlyIncome));
      if (!Number.isFinite(n) || n < 0) e.monthlyIncome = "Enter a valid monthly income.";
    }
    if (fieldEnabled("annualIncome") && f.annualIncome.trim()) {
      const n = Number(parseMoneyInput(f.annualIncome));
      if (!Number.isFinite(n) || n < 0) e.annualIncome = "Enter a valid annual income.";
    }
    if (fieldEnabled("otherIncome") && f.otherIncome.trim()) {
      const n = Number(parseMoneyInput(f.otherIncome));
      if (!Number.isFinite(n) || n < 0) e.otherIncome = "Enter a valid amount for other income.";
    }
    return e;
  }

  if (step === 8) {
    if (fieldEnabled("ref1Name")) {
      const n1 = validateRequired(f.ref1Name, "Reference 1 name");
      if (!n1.ok) e.ref1Name = n1.message;
    }
    if (fieldEnabled("ref1Relationship")) {
      const r1 = validateRequired(f.ref1Relationship, "Reference 1 relationship");
      if (!r1.ok) e.ref1Relationship = r1.message;
    }
    if (fieldEnabled("ref1Phone")) {
      const p1 = validatePhone10(f.ref1Phone);
      if (!p1.ok) e.ref1Phone = p1.message;
    }
    const has2 = f.ref2Name.trim() || f.ref2Relationship.trim() || digitsOnly(f.ref2Phone).length > 0;
    if (has2) {
      if (fieldEnabled("ref2Name") && !f.ref2Name.trim()) e.ref2Name = "Reference 2 name is required when adding a second reference.";
      if (fieldEnabled("ref2Relationship") && !f.ref2Relationship.trim()) e.ref2Relationship = "Reference 2 relationship is required.";
      if (fieldEnabled("ref2Phone")) {
        const p2 = validatePhone10(f.ref2Phone);
        if (!p2.ok) e.ref2Phone = p2.message;
      }
    }
    return e;
  }

  if (step === 9) {
    if (fieldEnabled("occupancyCount")) {
      if (!f.occupancyCount.trim()) e.occupancyCount = "Number of occupants is required.";
      else {
        const n = parseInt(f.occupancyCount, 10);
        if (!Number.isFinite(n) || n < 1 || n > 20) e.occupancyCount = "Enter a whole number between 1 and 20.";
      }
    }
    if (fieldEnabled("evictionHistory")) {
      if (f.evictionHistory === null) e.evictionHistory = "Please select Yes or No.";
      else if (f.evictionHistory === "yes" && fieldEnabled("evictionDetails") && !f.evictionDetails.trim()) {
        e.evictionDetails = "Brief details are required when you answer Yes.";
      }
    }
    if (fieldEnabled("bankruptcyHistory")) {
      if (f.bankruptcyHistory === null) e.bankruptcyHistory = "Please select Yes or No.";
      else if (f.bankruptcyHistory === "yes" && fieldEnabled("bankruptcyDetails") && !f.bankruptcyDetails.trim()) {
        e.bankruptcyDetails = "Brief details are required when you answer Yes.";
      }
    }
    if (fieldEnabled("criminalHistory")) {
      if (f.criminalHistory === null) e.criminalHistory = "Please select Yes or No.";
      else if (f.criminalHistory === "yes" && fieldEnabled("criminalDetails") && !f.criminalDetails.trim()) {
        e.criminalDetails = "Brief details are required when you answer Yes.";
      }
    }
    return e;
  }

  if (step === 10) {
    if (fieldEnabled("consentCredit") && !f.consentCredit) e.consentCredit = "You must authorize a credit and background check to continue.";
    if (fieldEnabled("consentTruth") && !f.consentTruth) e.consentTruth = "You must confirm your information is true and complete.";
    if (fieldEnabled("digitalSignature") && !f.digitalSignature.trim()) e.digitalSignature = "Type your full legal name as your digital signature.";
    if (fieldEnabled("dateSigned") && !f.dateSigned.trim()) e.dateSigned = "Date signed is required.";
    return e;
  }

  if (step === 12) {
    const pid = f.propertyId.trim();
    const { amount } = listingApplicationFeeAmount(pid);
    const needsFee = Boolean(pid && amount > 0);
    if (needsFee) {
      const prop = getPropertyById(pid);
      const sub = prop?.listingSubmission?.v === 1 ? prop.listingSubmission : undefined;
      const payChannel = resolveApplicationFeePayChannel(sub, f.applicationFeePayChannel);
      if (!isAchApplicationFeeChannel(payChannel) && !f.applicationFeeZelleSentConfirmed) {
        e.applicationFeeZelleSentConfirmed =
          payChannel === "other"
            ? "Confirm you followed the manager's payment instructions."
            : `Confirm you sent the application fee by ${payChannel === "venmo" ? "Venmo" : "Zelle"}.`;
      }
    }
    return e;
  }

  return e;
}

export function countValidationErrors(err: RentalWizardErrors): number {
  return Object.values(err).filter(Boolean).length;
}
