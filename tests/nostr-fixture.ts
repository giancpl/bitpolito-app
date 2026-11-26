import { WebSocketServer, WebSocket } from "ws";
import {
  finalizeEvent,
  getPublicKey,
  verifyEvent,
  type Event,
  type Filter,
} from "nostr-tools";
import { nip44 } from "nostr-tools";
export function testKey(n: number) {
  const key = new Uint8Array(32);
  key[31] = n;
  return key;
}
export async function startNostrFixture() {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 7001 });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const records: Event[] = [],
    subscriptions = new Map<WebSocket, Map<string, Filter[]>>();
  const match = (event: Event, f: Filter) =>
    (!f.kinds || f.kinds.includes(event.kind)) &&
    (!f.authors || f.authors.includes(event.pubkey)) &&
    Object.entries(f).every(
      ([key, values]) =>
        !key.startsWith("#") ||
        event.tags.some(
          (t) => t[0] === key.slice(1) && (values as string[]).includes(t[1]),
        ),
    );
  function deliver(event: Event) {
    records.push(event);
    for (const [client, subs] of subscriptions)
      for (const [id, filters] of subs)
        if (
          filters.some((f) => match(event, f)) &&
          client.readyState === WebSocket.OPEN
        )
          client.send(JSON.stringify(["EVENT", id, event]));
  }
  const bunkerKey = testKey(4),
    bunker = getPublicKey(bunkerKey),
    userKey = testKey(3);
  server.on("connection", (client) => {
    const subs = new Map<string, Filter[]>();
    subscriptions.set(client, subs);
    client.on("close", () => subscriptions.delete(client));
    client.on("message", async (bytes) => {
      try {
        const data = JSON.parse(bytes.toString());
        if (data[0] === "REQ") {
          subs.set(data[1], data.slice(2));
          for (const event of records)
            if (data.slice(2).some((f: Filter) => match(event, f)))
              client.send(JSON.stringify(["EVENT", data[1], event]));
          client.send(JSON.stringify(["EOSE", data[1]]));
        } else if (data[0] === "CLOSE") subs.delete(data[1]);
        else if (data[0] === "EVENT") {
          const event = data[1] as Event;
          if (!verifyEvent(event)) return;
          client.send(JSON.stringify(["OK", event.id, true, ""]));
          deliver(event);
          if (
            event.kind === 24133 &&
            event.tags.some((t) => t[0] === "p" && t[1] === bunker)
          ) {
            const key = nip44.getConversationKey(bunkerKey, event.pubkey),
              message = JSON.parse(nip44.decrypt(event.content, key));
            let result = "";
            if (message.method === "connect") result = "ack";
            else if (message.method === "get_public_key")
              result = getPublicKey(userKey);
            else if (message.method === "switch_relays")
              result = '["ws://127.0.0.1:7001"]';
            else if (message.method === "ping") result = "pong";
            else if (message.method === "sign_event")
              result = JSON.stringify(
                finalizeEvent(JSON.parse(message.params[0]), userKey),
              );
            const reply = finalizeEvent(
              {
                kind: 24133,
                content: nip44.encrypt(
                  JSON.stringify({ id: message.id, result }),
                  key,
                ),
                tags: [["p", event.pubkey]],
                created_at: Math.floor(Date.now() / 1000),
              },
              bunkerKey,
            );
            deliver(reply);
          }
        }
      } catch {
        /* Ignore malformed fixture frames. */
      }
    });
  });
  return {
    url: "ws://127.0.0.1:7001",
    bunker,
    close: async () => {
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
