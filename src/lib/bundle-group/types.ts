import type { GroupRole } from "@/lib/rental-application/types";

export type LeaseKind = "individual" | "joint_bundle";

export type JointLeaseMember = {
  applicationId: string;
  residentName: string;
  residentEmail: string;
  residentUserId: string | null;
  role: Exclude<GroupRole, null>;
  residentSignature?: { name: string; signedAtIso: string } | null;
};

export type BundleFinancialTotals = {
  monthlyRent: number;
  securityDeposit: number;
  moveInFee: number;
  monthlyUtilities: number;
};

export type BundleCostSplitLine = {
  kind: string;
  totalAmount: number;
  memberAmount: number;
  memberIndex: number;
  memberCount: number;
  shareLabel: string;
};
