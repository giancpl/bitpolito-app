# Cleanup and interface refresh — 2026-11-26

Removed the archived server, PWA and their tests (preserved at tag
`server-final`), replaced the HTTP-path adapter with a typed `team.*` client,
hardened the native runtime and refreshed the interface (urgent door requests
first, named requesters with a countdown, quieter connection status, dark theme).

- `npm run check`: typecheck, ESLint (0 errors), Prettier, 16 unit tests and the
  production build. The production bundle contains no simulator code.
- `npm run test:e2e`: 8 browser simulator workflows, including the new request
  priority and dark-theme checks, with all application API requests blocked.
- `npm run android:build` and `npm run android:build -- team`: both APKs built;
  the team assets contain no sandbox or simulator code. Kotlin/JVM unit tests
  passed (`HubAlertPolicyTest` 8/8, `HubProjectionTest` 8/8).
- Not yet repeated on this revision: instrumented tests on a device or emulator,
  the opt-in `test:android:*` device scripts, and a physical phone pilot.

# Distributed Android verification — 2026-11-26

This section describes the current Marmot APK. The dated records below describe
the archived server/PWA installation and do not certify the new native runtime.

Completed with disposable identities and only loopback test relays:

- TypeScript check and web build; 39 unit/API/cryptography/configuration tests.
- 15 Kotlin/JVM projection and alert-policy tests: replay, ordering, two door
  responders, inside followed by immediate leave, cancellation, expiry, device
  reset, authorization, Rome DST midnight and obsolete-alert suppression.
- Six browser simulator tests, including all application API requests blocked,
  separate tab identities, approval, multiple responders, release, entry/leave,
  reload, recovery navigation, keyboard and 360/390/768/1440 px layouts. This
  browser simulator does not implement Marmot encryption.
- Real native SDK integration: three independent encrypted runtime roots and
  identities, authenticated Welcome, encrypted custom-event convergence,
  concurrent responders, release, entry/leave and reconstruction after restart.
- Phone-replacement integration: restore a disposable identity in a new runtime,
  explicitly retire previous public KeyPackages, remove the previous membership,
  admit exactly one new device and verify that only the new phone decrypts future
  updates. The first rehearsal exposed two-device re-admission; explicit signed
  retirement and a fail-closed native device-count guard were added.
- Three Android instrumentation checks for Keystore-authenticated storage,
  tamper rejection, preservation of archived session data and the local cow
  notification channel without alarm privileges.
- Real worker NIP-49 and Android file-picker recovery: generation, encrypted
  save, cancellation, wrong password, file restore and locked-worker behavior.
  The existing encrypted identity vault was not replaced.
- Seven real legacy catalogue entries exported read-only into a protected local
  JSON artifact. Nothing was automatically imported or published.

The full archived browser run passed 29/34 cases; its first failure was an old
copy expectation (“handling this” → “coming”) that prevented cleanup and caused
four later failures against the same test database. After updating that
expectation, all eight focused desktop/mobile cases passed with a fresh test
database. The new simulator suite also passed again after the entry/leave UI
was corrected to show “Entry confirmed” when the member is already outside.

The native app workflow passed against the final UI and real bridge: identity
ownership, member/admin isolation, resource creation/archive, last-administrator
protection, encrypted invitation approval, multiple responders, entry, immediate
leave, reload and rejection of the retired HTTP bridge. Earlier runs exercised
fresh Bob/Cara admission; the repeat run reused those disposable memberships.

All 14 archived production PWA checks passed. The legacy four-tab sandbox
workflow passed; its recovery case was interrupted by a development-server
reload during concurrent builds, then passed alone with the real backup and
restore flow. The existing encrypted Android vault fingerprint still matches
its pre-test value. The prior Docker app and its database remain untouched.

The external defaults `wss://relay.eu.whitenoise.chat` and
`wss://relay.us.whitenoise.chat` both accepted a WSS connection and returned
EOSE for an empty-ID lookup. No identity or team data was published by this
read-only availability check. It does not certify encrypted delivery or relay
uptime for the pilot.

