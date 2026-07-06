#!/usr/bin/env node
/**
 * Scrape All Property Management (allpropertymanagement.com) into structured JSON.
 *
 * Uses the site's public API + React Static routeInfo.json endpoints (no browser required).
 *
 * Usage:
 *   node scripts/scrape-allpropertymanagement.mjs
 *   node scripts/scrape-allpropertymanagement.mjs --output data/scrapes/apm
 *   node scripts/scrape-allpropertymanagement.mjs --quick          # smoke test (1 city, 2 blog pages)
 *   node scripts/scrape-allpropertymanagement.mjs --no-zip-search  # skip zip-based manager search
 *   node scripts/scrape-allpropertymanagement.mjs --delay 250
 *
 * Output layout:
 *   manifest.json
 *   site/home.json
 *   property-types.json
 *   cities/*.json
 *   property-managers/by-id/*.json
 *   property-managers/index.json
 *   search-by-zip/*.json
 *   blog/posts.json
 *   blog/pages/*.json
 *   resources/index.json
 *   property-laws/index.json
 *   property-laws/states/*.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE = "https://www.allpropertymanagement.com";
const API = "https://api.allpropertymanagement.com/public/v1";
const USER_AGENT = "AxisAPMScraper/1.0 (+research; contact: axis-seattle-housing.com)";

function parseArgs(argv) {
  const opts = {
    output: `data/scrapes/apm-${new Date().toISOString().slice(0, 10)}`,
    delayMs: 150,
    quick: false,
    zipSearch: true,
    managerDetails: true,
    zipsPerCity: 3,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--quick") opts.quick = true;
    else if (arg === "--no-zip-search") opts.zipSearch = false;
    else if (arg === "--no-manager-details") opts.managerDetails = false;
    else if (arg === "--output") opts.output = argv[++i] ?? opts.output;
    else if (arg === "--delay") opts.delayMs = Number(argv[++i] ?? opts.delayMs);
    else if (arg === "--zips-per-city") opts.zipsPerCity = Number(argv[++i] ?? opts.zipsPerCity);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/scrape-allpropertymanagement.mjs [options]

  --output <dir>         Output directory (default: data/scrapes/apm-YYYY-MM-DD)
  --delay <ms>           Pause between requests (default: 150)
  --quick                Smoke test: 1 city, 2 blog pages, no zip search
  --no-zip-search        Skip zip-based property manager search
  --no-manager-details   Skip per-manager profile fetches
  --zips-per-city <n>    Zip codes to search per city (default: 3)
`);
      process.exit(0);
    }
  }
  if (opts.quick) {
    opts.zipSearch = false;
    opts.zipsPerCity = 1;
  }
  return opts;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${url}${body ? `: ${body.slice(0, 120)}` : ""}`);
  }
  return res.json();
}

async function routeInfo(sitePath) {
  const normalized = sitePath.replace(/\/$/, "") || "";
  return fetchJson(`${SITE}${normalized}/routeInfo.json`);
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function citySlug(state, city) {
  return `${String(state).toLowerCase()}-${String(city).toLowerCase().replace(/\s+/g, "-")}`;
}

function collectManagerIdsFromGeo(geo) {
  const ids = new Set();
  const add = (row) => {
    if (row?.Id) ids.add(row.Id);
  };
  for (const rows of Object.values(geo?.TopRatedPropertyManagers ?? {})) {
    if (Array.isArray(rows)) rows.forEach(add);
  }
  for (const row of geo?.AdditionalPropertyManagers ?? []) add(row);
  return ids;
}

function collectManagerIdsFromSearch(search) {
  const ids = new Set();
  for (const row of search?.PropertyManagers ?? []) {
    if (row?.Id) ids.add(row.Id);
  }
  return ids;
}

async function paginateZipSearch(zip, delayMs) {
  const all = [];
  let offset = 1;
  let total = Infinity;
  while (offset <= total) {
    const page = await fetchJson(`${API}/propertyManagers/search?zip=${encodeURIComponent(zip)}&offset=${offset}`);
    total = page.Total ?? 0;
    all.push(page);
    const count = page.PropertyManagers?.length ?? 0;
    if (!count) break;
    offset += count;
    await sleep(delayMs);
  }
  return all;
}

async function main() {
  const opts = parseArgs(process.argv);
  const outDir = path.resolve(opts.output);
  const stats = {
    cities: 0,
    managerProfiles: 0,
    zipSearches: 0,
    blogPages: 0,
    blogPosts: 0,
    resourceArticles: 0,
    lawStates: 0,
    errors: [],
  };
  const managerIds = new Set();

  console.log(`Scraping allpropertymanagement.com → ${outDir}`);
  await mkdir(outDir, { recursive: true });

  const throttle = async () => {
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  };

  // --- Property types ---
  console.log("→ property types");
  const propertyTypes = await fetchJson(`${API}/propertyTypes/`);
  await writeJson(path.join(outDir, "property-types.json"), propertyTypes);
  await throttle();

  // --- Home / featured cities ---
  console.log("→ home + featured cities");
  const home = await routeInfo("");
  await writeJson(path.join(outDir, "site/home.json"), home);
  let featuredCities = home.data?.featuredCities ?? [];
  if (opts.quick) featuredCities = featuredCities.slice(0, 1);
  await throttle();

  // --- Cities (geo listings + routeInfo) ---
  console.log(`→ ${featuredCities.length} city pages`);
  for (const entry of featuredCities) {
    const state = entry.State;
    const city = entry.City;
    const slug = citySlug(state, city);
    try {
      const geo = await fetchJson(`${API}/propertyManagers/geo?state=${encodeURIComponent(state)}&city=${encodeURIComponent(city)}`);
      const cityPath = `/property-management/${String(state).toLowerCase()}/${String(city).toLowerCase()}`;
      let cityRoute = null;
      try {
        cityRoute = await routeInfo(cityPath);
      } catch (e) {
        stats.errors.push({ section: "city-routeInfo", city: slug, error: String(e.message ?? e) });
      }
      await writeJson(path.join(outDir, "cities", `${slug}.json`), {
        state,
        city,
        sitePath: cityPath,
        geo,
        routeInfo: cityRoute,
      });
      for (const id of collectManagerIdsFromGeo(geo)) managerIds.add(id);
      stats.cities++;
    } catch (e) {
      stats.errors.push({ section: "city", city: slug, error: String(e.message ?? e) });
    }
    await throttle();
  }

  // --- Zip-based manager search (per city) ---
  if (opts.zipSearch) {
    console.log(`→ zip search (${opts.zipsPerCity} zips/city)`);
    for (const entry of featuredCities) {
      const state = entry.State;
      const city = entry.City;
      try {
        const areas = await fetchJson(`${API}/searchAreas?location=${encodeURIComponent(city)}`);
        const zips = [...new Set((areas ?? []).map((a) => a.Zip).filter(Boolean))].slice(0, opts.zipsPerCity);
        for (const zip of zips) {
          try {
            const pages = await paginateZipSearch(zip, opts.delayMs);
            await writeJson(path.join(outDir, "search-by-zip", `${zip}.json`), {
              zip,
              state,
              city,
              pages,
            });
            for (const page of pages) {
              for (const id of collectManagerIdsFromSearch(page)) managerIds.add(id);
            }
            stats.zipSearches++;
          } catch (e) {
            stats.errors.push({ section: "zip-search", zip, error: String(e.message ?? e) });
          }
          await throttle();
        }
      } catch (e) {
        stats.errors.push({ section: "searchAreas", city, error: String(e.message ?? e) });
      }
    }
  }

  // --- Property manager profiles ---
  const idList = [...managerIds].sort((a, b) => a - b);
  console.log(`→ ${idList.length} unique property manager profiles`);
  const managerIndex = [];
  if (opts.managerDetails) {
    for (const id of idList) {
      try {
        const profile = await fetchJson(`${API}/propertyManagers/${id}`);
        await writeJson(path.join(outDir, "property-managers/by-id", `${id}.json`), profile);
        managerIndex.push({ id, name: profile.Name, state: profile.Address?.State, city: profile.Address?.City });
        stats.managerProfiles++;
      } catch (e) {
        stats.errors.push({ section: "manager", id, error: String(e.message ?? e) });
      }
      await throttle();
    }
  } else {
    for (const id of idList) managerIndex.push({ id });
  }
  await writeJson(path.join(outDir, "property-managers/index.json"), {
    count: idList.length,
    managers: managerIndex,
  });

  // --- Blog (paginated routeInfo) ---
  console.log("→ blog posts");
  const allBlogPosts = [];
  const maxBlogPages = opts.quick ? 2 : 100;
  for (let page = 1; page <= maxBlogPages; page++) {
    const blogPath = page === 1 ? "/blog" : `/blog/${page}`;
    let payload;
    try {
      payload = await routeInfo(blogPath);
    } catch {
      break;
    }
    const posts = payload.data?.blogPosts ?? [];
    if (!posts.length) break;
    await writeJson(path.join(outDir, "blog/pages", `${String(page).padStart(3, "0")}.json`), payload);
    allBlogPosts.push(...posts);
    stats.blogPages++;
    stats.blogPosts += posts.length;
    await throttle();
  }
  await writeJson(path.join(outDir, "blog/posts.json"), {
    count: allBlogPosts.length,
    featuredBlogPost: allBlogPosts[0] ?? null,
    posts: allBlogPosts,
  });

  // --- Resources hub ---
  console.log("→ resources");
  const resources = await routeInfo("/resources");
  stats.resourceArticles = resources.data?.resources?.length ?? 0;
  await writeJson(path.join(outDir, "resources/index.json"), resources);
  await throttle();

  // --- Property management laws by state ---
  console.log("→ property management laws (by state)");
  const lawsIndex = await routeInfo("/resources/property-management-laws");
  const lawStates = lawsIndex.data?.propertyManagementLawsStates ?? [];
  if (opts.quick) {
    await writeJson(path.join(outDir, "property-laws/index.json"), {
      ...lawsIndex,
      data: { ...lawsIndex.data, propertyManagementLawsStates: lawStates.slice(0, 2) },
    });
    for (const stateDoc of lawStates.slice(0, 2)) {
      const uid = stateDoc.uid;
      if (!uid) continue;
      try {
        const detail = await routeInfo(`/resources/property-management-laws/${uid}`);
        await writeJson(path.join(outDir, "property-laws/states", `${uid}.json`), detail);
        stats.lawStates++;
      } catch (e) {
        stats.errors.push({ section: "law-state", uid, error: String(e.message ?? e) });
      }
      await throttle();
    }
  } else {
    await writeJson(path.join(outDir, "property-laws/index.json"), lawsIndex);
    for (const stateDoc of lawStates) {
      const uid = stateDoc.uid;
      if (!uid) continue;
      try {
        const detail = await routeInfo(`/resources/property-management-laws/${uid}`);
        await writeJson(path.join(outDir, "property-laws/states", `${uid}.json`), detail);
        stats.lawStates++;
      } catch (e) {
        stats.errors.push({ section: "law-state", uid, error: String(e.message ?? e) });
      }
      await throttle();
    }
  }

  const manifest = {
    source: SITE,
    apiBase: API,
    scrapedAt: new Date().toISOString(),
    outputDir: outDir,
    options: opts,
    stats: {
      ...stats,
      uniqueManagerIds: idList.length,
    },
    errors: stats.errors,
  };
  delete manifest.options.delayMs;
  await writeJson(path.join(outDir, "manifest.json"), manifest);

  console.log("\nDone.");
  console.log(JSON.stringify(manifest.stats, null, 2));
  if (stats.errors.length) {
    console.warn(`${stats.errors.length} non-fatal error(s) — see manifest.json`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
