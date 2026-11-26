/// <reference lib="webworker" />
import {
  askForeground,
  officeAlertKey,
  systemAlert,
} from "./lib/office-alerts";
import type { MooState } from "../shared/contracts";
declare const self: ServiceWorkerGlobalScope;

const CACHE = "bitpolito-offline-v6";
const ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith("bitpolito-offline-") && key !== CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/uploads")
  )
    return;
  if (event.request.mode === "navigate")
    event.respondWith(
      fetch(event.request).catch(() =>
        caches
          .open(CACHE)
          .then((cache) => cache.match("/offline.html"))
          .then((response) => response || Response.error()),
      ),
    );
  else if (ASSETS.includes(url.pathname) && !url.search)
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) =>
            (await cache.match(event.request)) || fetch(event.request),
        ),
    );
});
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data: Record<string, any> = {};
      let alertKey = "";
      try {
        data = event.data?.json() || {};
      } catch {
        /* Generic fallback. */
      }
      let url = "/moo";
      try {
        const target = new URL(data.url, self.location.origin);
        if (
          target.origin === self.location.origin &&
          target.pathname === "/moo"
        )
          url = target.pathname + target.search;
      } catch {}
      // A push can be delayed in transit. Recheck private state when online so
      // leaving, revocation or another responder makes the old ring obsolete.
      if (["ring", "reminder"].includes(data.purpose)) {
        try {
          const response = await fetch("/api/moo/state", {
            credentials: "include",
            cache: "no-store",
          });
          if (response.status === 401 || response.status === 403) return;
          if (response.ok) {
            const state = (await response.json()) as MooState;
            const request = state.incoming.find(
              (r) => r.id === data.request && r.status === "waiting",
            );
            if (!request) return;
            alertKey = officeAlertKey(request, state.serverTime);
          }
        } catch {
          /* The generic push remains useful when the network is unavailable. */
        }
      }
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      let silent = data.silent === true;
      if (
        !silent &&
        ["ring", "reminder"].includes(data.purpose) &&
        typeof data.request === "string"
      ) {
        // This fallback also records a channel when offline, so the page cannot
        // replay the same ring after the connection returns.
        alertKey ||= `audio:${data.request}:${data.purpose}`;
        try {
          await askForeground(windows, {
            type: "bitpolito:office-alert",
            request: data.request,
            key: alertKey,
          });
          silent = !(await systemAlert(alertKey));
        } catch {
          // Storage failure must not silently discard a standard push alert.
          silent = false;
        }
      }
      const options: NotificationOptions & { renotify: boolean } = {
        body:
          typeof data.body === "string"
            ? data.body.slice(0, 160)
            : "There is an office update.",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: typeof data.tag === "string" ? data.tag : "moo",
        silent,
        renotify: !silent && data.purpose === "reminder",
        data: { url },
      };
      await self.registration.showNotification("BitPolito · Office", options);
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const target = new URL(
        event.notification.data?.url || "/moo",
        self.location.origin,
      );
      if (target.origin !== self.location.origin || target.pathname !== "/moo")
        return;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(target.href);
          return client.focus();
        }
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
