#!/usr/bin/env node
// Idempotently provision PropLane's two annual App Store subscriptions by
// copying the tier, territory availability, and review note from the matching
// monthly products. Product identifiers are immutable, so every prerequisite
// is validated before the first POST and existing products are never replaced.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { resolveCanonicalApp } from "./ios-app-store-metadata.mjs";
import { AscClient } from "./ios-testflight-distribute.mjs";

export const ANNUAL_PRODUCT_SPECS = Object.freeze([
  {
    productId: "space.proplane.app.pro.annual",
    sourceProductId: "space.proplane.app.pro.monthly",
    referenceName: "PropLane Pro Annual",
    displayName: "PropLane Pro Annual",
    description: "Pro plan access, billed once per year.",
    // Apple has no exact $192.00 subscription price point. StoreKit displays
    // this nearest permitted tier instead of the rounded web marketing price.
    usd: "191.99",
  },
  {
    productId: "space.proplane.app.business.annual",
    sourceProductId: "space.proplane.app.business.monthly",
    referenceName: "PropLane Business Annual",
    displayName: "PropLane Business Annual",
    description: "Business plan access, billed once per year.",
    usd: "1919.99",
  },
]);

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
}

export function selectPricePoint(pricePoints, expectedUsd) {
  const matches = pricePoints.filter((point) => money(point.attributes?.customerPrice) === expectedUsd);
  if (matches.length !== 1) {
    const target = Number(expectedUsd);
    const nearest = pricePoints
      .map((point) => money(point.attributes?.customerPrice))
      .filter(Boolean)
      .sort((a, b) => Math.abs(Number(a) - target) - Math.abs(Number(b) - target))
      .slice(0, 5);
    throw new Error(
      `Expected one USA price point at $${expectedUsd}; found ${matches.length}. ` +
        `Nearest Apple price points: ${nearest.map((value) => `$${value}`).join(", ") || "none"}.`,
    );
  }
  return matches[0];
}

export function buildAnnualSubscriptionCreate(spec, source, groupId) {
  if (source.attributes?.subscriptionPeriod !== "ONE_MONTH") {
    throw new Error(`${spec.sourceProductId} is not a one-month subscription.`);
  }
  const groupLevel = source.attributes?.groupLevel;
  if (!Number.isInteger(groupLevel)) {
    throw new Error(`${spec.sourceProductId} has no valid group level to copy.`);
  }
  return {
    data: {
      type: "subscriptions",
      attributes: {
        name: spec.referenceName,
        productId: spec.productId,
        subscriptionPeriod: "ONE_YEAR",
        groupLevel,
        familySharable: Boolean(source.attributes?.familySharable),
        ...(source.attributes?.reviewNote ? { reviewNote: source.attributes.reviewNote } : {}),
      },
      relationships: {
        group: { data: { type: "subscriptionGroups", id: groupId } },
      },
    },
  };
}

export function buildLocalizationCreate(spec, subscriptionId) {
  return {
    data: {
      type: "subscriptionLocalizations",
      attributes: {
        locale: "en-US",
        name: spec.displayName,
        description: spec.description,
      },
      relationships: {
        subscription: { data: { type: "subscriptions", id: subscriptionId } },
      },
    },
  };
}

function buildPriceCreate(subscriptionId, pricePointId) {
  return {
    data: {
      type: "subscriptionPrices",
      relationships: {
        subscription: { data: { type: "subscriptions", id: subscriptionId } },
        subscriptionPricePoint: {
          data: { type: "subscriptionPricePoints", id: pricePointId },
        },
      },
    },
  };
}

function buildAvailabilityCreate(subscriptionId, territoryIds, availableInNewTerritories) {
  return {
    data: {
      type: "subscriptionAvailabilities",
      attributes: { availableInNewTerritories },
      relationships: {
        subscription: { data: { type: "subscriptions", id: subscriptionId } },
        availableTerritories: {
          data: territoryIds.map((id) => ({ type: "territories", id })),
        },
      },
    },
  };
}

async function loadInventory(client, groupId) {
  const response = await client.get(`subscriptionGroups/${groupId}/subscriptions?limit=200`);
  return response?.data ?? [];
}

