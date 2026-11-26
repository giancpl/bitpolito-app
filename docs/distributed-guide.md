# BitPolito — member and administrator guide

## Join your team

Open your personal invitation in the Android app. Create an identity and save
its encrypted backup, or connect a Nostr signer with NIP-44 support. Keep the
backup password separately: BitPolito cannot reset it.

Request access and keep the app open. The administrator who issued your
invitation approves your phone from their app. An invitation lasts seven days;
opening it alone does not grant membership. The app shows pending, declined,
expired or already-used states and lets you use another invitation.

## Home and the office

Tap **I’m in the office** when you arrive. You are now available to get the door.
Tap **I’m leaving** whenever you leave, even immediately after arrival. Presence
clears at the next midnight in Rome. Presence is manually declared, not GPS or
proof of a live connection.

Outside? Tap **Ring the office**. If nobody is marked present, ringing is
unavailable. Publication accepted by a relay does not prove that anyone has
received or read your request.

Inside? Tap **I’ll get the door**. More than one member may respond. If you
cannot go, tap **I can’t go**. You do not confirm opening the door. The arriving
member taps **I’m inside**, completing the request and checking in automatically.

Requests wait three minutes initially, may extend to five minutes when someone
responds, and permit one reminder after a minute. Each response lasts 90 seconds.
Only the requester can cancel. Leave the request page without cancelling it;
the compact request banner brings you back.

## Office alerts

Open **Profile → Office alerts**. Enable notifications, test the short moo and
confirm whether you heard it. Vibration is optional. Check-in is allowed even
when you choose not to enable alerts.

The native listener displays **Office alerts active** while it runs. It connects
directly to relays, including with the app screen closed. Leaving, midnight,
sign-out or received revocation stops office listening. Notifications show no
private name on the lock screen.

Android may interrupt the listener. Force stop, battery restrictions, volume,
silent mode, DND and Bluetooth affect alerts. Reopen the app after a force stop
or reboot; resume listening explicitly. The app never changes device volume or
pretends to be an alarm. Outside members do not automatically hear a moo.

## Identity and a new phone

**Profile → Identity & recovery** contains public identity copying, encrypted
backup, restore, password change and local key removal. External signers manage
their own backup. Signing keys lock after inactivity; this is separate from the
native MLS state needed to receive office updates.

Restore your identity on a new phone and sign out on the previous phone. If
another Marmot installation is advertised, BitPolito shows a separate **Use this
phone** confirmation before sending your application. This publishes signed
retirement requests for the other installations’ KeyPackages across Marmot apps;
it does not erase their existing groups. Use a separate Nostr identity if you
want to keep those installations available for other apps. Then ask an
administrator to approve the new phone and remove the old one. Identity backup does not recover private group
history. The new phone receives the current catalogue and member profiles.
Previously received data cannot be erased from the old phone remotely.

## Administration

For a new installation, explicitly choose **Create a new team**. This creates a
separate group, not a reconnection to an existing one. Before a shared pilot,
appoint two administrators on different phones. The last administrator cannot
be removed.

Under **Profile → Administration**:

- **Invites:** create a personal invitation and review encrypted join requests.
  Keep the issuing administrator's app open to receive them. Approval consumes
  the invitation; retrying does not intentionally add another membership.
- **Members:** promote, demote, revoke or confirm a phone replacement. Revocation
  propagates when devices synchronize and prevents future encrypted access;
  offline devices cannot learn it instantly.
- **Resources:** add, edit or archive catalogue entries. Import an existing
  resource export only after reviewing its contents and confirming publication.
- **Team relay connections:** add compatible secure endpoints before removing
  old ones. Keep members online during a planned migration. Default EU/US relays
  are run by the same operator.

All current members can decrypt group operations. Only present members receive
doorbell alerts; this alert rule is not a separate cryptographic access boundary.
Relay operators can observe connection and routing metadata but should not see
the private operation contents.

## If connectivity is lost

Check **Connected / Reconnecting**. Ordinary updates have a persistent local
retry queue. Leaving stops local alerts immediately, even when publication is
pending. Door requests expire rather than being delivered as fresh requests
long after they were sent. Compare the current state after reconnection; there
is no central server imposing an instant global order. Keep automatic date and
time enabled on your phone: expiry checks depend on the device clock.

The previous server installation and its database remain a separate archive.
Its sessions, invitations, active requests and push registrations do not grant
membership in the new Marmot team.

## Recovery boundaries

Your encrypted NIP-49 file proves control of your Nostr identity after you unlock
it. It does **not** contain MLS state, team membership, invitations or private
history. Keep its password separately. Neither relay operators nor team
administrators can recover a forgotten identity password.

When replacing a phone, keep the old phone and backup until the administrator
has verified the new admission. The administrator must explicitly confirm
replacement; this is not automatic multi-device synchronization. Promote a
second administrator before replacing the last administrator's phone.

## Move to different relays

Keep at least one current relay during the first migration step. Add the new
secure endpoints, have members synchronize, and verify a test office request
before removing old endpoints. Keep two compatible relays. An offline member
may need an invitation on the new route; do not assume every phone received the
routing update. Update new invitations after the change.

## Consult the previous installation

The previous Fastify application and its database are a separate archive,
preserved at the git tag `server-final` (see [the archive notes](../legacy/README.md)).
Start it only from that checkout and its original data directory.
Never point a test reset at that directory. Export resources read-only, review
the file, and import explicitly into the new group. Do not run both apps as if
they shared a live office state: there is no bidirectional synchronization.
