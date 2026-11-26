> Historical guide for the archived server/PWA installation. For the current
> distributed Android app, use [the Android guide](android-guide.md) and
> [the member guide](distributed-guide.md).

# BitPolito Hub — quick guide

## Members

- Open your personal invitation. Create an identity or connect your existing Nostr
  identity. A new identity requires downloading and acknowledging its encrypted
  backup. Store the file and remember its encryption password.
- **Home** shows your status and who is available to get the door.
  Tap **View everyone** for the Office page. The bottom bar opens **Home**,
  **Tools** and **Profile**; profile settings are pages with Back navigation.
- At the office, tap **I'm in the office**. You are immediately available to get
  the door until **I'm leaving** or midnight in Europe/Rome. There is no minimum
  stay. Presence is shared across your signed-in devices. Existing check-ins
  keep their saved expiry until you check in again.
- Outside, check who's present and tap **Ring the office**. Wait for a named
  person to respond. You can cancel, or confirm **I'm inside** after entering.
  If nobody is marked present, check again; the app cannot promise an opener.
- Incoming requests appear as cards on Home, with **I'll get the door** directly
  available. In Profile, forms and recovery you get a compact **View request**
  banner. Changing pages keeps the request active; there are no automatic popups.
- Inside, respond with **I'll get the door**. Other members see that you are
  handling it. You do not confirm opening: the arriving member chooses
  **I'm inside**, completing the request and automatically checking in.
  Choose **I can't go** to release a claim. A claim releases after 90 seconds
  if the requester has not confirmed entry.
- Profile contains your name, alerts, Help and **Identity & recovery**.
  Download a backup there; restore it on another device from the sign-in screen.
  Both the file and its password are necessary. External signers handle their own backups.
- Local signing keys lock after inactivity or reload. You stay signed in to Moo
  for up to seven days; you only unlock the vault when signing or changing its password.
- After checking in, choose **Set up office alerts**, or open **Profile → Office alerts**.
  In the Android APK, allow notifications and run the sound test; see the
  [Android guide](android-guide.md). In the browser, follow
  **Install → Enable alerts → Test**. On iPhone, add the app to Home Screen
  first. Sound and closed-app push have separate statuses; neither blocks check-in.
- Enable/test the cow sound with an explicit tap. Answer **Did you hear the sound?**
  after actually hearing it; the saved timestamp is only your test history. Use
  **No, help me** for volume, Bluetooth and Focus troubleshooting. After reload or
  an audio interruption, use **Reactivate cow sound** when prompted.
- In the browser, cow sound plays only for present members with a visible page.
  Optional vibration appears on supporting browsers and follows the same rule.
  Browser closed-app push uses the device’s standard notification sound. The
  Android APK uses its native Office doorbell cow channel; requester
  updates stay silent. The app cannot override low volume, silent mode or Focus.
  A provider acknowledgement is not a delivery or listening receipt.

## In-app help

Open **Profile → Help** for short guides on presence, the doorbell and recovery.
The alerts guide reuses **Install → Enable alerts → Test**. A compact tip appears
only when relevant in Office; **Not now** hides it for this guide version on this
device. Reading a guide never checks you in or sends a door request. Your progress
stays local to your member identity and device; it is not shared with the server.
Door requests, errors and open forms take priority over automatic tips.

For the real-device checklist, see [Phone testing](phone-testing.md).

## Administrators

The first administrator is granted by the operator using a public key and the
local `admin:grant` command (README). Open **Profile → Administration** for the
dedicated administration page. Invites, Members and Resources have separate tabs;
role changes and destructive actions ask for confirmation.

- **Invitations:** create a named one-use link and share it personally. It expires
  in seven days. Copy it when shown; the app does not store its plaintext token.
  Revoke an unused link if it was shared incorrectly.
- **Members:** assign administrators, change roles or revoke access. Revocation
  ends their app sessions, office presence and registered alerts and releases any
  door request they were handling. The last admin cannot be demoted/revoked.
- **Resources:** add or edit a Tool/Resource, short description, category and URL.
  Archive entries to remove them from Tools.
  Earlier projects/events remain in storage and are outside this catalogue.
- Arrange regular private database backups and preserve VAPID keys. Member
  identity backups stay with each member, never on the server.

Moo coordinates people; it does not control a lock or detect physical presence.
If a request expires, the requester sees that outcome and can ring again while
someone remains marked inside. For urgent access, use your usual office contact.

For the future shared pilot, use the [VPS deployment guide](deployment-guide.md).
No hosting or public access has been configured; local sandbox accounts stay local.
