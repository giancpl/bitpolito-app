import { expect, type Page } from "@playwright/test";
import {
  getPublicKey,
  finalizeEvent,
  type EventTemplate,
} from "nostr-tools/pure";
import { testKey } from "../nostr-fixture";
export async function navigate(page: Page, name: string) {
  name = name === "Office" ? "Home" : name;
  const dialogs = page.getByRole("dialog");
  if (
    name === "Profile" &&
    (await page.getByRole("heading", { name: "Profile", exact: true }).count())
  )
    return;
  if (await dialogs.count()) {
    await dialogs
      .last()
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(dialogs).toHaveCount(0);
  }
  await page.getByRole("link", { name, exact: true }).click();
}
export async function openProfileView(page: Page, view: string) {
  await navigate(page, "Profile");
  await page.getByRole("button", { name: view, exact: true }).click();
  // A missing resource can already be absent on the page behind the panel.
  // Wait for the destination before starting another profile interaction.
  if (view === "Tools & resources" || view === "Administration") {
    await expect(page).toHaveURL(
      view === "Administration" ? /\/account\/admin$/ : /\/resources$/,
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
}
export async function openAdministration(page: Page, tab?: string) {
  await openProfileView(page, "Administration");
  if (tab) await page.getByRole("tab", { name: tab, exact: true }).click();
}
export async function connectAs(page: Page, n = 1) {
  await page.exposeFunction("testSign", (event: EventTemplate) =>
    finalizeEvent(event, testKey(n)),
  );
  await page.addInitScript(
    (pubkey) => {
      window.nostr = {
        getPublicKey: async () => pubkey,
        signEvent: async (event) => (window as any).testSign(event),
      };
    },
    getPublicKey(testKey(n)),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Nostr", exact: true })
    .click();
  await page.getByRole("button", { name: /Use my Nostr identity/ }).click();
  await page.getByRole("button", { name: /Browser extension/ }).click();
  await expect(
    page.getByRole("heading", { name: /^(Hi, .+\.|Office|Door request)$/, exact: true }),
  ).toBeVisible();
}
export async function localPost(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const r = await fetch("/api" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bitpolito-Request": "1",
        },
        body: JSON.stringify(body),
      });
      return { status: r.status, data: await r.json() };
    },
    { path, body },
  );
}
