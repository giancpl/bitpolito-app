> Historical guide for the archived server/PWA installation. For the current
> distributed Android app, use [the Android guide](android-guide.md) and
> [the member guide](distributed-guide.md).

# Smartphone and office-alert acceptance

Status: **physical iPhone/Android checks pending**. Browser emulation, a successful
Web Audio start, and a push-provider acknowledgement do not prove that a member
heard an alert.

For the Android APK, use the separate [Android pilot checklist](android-guide.md).
The following setup describes the browser/PWA preview.

## Prepare

- Use the built PWA at an HTTPS origin reachable by both phones and trusted by
  their browsers. Configure that exact `APP_ORIGIN`, secure cookies and the
  server's VAPID keys. Keep the same origin when installing and signing in.
- `localhost` and `127.0.0.1` on a phone refer to the phone itself, not this PC.
  The loopback-only Compose app and sandbox are PC previews. Do not expose their
  test identities to a public network. Hosting and a domain remain a later step.
- Use Safari and the installed Home Screen app on iPhone; use Chrome and its
  installed app on Android. Record OS/browser versions and phone model.
- Sign in as two members: one in the office, the other outside. Check-in does not
  require permission for audio, notifications or vibration.

## Configure on each phone

1. Open **Profile → Office alerts**. Follow **Install → Enable alerts → Test**.
   iPhone push needs the Home Screen installation. If permission is blocked,
   change it in system/browser settings and return to the app.
2. Enable cow sound with an explicit tap. Use **Did you hear the sound?** to
   record an actual successful listening test. **No, help me** explains volume,
   Bluetooth, silent mode and Focus. A stored confirmation is test history only.
3. If shown, choose whether to vibrate with office alerts. It is optional and
   depends on device/browser support. It does not provide an iPhone fallback.
4. Test the notification separately. Standard closed-app notification sound is
   controlled by the phone; it is not the custom cow recording.

## Real-device matrix

Repeat on both platforms and record what actually happens, including limitations.
Do not treat silent-mode or zero-volume sound as a required web capability.

| Condition                      | Open, visible app                              | App hidden / screen locked / app closed          |
| ------------------------------ | ---------------------------------------------- | ------------------------------------------------ |
| Normal audible volume          | One cow; optional supported vibration          | Standard notification, subject to phone settings |
| Low media/notification volume  | Record actual audibility                       | Record actual audibility                         |
| Media/notification volume zero | No promise of audible sound                    | No promise of audible sound                      |
| Silent mode                    | Record device behavior                         | Record device behavior                           |
| Focus / Do Not Disturb         | Record device behavior                         | Verify allowed-app settings and actual delivery  |
| Bluetooth headphones/speaker   | Confirm which output receives audio            | Confirm which output receives the notification   |
| Permission denied              | In-app flow still works; useful recovery steps | No claim that push is enabled                    |
| Reload or interrupted audio    | Reactivation offered when needed               | Push remains an independent channel              |

Also verify:

- Outside member rings; only members marked inside alert. Exactly one responder
  claims. The arriving member chooses **I'm inside**, then can leave immediately.
- A visible page with cow sound off does not automatically silence a push.
- A foreground cow and its push do not both produce a sound for the same alert.
  After the worker selects the system channel, enabling audio must not replay it.
- One reminder after 60 seconds while still waiting; no continuous alarm loop.
- Claim, cancellation, expiry, leaving and revocation stop obsolete in-app alerts.
- Phone portrait/landscape, larger text and keyboard: controls remain reachable,
  inputs are not covered, forms retain drafts, and closing a panel restores focus.
- Reload and switch apps during requests and during identity backup/restore.

| Device / OS / browser        | Audible test | Locked / closed app | Silent / Focus | Bluetooth | UI / keyboard | Notes |
| ---------------------------- | ------------ | ------------------- | -------------- | --------- | ------------- | ----- |
| iPhone / Safari / installed  | Pending      | Pending             | Pending        | Pending   | Pending       |       |
| Android / Chrome / installed | Pending      | Pending             | Pending        | Pending   | Pending       |       |

The PWA cannot raise system volume or change silent/Focus settings. Audio Session
`playback` is a foreground enhancement on supporting browsers and is restored
after the short sound; it is not an alarm permission. No background audio loop,
native alarm, electronic lock or physical office receiver is implemented.
