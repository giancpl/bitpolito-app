import { test, expect, type Page } from "@playwright/test";
import { connectAs, navigate, openProfileView } from "../browser/helpers";

async function openSettings(page: Page, view = "Install app") {
  await openProfileView(page, view);
}

test("production manifest, icons, service worker, and offline navigation", async ({
  page,
  context,
}) => {
  await connectAs(page);
  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const response = await page.request.get(manifestUrl!);
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    short_name: "BitPolito",
  });
  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.headers()["content-type"]).toContain("image/png");
    const bytes = await image.body();
    const [width, height] = icon.sizes.split("x").map(Number);
    expect(bytes.readUInt32BE(16)).toBe(width);
    expect(bytes.readUInt32BE(20)).toBe(height);
  }
  const touchIcon = await page.request.get(
    (await page.locator('link[rel="apple-touch-icon"]').getAttribute("href"))!,
  );
  expect((await touchIcon.body()).readUInt32BE(16)).toBe(180);
  expect((await page.request.get("/sw.js")).headers()["cache-control"]).toBe(
    "no-cache",
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);

  const resources = await page.request.get("/api/resources");
  expect(resources.ok()).toBe(true);
  const state = await page.evaluate(async () =>
    (await fetch("/api/moo/state")).json(),
  );
  expect(state.office).toBe("BitPolito Office");
  const cached = await page.evaluate(async () => {
    const keys: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        keys.push(new URL(request.url).pathname);
    return keys;
  });
  expect(cached).toContain("/offline.html");
  expect(
    cached.every(
      (path) => path === "/offline.html" || path.startsWith("/icons/"),
    ),
  ).toBe(true);

  await context.setOffline(true);
  await page.goto("/moo");
  await expect(
    page.getByRole("heading", { name: "Let’s reconnect." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ring the office" }),
  ).toHaveCount(0);
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: /^(Hi, .+\.|Office|Door request)$/, exact: true }),
  ).toBeVisible();
});

test("retains the browser install offer until settings open and shows manual steps after dismissal", async ({
  page,
}) => {
  await connectAs(page);
  await page.getByRole("heading", { name: /^(Hi, .+\.|Office|Door request)$/, exact: true }).waitFor();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        (window as any).promptCalls = ((window as any).promptCalls || 0) + 1;
      },
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await openSettings(page);
  await page
    .getByRole("button", { name: "Install BitPolito", exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).promptCalls)).toBe(1);
  await expect(
    page.getByRole("button", { name: "Install BitPolito", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Open your browser’s menu", { exact: false }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(
    page.getByText("You’re using the installed web app."),
  ).toBeVisible();
});

test("shows iPhone home-screen instructions and an offline notice", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "userAgent", {
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
    }),
  );
  await connectAs(page);
  await openSettings(page);
  // This checks the instructions, not a physical iOS install or Safari engine.
  await expect(
    page.getByText("In Safari, open the Share menu", { exact: false }),
  ).toBeVisible();
  await navigate(page, "Office");
  await context.setOffline(true);
  await expect(
    page.getByText(
      "You’re offline. Reconnect to load updates or save changes.",
    ),
  ).toBeVisible();
});

test("notification denial stays recoverable and never reports alerts as enabled", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let permission: NotificationPermission = "default";
    Object.defineProperty(Notification, "permission", {
      get: () => permission,
    });
    Notification.requestPermission = async () => {
      permission = "denied";
      return permission;
    };
  });
  await connectAs(page);
  await openSettings(page, "Office alerts");
  await page
    .getByRole("button", { name: "Enable office alerts", exact: true })
    .click();
  await expect(
    page.getByText(
      "Notifications are not enabled. You can change this in browser settings.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Alerts only while the app is open.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Test notification", exact: true }),
  ).toHaveCount(0);
});

test("local cow recording decodes and explicit audio activation stays recoverable", async ({
  page,
}) => {
  await connectAs(page);
  const response = await page.request.get("/audio/mudchute-cow.mp3");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toMatch(/audio/);
  const credit = await (
    await page.request.get("/audio/ATTRIBUTION.txt")
  ).text();
  expect(credit).toContain("Secretlondon");
  expect(credit).toContain("CC BY-SA 3.0");
  await openSettings(page, "Office alerts");
  await page
    .getByRole("button", { name: "Enable cow sound", exact: true })
    .click();
  await expect(
    page.getByText("Cow sound ready while this page is visible.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reactivate cow sound", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reactivate cow sound", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Test cow sound", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mute cow sound", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable cow sound", exact: true }),
  ).toBeVisible();
});

