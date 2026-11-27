# BitPolito Hub

A private Android space for the BitPolito team: **Home · Tools · Profile**.
Check who is in the office, ring the doorbell and share useful tools and resources.
The interface is entirely in English, with BitPolito’s blue, typography and illustrations.

Nostr provides identity and relay delivery. Marmot/MLS encrypts the team’s data.
The team APK uses external relays: no BitPolito backend, Firebase, hosting or PC
needs to stay running. The browser is a local UX simulator.

## Download the Android test app

**[Download BitPolito for Android (ARM64 APK)](https://github.com/giancpl/bitpolito-app/raw/refs/heads/improve/distributed-cleanup/downloads/bitpolito-team-arm64-v8a.apk)**

[SHA-256 checksum](downloads/bitpolito-team-arm64-v8a.apk.sha256) ·
[Build details](downloads/build-info.json) · [Installation guide](docs/android-guide.md)

This is a debug-signed test build, **not a GitHub release or store release**.
It supports Android 8+ on ARM64 phones, including the Pixel 9 Pro. Older 32-bit
phones and x86 emulators need a different build. The file is served directly by
GitHub; you do not need an Actions account or a local build environment.

1. Open the APK link on your Android phone and download it.
2. Open the file and allow installation from that browser/files app if Android asks.
3. Create a dedicated test identity or connect a compatible Nostr signer.
4. Join through a personal invitation. Only the first administrator creates the
   team; everyone else joins that existing team after approval.
5. Save your identity backup under **Profile → Identity & recovery**.

Install future updates over the existing app. Do not uninstall to solve an
update problem: uninstalling removes local identity and group state. The test
APK retains the local debug signing certificate; its private keystore is not
in Git. Verify the downloaded file against the checksum before installing.

## What to try

- **Home:** check in, see present teammates and ring the office when outside.
- **Doorbell:** several present members can respond. Only the arriving member
  confirms **I’m inside**, which checks them in. **I’m leaving** is immediate.
- **Tools:** browse the team catalogue; administrators can add, edit and archive entries.
- **Profile:** edit your internal profile, configure alerts, recover your identity
  and access Help. Administrators also manage invitations and members.

Presence clears at the next midnight in `Europe/Rome`. It is manually declared;
there is no GPS tracking. Public Nostr profiles are not updated automatically.

Office alerts use a voluntary native listener and a persistent notification.
Volume, silent mode, Do Not Disturb, Bluetooth and Android battery restrictions
still apply. Physical background reliability and the three-phone, PC-off pilot
remain to be verified. See the [verification record](docs/verification.md).

## Identity and recovery

The current onboarding supports passwordless local keys and external signers
(NIP-55 on Android, NIP-46 remotely). Android Keystore protects local vault
records at rest. Passwordless keys load automatically; they do not use the
legacy password-encrypted vault’s 15-minute unlock policy.

**A downloaded `nsec` backup is an unencrypted private key.** Anyone with that
file can act as you. Keep it in a trusted password manager or other protected
storage; never attach it to GitHub issues or send it to another member. Backup
is available from Profile but is no longer a mandatory onboarding step.
Legacy NIP-49 encrypted backups can still be restored with their password.
Signing runs in a worker, but the passwordless flow also passes key material
through the app when saving or restoring the local vault.

An identity backup does not contain MLS state or recover private group history.
The first version supports one active phone per member: replacing it requires
administrator approval. Keep two administrators on separate phones before a
shared pilot. See the [member and administrator guide](docs/distributed-guide.md).

## Run the browser simulator

```bash
npm ci
npm run dev
```

Open the printed local URL and select Alice, Bob, Cara or Drew. Multiple tabs
can try approvals and simultaneous door responses. This uses disposable browser
state, not real Marmot encryption. Do not import personal keys into the preview.

## Build Android locally

Node 22.12+ is required. The setup installs an isolated JDK 21 and Android SDK 36
under `.android-local`, without replacing system Java.

```bash
npm ci
npm run android:setup
npm run marmot:setup
npm run android:build -- team
```

The default team output is a universal APK at `artifacts/bitpolito-team.apk`.
To reproduce the smaller download build:

```bash
BITPOLITO_ANDROID_ABI=arm64-v8a npm run android:build -- team
```

For disposable native tests, run `npm run dev:relays`, build with
`npm run android:build`, reverse ports 3480/3481 over ADB and install the sandbox
APK. That sandbox needs the local relays; the downloadable team APK does not.
Full commands are in the [Android guide](docs/android-guide.md).

Optional build-time authority configuration uses public keys only:
`BITPOLITO_OWNER_NPUB` and `BITPOLITO_ADMIN_NPUBS` configure the native runtime;
`VITE_OWNER_NPUB` and `VITE_ADMIN_NPUBS` configure frontend defaults. Use matching
values when setting both. Entries may be hex or `npub`, separated by commas,
semicolons or whitespace. Empty defaults allow a tester to create a separate
team; they do not automatically connect to an official BitPolito group.

## Development and checks

```bash
npm run check
npm run test:e2e
```

Native workflow, recovery and protocol checks are documented in the Android
guide. `src/lib/hub.ts` is the typed team client; native Marmot integration lives
in `android/app/src/main/java/it/bitpolito/hub/`. No private keys, databases,
local toolchains or signing credentials belong in Git.

MarmotKit is pinned to **0.19.0**, with a checksum-verified native archive.
See [dependency provenance](docs/marmot-dependency.md). The former server/PWA
installation is preserved at `server-final`; see [archive and catalogue migration](legacy/README.md).
