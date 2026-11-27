import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools/pure";
import { decode, nsecEncode } from "nostr-tools/nip19";
import { encrypt } from "nostr-tools/nip49";
import { v2 as nip44 } from "nostr-tools/nip44";
import { validPassword, readBackup } from "./vault-crypto";

let secret: Uint8Array | null = null;
let security: 0 | 1 | 2 = 1;

function decodeNsec(value: string): Uint8Array {
  const decoded = decode(value.trim());
  if (decoded.type !== "nsec") {
    throw Error("A private nsec key is required; an npub cannot sign in.");
  }
  return decoded.data;
}

self.onmessage = ({ data }) => {
  const { id, action, payload } = data;
  try {
    let value: unknown;
    if (action === "createQuick") {
      const next = generateSecretKey();
      secret?.fill(0);
      secret = next;
      security = 1;
      value = { pubkey: getPublicKey(next), secret: nsecEncode(next) };
    } else if (action === "loadSecret") {
      const next = decodeNsec(payload.secret);
      secret?.fill(0);
      secret = next;
      security = 1;
      value = getPublicKey(next);
    } else if (action === "exportSecret") {
      if (!secret) throw Error("Unlock your identity first.");
      value = nsecEncode(secret);
    } else if (action === "create") {
      validPassword(payload.password);
      const next = generateSecretKey();
      const encrypted = encrypt(next, payload.password, 16, 1);
      secret?.fill(0);
      secret = next;
      security = 1;
      value = { pubkey: getPublicKey(next), encrypted };
    } else if (action === "restore") {
      const raw = String(payload.key || "").trim();
      if (raw.startsWith("nsec1")) {
        const next = decodeNsec(raw);
        secret?.fill(0);
        secret = next;
        security = 0;
        value = { pubkey: getPublicKey(next), secret: nsecEncode(next) };
      } else {
        const recovered = readBackup(raw, String(payload.password || ""));
        secret?.fill(0);
        secret = recovered.secret;
        security = recovered.security;
        value = { pubkey: getPublicKey(secret), secret: nsecEncode(secret) };
      }
    } else if (action === "unlock") {
      const recovered = readBackup(payload.encrypted, payload.password);
      secret?.fill(0);
      secret = recovered.secret;
      security = recovered.security;
      value = getPublicKey(secret);
    } else if (action === "sign") {
      if (!secret) throw Error("Unlock your identity first.");
      value = finalizeEvent(payload.event, secret);
    } else if (action === "encrypt" || action === "decrypt") {
      if (!secret) throw Error("Unlock your identity first.");
      const key = nip44.utils.getConversationKey(secret, payload.pubkey);
      try {
        value =
          action === "encrypt"
            ? nip44.encrypt(payload.content, key)
            : nip44.decrypt(payload.content, key);
      } finally {
        key.fill(0);
      }
    } else if (action === "password") {
      if (!secret) throw Error("Unlock your identity first.");
      validPassword(payload.password);
      value = encrypt(secret, payload.password, 16, security);
    } else throw Error("Unknown vault action.");
    self.postMessage({ id, value });
  } catch (e) {
    self.postMessage({
      id,
      error:
        action === "unlock" || action === "restore"
          ? "The key or recovery password is incorrect."
          : (e as Error).message,
    });
  }
};
