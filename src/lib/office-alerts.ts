import { createStore, update } from "idb-keyval";

// The audio start and channel decision share one IndexedDB transaction. A late
// page cannot play after the worker has selected the system notification sound.
type Delivery = { at: number; channel: "cow" | "system" };
const store = createStore("bitpolito-office-alerts", "played");
export function officeAlertKey(
  request: { id: string; updatedAt: number; createdAt: number },
  serverTime: number,
) {
  return `audio:${request.id}:${serverTime - request.createdAt >= 60 ? "reminder" : "ring"}`;
}
async function decide(
  key: string,
  choose: (existing?: Delivery) => Delivery | undefined,
) {
  await update<Record<string, Delivery>>(
    "audio-v2",
    (old = {}) => {
      const recent = Object.fromEntries(
        Object.entries(old).filter(
          ([, value]) => value.at > Date.now() - 86400000,
        ),
      );
      const next = choose(recent[key]);
      if (next) recent[key] = next;
      return recent;
    },
    store,
  );
}
export async function foregroundAlert(
  key: string,
  eligible: () => boolean,
  start: () => boolean,
) {
  let cowStarted = false;
  await decide(key, (existing) => {
    if (existing) {
      cowStarted = existing.channel === "cow";
      return existing;
    }
    if (eligible() && start()) {
      cowStarted = true;
      return { at: Date.now(), channel: "cow" };
    }
  });
  return cowStarted;
}
export async function systemAlert(key: string) {
  let audible = false;
  await decide(key, (existing) => {
    if (existing) return existing;
    audible = true;
    return { at: Date.now(), channel: "system" };
  });
  return audible;
}
export interface OfficeAlertMessage {
  type: "bitpolito:office-alert";
  request: string;
  key: string;
}
// Visibility alone is not proof that the page started a sound.
export function askForeground(
  clients: readonly {
    visibilityState: string;
    postMessage: (message: unknown, transfer: Transferable[]) => void;
  }[],
  message: OfficeAlertMessage,
  timeout = 750,
): Promise<boolean> {
  const visible = clients.filter(
    (client) => client.visibilityState === "visible",
  );
  if (!visible.length) return Promise.resolve(false);
  return new Promise((resolve) => {
    const ports: MessagePort[] = [];
    let remaining = visible.length,
      finished = false;
    const finish = (played: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      ports.forEach((port) => port.close());
      resolve(played);
    };
    const timer = setTimeout(() => finish(false), timeout);
    for (const client of visible) {
      try {
        const channel = new MessageChannel();
        ports.push(channel.port1);
        channel.port1.onmessage = (event) => {
          if (event.data?.started === true) finish(true);
          else if (--remaining === 0) finish(false);
        };
        client.postMessage(message, [channel.port2]);
      } catch {
        if (--remaining === 0) finish(false);
      }
    }
  });
}
