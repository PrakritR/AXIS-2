/**
 * Deterministic household charge + rent-profile rows for catalog applicants seeded
 * by tests/helpers/seed-test-db.mjs. Mirrors charge id rules in household-charges.ts.
 */

export function chargeKeyPart(raw) {
  const trimmed = String(raw ?? "").trim();
  const upper = trimmed.toUpperCase();
  if (upper.startsWith("AXIS-")) {
    const suffix = upper
      .slice(5)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return suffix ? `pl_${suffix}` : "unknown";
  }
  if (upper.startsWith("PROPLANE-")) {
    const suffix = upper
      .slice(9)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return suffix ? `pl_${suffix}` : "unknown";
  }
  const cleaned = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "unknown";
}

function moneyLabel(amount) {
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * @param {object} p catalog person from seed-test-db (axisId, email, name, rent, prop, propId, room, residentUserId, leaseStage, primaryE2e?)
 * @param {{ now?: Date, leaseEndIso?: string }} opts
 */
export function buildSeedChargesForPerson(p, opts = {}) {
  const now = opts.now ?? new Date();
  const axisKey = chargeKeyPart(p.axisId);
  const emailKey = chargeKeyPart(p.email);
  const propKey = chargeKeyPart(p.propId);
  const managerUserId = p.prop.ownerUserId;
  const rentMonth = now.toISOString().slice(0, 7);
  const profileId = `seed-rent-${emailKey}-${propKey}`;
  const createdAt = now.toISOString();
  const moveInDue = opts.moveInDueLabel ?? "Due at move-in";

  /** @param {string} id @param {string} kind @param {string} title @param {number} amount @param {string} status */
  function base(id, kind, title, amount, status, extra = {}) {
    const amountLabel = moneyLabel(amount);
    return {
      id,
      createdAt,
      applicationId: p.axisId,
      residentEmail: p.email,
      residentName: p.name,
      residentUserId: p.residentUserId ?? null,
      propertyId: p.propId,
      propertyLabel: p.prop.name,
      managerUserId,
      kind,
      title,
      amountLabel,
      balanceLabel: status === "paid" ? "$0.00" : amountLabel,
      status,
      blocksLeaseUntilPaid: kind === "security_deposit",
      dueDateLabel: moveInDue,
      ...extra,
    };
  }

  const utilities = 150;
  const moveInFee = 250;
  const appFee = 50;

  const charges = [
    base(`hc_app_fee_${axisKey}`, "application_fee", "Application fee", appFee, "paid", {
      paidAt: createdAt,
      blocksLeaseUntilPaid: false,
    }),
    base(`hc_app_${axisKey}_security_deposit`, "security_deposit", "Security deposit", p.prop.deposit, "pending"),
    base(`hc_app_${axisKey}_first_month_rent`, "first_month_rent", "First month rent", p.rent, "pending"),
    base(`hc_app_${axisKey}_utilities`, "utilities", "Utilities", utilities, "pending"),
    base(`hc_app_${axisKey}_move_in_fee`, "move_in_fee", "Move-in fee", moveInFee, "pending"),
  ];

  if (p.leaseStage === "signed") {
    const paidMoveIn = Boolean(p.primaryE2e);
    for (const charge of charges) {
      if (charge.kind === "security_deposit" && paidMoveIn) {
        charge.status = "paid";
        charge.balanceLabel = "$0.00";
        charge.paidAt = createdAt;
      }
      if (charge.kind === "first_month_rent" && paidMoveIn) {
        charge.status = "paid";
        charge.balanceLabel = "$0.00";
        charge.paidAt = createdAt;
      }
      if (charge.kind === "move_in_fee" && paidMoveIn) {
        charge.status = "paid";
        charge.balanceLabel = "$0.00";
        charge.paidAt = createdAt;
      }
    }

    charges.push(
      base(
        `hc_rent_${emailKey}_${propKey}_${rentMonth}`,
        "rent",
        "Monthly rent",
        p.rent,
        "pending",
        {
          rentMonth,
          recurringRentProfileId: profileId,
          dueDateLabel: `Due ${rentMonth}-01`,
          dueDay: 1,
        },
      ),
    );

    if (p.primaryE2e) {
      const utilCharge = charges.find((c) => c.kind === "utilities");
      if (utilCharge) {
        utilCharge.status = "pending";
        utilCharge.dueDateLabel = `Due ${rentMonth}-01`;
      }
    }
  }

  return charges;
}

/** @param {object} p @param {{ now?: Date, leaseEndIso?: string }} opts */
export function buildSeedRentProfileForPerson(p, opts = {}) {
  if (p.leaseStage !== "signed") return null;
  const now = opts.now ?? new Date();
  const emailKey = chargeKeyPart(p.email);
  const propKey = chargeKeyPart(p.propId);
  return {
    id: `seed-rent-${emailKey}-${propKey}`,
    residentEmail: p.email,
    residentName: p.name,
    residentUserId: p.residentUserId ?? null,
    propertyId: p.propId,
    propertyLabel: p.prop.name,
    roomLabel: p.room?.name ?? "Room",
    managerUserId: p.prop.ownerUserId,
    monthlyRent: p.rent,
    monthlyUtilities: 150,
    dueDay: 1,
    startMonth: now.toISOString().slice(0, 7),
    leaseEnd: opts.leaseEndIso,
    active: true,
    updatedAt: now.toISOString(),
  };
}

export function householdChargeDbRow(charge) {
  return {
    id: charge.id,
    manager_user_id: charge.managerUserId,
    resident_user_id: charge.residentUserId ?? null,
    resident_email: charge.residentEmail?.toLowerCase() ?? null,
    property_id: charge.propertyId ?? null,
    kind: charge.kind,
    status: charge.status,
    row_data: charge,
    updated_at: new Date().toISOString(),
  };
}

export function rentProfileDbRow(profile) {
  return {
    id: profile.id,
    manager_user_id: profile.managerUserId,
    resident_user_id: profile.residentUserId ?? null,
    resident_email: profile.residentEmail?.toLowerCase() ?? null,
    property_id: profile.propertyId ?? null,
    row_data: profile,
    updated_at: new Date().toISOString(),
  };
}
