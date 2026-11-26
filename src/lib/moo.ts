import { isAndroid, Native } from "./native";
import { hubEnabled } from './hub';
import { useEffect, useRef } from "react";
import {
  playOfficeSound,
  retainOfficeAlerts,
  stopOfficeSound,
  useOfficeSound,
} from "./office-sound";
import {
  foregroundAlert,
  officeAlertKey,
  type OfficeAlertMessage,
} from "./office-alerts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useIdentity } from "./identity";
import type { MooState } from "../../shared/contracts";
export function useMoo() {
  const { user } = useIdentity();
  return useQuery({
    queryKey: ["moo"],
    queryFn: () => api<MooState>("/moo/state"),
    enabled: !!user && user.role !== "follower",
    refetchInterval: 5000,
    retry: 1,
  });
}
export function Realtime() {
  const { user } = useIdentity(),
    client = useQueryClient();
  const moo = useMoo(),
    sound = useOfficeSound();
  useEffect(() => {
    if (!user || user.role === "follower" || isAndroid || hubEnabled) return;
    const source = new EventSource("/api/realtime");
    const update = () => {
      void client.invalidateQueries({ queryKey: ["moo"] });
      void client.invalidateQueries({ queryKey: ["me"] });
      void client.invalidateQueries({ queryKey: ["resources"] });
    };
    source.addEventListener("change", update);
    source.addEventListener("revoked", () => {
      // Keep the observed session query alive so the member gate updates even
      // when another request finishes with 401 at the same time.
      client.setQueryData(["me"], { user: null });
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "me",
      });
      source.close();
    });
    return () => source.close();
  }, [user?.id, user?.role, client]);
  const latest = useRef({ user, data: moo.data, error: moo.error });
  latest.current = { user, data: moo.data, error: moo.error };
  useEffect(() => {
    const eligible = (id: string, key: string) => {
      const current = latest.current;
      const state = client.getQueryData<MooState>(["moo"]);
      return (
        !!current.user &&
        !current.error &&
        document.visibilityState === "visible" &&
        !!state?.presence.some((p) => p.id === current.user!.id) &&
        !!state.incoming.some(
          (r) =>
            r.id === id &&
            r.status === "waiting" &&
            officeAlertKey(r, state.serverTime) === key,
        )
      );
    };
    const deliver = async (id: string, key: string) =>
      foregroundAlert(
        key,
        () => eligible(id, key),
        () => playOfficeSound(key),
      );
    async function notify() {
      if (isAndroid && hubEnabled) return;
      if (isAndroid) {
        const current = latest.current;
        if (current.user && current.data && !current.error && current.data.presence.some(p=>p.id===current.user!.id)) {
          for (const r of current.data.incoming) if(r.status==='waiting') {
            await Native.alert({request:r.id,phase:current.data.serverTime-r.createdAt>=60?'reminder':'ring'});
          }
        }
        return;
      }
      const current = latest.current;
      const keys = new Set<string>();
      if (
        current.user &&
        !current.error &&
        current.data?.presence.some((p) => p.id === current.user!.id)
      ) {
        for (const request of current.data.incoming) {
          if (request.status === "waiting")
            keys.add(officeAlertKey(request, current.data.serverTime));
        }
      }
      retainOfficeAlerts(keys);
      if (sound !== "ready" || !current.user || !current.data || current.error)
        return;
      for (const request of current.data.incoming) {
        if (request.status === "waiting")
          await deliver(
            request.id,
            officeAlertKey(request, current.data.serverTime),
          );
      }
    }
    const message = (event: MessageEvent<OfficeAlertMessage>) => {
      if (event.origin && event.origin !== window.location.origin) return;
      if (event.data?.type !== "bitpolito:office-alert" || !event.ports[0])
        return;
      const port = event.ports[0];
      void deliver(event.data.request, event.data.key)
        .then((started) => port.postMessage({ started }))
        .catch(() => port.postMessage({ started: false }))
        .finally(() => port.close());
    };
    const check = () => void notify().catch(() => {});
    navigator.serviceWorker?.addEventListener("message", message);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      navigator.serviceWorker?.removeEventListener("message", message);
      document.removeEventListener("visibilitychange", check);
    };
  }, [moo.data, moo.error, user?.id, sound, client]);
  useEffect(() => () => stopOfficeSound(), [user?.id]);
  return null;
}

