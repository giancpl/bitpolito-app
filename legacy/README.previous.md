# BitPolito Hub

An Android-first team app with **Home · Tools · Profile**, built with Capacitor 8.
Home shows presence and discreet door-request cards. Settings, recovery and Help
are pages; short actions use shared Radix primitives and Motion transitions.
English UI, BitPolito assets, electric blue and Plus Jakarta Sans.

**[Android build, USB installation and pilot guide](docs/android-guide.md)**

```bash
npm ci
npm run android:setup
npm run android:build
npm run dev:android-sandbox
# In another terminal, with a USB-debugging device connected:
.android-local/sdk/platform-tools/adb reverse tcp:3280 tcp:3280
.android-local/sdk/platform-tools/adb install -r artifacts/bitpolito-sandbox.apk
```

The APK sandbox uses disposable identities and a separate local database.
Firebase is optional for UX tests; real background delivery requires explicit
Firebase configuration and physical Android acceptance tests. No deployment is
performed. The browser remains a technical preview with its existing sessions.

React / TypeScript / Vite / React Router / TanStack Query; Fastify / SQLite /
Drizzle. Authentication uses signed NIP-98 requests with browser-bound, single-use
challenges. No preview auto-login. Presence and requests stay in the private database.
Events, Luma and Notion are paused; earlier project/event records are preserved,
but their API routes and public uploads are disabled.

## Start locally

Node 22.12+ or Docker Compose:

```bash
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:5173. For a built app use `npm run build`, then
`APP_ORIGIN=http://localhost:3001 npm start` and open http://localhost:3001.
`APP_ORIGIN` must exactly match the browser origin, with no trailing slash.
HTTP is accepted only on loopback; HTTPS requires `COOKIE_SECURE=true`.

```bash
docker compose up --build -d
```

Docker serves http://localhost:3001, bound only to 127.0.0.1. SQLite lives in the
existing `app-data` volume. Health check: `/api/health`. Startup automatically runs
additive migrations. Back up first when upgrading an existing installation.

## Try it without a personal Nostr identity

```bash
npm run dev:sandbox
```

Open http://127.0.0.1:5180 and click **Use Alice test identity**. The sandbox bar
links to Bob, Cara and Drew in their own tabs, each with a separate session.
Alice is an administrator, Bob/Cara are members, and Drew can redeem an invite.
No personal keys, extension or public relay are needed. Data persists in
`data/sandbox`, separate from the normal app. A second start shows the existing
links. Stop with `npm run dev:sandbox -- --stop`, then use `-- --reset` to start over.
The sandbox runs alongside Docker on localhost:3001.

Follow the [local testing walkthrough](docs/local-testing.md) for invitations,
Moo, resource management, revocation, and creating/restoring disposable keys.
Run `npm run test:sandbox` for the automated four-tab workflow. Stop the manual
sandbox first; the automated test uses a temporary database.

## First administrator and invitations

1. Open the app, create an identity and save the encrypted backup, or connect your
   existing Nostr identity. Without membership you see **Member access required**.
2. Copy **your public identity** from that screen. Grant that specific key locally:

```bash
npm run admin:grant -- npub1_YOUR_PUBLIC_KEY
# Docker, using the same app/data volume:
docker compose exec app node dist/scripts/admin.js npub1_YOUR_PUBLIC_KEY
```

Both `npub` and 64-character hex public keys work. No default admin/private key is
shipped. Refresh the page; under **Profile → Administration → Invites** create
a personal link and share it yourself. Links are single-use, expire after seven
days, and grant only membership. Their token is in the URL fragment, not server
access logs; the database stores only its hash. A link is displayed once.

Admins manage resources and roles under **Profile → Administration**. Revocation invalidates sessions,
push subscriptions and presence immediately, and releases the person's door claim.
The last administrator cannot be removed. The seven-day app session continues
working when local signing keys lock.

## Identity and recovery

Local keys are generated, signed and NIP-49 encrypted in a worker. The browser
stores only `{pubkey, encrypted}` in IndexedDB. Android wraps that encrypted
vault in Android Keystore storage, excludes vault/session from automatic backups
and exports/restores through the Android file picker. Reload, sign-out and 15 minutes of
inactivity terminate the unlocked worker. Both the backup and its password are
required for recovery; the server cannot recover them. Existing encrypted vaults
under `bitpolito.identity.v1` are recognized, with confirmation before replacement.
Supported encrypted backups use NIP-49 v2 with scrypt log_n 16–18; oversized or
more costly imports are rejected before expensive derivation.

