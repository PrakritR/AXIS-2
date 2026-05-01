export type CosignerSubmission = {
  signerAppId: string;
  signerFullName: string;
  fullName: string;
  email: string;
  phone: string;
  dob: string;
  dlNumber: string;
  ssn: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notEmployed: boolean;
  employerName: string;
  employerAddress: string;
  supervisorName: string;
  supervisorPhone: string;
  jobTitle: string;
  monthlyIncome: string;
  annualIncome: string;
  employmentStart: string;
  otherIncome: string;
  bankruptcy: string;
  criminal: string;
  consentCredit: boolean;
  signature: string;
  dateSigned: string;
  submittedAt: string;
};

const KEY = "axis:cosigner-submissions:v1";
let memory: CosignerSubmission[] = [];

function canUseStorage() {
  return typeof window !== "undefined";
}

function hydrate() {
  if (!canUseStorage() || memory.length > 0) return;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CosignerSubmission[];
    if (Array.isArray(parsed)) memory = parsed;
  } catch {
    /* ignore */
  }
}

function persist() {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* ignore */
  }
}

export function appendCosignerSubmission(sub: CosignerSubmission) {
  hydrate();
  memory = [...memory, sub];
  persist();
}

export function readCosignerSubmissionsForSignerAppId(signerAppId: string): CosignerSubmission[] {
  hydrate();
  const id = signerAppId.trim().toUpperCase();
  if (!id) return [];
  return memory.filter((s) => s.signerAppId.trim().toUpperCase() === id);
}