Both final debug APKs built successfully for Android 8+/target 36 and passed
APK signature verification with the same preserved local debug certificate.
The audit confirms all four pinned Marmot JNI ABIs, no Firebase assets, no
simulator or disposable-identity controls in the team bundle, and separate test
controls in the sandbox bundle. SHA-256 files and `artifacts/build-audit.json`
record the exact delivered binaries. Private resource markers are absent from
both relays' stored wire-event JSON.

The final installed sandbox APK passed the native workflow again, including
fresh Drew admission through the phone-readiness preflight and the native
one-device guard. After entry, immediate departure and reload, retrying both
the original ring operation and its inside action returned the resolved result
without reactivating presence. Acknowledged operations now retain their original
IDs/clocks on retry, and expired queued responder offers are dropped at 90 seconds.
The archived SQLite database also returned `quick_check = ok`.
A real Android WebView screenshot at 412 × 839 CSS pixels showed no horizontal
overflow or open modal, with presence, bell and bottom navigation visible.
The alert coordinator was also corrected so cached state only expires the
listener; sound requires freshly checked membership and request operations.
Both APKs were rebuilt and audited again after this fix. With the final sandbox
installed, the owned relay on port 3480 was temporarily paused; the other relay
accepted a new ring, duplicate retries returned that same request, cancellation
survived reload, and the requester listener stopped. Relay 3480 was resumed in
finally and passed its health check. This exercises a stalled relay, not Android
Doze or physical mobile-network conditions. Physical three-phone operation with the PC off, external-relay
availability, real NIP-55/NIP-46 signers, TalkBack and screen-locked/Doze/battery
behavior remain manual pilot requirements. Emulator and browser checks are not
proof of audible or reliable background alerts on a physical phone.

---

# Local verification — BitPolito Hub

Date: 2026-11-11. All automated identities, invitation tokens, push keys and browser
records are disposable fixtures, separate from the existing application database.

Completed:

- TypeScript checks and production build.
- 14 unit/API/cryptography tests: NIP-49 recovery and wrong passwords, private-key
  import, NIP-98 signature/request/payload/challenge/replay checks, origin/host
  checks, member/admin isolation, one-use/concurrent/expired/revoked invitations,
  last-admin protection, API-only throttling for members sharing one IP, atomic door claim, duplicate requests, cancellation,
  inside/opened confirmation, cooldown, lease extension cap, manual release,
  leaving responder, presence expiry, persistent restart and notification queue.
- Actual loopback SSE connection closed on membership revocation; subsequent
  requests with the revoked cookie denied.
- Notification provider mocked for transient errors/retry, dead endpoints,
  obsolete messages and restart persistence. This is not device delivery testing.
- 16 desktop/mobile browser tests, including new identity + mandatory backup,
  another-device restore, wrong password, reload/inactivity locking, password
  change + decryptable new backup, cancelled extension, real NIP-46 encrypted
  exchanges with a local test relay, QR cancellation/reconnection, a requester
  with two responders, resources/forms/network retry/unsaved changes, keyboard
  focus, and layouts at 360/390/768/1440 px.
- All nine unique catalogue URLs returned HTTPS 200.

Physical Android/iPhone background alerts, public hosting and the three-member
office acceptance exercise remain pending; see ux-validation.md.

- Upgrade rehearsal on a copy of the existing database: all records in the 11
  previous application tables preserved exactly; six new tables added; SQLite
  `quick_check` returned `ok`. A consistent pre-upgrade backup was saved in the
  persistent volume and copied to `/tmp/bitpolito-before-hub-moo.sqlite`.
- Docker multi-stage production build succeeded with Node 22. Production Compose
  configuration validated with placeholder environment values, without starting
  a public deployment. Local Compose retains its loopback-only published port.

- Eight production PWA checks passed on desktop/mobile: manifest/icon dimensions,
  service worker registration, private-API cache exclusion, offline fallback,
  browser install offer/dismissal, iPhone Home Screen instructions and denied
  notification permission without false activation status.
- Updated local Docker app started on http://localhost:3001. Compared the real
  database against its pre-upgrade backup: all previous records preserved
  exactly; integrity `ok`; seven curated collection entries. Health 200,
  anonymous resources/Moo 401, old projects/events API 404. No test accounts or
  administrator grants were inserted into the existing database.

