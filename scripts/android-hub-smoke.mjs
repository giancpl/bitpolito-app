// Opt-in native UX/protocol test. Uses only the installed labelled sandbox and public disposable fixtures.
import { chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { getPublicKey } from "nostr-tools/pure";
const adb = (...args) =>
  execFileSync(".android-local/sdk/platform-tools/adb", args, { encoding: "utf8" }).trim();
adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
for (const port of [3480, 3481]) adb("reverse", `tcp:${port}`, `tcp:${port}`);
adb("shell", "am", "start", "-n", "it.bitpolito.hub.sandbox/it.bitpolito.hub.MainActivity");
const check = expect.configure({ timeout: 120000 });
let browser;
await check
  .poll(async () => {
    try {
      const pid = adb("shell", "pidof", "it.bitpolito.hub.sandbox");
      adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);
      browser = await chromium.connectOverCDP("http://127.0.0.1:9222", {
        noDefaults: true,
        timeout: 3000,
      });
      return true;
    } catch {
      return false;
    }
  })
  .toBe(true);
const page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(120000);
const native = (plugin, method, args = {}) =>
  page.evaluate(
    ({ plugin, method, args }) => window.Capacitor.nativePromise(plugin, method, args),
    { plugin, method, args },
  );
const command = async (action, input = {}) =>
  (await native("BitPolitoHub", "execute", { action, input })).value;