async function verifyMonthlySource(client, source, spec) {
  const prices = await client.get(
    `subscriptions/${source.id}/prices?filter[territory]=USA&include=subscriptionPricePoint,territory&limit=200`,
  );
  const pricePointById = new Map(
    (prices?.included ?? [])
      .filter((item) => item.type === "subscriptionPricePoints")
      .map((item) => [item.id, money(item.attributes?.customerPrice)]),
  );
  const current = (prices?.data ?? [])
    .map((price) => pricePointById.get(price.relationships?.subscriptionPricePoint?.data?.id))
    .filter(Boolean);
  const expectedMonthlyUsd = spec.sourceProductId.includes("business") ? "200.00" : "20.00";
  if (!current.includes(expectedMonthlyUsd)) {
    throw new Error(
      `${spec.sourceProductId} does not have its expected $${expectedMonthlyUsd} USA price; refusing to clone it.`,
    );
  }
}

async function ensureLocalization(client, subscription, spec) {
  const response = await client.get(
    `subscriptions/${subscription.id}/subscriptionLocalizations?limit=50`,
  );
  const localizations = response?.data ?? [];
  const english = localizations.find((item) => item.attributes?.locale === "en-US");
  if (english) {
    if (
      english.attributes?.name !== spec.displayName ||
      english.attributes?.description !== spec.description
    ) {
      throw new Error(
        `${spec.productId} already has different en-US metadata; refusing to overwrite it.`,
      );
    }
    console.log(`  ✓ ${spec.productId}: en-US localization already correct`);
    return;
  }
  if (localizations.length > 0) {
    throw new Error(`${spec.productId} has unexpected localizations but no en-US localization.`);
  }
  await client.post("subscriptionLocalizations", buildLocalizationCreate(spec, subscription.id));
  console.log(`  ✓ ${spec.productId}: added en-US localization`);
}

async function sourceAvailability(client, sourceId) {
  const availability = await client.get(
    `subscriptions/${sourceId}/subscriptionAvailability`,
  );
  const territoryResponse = await client.get(
    `subscriptionAvailabilities/${sourceId}/availableTerritories?limit=200`,
  );
  const territoryIds = (territoryResponse?.data ?? []).map((territory) => territory.id).sort();
  if (territoryIds.length === 0) {
    throw new Error(`Monthly source ${sourceId} is not available in any App Store territory.`);
  }
  return {
    territoryIds,
    availableInNewTerritories: Boolean(availability?.data?.attributes?.availableInNewTerritories),
  };
}

async function ensurePrices(client, subscription, spec, territoryIds) {
  const points = await client.get(
    `subscriptions/${subscription.id}/pricePoints?filter[territory]=USA&include=territory&limit=8000`,
  );
  const usaPoint = selectPricePoint(points?.data ?? [], spec.usd);
  const equalizations = await client.get(
    `subscriptionPricePoints/${encodeURIComponent(usaPoint.id)}/equalizations?include=territory&limit=8000`,
  );
  const desiredPoints = [usaPoint, ...(equalizations?.data ?? [])];
  const desiredByTerritory = new Map();
  for (const point of desiredPoints) {
    const territoryId = point.relationships?.territory?.data?.id;
    if (territoryId && territoryIds.includes(territoryId)) {
      desiredByTerritory.set(territoryId, point.id);
    }
  }
  const missingTerritories = territoryIds.filter((id) => !desiredByTerritory.has(id));
  if (missingTerritories.length > 0) {
    throw new Error(
      `${spec.productId} has no equalized price point for: ${missingTerritories.join(", ")}`,
    );
  }

  const existing = await client.get(
    `subscriptions/${subscription.id}/prices?include=subscriptionPricePoint,territory&limit=200`,
  );
  const existingByTerritory = new Map(
    (existing?.data ?? []).map((price) => [
      price.relationships?.territory?.data?.id,
      price.relationships?.subscriptionPricePoint?.data?.id,
    ]),
  );
  for (const territoryId of territoryIds) {
    const desiredPointId = desiredByTerritory.get(territoryId);
    const existingPointId = existingByTerritory.get(territoryId);
    if (existingPointId === desiredPointId) continue;
    if (existingPointId) {
      throw new Error(
        `${spec.productId} already has a different price in ${territoryId}; refusing to overwrite it.`,
      );
    }
    await client.post("subscriptionPrices", buildPriceCreate(subscription.id, desiredPointId));
  }
  console.log(`  ✓ ${spec.productId}: configured ${territoryIds.length} equalized territory prices`);
}

