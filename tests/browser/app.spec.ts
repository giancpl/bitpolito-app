import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { getPublicKey } from "nostr-tools/pure";
import { decrypt } from "nostr-tools/nip49";
import { testKey } from "../nostr-fixture";
import { connectAs, navigate, localPost, openProfileView } from "./helpers";
test("anonymous visitors cannot see the collection or office status", async ({
  page,
}) => {
  await page.goto("/moo");
  await expect(
    page.getByRole("button", { name: "Sign in with Nostr", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/resources")).status()).toBe(401);
  expect((await page.request.get("/api/moo/state")).status()).toBe(401);
  expect((await page.request.get("/api/workspace/events")).status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "In the office", exact: true }),
  ).toHaveCount(0);
});
test("an invitation onboards a recoverable identity, keeps the session on reload and locks keys", async ({
  page,
  browser,
}) => {
  await connectAs(page);
  const invitation = await localPost(page, "/invites", {
    label: "Browser onboarding",
  });
  expect(invitation.status).toBe(200);
  const context = await browser.newContext(),
    newPage = await context.newPage();
  const sent: string[] = [];
  newPage.on("request", (r) => {
    if (r.url().includes("/api/")) sent.push(r.postData() || "");
  });
  await newPage.goto(`/#invite=${invitation.data.token}`);
  await newPage
    .getByRole("button", { name: "Join BitPolito", exact: true })
    .click();
  await newPage.getByRole("button", { name: /Create an identity/ }).click();
  await newPage.getByLabel("Your name", { exact: true }).fill("New teammate");
  const password = "my encrypted recovery password";
  await newPage
    .getByLabel("Key encryption password", { exact: true })
    .fill(password);
  await newPage.getByLabel("Confirm password", { exact: true }).fill(password);
  await newPage
    .getByRole("button", { name: "Create identity", exact: true })
    .click();
  await expect(
    newPage.getByRole("button", { name: "Continue to BitPolito", exact: true }),
  ).toBeDisabled();
  const download = newPage.waitForEvent("download");
  await newPage
    .getByRole("button", { name: /Download encrypted backup/ })
    .click();
  const backup = await readFile((await (await download).path())!);
  await newPage.getByRole("checkbox", { name: /I saved my backup/ }).check();
  await newPage
    .getByRole("button", { name: "Continue to BitPolito", exact: true })
    .click();
  await expect(
    newPage.getByRole("heading", {
      name: /^(Hi, .+\.|Office|Door request)$/,
      exact: true,
    }),
  ).toBeVisible();
  const secret = decrypt(backup.toString(), password),
    me = await (await newPage.request.get("/api/me")).json();
  expect(me.user.id).toBe(getPublicKey(secret));
  secret.fill(0);
  await newPage.reload();
  await expect(
    newPage.getByRole("heading", {
      name: /^(Hi, .+\.|Office|Door request)$/,
      exact: true,
    }),
  ).toBeVisible();
  await navigate(newPage, "Profile");
  await newPage
    .getByRole("button", { name: "Identity & recovery", exact: true })
    .click();
  await expect(newPage.getByText("Keys locked", { exact: true })).toBeVisible();
  await newPage
    .getByRole("button", { name: "Unlock identity", exact: true })
    .click();
  await newPage.getByRole("button", { name: /Unlock saved identity/ }).click();
  await newPage
    .getByLabel("Key encryption password", { exact: true })
    .fill("wrong password");
  await newPage
    .getByRole("button", { name: "Unlock and continue", exact: true })
    .click();
  await expect(
    newPage.getByText("The password or recovery backup is incorrect.", {
      exact: true,
    }),
  ).toBeVisible();
  await newPage
    .getByLabel("Key encryption password", { exact: true })
    .fill(password);
  await newPage
    .getByRole("button", { name: "Unlock and continue", exact: true })
    .click();
  await expect(newPage.getByText("Unlocked", { exact: true })).toBeVisible();
  const sessionBefore = (await context.cookies()).find(
    (c) => c.name === "bp_session",
  )!.value;
  await newPage
    .getByText("Change encryption password", { exact: true })
    .click();
  const replacement = "a different encrypted vault password";
  await newPage
    .getByLabel("New encryption password", { exact: true })
    .fill(replacement);
  await newPage
    .getByLabel("Confirm new password", { exact: true })
    .fill(replacement);
  const replacementDownload = newPage.waitForEvent("download");
  await newPage
    .getByRole("button", {
      name: "Change password & download backup",
      exact: true,
    })
    .click();
  const changed = await readFile((await (await replacementDownload).path())!);
  const changedSecret = decrypt(changed.toString(), replacement);
  expect(getPublicKey(changedSecret)).toBe(me.user.id);
  changedSecret.fill(0);
  expect(
    (await context.cookies()).find((c) => c.name === "bp_session")!.value,
  ).toBe(sessionBefore);
  await expect(
    newPage.getByText(
      "Password changed. Keep the new backup; older copies use the old password.",
      { exact: true },
    ),
  ).toBeVisible();
  await newPage
    .getByRole("button", { name: "Identity & recovery", exact: true })
    .click();
  await newPage.clock.install();
  await newPage.clock.fastForward(15 * 60000 + 11000);
  await expect(newPage.getByText("Keys locked", { exact: true })).toBeVisible();
  expect((await (await newPage.request.get("/api/me")).json()).user.role).toBe(
    "member",
  );
  const restoredContext = await browser.newContext(),
    restored = await restoredContext.newPage();
  await restored.goto("/");
  await restored
    .getByRole("button", { name: "Sign in with Nostr", exact: true })
    .click();
  await restored
    .getByRole("button", { name: "Restore identity", exact: true })
    .click();
  await restored.getByLabel("Backup file", { exact: true }).setInputFiles({
    name: "identity.ncryptsec",
    mimeType: "text/plain",
    buffer: backup,
  });
  await restored.getByLabel("Backup password", { exact: true }).fill(password);
  await restored
    .getByRole("button", { name: "Restore and continue", exact: true })
    .click();
  await expect(
    restored.getByRole("heading", {
      name: /^(Hi, .+\.|Office|Door request)$/,
      exact: true,
    }),
  ).toBeVisible();
  for (const body of sent) {
    expect(body).not.toContain(password);
    expect(body).not.toContain(backup.toString());
  }
  await restoredContext.close();
  await context.close();
});
test("a cancelled extension stays signed out and a remote signer connects as the user identity", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.nostr = {
      getPublicKey: async () => "a".repeat(64),
      signEvent: async () => {
        throw Error("Signing cancelled");
      },
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Nostr", exact: true })
    .click();
  await page.getByRole("button", { name: /Use my Nostr identity/ }).click();
  await page.getByRole("button", { name: /Browser extension/ }).click();
  await expect(
    page.getByText("Signing cancelled", { exact: true }),
  ).toBeVisible();
  expect((await (await page.request.get("/api/me")).json()).user).toBeNull();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Sign in with Nostr", exact: true })
    .click();
  await page.getByRole("button", { name: /Use my Nostr identity/ }).click();
  await page.getByRole("button", { name: /Remote or mobile signer/ }).click();
  await page
    .getByLabel("Bunker connection link")
    .fill(
      `bunker://${getPublicKey(testKey(4))}?relay=${encodeURIComponent("ws://127.0.0.1:7001")}&secret=fixture`,
    );
  await page
    .getByRole("button", { name: "Connect signer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /^(Hi, .+\.|Office|Door request)$/, exact: true }),
  ).toBeVisible();
  expect((await (await page.request.get("/api/me")).json()).user.id).toBe(
    getPublicKey(testKey(3)),
  );
});
test("Moo coordinates a requester and two office members with one opener", async ({
  page,
  browser,
}, info) => {
  await connectAs(page, 1);
  const second = await browser.newContext(),
    bob = await second.newPage();
  await connectAs(bob, 2);
  const third = await browser.newContext(),
    cara = await third.newPage();
  await connectAs(cara, info.project.name === "desktop" ? 3 : 5);
  for (const p of [page, bob, cara])
    await localPost(p, "/moo/presence", { action: "leave" });
  await navigate(cara, "Office");
  await expect(
    cara.getByText("Nobody is marked in the office.", { exact: true }),
  ).toBeVisible();
  await expect(
    cara.getByRole("button", { name: "Ring the office", exact: true }),
  ).toBeDisabled();
  await navigate(page, "Office");
  await page
    .getByRole("button", { name: "I’m in the office", exact: true })
    .click();
  await expect(
    page.locator(".status-label").getByText("In the office", { exact: true }),
  ).toBeVisible();
  await navigate(bob, "Office");
  await bob
    .getByRole("button", { name: "I’m in the office", exact: true })
    .click();
  await expect(
    cara.getByRole("button", { name: /Ring (the office|again)/ }),
  ).toBeVisible();
  await cara.getByRole("button", { name: /Ring (the office|again)/ }).click();
  await expect(
    cara.getByRole("heading", {
      name: "Waiting for someone to respond",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "I’ll get the door", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "I’ll get the door", exact: true })
    .click();
  await expect(
    cara.getByRole("heading", { name: /Alice is coming/ }),
  ).toBeVisible();
  await expect(
    bob.getByRole("heading", { name: /Alice is coming/ }),
  ).toBeVisible();
  await expect(
    bob.getByRole("button", { name: "I’ll get the door", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "I opened the door", exact: true }),
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
  await expect
    .poll(async () =>
      (await (await cara.request.get("/api/moo/state")).json()).presence.some(
        (p: any) => p.name === "Cara",
      ),
    )
    .toBe(false);
  for (const p of [page, bob])
    await localPost(p, "/moo/presence", { action: "leave" });
  await second.close();
  await third.close();
});

test("mobile signer QR can be cancelled and reconnected with the same client identity", async ({
  page,
}) => {
  const { WebSocket } = await import("ws");
  const { nip44, finalizeEvent } = await import("nostr-tools");
  await page.goto("/moo");
  await page
    .getByRole("button", { name: "Sign in with Nostr", exact: true })
    .click();
  await page.getByRole("button", { name: /Use my Nostr identity/ }).click();
  await page.getByRole("button", { name: /Remote or mobile signer/ }).click();
  await page
    .getByRole("button", { name: "Show connection QR code", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Nostr signer connection QR code",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel connection", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Nostr signer connection QR code",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show connection QR code", exact: true })
    .click();
  const link = page.getByRole("link", {
    name: "Open in your signer",
    exact: true,
  });
  await expect(link).toBeVisible();
  const uri = new URL((await link.getAttribute("href"))!),
    remoteKey = testKey(4),
    conversation = nip44.getConversationKey(remoteKey, uri.hostname);
  const event = finalizeEvent(
    {
      kind: 24133,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", uri.hostname]],
      content: nip44.encrypt(
        JSON.stringify({
          id: "connect-fixture",
          result: uri.searchParams.get("secret"),
        }),
        conversation,
      ),
    },
    remoteKey,
  );
  const socket = new WebSocket("ws://127.0.0.1:7001");
  await new Promise<void>((resolve) => socket.once("open", resolve));
  socket.send(JSON.stringify(["EVENT", event]));
  await expect(
    page.getByRole("heading", { name: "Door request", exact: true }),
  ).toBeVisible();
  expect((await (await page.request.get("/api/me")).json()).user.id).toBe(
    getPublicKey(testKey(3)),
  );
  socket.close();
});