const fixtures = [1, 2, 3, 6].map((n) => {
  const key = new Uint8Array(32);
  key[31] = n;
  return getPublicKey(key);
});
try {
  const config = await native("BitPolito", "configuration");
  if (!config.sandbox || config.transport !== "marmot")
    throw Error("Only the distributed disposable sandbox may be tested.");
  const current = await command("me");
  if (current.user && !fixtures.includes(current.user.id))
    throw Error("Refusing to sign out a non-fixture identity.");
  async function logout() {
    await command("logout");
    await page.reload();
    await check(page.getByRole("combobox", { name: "Test identity" })).toBeVisible();
  }
  async function login(name) {
    console.log(`Connecting disposable ${name}…`);
    await page.getByRole("combobox", { name: "Test identity" }).selectOption({ label: name });
    await page.getByRole("button", { name: `Use ${name} test identity`, exact: true }).click();
    await check
      .poll(async () => {
        const error = (await page.locator(".android-sandbox [role=alert]").allTextContents()).join(
          " ",
        );
        if (error) throw Error(`Fixture onboarding failed: ${error}`);
        return (await command("me")).user?.name;
      })
      .toBe(name);
    await check.poll(async () => (await command("status")).state).toBe("connected");
    console.log(`${name} connected.`);
  }
  async function invite(name) {
    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Administration", exact: true }).click();
    await page.getByLabel("Who is this invitation for?").fill(name);
    await page.getByRole("button", { name: "Create invitation", exact: true }).click();
    return page.getByLabel("Invitation link", { exact: true }).inputValue();
  }
  async function request(link) {
    const another = page.getByRole("button", { name: "Use another invitation", exact: true });
    if ((await command("joinStatus")).status === "pending") await another.click();
    await page.getByLabel("Invitation link or code").fill(link);
    await page.getByRole("button", { name: "Request access", exact: true }).click();
    const replacePhone = page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Use this phone", exact: true });
    const waiting = page.getByRole("heading", { name: "Waiting for approval" });
    await check(waiting.or(replacePhone)).toBeVisible();
    if (await replacePhone.isVisible()) await replacePhone.click();
    await check(waiting).toBeVisible();
  }
  async function approve(name) {
    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Administration", exact: true }).click();
    const card = page
      .locator(".join-applications .application-row")
      .filter({ has: page.getByText(name, { exact: true }) });
    await check(card).toBeVisible();
    await card.getByRole("button", { name: "Approve", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Approve member", exact: true })
      .click();
    await check(card).toHaveCount(0);
  }
  if (current.user) await logout();
  expect(
    await command("resources").then(
      () => false,
      () => true,
    ),
  ).toBe(true);
  await login("Alice");
  await check(page.getByRole("heading", { name: /^(Hi, Alice\.|Join your team)$/ })).toBeVisible();
  if (await page.getByRole("heading", { name: "Join your team", exact: true }).count()) {
    await page.getByText("Setting up a new team?", { exact: true }).click();
    await page.getByRole("button", { name: "Create a new team", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Create team", exact: true })
      .click();
  }
  await check(page.getByRole("heading", { name: "Hi, Alice.", exact: true })).toBeVisible();
  const existing = await command("members");
  const self = (await command("me")).user;
  expect(
    await command("setRole", { id: self.id, role: "member" }).then(
      () => false,
      () => true,
    ),
  ).toBe(true);
  const catalogueId = "sandbox-native-handbook";
  const resource = {
    id: catalogueId,
    title: "Sandbox handbook",
    description: "Disposable native verification resource",
    category: "Team",
    type: "resource",
    status: "active",
    url: "https://bitpolito.it",
    icon: "icon-bell.svg",
  };
  await command("saveResource", resource);
  expect(
    (await command("resources")).some((r) => r.id === catalogueId && r.status === "active"),
  ).toBe(true);
  await command("saveResource", { ...resource, status: "archived" });
  for (const name of ["Bob", "Cara", "Drew"]) {
    if (existing.some((m) => m.id === fixtures[{ Bob: 1, Cara: 2, Drew: 3 }[name]])) continue;
    const link = await invite(name);
    await logout();
    await login(name);
    await request(link);
    await logout();
    await login("Alice");
    await approve(name);
    console.log(`${name} approval published.`);
    await page.getByRole("link", { name: "Home", exact: true }).click();
  }
  await page.getByRole("link", { name: "Home", exact: true }).click();
  if (await page.getByRole("button", { name: "I’m in the office", exact: true }).count()) {
    await page.getByRole("button", { name: "I’m in the office", exact: true }).click();
    await check(page.getByRole("button", { name: "I’m leaving", exact: true })).toBeVisible();
  }
  await logout();
  await login("Bob");
  await check(page.getByRole("heading", { name: "Hi, Bob.", exact: true })).toBeVisible();
  await check.poll(async () => (await command("members")).length).toBeGreaterThanOrEqual(4);
  expect(
    await command("saveResource", { id: "denied" }).then(
      () => false,
      () => true,
    ),
  ).toBe(true);
  if (await page.getByRole("button", { name: "I’m in the office", exact: true }).count()) {
    await page.getByRole("button", { name: "I’m in the office", exact: true }).click();
    await check(page.getByRole("button", { name: "I’m leaving", exact: true })).toBeVisible();
  }
  await check(page.getByText("2 people in the office")).toBeVisible();
  await logout();
  await login("Cara");
  await check(page.getByRole("heading", { name: "Hi, Cara.", exact: true })).toBeVisible();
  await check.poll(async () => (await command("members")).length).toBeGreaterThanOrEqual(4);
  await check(page.getByText("2 people in the office")).toBeVisible();
  await page.getByRole("button", { name: "Ring the office", exact: true }).click();
  await check(
    page.getByRole("heading", { name: "Waiting for someone to respond", exact: true }),
  ).toBeVisible();
  const requestId = (await command("moo")).own.id;
  await logout();
  await login("Alice");
  await page.getByRole("button", { name: "I’ll get the door", exact: true }).click();
  await check(page.getByRole("button", { name: "I can’t go", exact: true })).toBeVisible();
  await logout();
  await login("Bob");
  await page.getByRole("button", { name: "I’ll get the door", exact: true }).click();
  await check(page.getByRole("button", { name: "I can’t go", exact: true })).toBeVisible();
  await check
    .poll(
      async () =>
        (await command("moo")).incoming.find((r) => r.id === requestId)?.responders.length,
    )
    .toBe(2);
  await logout();
  await login("Cara");
  await check(
    page.getByRole("heading", { name: "Alice and Bob are coming", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "I’m inside", exact: true }).click();
  await page.getByRole("button", { name: "I’m leaving", exact: true }).click();
  await page.reload();
  await check(page.getByRole("button", { name: "I’m in the office", exact: true })).toBeVisible();
  expect((await command("ring", { key: requestId })).status).toBe("resolved");
  expect((await command("request", { id: requestId, action: "inside" })).status).toBe("resolved");
  expect((await command("moo")).presence.some((p) => p.id === fixtures[2])).toBe(false);
  const blocked = await native("BitPolito", "request", { path: "/api/me", method: "GET" }).then(
    () => false,
    () => true,
  );
  expect(blocked).toBe(true);
  console.log(
    "PASS: native signer bridge, encrypted invitations, administrator approval, multiple responders, entry, immediate leave, reload, terminal retries and retired HTTP bridge. No application backend used.",
  );
} finally {
  await browser.close();
}