2026-11-15 — public signer relay default:

- Selected `wss://nrs.primal.net`, Primal's public remote-signer relay. Verified
  the WebSocket subscription and an encrypted NIP-46 kind-24133 event sent
  between two independent connections with disposable test identities. The
  relay acknowledged the event and the receiving connection decrypted it.
- Default, explicit empty opt-out, custom/local relay overrides and rejection of
  insecure external relay URLs verified in configuration tests. All 17 local
  unit/API/cryptography/configuration tests passed.
- `RELAY_URLS` remains configurable; no presence or door-request data was sent
  to the public relay. No physical mobile signer or background-push trial was
  performed as part of this change.

2026-11-15 — local sandbox without a personal Nostr identity:

- Added `npm run dev:sandbox` with four local test profiles, per-profile browser
  storage/session isolation, normal signed authentication, and a persistent
  separate database at `data/sandbox`. Public relays and push are disabled.
- Two sandbox browser tests passed: four tabs in the same browser exercise an
  invitation, simultaneous Moo claims, completion, reload and immediate
  revocation; normal onboarding creates a disposable identity, downloads its
  encrypted backup and restores it successfully on the new-member origin.
- The revocation exercise caught a frontend cache race that could leave a
  signed-out member on a stale error screen. The revocation event now updates
  the observed session query before discarding private queries; the member gate
  changes immediately.
- TypeScript and production build passed. Production bundles were checked for
  absence of sandbox controls and cookie proxy code. The existing normal app
  database is not used by sandbox tests.

2026-11-15 — sandbox port collision handling:

- Startup now checks all sandbox ports before opening or resetting its database.
  Repeating a normal start reuses the links of this workspace's existing sandbox;
  reset and temporary runs refuse occupied ports without changing data.
- Added `npm run dev:sandbox -- --stop`, limited to a sandbox identified by all
  four local status endpoints with a matching workspace and process identifier.
- 21 unit/API/configuration/lifecycle tests and TypeScript checks passed. Manual
  command checks confirmed successful repeated startup, refusal to reset an
  active database, and preservation of its database file. Shutdown was also
  verified with a signed-in browser and an active SSE connection.

2026-11-15 — Office and discreet intercom:

- New Office landing page, header profile avatar, secondary resource catalogue,
  original BitPolito bell asset and accessible mobile bottom sheet/desktop dialog.
- Presence lasts until leaving or the next Rome midnight. API tests cover winter,
  summer, 23/25-hour DST days and a year boundary; legacy check-ins keep their expiry.
- Arriving member confirmation resolves the request and checks in atomically.
  Repeating completion after immediate departure cannot reactivate presence.
  Legacy `opened` and `extend` mutations return explicit 410 errors; historic
  records remain readable. No database migration was needed.
- 25 unit/API/configuration/cryptography/lifecycle/service-worker tests passed.
  They include concurrent claims, release/cancel/expiry, restart, revocation,
  one reminder, obsolete push rejection and silent requester notifications.
- Production build and TypeScript checks passed. Docker production image built.
- Four-tab sandbox workflow and ordinary identity backup/restore both passed
  with disposable identities and a temporary database. Sandbox Vite caches and
  Playwright output directories are isolated to allow independent test suites.
- Real cow recording stored locally as original Ogg and mobile-compatible MP3;
  Secretlondon/CC BY-SA 3.0 attribution and conversion details accompany the files.

Physical Android/iPhone sound behavior, closed-app push delivery and the office
field trial remain explicitly unverified. See ux-validation.md.

- Final browser suite: 20/20 passed on desktop/mobile. Office/Profile, intercom
  focus trap/return and no horizontal overflow checked at 360/390/768/1440 px.
  Audio dispatch counted at the Web Audio boundary with a mock sound device:
  present members alert, outside requester stays silent, two same-origin tabs
  emit one alert, reload does not replay it, and an incoming ring preserves an
  unfinished profile form and its focus. Recovery/signers use the real local
  cryptography/relay fixture. These are browser emulations, not phone trials.
