import { isAndroid, Native } from "./native";
import { get, set, del } from "idb-keyval";
import type { EventTemplate, VerifiedEvent } from "nostr-tools/pure";
export interface VaultRecord {
  pubkey: string;
  encrypted: string;
}
const storageKey = "bitpolito.identity.v1";
export const readVault = async (): Promise<VaultRecord | undefined> =>
  isAndroid
    ? JSON.parse((await Native.vaultRead()).value || "null") || undefined
    : get<VaultRecord>(storageKey);
export const saveVault = (r: VaultRecord) =>
  isAndroid
    ? Native.vaultWrite({ value: JSON.stringify({ pubkey: r.pubkey, encrypted: r.encrypted }) })
    : set(storageKey, { pubkey: r.pubkey, encrypted: r.encrypted });
export const forgetVault = () => (isAndroid ? Native.vaultRemove() : del(storageKey));
let worker: Worker | undefined,
  id = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
export function lockVault() {
  worker?.terminate();
  worker = undefined;
  for (const p of pending.values()) p.reject(Error("Identity locked."));
  pending.clear();
}
export function vaultCall<T>(action: string, payload: unknown = {}): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL("./vault-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) p?.reject(Error(data.error));
      else p?.resolve(data.value);
    };
    worker.onerror = () => {
      lockVault();
    };
  }
  return new Promise((resolve, reject) => {
    const serial = ++id;
    pending.set(serial, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ id: serial, action, payload });
  });
}
export const signLocal = (event: EventTemplate) => vaultCall<VerifiedEvent>("sign", { event });
export const localSigner = (pubkey: string) => ({
  pubkey,
  signEvent: signLocal,
  encrypt: (pubkey: string, content: string) => vaultCall<string>("encrypt", { pubkey, content }),
  decrypt: (pubkey: string, content: string) => vaultCall<string>("decrypt", { pubkey, content }),
});
