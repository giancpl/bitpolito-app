import { Native } from "./native";
import {
  generateSecretKey,
  getPublicKey,
  type EventTemplate,
  type VerifiedEvent,
} from "nostr-tools/pure";
import {
  BunkerSigner,
  parseBunkerInput,
  createNostrConnectURI,
} from "nostr-tools/nip46";
import { SimplePool } from "nostr-tools/pool";
export interface IdentitySigner {
  pubkey: string;
  signEvent: (e: EventTemplate) => Promise<VerifiedEvent>;
  encrypt?: (pubkey:string,content:string)=>Promise<string>;
  decrypt?: (pubkey:string,content:string)=>Promise<string>;
  close?: () => Promise<void>;
}
declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (e: EventTemplate) => Promise<VerifiedEvent>;
      nip44?:{encrypt:(pubkey:string,content:string)=>Promise<string>;decrypt:(pubkey:string,content:string)=>Promise<string>};
    };
  }
}
export async function extensionSigner(): Promise<IdentitySigner> {
  if (!window.nostr)
    throw Error(
      "No browser signer found. Use a mobile signer, restore keys or create an identity.",
    );
  const extension = window.nostr;
  return {
    pubkey: await extension.getPublicKey(),
    signEvent: (e) => extension.signEvent(e),
    encrypt: extension.nip44 ? (p,c)=>extension.nip44!.encrypt(p,c) : undefined,
    decrypt: extension.nip44 ? (p,c)=>extension.nip44!.decrypt(p,c) : undefined,
  };
}
export async function remoteSigner(
  input: string,
  relays: string[],
  signal: AbortSignal,
  onauth: (url: string) => void,
): Promise<IdentitySigner> {
  const secret = generateSecretKey(),
    pool = new SimplePool();
  let bunker: BunkerSigner | undefined;
  const close = async () => {
    try {
      await bunker?.close();
    } finally {
      pool.destroy();
      secret.fill(0);
    }
  };
  const abort = () => {
    void close();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw Error("Connection cancelled.");
    if (input.startsWith("bunker://")) {
      const pointer = await parseBunkerInput(input);
      if (!pointer || !pointer.relays.length)
        throw Error("Enter a bunker connection link.");
      if (pointer.relays.some((r) => {try {const url=new URL(r);return url.protocol!=="wss:"&&!(import.meta.env.DEV&&url.protocol==="ws:"&&["localhost","127.0.0.1"].includes(url.hostname));}catch{return true;}}))
        throw Error("Use a signer link with secure relay URLs.");
      bunker = BunkerSigner.fromBunker(secret, pointer, {
        pool,
        onauth,
        timeout: 30000,
        authTimeout: 120000,
      });
      await bunker.connect({ name: "BitPolito Hub", url: location.origin });
      await bunker.switchRelays();
    } else {
      bunker = await BunkerSigner.fromURI(
        secret,
        input,
        { pool, onauth, timeout: 30000, authTimeout: 120000 },
        signal,
      );
    }
    if (signal.aborted) throw Error("Connection cancelled.");
    const pubkey = await bunker.getPublicKey();
    if (!/^[a-f0-9]{64}$/.test(pubkey))
      throw Error("Signer returned an invalid identity.");
    return { pubkey, signEvent: (e) => bunker!.signEvent(e), encrypt:(p,c)=>bunker!.nip44Encrypt(p,c),decrypt:(p,c)=>bunker!.nip44Decrypt(p,c),close };
  } catch (e) {
    await close();
    throw e;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
export function mobileURI(relays: string[]) {
  if (!relays.length)
    throw Error(
      "A secure relay must be configured by an administrator before connecting a mobile signer.",
    );
  // The remoteSigner must retain the same client secret used to create this URI.
  const secret = generateSecretKey();
  const uri = createNostrConnectURI({
    clientPubkey: getPublicKey(secret),
    relays,
    secret: crypto.randomUUID(),
    name: "BitPolito Hub",
    url: location.origin,
    perms: ["sign_event:27235","sign_event:5","sign_event:10002","sign_event:10050","sign_event:30443","sign_event:450","sign_event:30078","sign_event:1059","sign_event:22242","nip44_encrypt","nip44_decrypt"],
  });
  return {
    uri,
    connect: async (signal: AbortSignal, onauth: (u: string) => void) => {
      const pool = new SimplePool();
      let bunker: BunkerSigner | undefined;
      const close = async () => {
        try {
          await bunker?.close();
        } finally {
          pool.destroy();
          secret.fill(0);
        }
      };
      const abort = () => void close();
      signal.addEventListener("abort", abort, { once: true });
      try {
        bunker = await BunkerSigner.fromURI(
          secret,
          uri,
          { pool, onauth, timeout: 30000, authTimeout: 120000 },
          signal,
        );
        if (signal.aborted) throw Error("Connection cancelled.");
        const pubkey = await bunker.getPublicKey();
        return {
          pubkey,
          signEvent: (e: EventTemplate) => bunker!.signEvent(e),
          encrypt:(p:string,c:string)=>bunker!.nip44Encrypt(p,c),
          decrypt:(p:string,c:string)=>bunker!.nip44Decrypt(p,c),
          close,
        };
      } catch (e) {
        await close();
        throw e;
      } finally {
        signal.removeEventListener("abort", abort);
      }
    },
    dispose: () => secret.fill(0),
  };
}

export async function androidSigner():Promise<IdentitySigner> {
  const {pubkey}=await Native.signerKey();
  return {pubkey,encrypt:(p,c)=>Native.signerCrypt({type:'nip44_encrypt',pubkey:p,content:c}).then(r=>r.content),decrypt:(p,c)=>Native.signerCrypt({type:'nip44_decrypt',pubkey:p,content:c}).then(r=>r.content), signEvent: async e => {
    const result=await Native.signerSign({event:JSON.stringify({...e,pubkey})});
    const signed={...e,pubkey,...JSON.parse(result.event)};
    const {verifyEvent,getEventHash}=await import("nostr-tools/pure");
    if (!signed.id) signed.id=getEventHash(signed);
    if (signed.pubkey!==pubkey || !verifyEvent(signed)) throw Error("Signer returned an invalid signature");
    return signed;
  }};
}
