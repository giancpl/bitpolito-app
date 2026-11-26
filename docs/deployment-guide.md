> Historical guide for the archived server/PWA installation. For the current
> distributed Android app, use [the Android guide](android-guide.md) and
> [the member guide](distributed-guide.md).

# Shared pilot: future VPS deployment

Status: **preparation only**. The app and identity-free sandbox currently stay on
this PC. No domain, server, tunnel or public deployment is provisioned by this
change. Keep the sandbox bound to loopback; never publish its disposable signers.

## Architecture and prerequisites

Use one Linux VPS, Docker Engine with Compose, and a stable dedicated hostname.
A small office pilot can start with 2 GB RAM; measure actual load before scaling.
Run exactly one app instance with its SQLite volume, SSE connections and durable
notification worker. Caddy handles HTTPS on the same origin. Only Caddy exposes
ports 80/443; restrict SSH to the operators. Keep the OS and Docker updated.

The repository already supplies `compose.production.yaml` and `deploy/Caddyfile`.
Use that Compose file on its own, not layered over the local Compose file. Vercel
can serve the frontend, but hosting the complete current app there would require
changes to persistence and continuous processing: [Vercel's SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
No such migration is planned for the pilot.

Before provisioning, choose a provider, server region, hostname and an operator
responsible for updates, off-server backups and incident response. These choices
are deferred until hosting is requested. Keep the hostname stable: notification
permissions, subscriptions and browser key storage belong to an origin.

## First deployment

1. Point the hostname's DNS at the server. Open 80/443 for Caddy's certificates
   and app traffic. Install Docker/Compose and check out a reviewed Git commit
   from `git@github.com:giancpl/bitpolito-app.git`. Record its full SHA as the release.
2. Copy `.env.production.example` to `.env.production`, set mode `600`, and fill
   `DOMAIN`, `ACME_EMAIL`, `VAPID_SUBJECT` (a real `mailto:` contact), and VAPID keys.
   Generate keys once with `npm run push:keys` on the trusted operator PC and move
   them securely. Keep that pair through updates; do not commit the filled file.
   `APP_ORIGIN=https://DOMAIN`, secure cookies and the private proxy setting are
   wired by production Compose. The optional default relay is for remote signers,
   not office presence or door requests; local identities need no public relay.
3. Start with a clean production volume. Do not import sandbox users or data.
   If deliberately carrying real local member data, first back it up and follow
   the restore procedure below before opening access.

```bash
docker compose --env-file .env.production -f compose.production.yaml up --build -d
docker compose --env-file .env.production -f compose.production.yaml ps
curl --fail https://YOUR_HOSTNAME/api/health
```

4. On the final HTTPS origin, create a dedicated pilot identity and save its
   encrypted backup and password. Copy its **public** npub from the identity panel
   on the member-access screen. Grant the first administrator on the server:

```bash
docker compose --env-file .env.production -f compose.production.yaml exec -T app node dist/scripts/admin.js YOUR_PUBLIC_NPUB
```

5. Sign in again or reload, create personal one-use invitations, and invite the
   small pilot group. Use identities created for testing rather than requiring
   anyone's primary Nostr identity. The sandbox bypass is never enabled here.

## Moving from localhost

Browser keys do not transfer when the origin changes. Before moving, download the
encrypted backup from **Profile → Identity & recovery**, keep its password, then
choose **Restore identity** on the final website. An external signer must be connected
again. Existing membership follows the public key only when the corresponding
real member database has deliberately been restored; a fresh pilot needs invites.

Reinstall the PWA at the final hostname, enable push there and test again. Do not
reuse a successful listening test on localhost as proof of phone push delivery.

## Daily backups and recovery

Schedule a daily operator job with `flock` so two backups cannot overlap. It must:
create a consistent backup using the app's SQLite backup command, copy it out of
the container, transfer it over an authenticated encrypted channel to protected
storage on a **different machine**, and report any failure. Keep at least 7 daily
copies locally and 30 off-server. The destination and its credentials are supplied
when the VPS is chosen; until that job has succeeded, backup readiness is pending.

Example manual run from the deployment directory (create the host directory with
operator-only access first):

```bash
umask 077
backup_name="bitpolito-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
docker compose --env-file .env.production -f compose.production.yaml exec -T app node dist/scripts/backup.js /app/data/backup.sqlite
docker compose --env-file .env.production -f compose.production.yaml cp app:/app/data/backup.sqlite "/srv/bitpolito-backups/$backup_name"
```

The daily job must stop on any failed command and upload only a completed copy.
Keep `.env.production`/VAPID secrets separately encrypted off-server. Preserve
legacy `data/uploads` separately if it exists. Server backups contain private
member data and sessions, but **never members' browser identity backups**.

Before the pilot, test recovery in a separate deployment with its own volume:
use dedicated pilot accounts and block outbound push delivery in that recovery
environment, so restored notification jobs cannot alert real members. Copy a
backup to `/app/data/restore.sqlite`, stop the app, then run:

```bash
docker compose --env-file .env.production -f compose.production.yaml stop app
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps app node dist/scripts/backup.js --restore /app/data/restore.sqlite
docker compose --env-file .env.production -f compose.production.yaml up -d app
```

Verify health, sign-in, member roles and a full door workflow. Never delete the
volume with `down -v`. Rehearse with dedicated pilot data; do not run an unprotected
copy of the member database. A restore also restores historical sessions/invites,
so evaluate whether credentials or subscriptions need revocation after an incident.

## Updates, rollback and monitoring

- Before every update, record the current commit SHA and take a fresh verified
  backup. Run the test suites on the new release before transferring it.
- Check out the selected reviewed SHA on the VPS; run the same `up --build -d`
  command. Never rebuild the app's volume from sandbox data.
- Check Compose health, external HTTPS health and logs after restart. Test an
  active request and reconnect; durable state must survive. Configure an external
  periodic check of `/api/health` and route failures to the designated operator.
  A healthy HTTP endpoint alone does not prove notification delivery: inspect
  `docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 app`
  for worker errors and perform a pilot notification test.
- For a code-only compatible release, roll back by checking out the recorded
  previous SHA and rebuilding/restarting with the same volume and VAPID keys.
  If a future release changes the database incompatibly, stop and use its explicit
  recovery instructions; restoring the pre-update backup discards newer writes.
  This guidance change has no database migration.

## Real-device acceptance gate

Follow [phone-testing.md](phone-testing.md) on an installed iPhone PWA and Android,
using mobile data as well as office Wi-Fi. Test one member outside and two inside:
only one claims, the requester sees their name, confirms entry and can leave at
once. Test a locked screen and a closed app, permission denial and reconnection.

Push requires trusted HTTPS, configured VAPID keys and browser permission. iPhone
push requires a Home Screen app ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
The cow sound is foreground-only; background notifications use device sound.
Silent mode, low volume and Focus cannot be overridden. Do not call the pilot
operationally verified until physical tests and a backup/restore rehearsal pass.
