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

1. **Portal section / nav** — Update `src/lib/portals/*-sections.ts` (or portal definition), `render-portal-section.tsx`, and tier gating in `manager-access.ts` if needed.
2. **In-app route** — If the path is new (e.g. `/billing/...`), add its prefix to `IN_APP_PATH_PREFIXES` in `src/lib/platform/parity.ts` so deep links and push taps work in the app.
3. **Push notification** — Use `sendPushToUser` with an in-app `url`. Register the path in `REGISTERED_PUSH_DEEP_LINKS`; `assertInAppPushPath` validates at send time.
4. **Photo upload** — Use `useNativeCamera()` so the app gets the native picker and the web keeps `<input type="file">`.
5. **Layout on notched phones** — Use `portal-layout-classes.ts` and `html[data-native]` CSS (set by `NativeBridge`).
6. **Tests** — Run `npm run test:unit` — `tests/unit/platform-parity.test.ts` fails if registries drift.
7. **Native shell only** — Plugins, icons, `Info.plist` permissions: `npx cap sync` and rebuild in Xcode / Android Studio.

---

## Registries (single source of truth)

| File | Purpose |
| --- | --- |
| `src/lib/platform/parity.ts` | In-app path prefixes, push deep links, validation helpers |
| `src/lib/portals/resident-sections.ts` | Resident nav sections, free-tier ids, smoke-test paths |
| `src/lib/auth/native-entry-paths.ts` | Re-exports deep-link helpers from parity |
| `tests/unit/platform-parity.test.ts` | CI guard — sections, tier gating, push paths |

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