- Updated Docker app restarted on http://localhost:3001. Health returned `ok`.
  All table counts matched the pre-restart snapshot; SQLite quick_check `ok`.
  Existing three users, three sessions, one application and seven resources were
  preserved. No personal or test identity was added to the production volume.
  Local VAPID push remains unconfigured; the sandbox explicitly disables push.
- Final production PWA suite: 10/10 desktop/mobile tests passed, including real
  MP3 fetch/decode/play activation, reload audio locking and reactivation/mute,
  manifest/install/offline behavior, denied notification recovery, and private
  API cache exclusion. This does not certify a physical phone’s audio output.
- Production bell/audio assets return 200; anonymous catalogue/Moo return 401;
  legacy project/event API routes remain 404. Persistent sandbox reopened at
  127.0.0.1:5180–5183 with its existing data and initial test roles preserved.

2026-11-15 — compact interactive interface:

- Shared Radix dialogs, alert confirmations, menus, tabs, avatars and toasts;
  Motion transitions obey OS Reduce Motion. Replaced legacy CSS with shared
  design tokens and reusable components. No API or database migration.
- Compact Office presence bar, first-screen bell, grouped avatars and full
  people panel. Profile is a single navigable panel with query-string deep links;
  administration has its own route. Browser-native confirm dialogs removed.
- Automatic Office request popups use persistent, cross-tab serialized claims,
  independent from sound deduplication. Forms and key recovery keep a compact
  banner. Dismissed requests remain available from the banner without repeated
  popups. Audio/requests remain private, using the existing member APIs.
- Existing 25 API/crypto/configuration/SSE/lifecycle/service-worker tests passed.
  Typecheck/build passed; UI and animation code are split into separate bundles.
- Updated two-test sandbox suite passed: four identities, invitations, concurrent
  claim (one 200 / one 409), entry, immediate departure, revocation, and regular
  encrypted-key creation/backup/restore. Test data is separate from normal data.
- All 28 desktop/mobile browser cases validated: 26 passed in the full run;
  both resource-management cases passed after fixing their navigation helper to
  await the destination route. Covers popup deduplication across tabs/reload,
  draft/focus preservation, short-screen forms, failed saves, role confirmations,
  signer cancellation, mandatory backup/restore and reduced-motion layouts.
- Docker image rebuilt and the local app restarted with its persistent volume.
  All 18 table counts match the pre-update snapshot (three users, three sessions,
  one application, seven resources); SQLite quick_check returned `ok`.
  No migration or personal identity change. Existing sandbox data reopened.
- All 10 production PWA browser tests passed on desktop/mobile: manifest/icons,
  service worker, private-cache exclusion, offline fallback, install offer,
  iPhone instructions, denied permissions, real MP3 decoding and audio reactivation.
- Local production health and bell/audio assets return 200; anonymous resources
  and office state return 401; old project/event routes remain 404. The persistent
  sandbox is available on 127.0.0.1:5180–5183. Push remains unconfigured locally;
  physical-phone alerts and the three-member office trial remain pending.

2026-11-15 — smartphone controls and coordinated office alerts:

- Office simplified to presence, people and a full-width centered bell. Main
  controls are at least 48 px; mobile controls/fields use 16 px text and secondary
  text at least 14 px. Dialogs track the visual viewport for keyboard-safe sizing;
  mobile action areas remain reachable. Existing membership and data unchanged.
- Office alerts now have Install / Enable alerts / Test steps, independent push
  and foreground sound states, optional supported vibration, an explicit hearing
  confirmation stored locally, and volume/Bluetooth/Focus recovery instructions.
- Audio Session playback is scoped to the short cow sound and restored on end,
  interruption, mute, leaving or cancellation. Reload still requires explicit
  audio activation. No system-volume, silent-mode or Focus overrides are claimed.
- Page and production service worker import the same IndexedDB channel arbiter.
  An actual audio-source start and its delivery record share a serialized write
  transaction; visible pages with sound off no longer silently consume a push.
  A 750 ms response window falls back to the standard system notification channel;
  later page delivery and provider retries cannot replay that same sound phase.
