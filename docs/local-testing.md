> Historical guide for the archived server/PWA installation. For the current
> distributed Android app, use [the Android guide](android-guide.md) and
> [the member guide](distributed-guide.md).

# Try the complete flow without your own Nostr identity

Start the separate local sandbox:

```bash
npm run dev:sandbox
```

Open these addresses in four tabs of the **same browser**:

| Address               | Test identity | Initial access      |
| --------------------- | ------------- | ------------------- |
| http://127.0.0.1:5180 | Alice         | Administrator       |
| http://127.0.0.1:5181 | Bob           | Member              |
| http://127.0.0.1:5182 | Cara          | Member              |
| http://127.0.0.1:5183 | Drew          | Needs an invitation |

Each page has a **Local sandbox** bar. Click **Use Alice/Bob/Cara/Drew test
identity** in its own tab. No extension, personal key, remote signer or public
relay is needed. The app uses its normal signed authentication and permissions
with disposable test identities. The bar also links to the other test profiles.

The sandbox listens only on this PC and uses `data/sandbox/app.sqlite`, separate
from normal app data and the Docker volume. Roles, resources, invitations and
Moo state survive a restart. Stop with Ctrl+C, or from another terminal:

```bash
npm run dev:sandbox -- --stop
```

Starting it again while it is already running prints its existing links and
exits successfully. `--reset` refuses to run until the sandbox is stopped, so
it cannot delete an active database. To start over after stopping:

```bash
npm run dev:sandbox -- --reset
```

This resets only the sandbox database. The regular app on localhost:3001 can
continue running alongside it. Cookies and browser key storage are isolated
between test profiles, even in the same browser.

## Try the in-app guides

Open **Profile → Help** to read the presence and doorbell guides, configure alerts
or reach **Identity & recovery**. The real office actions remain on Office; reading
help never sends a request. Try **Not now**, reload, and open Help to find the same
guide again. Dismissals are per member/device and survive a sandbox server restart.
A failed check-in must not complete the presence guide. While editing a profile,
a ring should preserve both the draft and keyboard focus.

Do not clear site storage just to replay tips: doing so can remove local identity
keys. Help is always available without resetting anything.

## Invite a new member

1. Enter as Alice, open **Profile → Administration → Invites** and create an
   invitation for Drew. Copy its link.
2. Enter as Drew in the fourth tab. Paste that link into **Invitation code or
   link**, then choose **Join BitPolito**. Drew should reach Office.
3. Trying the same invitation with another new identity should fail. You can
   also revoke an unused invitation from Alice's Profile.

Paste the link into Drew's invitation field: following the original link in
Alice's tab will keep Alice's existing test session.

## Coordinate the door

1. Open **Office** as Alice and Bob; choose **I'm in the office** in both tabs.
   Tap **Office alerts**, follow the three setup steps and enable/test the cow sound in each. Answer **Did you hear the sound?**, then close the panel.
   Presence lasts until leaving or midnight in Rome, not two hours.
2. In Cara's tab, choose **Ring the office**. Both inside tabs should show the
   incoming request in an automatic panel and play the cow sound while visible; Cara must not receive
   an automatic cow sound. The bell opens a bottom sheet on phones.
3. Choose **I'll get the door** in one tab, or try both quickly. Exactly one
   person should handle it; Cara sees that person's name.
4. Only Cara chooses **I'm inside**. The opener has no completion button.
   Cara becomes available to get the door automatically. Reload, then choose
   **I'm leaving** immediately: availability must clear on all her devices.
5. Try **I can't go**, cancellation and a three-minute unanswered request.
   Wait at least 60 seconds before ringing again.
6. Stop and restart the sandbox during a request to check persistence and
   expiry. Use **I'm leaving** to clear presence on all devices for that user.

## Resources and revocation

- Alice can add/edit/archive resources from Profile. Bob and Cara can browse
  active entries through **Profile → Tools & resources** but cannot manage them.
- From Alice's Members section, revoke Bob while Bob's tab is open. Bob should
  lose access, and his presence or door claim should clear.
- Reset the sandbox to restore the initial roles after testing revocation.

## Create, back up and restore a disposable identity

To try the real onboarding screens, create another invitation as Alice. In
Drew's tab, sign out through Profile (or the member gate), then use the regular
**Sign in with Nostr / Join BitPolito → Create an identity** flow. Choose a test
name/password, download the encrypted backup and acknowledge it. Use the
invitation to enter.

After signing out, choose **Restore identity** and import the backup with its
password. Try a wrong password first. Also check password change, reload locking
and the **Identity & recovery** section. The test-profile button does not create
an encrypted vault; backup exercises use the normal identity-creation screens.
If that tab already has a saved disposable vault, the app asks before replacing
it. Store only test identities in this sandbox.

The browser stores these test vaults separately from the regular app. Resetting
the sandbox database does not erase IndexedDB or downloaded backup files. Clear
site data for the test ports if you also want to remove those.

## Automated checks

```bash
npm run test:sandbox
npm run check
npm run test:e2e
npm run test:pwa
```

`test:sandbox` launches a temporary sandbox database, then tests four tabs in a
single browser, invitation redemption, simultaneous claims, completion, reload,
permission checks and immediate revocation. Close a manual sandbox first to free
ports 3180–3183 and 5180–5183. Its temporary database is removed when the test server
stops. The other suites cover backup/restore, wrong passwords, local locking,
remote signer/QR, timeouts, restart, notification retries and PWA behavior.
`test:e2e` needs port 3001 free; the manual sandbox and `test:sandbox` use other
ports and can coexist with the normal Docker app.

The sandbox shows in-app updates and optional sound. Push is disabled here;
physical background notifications still need the configured HTTPS app and phone
checks described in ux-validation.md.
