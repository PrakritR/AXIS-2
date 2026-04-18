import { emitAdminUi } from "@/lib/demo-admin-ui";

const APP_KEY = "axis_demo_rental_applications_v1";
const HOUSE_KEY = "axis_demo_house_units_v1";

export type RentalApplication = {
  id: string;
  fullLegalName: string;
  email: string;
  phone: string;
  employer: string;
  monthlyIncomeLabel: string;
  desiredMoveIn: string;
  submittedAt: string;
};

export type HouseUnit = {
  id: string;
  applicationId: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  monthlyRentCents: number;
  securityDepositCents: number;
  leaseStart: string;
  leaseEnd: string;
  landlordDisplayName: string;
  managerContactLine: string;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readApps(): RentalApplication[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(APP_KEY);
    if (!raw) {
      const seed = seedApplications();
      window.localStorage.setItem(APP_KEY, JSON.stringify(seed));
      emitAdminUi();
      return seed;
    }
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as RentalApplication[]) : [];
  } catch {
    return [];
  }
}

function writeApps(rows: RentalApplication[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(APP_KEY, JSON.stringify(rows));
    emitAdminUi();
  } catch {
    /* ignore */
  }
}

function readHouses(): HouseUnit[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(HOUSE_KEY);
    if (!raw) {
      const apps = readApps();
      const seed = seedHouses(apps[0]?.id ?? "app-demo-1");
      window.localStorage.setItem(HOUSE_KEY, JSON.stringify(seed));
      emitAdminUi();
      return seed;
    }
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as HouseUnit[]) : [];
  } catch {
    return [];
  }
}

function writeHouses(rows: HouseUnit[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(HOUSE_KEY, JSON.stringify(rows));
    emitAdminUi();
  } catch {
    /* ignore */
  }
}

function seedApplications(): RentalApplication[] {
  const now = new Date().toISOString();
  return [
    {
      id: "app-demo-1",
      fullLegalName: "Alex Resident",
      email: "alex.resident@example.com",
      phone: "(555) 010-2030",
      employer: "City General Hospital",
      monthlyIncomeLabel: "$6,200 / month",
      desiredMoveIn: now.slice(0, 10),
      submittedAt: now,
    },
  ];
}

function seedHouses(applicationId: string): HouseUnit[] {
  const start = new Date();
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return [
    {
      id: "house-demo-1",
      applicationId,
      street: "1200 Market Street",
      unit: "4B",
      city: "San Francisco",
      state: "CA",
      zip: "94102",
      monthlyRentCents: 285000,
      securityDepositCents: 285000,
      leaseStart: fmt(start),
      leaseEnd: fmt(end),
      landlordDisplayName: "Northside Housing LLC",
      managerContactLine: "Axis Property Management — (555) 010-9999 · manager@axis.example",
    },
  ];
}

export function readRentalApplications(): RentalApplication[] {
  return readApps();
}

export function readHouseUnits(): HouseUnit[] {
  return readHouses();
}

export function getHouseForApplication(applicationId: string): HouseUnit | null {
  return readHouses().find((h) => h.applicationId === applicationId) ?? null;
}

export function getApplicationById(id: string): RentalApplication | null {
  return readApps().find((a) => a.id === id) ?? null;
}

export function updateApplicationPatch(id: string, patch: Partial<RentalApplication>): boolean {
  const rows = readApps();
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return false;
  const next = [...rows];
  next[i] = { ...next[i]!, ...patch };
  writeApps(next);
  return true;
}

export function updateHousePatch(id: string, patch: Partial<HouseUnit>): boolean {
  const rows = readHouses();
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return false;
  const next = [...rows];
  next[i] = { ...next[i]!, ...patch };
  writeHouses(next);
  return true;
}
