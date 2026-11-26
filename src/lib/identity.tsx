import { isAndroid, Native, nativeOrigin } from "./native";
import { hub, hubEnabled, clearHubSigner } from './hub';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "./api";
import { lockVault, readVault, type VaultRecord } from "./vault";
import type { IdentitySigner } from "./signers";
import type { User } from "../../shared/contracts";
interface IdentityState {
  user: User | null;
  ready: boolean;
  error: Error | null;
  vault: VaultRecord | null;
  unlocked: boolean;
  dialog: boolean;
  open: () => void;
  close: () => void;
  refresh: () => Promise<void>;
  refreshVault: () => Promise<void>;
  unlock: () => void;
  lock: () => void;
  connect: (
    s: IdentitySigner,
    name?: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<IdentityState>(null!);
export const useIdentity = () => useContext(Context);
export function IdentityProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient(),
    signer = useRef<IdentitySigner | null>(null);
  const [vault, setVault] = useState<VaultRecord | null>(null),
    [unlocked, setUnlocked] = useState(false),
    [dialog, setDialog] = useState(false);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User | null }>("/me"),
    refetchInterval: 15000,
    retry: 1,
  });
  const refreshVault = async () => setVault((await readVault()) || null);
  const lock = () => {
    lockVault();
    setUnlocked(false);
  };
  useEffect(() => {
    void refreshVault();
    return () => lockVault();
  }, []);
  useEffect(() => {
    let last = Date.now();
    const activity = () => (last = Date.now());
    const timer = setInterval(() => {
      if (Date.now() - last >= 900000) lock();
    }, 10000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    const resume = () => { if (Date.now()-last>=900000) lock(); };
    document.addEventListener("visibilitychange",resume);
    window.addEventListener("bitpolito:resume",resume);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      document.removeEventListener("visibilitychange",resume);
      window.removeEventListener("bitpolito:resume",resume);
    };
  }, []);
  useEffect(() => {
    if (me.data && !me.data.user) lock();
  }, [me.data?.user?.id]);
  async function refresh() {
    await client.invalidateQueries();
  }
  async function connect(
    next: IdentitySigner,
    name?: string,
    signal?: AbortSignal,
  ) {
    if(hubEnabled){
      await hub.connect(next,name);
      if(signal?.aborted){await hub.command('logout');clearHubSigner();throw Error('Connection cancelled.');}
      await signer.current?.close?.();signer.current=next;setDialog(false);
      client.removeQueries({predicate:query=>query.queryKey[0]!=="me"});
      await client.resetQueries({queryKey:["me"]});return;
    }
    const { challenge } = await api<{ challenge: string }>(isAndroid ? "/auth/android/challenge" : "/auth/challenge", isAndroid ? {method:"POST"} : {});
    const body = JSON.stringify({ challenge, ...(name ? { name } : {}) });
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)),
      ),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
    const authUrl = isAndroid ? `${await nativeOrigin()}/api/auth/android/session` : `${location.origin}/api/auth/session`;
    const event = await next.signEvent({
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags: [
        ["u", authUrl],
        ["method", "POST"],
        ["payload", digest],
      ],
    });
    if (signal?.aborted) {
      await next.close?.();
      throw Error("Connection cancelled.");
    }
    if (event.pubkey !== next.pubkey)
      throw Error("Signer identity does not match the signature.");
    if (isAndroid) await Native.authenticate({body, authorization:`Nostr ${btoa(JSON.stringify(event))}`});
    else await api("/auth/session", {
      method: "POST",
      body,
      headers: { Authorization: `Nostr ${btoa(JSON.stringify(event))}` },
      signal,
    });
    await signer.current?.close?.();
    signer.current = next;
    setDialog(false);
    client.removeQueries({predicate:query=>query.queryKey[0]!=="me"});
    await client.resetQueries({queryKey:["me"]});
  }
  async function logout() {
    try {
      await post("/auth/logout");
    } finally {
      lock();
      clearHubSigner();
      if (isAndroid && !hubEnabled) await Native.logout();
      await signer.current?.close?.();
      signer.current = null;
    }
    client.removeQueries({predicate:query=>query.queryKey[0]!=="me"});
    await client.resetQueries({queryKey:["me"]});
  }
  return (
    <Context.Provider
      value={{
        user: me.data?.user || null,
        ready: !me.isPending,
        error: me.error,
        vault,
        unlocked,
        dialog,
        open: () => setDialog(true),
        close: () => setDialog(false),
        refresh,
        refreshVault,
        unlock: () => setUnlocked(true),
        lock,
        connect,
        logout,
      }}
    >
      {children}
    </Context.Provider>
  );
}
