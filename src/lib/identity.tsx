import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hub, hubEnabled, clearHubSigner, setHubSigner, team } from "./hub";
import { localSigner, lockVault, readVault, vaultCall, type VaultRecord } from "./vault";
import type { IdentitySigner } from "./signers";
import type { User } from "../../shared/contracts";

/** Legacy password-locked keys lock after this much inactivity; passwordless device keys stay ready. */
const AUTO_LOCK_MS = 15 * 60 * 1000;

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
  connect: (s: IdentitySigner, name?: string, signal?: AbortSignal) => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<IdentityState>(null!);
export const useIdentity = () => useContext(Context);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const signer = useRef<IdentitySigner | null>(null);
  const [vault, setVault] = useState<VaultRecord | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [dialog, setDialog] = useState(false);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: team.me,
    enabled: hubEnabled,
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

  const userId = me.data?.user?.id;
  // Passwordless local keys stored in device secure storage unlock automatically on launch.
  useEffect(() => {
    if (!vault?.secret || unlocked) return;
    let active = true;
    void vaultCall<string>("loadSecret", { secret: vault.secret })
      .then((pubkey) => {
        if (!active) return;
        setUnlocked(true);
        if (userId === pubkey) setHubSigner(localSigner(pubkey));
      })
      .catch(() => {
        /* ignore corrupted local vault; user can restore or recreate */
      });
    return () => {
      active = false;
    };
  }, [vault?.secret, unlocked, userId]);

  useEffect(() => {
    if (vault?.secret && unlocked && userId === vault.pubkey) {
      setHubSigner(localSigner(vault.pubkey));
    }
  }, [vault?.secret, vault?.pubkey, unlocked, userId]);

  useEffect(() => {
    if (!vault?.encrypted || vault.secret) return;
    let last = Date.now();
    const activity = () => (last = Date.now());
    const check = () => {
      if (Date.now() - last >= AUTO_LOCK_MS) lock();
    };
    const timer = setInterval(check, 10000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("bitpolito:resume", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("bitpolito:resume", check);
    };
  }, [vault?.encrypted, vault?.secret]);

  const signedOut = !!me.data && !me.data.user;
  useEffect(() => {
    if (signedOut && !vault?.secret) lock();
  }, [signedOut, vault?.secret]);

  async function resetSession() {
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
    await client.resetQueries({ queryKey: ["me"] });
  }
  async function connect(next: IdentitySigner, name?: string, signal?: AbortSignal) {
    await hub.connect(next, name);
    if (signal?.aborted) {
      await team.logout();
      clearHubSigner();
      throw Error("Connection cancelled.");
    }
    await signer.current?.close?.();
    signer.current = next;
    setDialog(false);
    await resetSession();
  }
  async function logout() {
    try {
      await team.logout();
    } finally {
      if (!vault?.secret) lock();
      clearHubSigner();
      await signer.current?.close?.();
      signer.current = null;
    }
    await resetSession();
  }
  return (
    <Context.Provider
      value={{
        user: me.data?.user || null,
        ready: !hubEnabled || !me.isPending,
        error: me.error,
        vault,
        unlocked,
        dialog,
        open: () => setDialog(true),
        close: () => setDialog(false),
        refresh: () => client.invalidateQueries(),
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
