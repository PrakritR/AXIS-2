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
import { getDemoRoomAvailabilityMessage } from "./data";
import type { RentalWizardErrors, RentalWizardFormState } from "./types";
import { digitsOnly, parseMoneyInput } from "./masks";

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
    if (!f.propertyId.trim()) e.propertyId = "Property is required.";
    if (!f.roomChoice1.trim()) e.roomChoice1 = "First choice room is required.";
    const r1 = f.roomChoice1.trim();
    const r2 = f.roomChoice2.trim();
    const r3 = f.roomChoice3.trim();
    if (r2 && r2 === r1) e.roomChoice2 = "Second choice must differ from your first choice.";
    if (r3 && (r3 === r1 || r3 === r2)) e.roomChoice3 = "Third choice must differ from your other choices.";
    if (!f.leaseTerm.trim()) e.leaseTerm = "Lease term is required.";
    const start = f.leaseStart.trim();
    const end = f.leaseEnd.trim();
    const drs = validateDateRequired(start, "Lease start date");
    if (!drs.ok) e.leaseStart = drs.message;
    const mtm = f.leaseTerm === "Month-to-Month";
    if (!mtm) {
      const dre = validateDateRequired(end, "Lease end date");
      if (!dre.ok) e.leaseEnd = dre.message;
    } else if (end) {
      const dre = validateDateRequired(end, "Lease end date");
      if (!dre.ok) e.leaseEnd = dre.message;
    }
    const sd = parseLocalDate(start);
    const ed = parseLocalDate(end);
    const today = startOfTodayUTC();
    if (sd) {
      const sMid = Date.UTC(sd.getFullYear(), sd.getMonth(), sd.getDate());
      if (sMid < today.getTime()) e.leaseStart = "Lease start date cannot be in the past.";
    }
    if (sd && ed && !e.leaseStart && !e.leaseEnd) {
      if (ed.getTime() <= sd.getTime()) e.leaseEnd = "Lease end date must be after lease start date.";
    }
    const avail = getDemoRoomAvailabilityMessage(f.roomChoice1, start);
    if (avail) e.roomChoice1 = avail;
    return e;
  }

  if (step === 4) {
    const n = validateFullName(f.fullLegalName);
    if (!n.ok) e.fullLegalName = n.message;
    if (!f.dateOfBirth.trim()) e.dateOfBirth = "Date of birth is required.";
    else if (!isAtLeastAge(f.dateOfBirth, 18)) e.dateOfBirth = "You must be at least 18 years old to apply.";
    const ss = validateSsn(f.ssn);
    if (!ss.ok) e.ssn = ss.message;
    const dl = validateRequired(f.driversLicense, "Driver’s license or ID number");
    if (!dl.ok) e.driversLicense = dl.message;
    const ph = validatePhone10(f.phone);
    if (!ph.ok) e.phone = ph.message;
    const em = validateEmail(f.email);
    if (!em.ok) e.email = em.message;
    return e;
  }

  if (step === 5) {
    const st = validateRequired(f.currentStreet, "Street address");
    if (!st.ok) e.currentStreet = st.message;
    const ci = validateRequired(f.currentCity, "City");
    if (!ci.ok) e.currentCity = ci.message;
    const sa = validateStateAbbrev(f.currentState);
    if (!sa.ok) e.currentState = sa.message;
    const z = validateZip(f.currentZip);
    if (!z.ok) e.currentZip = z.message;
    if (f.currentLandlordPhone.trim()) {
      const lp = validatePhone10(f.currentLandlordPhone);
      if (!lp.ok) e.currentLandlordPhone = lp.message;
    }
    return e;
  }

  if (step === 6) {
    if (f.noPreviousAddress) return e;
    const st = validateRequired(f.prevStreet, "Previous street address");
    if (!st.ok) e.prevStreet = st.message;
    const ci = validateRequired(f.prevCity, "City");
    if (!ci.ok) e.prevCity = ci.message;
    const sa = validateStateAbbrev(f.prevState);
    if (!sa.ok) e.prevState = sa.message;
    const z = validateZip(f.prevZip);
    if (!z.ok) e.prevZip = z.message;
    if (f.prevLandlordPhone.trim()) {
      const lp = validatePhone10(f.prevLandlordPhone);
      if (!lp.ok) e.prevLandlordPhone = lp.message;
    }
    return e;
  }

  if (step === 7) {
    if (!f.notEmployed) {
      const emp = validateRequired(f.employer, "Employer name");
      if (!emp.ok) e.employer = emp.message;
      if (f.supervisorPhone.trim()) {
        const sp = validatePhone10(f.supervisorPhone);
        if (!sp.ok) e.supervisorPhone = sp.message;
      }
    }
    if (!hasIncomeValue(f.monthlyIncome, f.annualIncome, f.otherIncome)) {
      e._general =
        "Enter at least one income amount (monthly, annual, or other income), or check “not currently employed” and add other income if applicable.";
    }
    if (f.monthlyIncome.trim()) {
      const n = Number(parseMoneyInput(f.monthlyIncome));
      if (!Number.isFinite(n) || n < 0) e.monthlyIncome = "Enter a valid monthly income.";
    }
    if (f.annualIncome.trim()) {
      const n = Number(parseMoneyInput(f.annualIncome));
      if (!Number.isFinite(n) || n < 0) e.annualIncome = "Enter a valid annual income.";
    }
    if (f.otherIncome.trim()) {
      const n = Number(parseMoneyInput(f.otherIncome));
      if (!Number.isFinite(n) || n < 0) e.otherIncome = "Enter a valid amount for other income.";
    }
    return e;
  }

  if (step === 8) {
    const n1 = validateRequired(f.ref1Name, "Reference 1 name");
    if (!n1.ok) e.ref1Name = n1.message;
    const r1 = validateRequired(f.ref1Relationship, "Reference 1 relationship");
    if (!r1.ok) e.ref1Relationship = r1.message;
    const p1 = validatePhone10(f.ref1Phone);
    if (!p1.ok) e.ref1Phone = p1.message;
    const has2 = f.ref2Name.trim() || f.ref2Relationship.trim() || digitsOnly(f.ref2Phone).length > 0;
    if (has2) {
      if (!f.ref2Name.trim()) e.ref2Name = "Reference 2 name is required when adding a second reference.";
      if (!f.ref2Relationship.trim()) e.ref2Relationship = "Reference 2 relationship is required.";
      const p2 = validatePhone10(f.ref2Phone);
      if (!p2.ok) e.ref2Phone = p2.message;
    }
    return e;
  }

  if (step === 9) {
    if (!f.occupancyCount.trim()) e.occupancyCount = "Number of occupants is required.";
    else {
      const n = parseInt(f.occupancyCount, 10);
      if (!Number.isFinite(n) || n < 1 || n > 20) e.occupancyCount = "Enter a whole number between 1 and 20.";
    }
    if (f.evictionHistory === null) e.evictionHistory = "Please select Yes or No.";
    else if (f.evictionHistory === "yes" && !f.evictionDetails.trim()) {
      e.evictionDetails = "Brief details are required when you answer Yes.";
    }
    if (f.bankruptcyHistory === null) e.bankruptcyHistory = "Please select Yes or No.";
    else if (f.bankruptcyHistory === "yes" && !f.bankruptcyDetails.trim()) {
      e.bankruptcyDetails = "Brief details are required when you answer Yes.";
    }
    if (f.criminalHistory === null) e.criminalHistory = "Please select Yes or No.";
    else if (f.criminalHistory === "yes" && !f.criminalDetails.trim()) {
      e.criminalDetails = "Brief details are required when you answer Yes.";
    }
    return e;
  }

  if (step === 10) {
    if (!f.consentCredit) e.consentCredit = "You must authorize a credit and background check to continue.";
    if (!f.consentTruth) e.consentTruth = "You must confirm your information is true and complete.";
    if (!f.digitalSignature.trim()) e.digitalSignature = "Type your full legal name as your digital signature.";
    if (!f.dateSigned.trim()) e.dateSigned = "Date signed is required.";
    return e;
  }

  return e;
}

export function countValidationErrors(err: RentalWizardErrors): number {
  return Object.values(err).filter(Boolean).length;
}
