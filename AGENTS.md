<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Web + native (Capacitor)

Axis ships **one codebase** for the website and iOS/Android apps. The native shells load the deployed Next.js site in a WebView — portal features you add (e.g. resident Applications) appear in **both** after a Vercel deploy. Do not duplicate portal UI for mobile.

When changing portal nav, routes, push notifications, or uploads:

1. Update section registries in `src/lib/portals/*` and `render-portal-section.tsx`.
2. Keep `src/lib/platform/parity.ts` in sync (`IN_APP_PATH_PREFIXES`, `REGISTERED_PUSH_DEEP_LINKS`).
3. Run `npm run test:unit` — `tests/unit/platform-parity.test.ts` enforces parity.

See **`docs/web-and-native-parity.md`** and `.cursor/rules/web-native-parity.mdc`.