test("push and visible pages share one audio channel and muted pages keep a standard notification", async ({
  page,
  context,
  browser,
}, info) => {
  const actor = info.project.name === "desktop" ? 23 : 26;
  await context.grantPermissions(["notifications"]);
  await page.addInitScript(() => {
    (window as any).cowPlays = 0;
    (window as any).AudioContext = class {
      state = "running";
      destination = {};
      onstatechange = null;
      resume() {
        return Promise.resolve();
      }
      decodeAudioData() {
        return Promise.resolve({ duration: 2 });
      }
      createBufferSource() {
        return {
          buffer: null,
          connect() {},
          disconnect() {},
          stop() {},
          start() {
            (window as any).cowPlays++;
          },
        };
      }
    };
  });
  await connectAs(page, actor);
  const requesterContext = await browser.newContext({
    serviceWorkers: "block",
  });
  const secondContext = await browser.newContext({ serviceWorkers: "block" });
  const requester = await requesterContext.newPage(),
    second = await secondContext.newPage();
  await connectAs(requester, actor + 1);
  await connectAs(second, actor + 2);
  const { localPost } = await import("../browser/helpers");
  for (const p of [requester, second])
    await localPost(p, "/moo/presence", { action: "leave" });
  await localPost(page, "/moo/presence", { action: "arrive" });
  await openSettings(page, "Office alerts");
  await page
    .getByRole("button", { name: "Enable cow sound", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).cowPlays))
    .toBe(1);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const worker = context
    .serviceWorkers()
    .find((worker) => worker.url().endsWith("/sw.js"));
  expect(worker).toBeDefined();
  await worker!.evaluate(() => {
    // Headless Chromium cannot provide a physical notification service. Mock
    // only that boundary; event handling, MessagePorts and IndexedDB are real.
    const notices = ((self as any).testNotices = new Map());
    ServiceWorkerRegistration.prototype.showNotification = async (
      _title,
      options,
    ) => {
      notices.set(options?.tag, { silent: options?.silent, tag: options?.tag });
    };
  });
  async function deliver(request: string, tag: string) {
    // Exercise the actual production worker and browser IndexedDB. Only event
    // lifetime is collected by the harness; no push provider is contacted.
    await worker!.evaluate(
      async (payload) => {
        let pending: Promise<unknown> | undefined;
        const event = new PushEvent("push", { data: payload });
        Object.defineProperty(event, "waitUntil", {
          value: (work: Promise<unknown>) => {
            pending = work;
          },
        });
        self.dispatchEvent(event);
        await pending;
      },
      JSON.stringify({
        purpose: "ring",
        request,
        silent: false,
        url: `/moo?request=${request}`,
        tag,
      }),
    );
  }
  async function notification(tag: string) {
    return worker!.evaluate((tag) => {
      const notice = (self as any).testNotices.get(tag);
      return notice ? [notice] : [];
    }, tag);
  }
  const first = await localPost(requester, "/moo/requests", {
    key: crypto.randomUUID(),
  });
  expect(first.status).toBe(200);
  await expect
    .poll(() => page.evaluate(() => (window as any).cowPlays))
    .toBe(2);
  await deliver(first.data.id, "test-cow");
  await expect
    .poll(() => notification("test-cow"))
    .toEqual([{ silent: true, tag: "test-cow" }]);
  await localPost(requester, `/moo/requests/${first.data.id}`, {
    action: "cancel",
  });
  await page
    .getByRole("button", { name: "Mute cow sound", exact: true })
    .click();
  const next = await localPost(second, "/moo/requests", {
    key: crypto.randomUUID(),
  });
  expect(next.status).toBe(200);
  await deliver(next.data.id, "test-system");
  await expect
    .poll(() => notification("test-system"))
    .toEqual([{ silent: false, tag: "test-system" }]);
  await deliver(next.data.id, "test-system");
  await expect
    .poll(() => notification("test-system"))
    .toEqual([{ silent: true, tag: "test-system" }]);
  await page
    .getByRole("button", { name: "Enable cow sound", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).cowPlays))
    .toBe(3);
  // Let both the query invalidation and a complete page reload try delivery.
  await page.reload();
  await page
    .getByRole("button", { name: "Reactivate cow sound", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).cowPlays))
    .toBe(1);
  await localPost(second, `/moo/requests/${next.data.id}`, {
    action: "cancel",
  });
  await localPost(page, "/moo/presence", { action: "leave" });
  await requesterContext.close();
  await secondContext.close();
});

test("an old subscription cannot report enabled alerts on an unconfigured or unavailable server", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(Notification, "permission", { get: () => "granted" }),
  );
  await page.route("**/api/push/subscriptions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: false, subscribed: true }),
    }),
  );
  await connectAs(page);
  await openSettings(page, "Office alerts");
  await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Test notification", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Alerts are enabled on this device.", { exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/push/subscriptions");
  await page.route("**/api/config", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary outage" }),
    }),
  );
  await page.reload();
  await expect(page.getByText("Check failed", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Couldn’t check background alerts/),
  ).toBeVisible();
  await page.unroute("**/api/config");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enable office alerts", exact: true }),
  ).toBeEnabled();
});
