export const RENTAL_WIZARD_STEP_COUNT = 12;

export type YesNo = "yes" | "no" | null;
export type GroupRole = "first" | "joining" | null;

export type RentalWizardFormState = {
  applyingAsGroup: YesNo;
  groupRole: GroupRole;
  groupSize: string;
  groupId: string;
  hasCosigner: YesNo;
  propertyId: string;
  roomChoice1: string;
  roomChoice2: string;
  roomChoice3: string;
  leaseTerm: string;
  leaseStart: string;
  leaseEnd: string;
  fullLegalName: string;
  dateOfBirth: string;
  ssn: string;
  driversLicense: string;
  phone: string;
  email: string;
  currentStreet: string;
  currentCity: string;
  currentState: string;
  currentZip: string;
  currentLandlordName: string;
  currentLandlordPhone: string;
  currentMoveIn: string;
  currentMoveOut: string;
  currentReasonLeaving: string;
  noPreviousAddress: boolean;
  prevStreet: string;
  prevCity: string;
  prevState: string;
  prevZip: string;
  prevLandlordName: string;
  prevLandlordPhone: string;
  prevMoveIn: string;
  prevMoveOut: string;
  prevReasonLeaving: string;
  notEmployed: boolean;
  employer: string;
  employerAddress: string;
  supervisorName: string;
  supervisorPhone: string;
  jobTitle: string;
  monthlyIncome: string;
  annualIncome: string;
  employmentStart: string;
  otherIncome: string;
  ref1Name: string;
  ref1Relationship: string;
  ref1Phone: string;
  ref2Name: string;
  ref2Relationship: string;
  ref2Phone: string;
  occupancyCount: string;
  pets: string;
  evictionHistory: YesNo;
  evictionDetails: string;
  bankruptcyHistory: YesNo;
  bankruptcyDetails: string;
  criminalHistory: YesNo;
  criminalDetails: string;
  consentCredit: boolean;
  consentTruth: boolean;
  digitalSignature: string;
  dateSigned: string;
  /** Step 12 — non-refundable application processing fee acknowledgement */
  applicationFeeAcknowledged: boolean;
  /**
   * Step 12 — how the applicant will satisfy the listing application fee when the listing offers both portal tracking and Zelle.
   * “stripe” names the tracked fee line (no live card capture in this demo).
   */
  applicationFeePayChannel: "stripe" | "zelle";
  /** Step 12 — applicant attests they sent the fee via Zelle (manager must still mark the charge paid). */
  applicationFeeZelleSentConfirmed: boolean;
};

/** Field and step-level messages (string keys so consent booleans can still surface errors). */
export type RentalWizardErrors = Record<string, string>;
