import { bech32 } from "@scure/base";
import { encrypt, decrypt } from "nostr-tools/nip49";
import { decode } from "nostr-tools/nip19";
import { getPublicKey } from "nostr-tools/pure";
export function validPassword(password: string) {
  if (password.length < 12 || password.length > 200)
    throw Error("Use an encryption password between 12 and 200 characters.");
}
export function readBackup(value: string, password: string) {
  if (value.length > 512) throw Error("Choose a valid encrypted Nostr backup.");
  const { prefix, words } = bech32.decode(value as `${string}1${string}`, 512);
  const bytes = bech32.fromWords(words);
  if (
    prefix !== "ncryptsec" ||
    bytes.length !== 91 ||
    bytes[0] !== 2 ||
    bytes[1] < 16 ||
    bytes[1] > 18
  )
    throw Error("This backup format or encryption cost is not supported on this device.");
  const secret = decrypt(value, password);
  try {
    getPublicKey(secret);
    return { secret, security: bytes[42] as 0 | 1 | 2 };
  } catch (e) {
    secret.fill(0);
    throw e;
  }
}
export function importKey(value: string, password: string) {
  validPassword(password);
  const decoded = decode(value);
  if (decoded.type !== "nsec")
    throw Error("A private nsec key is required; an npub cannot sign in.");
  try {
    const pubkey = getPublicKey(decoded.data);
    return { pubkey, encrypted: encrypt(decoded.data, password, 16, 0) };
  } finally {
    decoded.data.fill(0);
  }
}
