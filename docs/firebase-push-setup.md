# Firebase push setup (step-by-step)

Use this after `ios/` and `android/` exist and the app runs in a simulator. Push delivery uses `sendPushToUser()` in `src/lib/push-notifications.server.ts`.

## 1. Create Firebase project

1. Open [Firebase Console](https://console.firebase.google.com) → **Add project** (e.g. `axis-housing`).
2. Disable Google Analytics if you do not need it (optional).

## 2. Android app

1. Firebase → **Add app** → **Android**.
2. Package name: `com.axisseattlehousing.app` (must match `capacitor.config.ts`).
3. Download **`google-services.json`**.
4. Place it at:
   ```
   android/app/google-services.json
   ```
5. Run `npm exec cap sync android`.

## 3. iOS app

1. Firebase → **Add app** → **iOS**.
2. Bundle ID: `com.axisseattlehousing.app`.
3. Download **`GoogleService-Info.plist`**.
4. In Xcode (`npm exec cap open ios`), drag the file into **App → App** (check “Copy items if needed”).
5. Run `npm exec cap sync ios`.

## 4. Apple Push (APNs) in Firebase

1. [Apple Developer](https://developer.apple.com/account/resources/authkeys/list) → **Keys** → **+** → enable **Apple Push Notifications service (APNs)**.
2. Download the `.p8` key (one-time). Note **Key ID** and your **Team ID**.
3. Firebase → **Project settings** → **Cloud Messaging** → **Apple app configuration**.
4. Upload the APNs auth key (.p8), enter Key ID and Team ID.

## 5. Xcode capabilities (iOS)

Open `ios/App/App.xcworkspace` or the App project in Xcode:

1. Target **App** → **Signing & Capabilities** → select your **Team**.
2. **+ Capability** → **Push Notifications**.
3. **+ Capability** → **Background Modes** → check **Remote notifications**.

## 6. Server env (Vercel + `.env.local`)

Firebase → **Project settings** → **Service accounts** → **Generate new private key**.

From the downloaded JSON, set:

```env
FCM_PROJECT_ID=your-project-id
FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Redeploy Vercel after saving. Until these are set, push calls no-op safely.

## 7. Supabase table

Apply the migration if not already applied:

```bash
npm run db:apply-sql
# or run supabase/migrations/20260628120000_device_push_tokens.sql in Supabase SQL Editor
```

## 8. Test on device or simulator

1. Build and run the app (`npm exec cap open ios` → Run).
2. Sign in as a resident.
3. **Profile** → **Enable notifications** (grants permission and registers the device token).
4. Confirm a row appears in `device_push_tokens` for your user.
5. Trigger a reminder cron locally or wait for the scheduled job; you should receive a push with a deep link (e.g. `/resident/payments`).

### iOS simulator note

Push on the **simulator** works on recent Xcode versions when using APNs sandbox + a signed build. Physical device testing is more reliable for first validation.

## 9. Files you must not commit

Add to `.gitignore` if needed (service account JSON):

- `*-firebase-adminsdk-*.json` (download from Firebase; use env vars on the server instead)
- Personal signing keys (`.p8`)

`google-services.json` and `GoogleService-Info.plist` are usually committed (they are not secret API keys).
