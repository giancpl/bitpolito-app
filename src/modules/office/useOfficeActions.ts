import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "../../lib/identity";
import { useGuidance } from "../../lib/guidance";
import { useToast } from "../../components/Feedback";
import { officeApi, type RequestAction } from "./api";
import { officeKeys, useOffice } from "./queries";
import { isLive } from "./logic";
import type { MooRequest } from "../../../shared/contracts";

const RING_KEY = "bitpolito.ring.operation";

/** Shared state and actions for the Office Home widget and full Office views. */
export function useOfficeActions() {
  const { user } = useIdentity();
  const query = useOffice();
  const client = useQueryClient();
  const navigate = useNavigate();
  const guidance = useGuidance(user?.id);
  const toast = useToast();
  const operation = useRef(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const latest = query.data?.own;
  const latestId = latest?.id;
  const latestEnded = !!latest && !isLive(latest);
  useEffect(() => {
    if (latestEnded) sessionStorage.removeItem(RING_KEY);
  }, [latestId, latestEnded]);

  async function run(key: string, fn: () => Promise<unknown>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(key);
    setError("");
    try {
      await fn();
      await client.invalidateQueries({ queryKey: officeKeys.state });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      operation.current = false;
      setBusy("");
    }
  }

  const respond = (r: MooRequest, action: RequestAction) =>
    void run(r.id, async () => {
      await officeApi.respond(r.id, action);
      if (action === "inside") {
        guidance.complete("inside");
        guidance.complete("check-in");
        toast("You’re in. You’re now available to get the door.");
      }
      if (action === "claim") {
        guidance.complete("claim");
        toast(`${r.requesterName || "They"} will see that you’re coming.`);
      }
    });

  const ring = (fresh = false) =>
    void run("ring", async () => {
      // A stable key makes a retried ring idempotent after a flaky connection.
      if (fresh) sessionStorage.removeItem(RING_KEY);
      let key = sessionStorage.getItem(RING_KEY);
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem(RING_KEY, key);
      }
      const result = await officeApi.ring(key);
      guidance.complete("ring");
      navigate(`/moo?request=${result.id}`);
    });

  const checkIn = () =>
    void run("presence", async () => {
      await officeApi.checkIn();
      guidance.complete("check-in");
      toast("You’re in. Presence clears at midnight.");
    });

  const leave = () =>
    void run("presence", async () => {
      await officeApi.leave();
      toast("You’re marked as outside. Office alerts have stopped.");
    });

  const data = query.data;
  const inside = !!user && !!data?.presence.some((p) => p.id === user.id);
  const own = data?.own ?? null;
  const active = !!own && isLive(own);
  const disabled = !!busy || !!query.error;
  const others = data && user ? data.presence.filter((p) => p.id !== user.id) : [];

  return {
    user,
    query,
    data,
    busy,
    error,
    guidance,
    inside,
    own,
    active,
    disabled,
    others,
    respond,
    ring,
    checkIn,
    leave,
  };
}
