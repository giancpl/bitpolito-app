import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Test identity" }).selectOption({ label: name });
  await page.getByRole("button", { name: `Use ${name} test identity` }).click();
}
test("three tabs coordinate multiple responders without any application API", async ({
  context,
}) => {
  const apiRequests: string[] = [];
  await context.route("**/api/**", (route) => {
    apiRequests.push(route.request().url());
    return route.abort();
  });
  const alice = await context.newPage(),
    bob = await context.newPage(),
    cara = await context.newPage();
  await login(alice, "Alice");
  await login(bob, "Bob");
  await login(cara, "Cara");
  await alice.getByRole("button", { name: "I’m in the office", exact: true }).click();
  await bob.getByRole("button", { name: "I’m in the office", exact: true }).click();
  await expect(cara.getByText("2 people in the office")).toBeVisible();
  await cara.getByRole("button", { name: "Ring the office", exact: true }).click();
  await expect(cara.getByRole("heading", { name: "Waiting for someone to respond" })).toBeVisible();
  await alice.getByRole("button", { name: "I’ll get the door", exact: true }).click();
  await bob.getByRole("button", { name: "I’ll get the door", exact: true }).click();
  await expect(cara.getByRole("heading", { name: "Alice and Bob are coming" })).toBeVisible();
  await bob.getByRole("button", { name: "I can’t go" }).click();
  await expect(cara.getByRole("heading", { name: "Alice is coming" })).toBeVisible();
  await cara.getByRole("button", { name: "I’m inside", exact: true }).click();
  await expect(cara.getByRole("button", { name: "I’m leaving", exact: true })).toBeVisible();
  await cara.getByRole("button", { name: "I’m leaving", exact: true }).click();
  await expect(cara.getByRole("button", { name: "I’m in the office", exact: true })).toBeVisible();
  await cara.reload();
  await expect(cara.getByRole("button", { name: "I’m in the office", exact: true })).toBeVisible();
  await expect(cara.getByRole("heading", { name: "Entry confirmed", exact: true })).toBeVisible();
  expect(apiRequests).toEqual([]);
});
test("invitation requires approval, and profile keeps recovery one step away", async ({
  context,
}) => {
  const alice = await context.newPage(),
    drew = await context.newPage();
  await login(alice, "Alice");
  await alice.goto("/account/admin");
  await alice.getByLabel("Who is this invitation for?").fill("Drew");
  await alice.getByRole("button", { name: "Create invitation", exact: true }).click();
  const invitation = await alice.getByLabel("Invitation link", { exact: true }).inputValue();
  await login(drew, "Drew");
  await drew.getByLabel("Invitation link or code").fill(invitation);
  await drew.getByRole("button", { name: "Request access", exact: true }).click();
  await expect(drew.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();
  await alice.getByRole("button", { name: "Approve", exact: true }).click();
  await alice
    .getByRole("alertdialog")
    .getByRole("button", { name: "Approve member", exact: true })
    .click();
  await expect(drew.getByRole("heading", { name: "Hi, Drew." })).toBeVisible();
  await drew.getByRole("link", { name: "Profile", exact: true }).click();
  await drew.getByRole("button", { name: "Identity & recovery", exact: true }).click();
  await expect(drew.getByText("Private history is not included.", { exact: false })).toBeVisible();
});
for (const width of [360, 390, 768, 1440])
  test(`clean navigation and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page, "Alice");
    await expect(
      page.getByRole("button", { name: "I’m in the office", exact: true }),
    ).toBeVisible();
    for (const name of ["Tools", "Profile", "Home"]) {
      await page.getByRole("link", { name, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  });

test("an incoming door request is the first thing a responder sees", async ({ context }) => {
  const alice = await context.newPage(),
    cara = await context.newPage();
  await login(alice, "Alice");
  await login(cara, "Cara");
  await alice.getByRole("button", { name: "I’m in the office", exact: true }).click();
  await cara.reload();
  await cara.getByRole("button", { name: "Ring the office", exact: true }).click();
  await alice.reload();
  const request = alice.getByRole("heading", { name: "Cara is at the door" });
  await expect(request).toBeVisible();
  const summary = alice.getByRole("region", { name: "Your office status" });
  const [requestBox, summaryBox] = await Promise.all([
    request.boundingBox(),
    summary.boundingBox(),
  ]);
  expect(requestBox!.y).toBeLessThan(summaryBox!.y);
  await expect(alice.getByLabel(/Expires in/)).toBeVisible();
});

test("dark theme keeps text readable without layout shifts", async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await login(page, "Alice");
  const colors = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { background: body.backgroundColor, color: body.color };
  });
  expect(colors.background).not.toBe("rgb(247, 248, 252)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await context.close();
});