- 30 unit/API/crypto/configuration/lifecycle/worker cases passed, including
  simultaneous channel decisions, failed starts, 750 ms timeout, late delivery,
  silent requester updates, obsolete notifications and the single reminder.
- Both sandbox browser workflows passed with temporary identities/data. New
  desktop/mobile checks passed for the bell/48 px controls, keyboard viewport,
  immediate leaving, human hearing confirmation, recovery and optional vibration.
- The 10 existing production PWA cases passed. Two added worker integration
  cases passed after replacing the headless OS notification boundary with a spy.
  Real browser service workers, MessagePorts and IndexedDB exercise foreground
  acknowledgement, muted-page system fallback, retry and reload deduplication.
  Audio-source and notification-display boundaries are mocked in those two cases;
  they do not verify provider delivery or a physical phone's sound.
- Production build/typecheck passed. All 32 browser cases validated: 29 passed
  in the full run; the two empty-office checks passed after updating their old
  copy assertion, and one Chromium ERR_NETWORK_CHANGED case passed with services
  stable. The six-case focused rerun also checked both keyboard-safe discard
  confirmations and draft recovery. No product failure remains from that run.
- Final production PWA suite: 14/14 desktop/mobile cases passed, including
  the two real-worker/browser-storage integration cases described above and
  recovery from unconfigured server, stale subscription and configuration errors.
  The final production build and typecheck passed again after the keyboard-safe
  confirmation and subscription-state refinements.
- Final Docker image built and restarted at http://localhost:3001. Health, app,
  worker, bell and cow audio return 200; anonymous resource/office APIs return 401.
  All 18 table counts match the pre-update snapshot; SQLite quick_check is `ok`.
  Three users, three sessions, one application and seven resources preserved;
  no test identities were added to the normal volume. Persistent sandbox reopened
  on 127.0.0.1:5180–5183 without resetting data.
- Physical iPhone/Android checks remain pending; see phone-testing.md. Local VAPID
  push is not configured. No silent-mode, low-volume or closed-app sound guarantee
  is made from these automated results.

## Contextual help and future deployment preparation — 2026-11-15

- Office remains the only daily destination. Profile now includes Help, with
  presence, doorbell and recovery guides, and a link to the existing interactive
  Install / Enable alerts / Test flow. No new APIs, dependencies or migrations.
- Contextual tips are dismissible and stored per member/device under a versioned
  local preference. Successful office operations alone record action progress.
  Existing office-alert suggestion preferences are respected. Tips do not submit
  actions, interrupt drafts/recovery, compete with requests or take focus on a
  realtime update. Guide navigation has keyboard focus and a stable return target.
- All 30 unit/API/crypto/configuration/lifecycle cases passed with local socket
  access enabled. Both temporary-database sandbox browser workflows passed.
- All 38 desktop/mobile browser cases passed, including six new guide cases:
  four widths, one-tip layout, dismissal across tabs/reload, member isolation,
  failed check-in, optional alerts, help deep links and no office actions from
  reading help, priority of requests, retained drafts/recovery, automatic check-in
  after entry and immediate leaving.
- Additional focus checks exposed a body-focus return when the originating tip
  had disappeared. Corrected the fallback; the amended guide cases passed on both
  projects. The four focused intercom/form keyboard cases also passed. Invalid
  help topics safely open the index. Screenshots inspected at 390 px show the bell
  in the first screen and a single Help sheet, with no nested settings dialogs.
- Final typecheck and production build passed. The VPS guide covers future HTTPS,
  VAPID continuity, dedicated pilot identities, origin changes, daily consistent
  backups with off-server copies, restore rehearsal, release SHAs and rollback.
  It provisions no service and changes no network exposure.
- Final production PWA suite passed 14/14 desktop/mobile cases, including worker
  coordination and private API cache isolation. Notification display/provider
  and audio boundaries are mocked where documented; physical audibility and
  closed-app push delivery remain pending on iPhone/Android over trusted HTTPS.
- The persistent identity-free sandbox was reopened on loopback ports 5180–5183,
  using its existing data directory without a reset. No public hosting, tunnel,
  provider account or domain was configured.
