# BitPolito Android — local pilot

The Android app uses the existing private backend. Home, Tools and Profile are
stable pages; short actions and confirmations use dialogs. Nothing in Office is
published to Nostr relays. Internal profile edits do not publish a Nostr profile.
The browser remains a useful technical preview, with its existing cookie session.

## Build and install the sandbox

Requirements: Node 22.12+, Linux x86_64, internet for the first dependency/SDK
installation, an Android 8+ phone with an updated WebView and USB debugging.

```bash
npm ci
npm run android:setup
npm run android:build
npm run dev:android-sandbox
```

The setup script installs JDK 21 and SDK/target 36 under `.android-local/` and
accepts the Android SDK licenses for that toolchain. It does not replace system
Java. The debug signing key also lives there: retain it to install later debug
updates without uninstalling and losing the device vault.

Run the sandbox backend once and leave it running. If this workspace already
has its Android sandbox listening on 3280, reuse that process.

In another terminal, unlock the phone and approve its USB debugging prompt:

```bash
.android-local/sdk/platform-tools/adb devices
.android-local/sdk/platform-tools/adb reverse tcp:3280 tcp:3280
.android-local/sdk/platform-tools/adb install -r artifacts/bitpolito-sandbox.apk
```

Open **BitPolito** (sandbox package `it.bitpolito.hub.sandbox`). A clearly marked
local picker offers Alice (admin), Bob, Cara (members), Drew (not yet a member).
Signatures use disposable identities, never a personal extension or key. Alice
can invite Drew. The Android sandbox listens only on `127.0.0.1:3280` and stores
its database at `data/android-sandbox`; it never changes `data/sandbox` or the
normal Docker volume. Keep the backend running and reapply `adb reverse` after
reconnecting the device. Multiple USB devices need `adb -s DEVICE ...`.

No Firebase configuration is required for navigation, presence, door requests,
identity recovery or foreground sound testing. The alerts page explicitly says
that background push is not configured. The PC is not exposed to the network.

## Member walkthrough

- **Home:** check in when you arrive; this makes you available to open. Tap
  **I'm leaving** whenever you go. Presence clears at Rome midnight.
- Outside, tap **Ring the office**. Requests arrive as cards; one teammate can
  claim. The arriving person presses **I'm inside**, becoming present immediately.
- **Tools:** browse the existing curated collection; external links use the
  device browser. Admins manage the catalogue through Profile.
- **Profile → Identity & recovery:** save an encrypted backup. Both the file and
  password are required to recover. The app cannot reset them.
- **Profile → Help:** optional guides; no demonstration rings are sent.

On a fresh identity, the Android file picker must successfully write the backup
before the app enables onboarding confirmation. Cancelled save, wrong password,
and cancelled signer remain recoverable. Restoring on Android uses the file
picker. A browser vault must be explicitly exported and restored; it never moves
automatically between localhost, Android and a future domain.

The encrypted NIP-49 vault and session token are additionally wrapped by Android
Keystore and excluded from Android cloud/device-transfer backups. Private keys
are decrypted only inside the signing worker. Reload, logout and 15 minutes of
inactivity lock it, including time spent in background. The app session lasts
seven days independently, subject to immediate membership revocation. Native
session credentials never enter JavaScript and are attached only to the compiled
backend origin. Uninstalling deletes local keys; keep the separate recovery file.

Existing identities: Android offers a NIP-55 signer app, NIP-49 restore, or NIP-46
remote signer. NIP-07 remains browser-only. A signer must approve the NIP-98
login request; cancellation does not complete login. External signers own their
backup. Check NIP-55 interoperability on the chosen signer before the team pilot.

## Enable real Android push later

Create a Firebase project and register each package that will be tested. Keep
configuration and credentials outside Git:

1. Put the matching client file at `android/app/google-services.json` (or the
   appropriate flavor directory). Both sandbox and team need matching Firebase
   Android package registrations if using one multi-client file.
2. On the backend set `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS`
   to the absolute path of a protected service-account JSON file. Never ship that
   file in the APK, web bundle, Docker image or repository. Mount it read-only for
   a future deployment; `deploy/compose.android.example.yaml` supplies an optional
   override using the external `FCM_CREDENTIAL_FILE` path. These are independent of existing Web Push VAPID keys.
3. Rebuild the APK and restart the backend; choose **Profile → Office alerts →
   Enable office alerts**. Allow Android notifications. Test cow sound, confirm
   whether you heard it, then test a notification with the app in background.

