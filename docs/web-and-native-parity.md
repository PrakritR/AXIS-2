# Web + native parity

Axis ships **one codebase** for the website and the iOS/Android apps.

| Layer | Web | Native app |
| --- | --- | --- |
| **Portal UI, auth, APIs** | Next.js on Vercel | Same — Capacitor WebView loads the deployed site |
| **Deploy** | `git push` → Vercel | Automatic on next app launch (no store review) |
| **Push, camera, status bar** | N/A or web APIs | Capacitor plugins via `src/lib/native/*` |

Most features — including new resident portal tabs like **Applications** — only need a **Vercel deploy**. You do not maintain a separate “app UI.”

---

## When you change product code

Use this checklist (also in `src/lib/platform/parity.ts` as `PLATFORM_CHANGE_CHECKLIST`):

1. **Portal section / nav** — Update `src/lib/portals/*-sections.ts` (or portal definition), `render-portal-section.tsx`, and tier gating in `manager-access.ts` if needed. **Nav order is defined only in those registries** — web sidebar, web mobile chrome, and the native bottom bar all use the same order (see [Nav order](#nav-order) below).
2. **In-app route** — If the path is new (e.g. `/billing/...`), add its prefix to `IN_APP_PATH_PREFIXES` in `src/lib/platform/parity.ts` so deep links and push taps work in the app.
3. **Push notification** — Use `sendPushToUser` with an in-app `url`. Register the path in `REGISTERED_PUSH_DEEP_LINKS`; `assertInAppPushPath` validates at send time.
4. **Photo upload** — Use `useNativeCamera()` so the app gets the native picker and the web keeps `<input type="file">`.
5. **Layout on notched phones** — Use `portal-layout-classes.ts` and `html[data-native]` CSS (set by `NativeBridge`).
6. **Tests** — Run `npm run test:unit` — `tests/unit/platform-parity.test.ts` and `tests/unit/portal-nav-order.test.ts` guard registries and web/native nav parity.
7. **Native shell only** — Plugins, icons, `Info.plist` permissions: `npx cap sync` and rebuild in Xcode / Android Studio.

---

## Registries (single source of truth)

| File | Purpose |
| --- | --- |
| `src/lib/platform/parity.ts` | In-app path prefixes, push deep links, validation helpers |
| `src/lib/portals/pro.ts` | Pro/manager nav section order |
| `src/lib/portals/admin.ts` | Admin nav section order |
| `src/lib/portals/resident-sections.ts` | Resident nav sections, free-tier ids, smoke-test paths |
| `src/lib/native/portal-bottom-nav.ts` | Native bottom bar — full order (pins Settings last) plus curated per-kind primary sets (`NATIVE_BOTTOM_NAV_*_PRIMARY`) for the fixed scroll strip |
| `src/lib/auth/native-entry-paths.ts` | Re-exports deep-link helpers from parity |
| `tests/unit/platform-parity.test.ts` | CI guard — sections, tier gating, push paths |
| `tests/unit/portal-nav-order.test.ts` | CI guard — web/native nav order parity and free/paid grouping |

---

## Nav order

Portal navigation order has **one source of truth**: the section arrays in `pro.ts`, `admin.ts`, and `resident-sections.ts`.

| Surface | How order is applied |
| --- | --- |
| Web desktop sidebar | **Not** registry order — grouped independently by fixed per-group lists in `src/lib/portals/nav-groups.ts` (`PRO_GROUPS` etc). Reordering the registry has no effect here. |
| Web mobile top chrome | Same `navItems` as sidebar, registry order |
| Native bottom bar (fixed primary strip) | `splitNativeBottomNavItems()` intersects the registry with a curated per-kind primary set (`NATIVE_BOTTOM_NAV_PRO_MANAGER_PRIMARY`, `..._RESIDENT_PRIMARY`, `..._ADMIN_PRIMARY`, `..._VENDOR_PRIMARY`) — only those sections get a one-tap slot; the rest overflow to the "more" sheet |
| Native "more sections" sheet | Full ordered list (`orderNativeBottomNavItems()`), unfiltered — includes primary-bar sections too, plus locked and overflowed ones |

Do **not** add a second preferred-order list for native. When reordering tabs, update the registry only. To promote or demote which sections get a one-tap primary-bar slot, edit that kind's `NATIVE_BOTTOM_NAV_*_PRIMARY` array in `portal-bottom-nav.ts` — everything not in it still stays reachable via the "more" sheet.

**Pro/manager (Free tier UX):** free operational sections first (`dashboard` … `payments`), then a contiguous paid block (`documents` … `relationships`), then account items (`plan`, `bugs-feedback`), then `profile` (Settings). Only `properties`, `calendar`, `residents`, `documents`, and `inbox` get primary-bar slots; `services` and everything else in the paid block is reachable via the "more" sheet.

**Resident:** free sections first (`dashboard` … `move-in`), then locked sections (`communication`, `documents`, and `services` when approved), then `bugs-feedback` and `profile`.

Tier locking (`manager-access.ts`) does not reorder nav — lock icons render inline at registry positions.

---

## Verifying in the native app

Production WebView (default):

```bash
npx cap open ios      # or cap:android
```

Local dev server on a device/simulator:

```bash
CAP_SERVER_URL=http://<your-LAN-ip>:3000 npx cap sync
npm run dev
```

Smoke-test the same URLs you use in the browser, e.g. `/resident/applications`.

---

## For AI agents / contributors

Read `.cursor/rules/web-native-parity.mdc` and `AGENTS.md` § Web + native before portal or notification work. **Never build a parallel “mobile-only” UI** for portal features — extend the shared Next.js routes and registries above.
