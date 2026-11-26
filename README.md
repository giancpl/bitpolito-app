# BitPolito Hub

An Android-first encrypted team app: **Home · Tools · Profile**.
Nostr provides identity and relay delivery; Marmot/MLS protects the private team.
The Android app coordinates presence and the office doorbell without a BitPolito
application server. All interface text, notifications and member guides are English.

## Start here

- [Member and administrator guide](docs/distributed-guide.md)
- [Android build and testing](docs/android-guide.md)
- [Archived server installation and catalogue migration](legacy/README.md)

```bash
npm ci
npm run android:setup
npm run marmot:setup
npm run dev:relays
```

In another terminal:

```bash
npm run android:build
.android-local/sdk/platform-tools/adb reverse tcp:3480 tcp:3480
.android-local/sdk/platform-tools/adb reverse tcp:3481 tcp:3481
npm run android:install
```

The sandbox APK uses two persistent loopback Nostr relays, disposable identities,
and a separate encrypted runtime. It does not use the former port 3280 backend.
USB/ADB is needed only for the local relay sandbox. The team APK uses external
secure relays and does not require your PC:

```bash
npm run android:build -- team
```

No hosting, domain, Firebase project or application backend is required by that
APK. External relay availability and Android background behavior require a real
phone pilot. Debug APKs are not store releases.

## Browser preview

```bash
npm run dev
```

Open the Vite URL and select Alice, Bob, Cara or Drew. Open several tabs to try
multiple responders and approvals. This is a clearly labelled local UX simulator,
not a browser Marmot implementation. It uses disposable fixtures and local
browser state; never enter personal keys for routine preview tests.

## Identity and membership

Existing encrypted NIP-49 vaults are retained. Private identity keys stay in the
signing worker; Android Keystore protects the native encrypted MLS runtime.
Identity backup is mandatory when generating keys. Android NIP-55 and remote
NIP-46 signers require NIP-44 support. Name and description are private group
operations; BitPolito does not publish public profile/contact updates.

One active phone per member. A restored identity needs administrator approval
for its new phone. NIP-49 does not restore MLS history. Invitations last seven
days and require approval from the administrator who issued them.

## Office

Check in manually until you leave or the next midnight in Europe/Rome. Several
members may respond to one door request. Only the arriving member confirms
**I’m inside**, which completes the request and checks them in. Leaving is
immediate; delayed retries cannot check them back in.

The native listener uses a persistent Android notification while enabled and
checked in, or while a door request is active. It plays the short licensed cow
sound only for present members. Android can stop it; volume, silent mode,
Bluetooth, Do Not Disturb and battery restrictions remain device-controlled.
No Firebase gateway, hidden alarm or automatic volume changes are used.

## Preservation and migration

The former Fastify/SQLite server, its PWA and its deployment files were removed
from this branch and are preserved at the git tag `server-final`. Existing
databases are not reset, migrated into public relays, or deleted. To move the
catalogue, export it read-only and import it explicitly; see
[the archive notes](legacy/README.md).

## Development

| Command                           | What it does                                                   |
| --------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                     | Browser simulator with disposable identities                   |
| `npm run dev:relays`              | Two persistent loopback Nostr relays for the sandbox APK       |
| `npm run check`                   | Typecheck, lint, format check, unit tests and production build |
| `npm run test:e2e`                | Playwright workflows against the browser simulator             |
| `npm run format`                  | Format the TypeScript and CSS sources with Prettier            |
| `npm run android:build [-- team]` | Sandbox (default) or team debug APK                            |

Code layout:

- `src/lib/hub.ts` — the typed client (`team.*`) for every encrypted team
  operation. On Android it calls the native Marmot runtime; in the browser
  preview it calls the local simulator, which never ships in Android builds.
- `src/lib/queries.ts` — shared React Query hooks and cache keys.
- `src/lib/office.ts` — pure door-request wording, covered by unit tests.
- `android/app/src/main/java/it/bitpolito/hub/` — the native runtime
  (`HubRuntime`), Capacitor bridges and the office listener service.

The interface uses a clean light theme built around BitPolito electric blue and light surfaces. CI (`.github/workflows/ci.yml`)
runs the web checks, the simulator workflows and the Android sandbox build with
its JVM tests on every pull request.

## Verification

```bash
npm run check
npm run test:e2e
npm run android:build
npm run test:android:hub
npm run test:android:recovery
npm run test:android:protocol
```

MarmotKit is pinned to `0.19.0`, source
`3fce95465cdea1edc8456dbd1c6691d1c8dc1f2e`, with a verified native archive hash.
Generated Kotlin and JNI libraries are installed together under the ignored
`.android-local/marmot` directory. [Upstream release](https://github.com/marmot-protocol/mdk/releases/tag/marmotkit-v0.19.0).
