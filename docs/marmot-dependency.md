# Native protocol dependency

BitPolito uses MarmotKit **0.19.0** from the immutable upstream release:
https://github.com/marmot-protocol/mdk/releases/tag/marmotkit-v0.19.0

Source and workflow commit: `3fce95465cdea1edc8456dbd1c6691d1c8dc1f2e`.
Android archive SHA-256:
`9f4dd11478265a24a98f1f0c40768b7e8eba8f1fbd4fe7b129b2f09198e3a8e4`.

`scripts/marmot-setup.py` verifies that archive before extraction. Generated
Kotlin, Android Keystore integration and all JNI libraries are one dependency
cohort. They are not committed as generated source; Gradle reads the verified
ignored directory. The embedded upstream manifest records its provenance.

Upstream source, notices and licensing:
https://github.com/marmot-protocol/mdk/tree/3fce95465cdea1edc8456dbd1c6691d1c8dc1f2e

The browser simulator does not use Marmot or claim encryption. No alpha
TypeScript Marmot implementation is bundled into the native protocol path.

Team operations use encrypted custom kind-78 messages with the
`bitpolito.hub.v1` namespace. Admission requests use separate encrypted two-person
Marmot control groups; approval adds the device to the real team with a Welcome.
The signed invitation is a private, shareable capability descriptor, not a
public relay event. Identity proof is local and not published. Public technical
relay discovery and KeyPackages are required; public kind-0 profiles and kind-3
contacts are explicitly blocked by the host signer.

Relay routing uses the pinned SDK's `marmot.transport.nostr.routing.v1`
component (0x8004), including QUIC variable-length vector encoding. It is not
an arbitrary application JSON component.