async function ensureAvailability(client, subscription, source) {
  try {
    const current = await client.get(`subscriptions/${subscription.id}/subscriptionAvailability`);
    if (current?.data) {
      const territories = await client.get(
        `subscriptionAvailabilities/${subscription.id}/availableTerritories?limit=200`,
      );
      const ids = (territories?.data ?? []).map((territory) => territory.id).sort();
      if (JSON.stringify(ids) !== JSON.stringify(source.territoryIds)) {
        throw new Error(
          `${subscription.attributes?.productId} already has different territory availability; refusing to overwrite it.`,
        );
      }
      console.log(`  ✓ ${subscription.attributes?.productId}: availability already matches monthly tier`);
      return;
    }
  } catch (error) {
    if (!String(error.message).includes("HTTP 404")) throw error;
  }
  await client.post(
    "subscriptionAvailabilities",
    buildAvailabilityCreate(
      subscription.id,
      source.territoryIds,
      source.availableInNewTerritories,
    ),
  );
  console.log(`  ✓ ${subscription.attributes?.productId}: copied territory availability`);
}

export async function provisionAnnualSubscriptions(client = new AscClient()) {
  const app = await resolveCanonicalApp(client);
  const groupsResponse = await client.get(`apps/${app.id}/subscriptionGroups?limit=200`);
  const groups = groupsResponse?.data ?? [];
  if (groups.length !== 1) {
    throw new Error(`Expected exactly one PropLane subscription group; found ${groups.length}.`);
  }
  const group = groups[0];
  let inventory = await loadInventory(client, group.id);
  const byProductId = new Map(inventory.map((item) => [item.attributes?.productId, item]));

  // Validate every source before reserving either immutable annual product ID.
  for (const spec of ANNUAL_PRODUCT_SPECS) {
    const source = byProductId.get(spec.sourceProductId);
    if (!source) throw new Error(`Required monthly source ${spec.sourceProductId} does not exist.`);
    buildAnnualSubscriptionCreate(spec, source, group.id);
    await verifyMonthlySource(client, source, spec);
  }

  for (const spec of ANNUAL_PRODUCT_SPECS) {
    const source = byProductId.get(spec.sourceProductId);
    let annual = byProductId.get(spec.productId);
    if (!annual) {
      const created = await client.post(
        "subscriptions",
        buildAnnualSubscriptionCreate(spec, source, group.id),
      );
      annual = created?.data;
      if (!annual?.id) throw new Error(`Apple did not return the new ${spec.productId} resource.`);
      console.log(`  ✓ ${spec.productId}: created one-year product`);
      inventory = await loadInventory(client, group.id);
      annual = inventory.find((item) => item.attributes?.productId === spec.productId);
    }
    if (annual.attributes?.subscriptionPeriod !== "ONE_YEAR") {
      throw new Error(`${spec.productId} exists but is not a one-year subscription.`);
    }
    if (annual.attributes?.groupLevel !== source.attributes?.groupLevel) {
      throw new Error(`${spec.productId} exists at the wrong subscription group level.`);
    }

    await ensureLocalization(client, annual, spec);
    const availability = await sourceAvailability(client, source.id);
    await ensurePrices(client, annual, spec, availability.territoryIds);
    await ensureAvailability(client, annual, availability);
  }

  console.log("");
  console.log("✅ Created and verified both annual App Store subscription products.");
  console.log("Review screenshots and RevenueCat offering assignment must still be verified before submission.");
}

function entryHref(argvPath) {
  try {
    return pathToFileURL(realpathSync(argvPath)).href;
  } catch {
    return pathToFileURL(argvPath).href;
  }
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === entryHref(process.argv[1]);
if (invokedDirectly) {
  provisionAnnualSubscriptions().catch((error) => {
    console.error("");
    console.error(`❌ Annual subscription provisioning failed: ${error.message}`);
    process.exitCode = 1;
  });
}
