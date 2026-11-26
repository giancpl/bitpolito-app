import { expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nsecEncode, npubEncode } from "nostr-tools/nip19";
import { encrypt } from "nostr-tools/nip49";
import { importKey, readBackup, validPassword } from "../src/lib/vault-crypto";
it("round trips NIP-49 recovery and rejects wrong passwords", () => {
  const key = generateSecretKey(),
    password = "a secure local password";
  const encrypted = encrypt(key, password, 16, 1);
  const recovered = readBackup(encrypted, password);
  expect(getPublicKey(recovered.secret)).toBe(getPublicKey(key));
  expect(() => readBackup(encrypted, "wrong password")).toThrow();
  recovered.secret.fill(0);
  key.fill(0);
}, 20000);
it("imports private keys encrypted and rejects public keys or short passwords", () => {
  const secret = generateSecretKey();
  const record = importKey(nsecEncode(secret), "a secure local password");
  expect(record.encrypted).toMatch(/^ncryptsec1/);
  const recovered = readBackup(record.encrypted, "a secure local password");
  expect(getPublicKey(recovered.secret)).toBe(getPublicKey(secret));
  expect(recovered.security).toBe(0);
  expect(() => importKey(npubEncode(getPublicKey(secret)), "a secure local password")).toThrow();
  expect(() => validPassword("short")).toThrow();
  secret.fill(0);
  recovered.secret.fill(0);
}, 20000);