- Updated the local Docker image and restarted it successfully (healthy).
  Health and the Help deep-link shell return 200; anonymous office/resource APIs
  still return 401. All 18 table counts match the pre-update snapshot, including
  three members, three sessions and seven resources; SQLite quick_check is `ok`.
  No fixture identity was added to the normal app database.

2026-11-16 — Android team app:

- Capacitor 8 Android sandbox APK built and installed on an Android 36 emulator;
  min SDK 26, target SDK 36. Isolated JDK 21/SDK under `.android-local/`; system
  Java unchanged. APK signature v2 verified. Team debug build also compiled with
  a deliberately non-routable HTTPS verification origin; its packaged web assets
  exclude the sandbox identity module. This is not a production release/deploy.
- Home / Tools / Profile use stable pages. Incoming requests are cards, with
  no automatic popup/navigation. Existing `/moo`, `/account?view=…` and
  `/resources` remain usable. Removed the obsolete automatic-popup hook.
- Typecheck and production builds passed. All 37 unit/API/crypto/config tests
  passed, including Android challenge binding, expiry/replay/cross-client
  rejection, session separation, current membership, per-device delivery retry,
  obsolete alerts, revocation, atomic claims and backend restart persistence.
- All 34 desktop/mobile browser cases passed; 10 authentication/Moo cases were
  rerun successfully after making session transitions immediate. Layouts at
  360, 390, 768 and 1440 px, keyboard, drafts, guards, Help and recovery covered.
- 14 production PWA checks passed and both four-origin sandbox workflows passed.
  Android/SDK output is excluded from Vite's dependency crawl and watcher to avoid
  scans of generated native assets during browser development.
- Three native JVM tests passed: pending/reminder policy and fixed-origin bridge
  paths. Four instrumented tests passed on Android 36: real Keystore encryption
  and tamper rejection, stale-request protection for a newer session, native
  POST challenge JSON handling, and the cow/vibration notification channel.
- Installed APK smoke test passed: signed native login, session-token bridge
  boundary, Home/Tools/Profile, two concurrent claimants with one winner,
  requester inside → automatic presence → immediate leave, native Back,
  keyboard dismissal, unsaved draft protection, Help and explicit sound-test UI.
  Foreground native SSE was observed; HTTP polling remains the fallback.
- Android recovery verified on the emulator: mandatory backup gate, cancelling
  the actual system file picker, successful file write and matching encrypted
  contents, wrong-password rejection, and restoring that file through the
  system picker. The close/discard confirmation is preserved. The restore
  resumed after the test harness was corrected to handle that confirmation.
- Sandbox-only data-push simulation passed against native notification code:
  background notification, duplicate suppression, leaving, cancelled/unknown
  request suppression, and notification deep link. This receiver is excluded
  from team builds. It does not contact Firebase or establish actual FCM delivery.
- Dependency audit: zero production vulnerabilities at verification time.
- Local Docker upgrade: saved consistent `before-android-20261116.sqlite` backup
  in the persistent volume, then applied the additive Android migration. Compared
  all old columns/records across 18 previous tables: none changed or missing.
  Users 3, sessions 3, resources 7 retained; native devices 0; quick_check `ok`.
  Health 200, anonymous resources 401, legacy projects API 404. No test identity
  imported into the normal app. Persistent browser and Android sandboxes remain
  separate from that volume. No hosting, purchase or public tunnel configured.

Still pending before team distribution: physical Android/TalkBack/large-text
acceptance, interoperability with the chosen NIP-55 signer, real Firebase setup
and delivery with locked screen/killed process, and audible sound under volume,
Bluetooth, Do Not Disturb and battery restrictions. Browser NIP-46 tests use real
encrypted protocol exchanges with a local test relay, not a physical mobile signer.
See [Android pilot guide](android-guide.md); an emulator cannot certify audibility.

- Final APK in-place update verified on the emulator: encrypted-vault fingerprint
  unchanged, session retained, Home rendered without horizontal overflow.
  Restarted the dedicated backend from its existing database; native realtime
  reconnected and the same session remained usable. Final APK checksum is stored
  beside `artifacts/bitpolito-sandbox.apk`. Emulator stopped after verification;
  local backend/preview remain available. No physical phone delivery claim.