FCM uses data-only messages. A native service verifies current session,
membership, presence and request state before ringing, even when the web process
is absent. Without a timely backend response it suppresses an uncertain alert.
The native coordinator deduplicates polling and push; Android never plays the
web audio path. Requester updates are silent. The persistent server queue retries
per device, discarding obsolete work; only one reminder is queued after 60s.

The Office doorbell channel uses the short, licensed local cow sound and
vibration, without alarm privileges. Android controls volume, Do Not Disturb,
Bluetooth routing, notification permission and battery restrictions. Force stop
in system settings blocks delivery until the user opens the app again. A debug
USB tunnel must remain connected to validate notifications against the PC.

## Build without sandbox identities

```bash
ANDROID_API_ORIGIN=https://your-final-backend.example npm run android:build -- team
```

This creates `artifacts/bitpolito-team.apk` as a local **debug** build, not a store
release. Team builds require HTTPS, reject sandbox frontend assets and exclude
the test identity picker and debug push receiver. Cookies, CORS and web origin
checks remain strict. No hosting, domain purchase, public tunnel or publishing is
performed by these commands. Distribution signing and a shared VPS come later.
Keep the eventual release signing key protected and stable.

## Verification commands and physical checklist

```bash
npm run typecheck
npm test -- --run
npm run test:e2e
npm run test:pwa
npm run test:sandbox
npm run android:build
```

Stop the manually running web sandbox before its temporary test suite. Tests
use disposable databases; don't point fixtures at production storage.
Native JVM tests run during the APK build. Optional emulator setup:
`bash scripts/android-emulator.sh` (downloads an Android 36 image; several GB).
On this Linux host, the host GPU renderer boots; the headless software renderer
crashed, so the script uses the working renderer. Once the APK is open,
`node scripts/android-smoke.mjs` checks real WebView/native navigation and Moo.
`node scripts/android-recovery-smoke.mjs` exercises the Android file picker on a
clean disposable emulator; it refuses to overwrite an existing encrypted vault.
These scripts require the dedicated backend on 3280.
`node scripts/android-push-smoke.mjs` additionally simulates native background
notifications, duplicates, stale state and the request deep link using the
sandbox-only receiver. None of these scripts tests real FCM delivery.
 With an emulator/device connected:

```bash
export JAVA_HOME="$PWD/.android-local/jdk"
export ANDROID_HOME="$PWD/.android-local/sdk"
export ANDROID_USER_HOME="$PWD/.android-local/user"
export GRADLE_USER_HOME="$PWD/.android-local/gradle"
(cd android && ./gradlew :app:connectedSandboxDebugAndroidTest --no-daemon)
```

Run instrumented tests only on a disposable sandbox emulator: the Gradle runner
can reinstall/uninstall its test package and app. Do not use a device vault with
personal keys for these destructive fixtures. The tests verify actual Keystore
tamper rejection, stale-session protection, native HTTP and notification channels. The sandbox-only `SIMULATE_PUSH` receiver supports local
verification of server-state filtering and duplicate handling; it does **not**
prove Firebase delivery and is absent from team builds.

Before shared use, record results on a physical Android phone for:

- Home → Tools → Profile, Android Back, keyboard, large fonts and TalkBack.
- Create/save/restore backup, wrong password, save cancellation, background lock,
  real NIP-55 return/cancellation, and NIP-46 connection.
- Alice and Bob present; Cara rings; simultaneous claims select one person;
  Cara confirms inside then leaves immediately. Restart during an active request.
- Actual FCM with foreground, background, locked screen and killed process;
  duplicates, stale messages, lost network, revoked membership and leaving.
- Permission denied, volume zero/low, silent mode, Do Not Disturb, Bluetooth,
  battery restrictions and force stop. Record what is audible; never infer it
  from a successful API call or subscription alone.

Real FCM, physical sound audibility and signer interoperability are separate
acceptance checks; a successful APK build or browser suite cannot certify them.

Protocol references: [NIP-55 Android signers](https://github.com/nostr-protocol/nips/blob/master/55.md),
[NIP-49 encrypted backups](https://github.com/nostr-protocol/nips/blob/master/49.md),
[Capacitor 8 migration](https://capacitorjs.com/docs/updating/8-0), and
[FCM message priority](https://firebase.google.com/docs/cloud-messaging/android/message-priority).
