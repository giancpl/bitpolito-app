> Historical guide for the archived server/PWA installation. For the current
> distributed Android app, use [the Android guide](android-guide.md) and
> [the member guide](distributed-guide.md).

# Hub and Moo field acceptance

Use [Phone testing](phone-testing.md) for the iPhone/Android setup and sound matrix.

Status: **physical-device and office trial pending**. Automated local tests do not
establish background notification delivery or usability with actual members.
Hosting/domain selection and publication are separate next steps.

After HTTPS hosting is selected, invite three actual members, including one
unfamiliar with Nostr. Use one person outside and two inside. Keep existing data.

1. Join with a personal link, create or connect an identity, and find the backup.
   Restore a downloaded encrypted backup on a second device; try a wrong password.
   Find Profile → Help without assistance. Dismiss a contextual tip, reload and
   reopen its guide from Help. Check that reading help sends no door request and
   that no guide interrupts a profile draft or recovery panel.
2. From Office, check in, enable/test cow sound and test a notification.
   Find the secondary resource catalogue through Profile.
   Try unsupported/denied permission; confirm the fallback explanation is useful.
3. Outside member rings. Both inside members try to claim together; exactly one
   succeeds. Verify the requester sees who is coming. Only the arriving member
   confirms **I’m inside**; check automatic availability and immediate leaving.
   Only the two inside members should hear the foreground cow sound. Repeat
   release, cancellation, timeout, and tabs without duplicate sound.
   Close the automatic panel and reload: it must remain dismissed. While editing
   a profile or recovering keys, a ring must keep the current draft and focus.
4. Close the app on physical Android and an installed iPhone. Ring, check generic
   lock-screen text, open the notification and load the request with a valid
   session. Repeat after revocation and expiry. Do not mark delivery verified
   based solely on a successful provider response or emulated browser.
5. Refresh/change devices during an active request and restart the server. Verify
   the true state returns and no expired request still appears active.
6. Ask an administrator to add/archive a resource, revoke an invitation and revoke
   a present member. Check that old sessions and SSE connections lose access.

Record independent completion, assistance, wrong taps, missed alerts and recovery
problems. Correct blocking issues and repeat the affected tasks before shared release.

| Participant/device            | Join & backup | Resource | Ring/claim/resolve | Closed-app alerts | Obstacles |
| ----------------------------- | ------------- | -------- | ------------------ | ----------------- | --------- |
| Member 1 / Android            | Pending       | Pending  | Pending            | Pending           | Pending   |
| Member 2 / iPhone Home Screen | Pending       | Pending  | Pending            | Pending           | Pending   |
| Member 3 / Nostr newcomer     | Pending       | Pending  | Pending            | Pending           | Pending   |

Automated browser coverage targets 360, 390, 768 and 1440 px, keyboard and modal
focus, unsaved changes, failed saves and retry. Physical keyboard/screen-reader
and real-member checks should supplement those results. Check the bell is visible
without scrolling at 360 × 800, profile Back/close on a short screen with the
keyboard open, and OS Reduce Motion enabled.