Android supports NIP-55 signer apps and NIP-46 remote/mobile signers; NIP-07
extensions are offered only in the browser preview. Remote/mobile
signers default to **`wss://nrs.primal.net`**, the public
[Primal Nostr Remote Signer Relay](https://nrs.primal.net/). No BitPolito relay is
needed. The browser connects when you choose a remote/mobile signer; local keys
and extensions do not need a relay. Signer messages are encrypted, while the
relay operator can see connection metadata and the outer event's routing keys.
Override `RELAY_URLS` with a comma-separated list if your bunker uses other
relays, or set it explicitly empty to disable relay connections. Public relays
require `wss://`; `ws://` is accepted on localhost for development. Mobile signers
can scan the connection QR or use its connection link; bunker links must use
configured relays. Keys managed by an external signer use that signer's recovery.
Moo state is never published to Nostr. The signer interface remains reusable for
future messaging; this version has no chat.

Android uses a separate NIP-98 challenge and seven-day session. Its token stays
native and is attached only to the configured backend; browser HTTP-only cookies
remain unchanged. Foreground native SSE and HTTP polling use the same access
checks. FCM devices/deliveries have additive private tables and independent retries.

The public relay carries signer traffic; the Fastify server and private SQLite
database still provide membership, resources, presence, door requests and push.
If the relay is unavailable, local identities and browser extensions remain
usable; change `RELAY_URLS` and restart the app to select another signer relay.

## Moo and alerts

Check in manually until **I'm leaving** or the next midnight in Europe/Rome.
There is no minimum stay. The app respects daylight-saving changes; legacy
check-ins keep their stored expiry until the next check-in. Outside members ring
once; one present member claims **I'll get the door**. Only the arriving member
confirms **I'm inside**, atomically completing the request and becoming available
to open the door. Completion retries never re-check-in someone who already left.
The opener can release with **I can't go**, without confirming opening.
Old clients calling `opened` or `extend` receive an explicit HTTP 410.

Requests initially wait three minutes. A claim lasts 90 seconds and can extend
the request up to five minutes total. Release and timeout reopen it only while
still valid. One active request per requester, 60-second cooldown, idempotent
ring keys and transactional claims prevent duplicates and multiple openers.
SSE updates plus five-second polling reconcile state after reconnection. Restart
reconstructs deadlines from SQLite; outdated notification jobs are discarded.

Push is optional locally. Generate a persistent VAPID pair, then set both keys
and a real `mailto:` contact in the environment, keeping the private key secret:

```bash
npm run push:keys
# Apply changed Docker environment:
docker compose up -d app
```

Profile and first check-in offer **Set up office alerts**, with
**Install → Enable alerts → Test**, optional foreground sound and supported
vibration. The listening test asks **Did you hear the sound?** and stores only
your explicit confirmation locally. Background push needs a secure browser context,
a configured server, browser permission and a registered device. Without these,
the UI says **Alerts only while the app is open**. Development Vite does not
register a service worker; test push using the built app. On iPhone, install to
Home Screen before enabling alerts. A locally hosted, licensed cow recording
plays only for present members with a visible page and enabled audio. Use
**Reactivate cow sound** after reload or browser suspension. Alerts are deduplicated
across polling, SSE, tabs and push. A visible page only silences a push after
its audio start is confirmed; after 750 ms without confirmation the worker
selects the standard sound and prevents late cow playback. Closed-app push uses
the OS sound. Low volume, silent mode and Focus can still prevent audible alerts;
the web app cannot change these settings. Requester updates
are silent. See `public/audio/ATTRIBUTION.txt` for audio provenance/license.
Push contents are generic; request details
are loaded after session checks. Provider acceptance is not a delivery receipt.

A durable database queue retries transient provider errors up to five times,
removes expired subscriptions, checks current membership/session/presence, and
suppresses obsolete messages. Notifications may still be delayed by a device or
its OS; use the in-app status as the source of truth.

See the [physical-phone checklist](docs/phone-testing.md) before relying on alerts.
The service worker is built from `src/service-worker.ts` with the same delivery
coordinator as the page. After updating, close all app tabs/windows and reopen
once to let a waiting service worker replace the previous version.

## Production preparation (not published)

`compose.production.yaml` is a **standalone** configuration with Caddy HTTPS,
SSE proxying, a separate persistent `hub-data` volume and health checks. Do not
combine it with local compose. Hosting and domain selection are still pending.

On the chosen server, copy `.env.production.example` to `.env.production`, fill
in the domain, ACME contact, optional signer relays, and persistent VAPID keys.
Point DNS to the server and allow ports 80/443. Then:

```bash
docker compose --env-file .env.production -f compose.production.yaml up --build -d
```

The app has no exposed host port in this configuration. It trusts one proxy hop
for rate limiting; use `TRUST_PROXY=true` only behind this private reverse proxy. To carry existing data
to the separate production volume, explicitly restore a backed-up database
before first use. Grant your selected first admin with the same compose flags.
No hosting or public deployment has been performed by this implementation.

## Backup and restore

```bash
npm run db:backup -- /absolute/path/bitpolito-backup.sqlite
# Docker:
docker compose exec app node dist/scripts/backup.js /app/data/backup.sqlite
docker compose cp app:/app/data/backup.sqlite ./bitpolito-backup.sqlite
```

Backups include the private database, invites and push subscriptions, but **not
browser identity keys**. Keep copies outside the container, protected like other
private member data. Retain VAPID secrets separately, and legacy `data/uploads`
if present. Stop the app and make a fresh backup before replacing a database:

```bash
npm run db:restore -- /absolute/path/bitpolito-backup.sqlite
# Docker, when backup.sqlite is already in the data volume:
docker compose stop app
docker compose run --rm --no-deps app node dist/scripts/backup.js --restore /app/data/backup.sqlite
docker compose up -d app
```

Use the production compose flags when managing production data. Never use
`docker compose down -v` unless deliberately deleting its persistent volumes.

## Verification and guides

```bash
npm run check
npm run test:e2e
npm run test:pwa
```

Tests use disposable databases, disposable test identities, a local NIP-46 relay
and mocked push providers. Stop an existing server on port 3001 before e2e tests;
PWA tests use port 4173. The suites cover authentication, recovery, invitations,
roles, transactional Moo, expiry/restart, notification retries, browser workflows,
responsive widths, PWA installation and API cache isolation. The service worker
caches only icons and the generic offline page, never member content or API data.

[Member/admin guide](docs/hub-guide.md) · [Verification results](docs/verification.md)
· [Future VPS pilot and recovery](docs/deployment-guide.md)
· [Field acceptance checklist](docs/ux-validation.md)
· [Catalogue link checks](docs/catalogue-links.md) · [Asset provenance](public/brand/SOURCES.md).
Physical Android/iPhone background-push checks and the real three-person office
trial remain explicit follow-up work; local automated tests do not verify them.
