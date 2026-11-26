# Android build and verification

## Requirements

Node 22.12+, Linux build tools and USB debugging or an Android emulator.
`npm run android:setup` installs an isolated JDK 21 and Android SDK 36 under
`.android-local`; it does not replace system Java. Android 8/API 26 is the minimum.

## Release builds

Debug APKs are for pilots. For a signed release, provide a keystore through
environment variables (or Gradle properties of the same name) and a version:

```bash
export BITPOLITO_KEYSTORE=/secure/path/bitpolito.jks
export BITPOLITO_KEYSTORE_PASSWORD=… BITPOLITO_KEY_ALIAS=… BITPOLITO_KEY_PASSWORD=…
npm run build
npx cap sync android
(cd android && ./gradlew :app:assembleTeamRelease -PversionCode=2 -PversionName=1.1)
```

The release signing config applies only when all four variables are set. Never
commit the keystore. Code shrinking stays off because MarmotKit's JNA/uniffi
bindings rely on reflection.

```bash
npm ci
npm run android:setup
npm run marmot:setup
```

MarmotKit 0.19.0 archive SHA-256:
`9f4dd11478265a24a98f1f0c40768b7e8eba8f1fbd4fe7b129b2f09198e3a8e4`.
The installer rejects a mismatched archive. All generated Kotlin/JNI files come
from the same release. Do not replace individual ABI files or use `master`.

## Local relay sandbox

```bash
npm run dev:relays
```

Relays bind only `127.0.0.1:3480` and `127.0.0.1:3481`, storing separate SQLite
files under `data/relay-sandbox`. They contain disposable test traffic. No
application API or port 3280 server is needed. Stop the command with Ctrl+C;
restart it to retain relay records.

```bash
npm run android:build
.android-local/sdk/platform-tools/adb reverse tcp:3480 tcp:3480
.android-local/sdk/platform-tools/adb reverse tcp:3481 tcp:3481
npm run android:install
```

The package is `it.bitpolito.hub.sandbox`. Use Alice, Bob, Cara or Drew only in
this labelled build. Create a team explicitly with Alice, then create personal
invitations. Test the same protocol with separate emulator/phone installations;
multiple browser tabs test only the UX simulator.

## External relay APK

```bash
npm run android:build -- team
.android-local/sdk/platform-tools/adb install -r artifacts/bitpolito-team.apk
```

This package is `it.bitpolito.hub`; disposable identity controls and their keys
are excluded from its web assets. It defaults to secure White Noise EU/US
endpoints. They share one operator. Administrators can publish relay-routing
updates under Administration; add new endpoints before retiring previous ones.
No Firebase credentials or backend origin are compiled into the APK.

Artifacts are debug-signed local test builds. Release signing and store
publication are separate work. Keep both identity backups and passwords before
changing packages: sandbox and team have separate private storage. Never copy
an MLS database into a second phone as a device migration strategy.

## Native protocol test

With the two local relays running and ADB reverse configured, compile the test
APK using the isolated toolchain. Install both APKs with `adb install -r`, then:

```bash
.android-local/sdk/platform-tools/adb shell am instrument -w -e class it.bitpolito.hub.MarmotIntegrationTest it.bitpolito.hub.sandbox.test/androidx.test.runner.AndroidJUnitRunner
```

The test creates disposable identities in its own encrypted runtime root. It
checks an authenticated Welcome, encrypted custom-event delivery through the
relays and persistence after runtime reconstruction. It never opens the user's
identity vault. A native test run is not proof of background delivery on a phone.

## Native app workflow test

After installing the labelled sandbox APK, run:

```bash
npm run test:android:hub
```

This opt-in test connects only disposable fixture identities on the installed
sandbox. It refuses a non-fixture signed-in identity, uses the real Android
bridge and two loopback relays, and never replaces an existing identity vault.
It exercises encrypted approval and the office workflow.

## Physical Android pilot

Use dedicated test identities and at least two administrators on distinct
phones. Keep the PC off when testing the external-relay APK.

- Check in Alice and Bob; ring as Cara. Both may respond. Cara confirms entry,
  then immediately leaves. Verify all screens converge.
- Enable office alerts explicitly. Confirm the persistent notification; test
  the sound and answer whether it was audible.
- Test foreground, screen lock, app background, Doze, low battery, denied
  notification permission, low/zero volume, silent mode, DND and Bluetooth.
- Test a dropped relay, airplane mode and reconnection. Expired/cancelled
  requests must not produce delayed sound.
- Force-stop and restart the app and reboot the phone. Do not expect automatic
  reactivation of the listener; open the app and explicitly resume listening.
- Verify NIP-55 with the chosen installed signer, including denial/cancellation,
  and NIP-46 with the required identity-proof and NIP-44 permissions.
- Check TalkBack, large fonts, Back, keyboard and recovery without interruptions.

Do not describe background alerts as reliable until these physical checks pass.

For a non-destructive recovery check with the installed sandbox open:

```bash
npm run test:android:recovery
```

This creates a disposable key inside a separate real signing worker, tests the
Android save/import pickers and wrong passwords, and compares the existing
vault fingerprint. It never writes to or replaces the app's saved vault.
Full identity onboarding and the mandatory backup gate are also covered by the
isolated browser regression suite.

Run the three-independent-runtime protocol suite with the relays already open:

```bash
npm run test:android:protocol
```

It installs the sandbox test APK in place, uses separate encrypted test roots,
and preserves existing vault records. Instrumentation restarts the app process;
finish the UI smoke test before starting it. This does not certify physical
phone background delivery or compatibility with a particular external signer.

The independent-runtime suite also tests encrypted office operations, two
responders, restart replay and a phone replacement. The disposable replacement
identity explicitly retires its previous public KeyPackages before re-admission;
the removed phone must not decrypt subsequent updates. Normal onboarding asks
for separate consent before such retirement and rejects multiple-phone admission.

## Relay failure check

After the native workflow test leaves Cara outside with Alice/Bob present, wait
at least 60 seconds before another new ring. `node scripts/android-relay-failover.mjs`
checks one-relay publication, duplicate retry, cancellation and reload with the
currently connected disposable fixture. It refuses personal identities, active
requests and an inside requester. A controlled test may pause one owned local
relay while running it; always resume that relay in a finally block. The final
verification used this method against port 3480 and restored both healthy relays.

This check does not replace the physical Android pilot or test a phone whose
network is completely disconnected.
