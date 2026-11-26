import { test, expect, type Page } from "@playwright/test";
import { navigate as nav } from "../browser/helpers";
import { sandboxProfiles, sandboxOrigin } from "../../shared/sandbox";

const home = (page: Page) =>
  page.getByRole("heading", { name: /^(Hi, .+\.|Office|Door request)$/, exact: true });
async function post(page: Page, path: string, body: unknown, method = "POST") {
  return page.evaluate(
    async ({ path, body, method }) => {
      const response = await fetch("/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Bitpolito-Request": "1",
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
    { path, body, method },
  );
}
test("four tabs share real workflows with isolated test identities, invitations and revocation", async ({
  context,
  page: alice,
}) => {
  await context.addCookies([
    {
      name: "bp_session",
      value: "existing-app-session",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  const pages = [
    alice,
    await context.newPage(),
    await context.newPage(),
    await context.newPage(),
  ];
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index],
      profile = sandboxProfiles[index];
    await page.goto(sandboxOrigin(profile));
    await expect(
      page.getByRole("button", { name: "Sign in with Nostr", exact: true }),
    ).toBeVisible();
    expect(
      (
        await (
          await page.request.get(new URL("/api/me", page.url()).href)
        ).json()
      ).user,
    ).toBeNull();
    expect(
      (
        await (
          await page.request.get(new URL("/api/config", page.url()).href)
        ).json()
      ).relays,
    ).toEqual([]);
    await page
      .getByRole("button", {
        name: `Use ${profile.name} test identity`,
        exact: true,
      })
      .click();
    if (index < 3) await expect(home(page)).toBeVisible();
    else
      await expect(
        page.getByRole("heading", {
          name: "Member access required",
          exact: true,
        }),
      ).toBeVisible();
  }
  const [a, b, c, d] = await Promise.all(
    pages.map(
      async (page) =>
        (
          await (
            await page.request.get(new URL("/api/me", page.url()).href)
          ).json()
        ).user,
    ),
  );
  expect(new Set([a.id, b.id, c.id, d.id]).size).toBe(4);
  expect(a.role).toBe("admin");
  expect(b.role).toBe("member");
  expect(d.role).toBe("follower");
  expect(
    (await context.cookies()).find((cookie) => cookie.name === "bp_session")
      ?.value,
  ).toBe("existing-app-session");
  const rejected = await pages[1].request.post(
    new URL("/api/moo/presence", pages[1].url()).href,
    {
      headers: {
        Origin: sandboxOrigin(sandboxProfiles[0]),
        "X-Bitpolito-Request": "1",
      },
      data: { action: "arrive" },
    },
  );
  expect(rejected.status()).toBe(403);
  await nav(alice, "Profile");
  await alice
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await alice
    .getByLabel("Who is this invitation for?", { exact: true })
    .fill("Drew");
  await alice
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  const link = alice.getByLabel("Invitation link", { exact: true });
  await expect(link).toHaveValue(/#invite=/);
  const invitation = await link.inputValue();
  const drew = pages[3];
  await drew
    .getByLabel("Invitation code or link", { exact: true })
    .fill(invitation);
  await drew
    .getByRole("button", { name: "Join BitPolito", exact: true })
    .click();
  await expect(home(drew)).toBeVisible();
  for (const page of pages.slice(0, 3)) {
    await page.setViewportSize({ width: 390, height: 844 });
    await nav(page, "Office");
  }
  const bob = pages[1],
    cara = pages[2];
  await expect(
    cara.getByRole("button", { name: "Ring the office", exact: true }),
  ).toBeDisabled();
  for (const page of [alice, bob])
    await page
      .getByRole("button", { name: "I’m in the office", exact: true })
      .click();
  await cara
    .getByRole("button", { name: "Ring the office", exact: true })
    .click();
  await expect(
    cara.getByRole("heading", {
      name: "Waiting for someone to respond",
      exact: true,
    }),
  ).toBeVisible();
  for (const page of [alice, bob])
    await expect(
      page.getByRole("button", { name: "I’ll get the door", exact: true }),
    ).toBeVisible();
  const requestId = (
    await (
      await cara.request.get(new URL("/api/moo/state", cara.url()).href)
    ).json()
  ).own.id;
  // Submit concurrently from the two authenticated tabs. A tap on the losing
  // DOM button can disappear as soon as the winning SSE update is rendered.
  const claims = await Promise.all(
    [alice, bob].map((page) =>
      post(page, `/moo/requests/${requestId}`, { action: "claim" }),
    ),
  );
  expect(claims.map((r) => r.status).sort()).toEqual([200, 409]);
  await expect(
    cara.getByRole("heading", { name: /^(Alice|Bob) is coming$/ }),
  ).toBeVisible();
  const state = await (
      await cara.request.get(new URL("/api/moo/state", cara.url()).href)
    ).json(),
    opener = state.own.claimedBy === a.id ? alice : bob;
  await expect(
    opener.getByRole("button", { name: "I opened the door", exact: true }),
  ).toHaveCount(0);
  await cara.getByRole("button", { name: "I’m inside", exact: true }).click();
  await expect(
    cara.getByRole("heading", { name: "You’re inside. Welcome!", exact: true }),
  ).toBeVisible();
  await cara.reload();
  await expect(
    cara.locator(".status-label").getByText("In the office", { exact: true }),
  ).toBeVisible();
  await cara
    .getByRole("button", { name: "I’m leaving", exact: true })
    .last()
    .click();
  await nav(cara, "Office");
  await expect(cara.getByText("Outside", { exact: true })).toBeVisible();
  expect(
    (await post(bob, "/resources", { title: "No permission" })).status,
  ).toBe(403);
  expect(
    (await post(alice, `/admin/members/${b.id}`, { role: "follower" }, "PUT"))
      .status,
  ).toBe(200);
  await expect(
    bob.getByRole("button", { name: "Sign in with Nostr", exact: true }),
  ).toBeVisible();
  expect(
    (await bob.request.get(new URL("/api/moo/state", bob.url()).href)).status(),
  ).toBe(401);
  expect(
    (
      await (
        await alice.request.get(new URL("/api/me", alice.url()).href)
      ).json()
    ).user.id,
  ).toBe(a.id);
  expect(
    (await (await cara.request.get(new URL("/api/me", cara.url()).href)).json())
      .user.id,
  ).toBe(c.id);
  expect(
    (await (await drew.request.get(new URL("/api/me", drew.url()).href)).json())
      .user.id,
  ).toBe(d.id);
});

test("normal onboarding and backup restore work on the separate new-member origin", async ({
  page,
  browser,
}) => {
  const { readFile } = await import("node:fs/promises");
  await page.goto(sandboxOrigin(sandboxProfiles[0]));
  await page
    .getByRole("button", { name: "Use Alice test identity", exact: true })
    .click();
  await expect(home(page)).toBeVisible();
  const invite = await post(page, "/invites", {
    label: "Disposable recovery test",
  });
  expect(invite.status).toBe(200);
  const newcomer = await browser.newContext(),
    join = await newcomer.newPage();
  await join.goto(
    `${sandboxOrigin(sandboxProfiles[3])}/#invite=${invite.body.token}`,
  );
  await join
    .getByRole("button", { name: "Join BitPolito", exact: true })
    .click();
  await join.getByRole("button", { name: /Create an identity/ }).click();
  const password = "temporary sandbox vault password";
  await join.getByLabel("Your name", { exact: true }).fill("Recovery tester");
  await join
    .getByLabel("Key encryption password", { exact: true })
    .fill(password);
  await join.getByLabel("Confirm password", { exact: true }).fill(password);
  await join
    .getByRole("button", { name: "Create identity", exact: true })
    .click();
  const downloading = join.waitForEvent("download");
  await join.getByRole("button", { name: /Download encrypted backup/ }).click();
  const backup = await readFile((await (await downloading).path())!);
  await join.getByRole("checkbox", { name: /I saved my backup/ }).check();
  await join
    .getByRole("button", { name: "Continue to BitPolito", exact: true })
    .click();
  await expect(home(join)).toBeVisible();
  await nav(join, "Profile");
  await join.getByRole("button", { name: "Sign out", exact: true }).click();
  await join
    .getByRole("button", { name: "Sign in with Nostr", exact: true })
    .click();
  await join
    .getByRole("button", { name: "Restore identity", exact: true })
    .click();
  await join.getByLabel("Backup file", { exact: true }).setInputFiles({
    name: "test-backup.ncryptsec",
    mimeType: "text/plain",
    buffer: backup,
  });
  await join.getByLabel("Backup password", { exact: true }).fill(password);

  await join
    .getByRole("button", { name: "Restore and continue", exact: true })
    .click();
  await join
    .getByRole("alertdialog")
    .getByRole("button", { name: "Replace saved keys", exact: true })
    .click();
  await expect(
    join.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();
  await nav(join, "Office");
  await expect(home(join)).toBeVisible();
  await newcomer.close();
});
