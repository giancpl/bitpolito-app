import { useEffect, useState } from "react";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { v2 as nip44 } from "nostr-tools/nip44";
import { isPreview } from "../lib/hub";
import { Native, isAndroid } from "../lib/native";
import { useIdentity } from "../lib/identity";
import { sandboxKey, sandboxProfiles } from "../../shared/sandbox";
import type { IdentitySigner } from "../lib/signers";
import { Button } from "./ui";

/** Disposable, public test identities. Never bundled in the team APK. */
function fixtureSigner(n: number): IdentitySigner {
  const key = sandboxKey(n);
  const conversation = (peer: string) => nip44.utils.getConversationKey(key, peer);
  return {
    pubkey: getPublicKey(key),
    signEvent: async (event) => finalizeEvent(event, key),
    encrypt: async (peer, content) => nip44.encrypt(content, conversation(peer)),
    decrypt: async (peer, content) => nip44.decrypt(content, conversation(peer)),
    close: async () => {
      key.fill(0);
    },
  };
}

export default function AndroidSandbox() {
  const [sandbox, setSandbox] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(false);
  const identity = useIdentity();
  useEffect(() => {
    if (isAndroid) void Native.configuration().then((c) => setSandbox(c.sandbox));
    else setSandbox(isPreview);
  }, []);
  if (!sandbox) return null;
  const profile = sandboxProfiles[selected];

  async function use() {
    setBusy(true);
    setError("");
    try {
      await identity.connect(fixtureSigner(profile.key), profile.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="android-sandbox">
      <strong>{isAndroid ? "Relay sandbox" : "Browser simulator"}</strong>
      <span>
        {identity.user ? `${identity.user.name} · test identity` : "Disposable identities"}
      </span>
      {!identity.user && (
        <div className="sandbox-picker">
          <select
            aria-label="Test identity"
            disabled={busy}
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {sandboxProfiles.map((p, i) => (
              <option value={i} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" busy={busy} disabled={busy} onClick={() => void use()}>
            Use {profile.name} test identity
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
