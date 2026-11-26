import { test, expect } from "@playwright/test";
import {
  connectAs,
  navigate,
  openAdministration,
  openProfileView,
} from "./helpers";
test("Office and Profile remain reachable at four screen widths", async ({
  page,
}, info) => {
  await connectAs(page);
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await navigate(page, "Profile");
    await expect(
      page.getByRole("heading", { name: "Profile", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await navigate(page, "Office");
    await page.screenshot({
      path: `/tmp/bitpolito-office-${info.project.name}-${width}.png`,
      fullPage: true,
    });
  }
});
test("admin resource forms preserve edits and expose validation and archive controls", async ({
  page,
}, info) => {
  await connectAs(page);
  await openAdministration(page, "Resources");
  await page.getByRole("button", { name: "Add resource", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Add resource", exact: true })
    .click();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await dialog
    .getByLabel("Title", { exact: true })
    .fill(`Resource ${info.project.name}`);
  await dialog.getByLabel("Category", { exact: true }).fill("Useful links");
  await dialog
    .getByLabel("Link", { exact: true })
    .fill("https://example.com/resource");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await page.route("**/api/resources", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary outage" }),
        })
      : route.continue(),
  );
  await dialog
    .getByRole("button", { name: "Add resource", exact: true })
    .click();
  await expect(dialog.getByText("Temporary outage")).toBeVisible();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
    `Resource ${info.project.name}`,
  );
  await page.unroute("**/api/resources");
  await dialog
    .getByRole("button", { name: "Add resource", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await openProfileView(page, "Tools & resources");
  await expect(
    page.getByRole("heading", {
      name: `Resource ${info.project.name}`,
      exact: true,
    }),
  ).toBeVisible();
  await openAdministration(page, "Resources");
  const menu = page.getByRole("button", {
    name: `More actions for Resource ${info.project.name}`,
    exact: true,
  });
  await menu.click();
  await page
    .getByRole("menuitem", { name: "Archive resource", exact: true })
    .click();
  await expect(
    page.getByRole("alertdialog", {
      name: `Archive “Resource ${info.project.name}”?`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Archive resource", exact: true })
    .click();
  await openProfileView(page, "Tools & resources");
  await expect(
    page.getByRole("heading", {
      name: `Resource ${info.project.name}`,
      exact: true,
    }),
  ).toHaveCount(0);
  await openAdministration(page, "Resources");
  await menu.click();
  await page
    .getByRole("menuitem", { name: "Restore resource", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Restore resource", exact: true })
    .click();
  await openProfileView(page, "Tools & resources");
  await expect(
    page.getByRole("heading", {
      name: `Resource ${info.project.name}`,
      exact: true,
    }),
  ).toBeVisible();
});

test("keyboard navigation and modal focus stay reachable without covering fixed navigation", async ({
  page,
}) => {
  await connectAs(page);
  await openAdministration(page, "Resources");
  await page.getByRole("button", { name: "Add resource", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Add resource", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add resource", exact: true }),
  ).toBeFocused();
  await navigate(page, "Office");
  const heading = page.getByRole("heading", { name: /^(Hi, .+\.|Office|Door request)$/, exact: true });
  await expect(heading).toBeVisible();
});

test("profile panels preserve drafts, guard Back and recover failed saves on a short viewport", async ({
  page,
}, info) => {
  await connectAs(page, info.project.name === "desktop" ? 15 : 18);
  await page.setViewportSize({ width: 390, height: 480 });
  await openProfileView(page, "Edit profile");
  await page
    .getByLabel("About you", { exact: true })
    .fill("A draft that should stay here");
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .click();
  await expect(
    page.getByRole("alertdialog", {
      name: "Discard your changes?",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.getByLabel("About you", { exact: true })).toHaveValue(
    "A draft that should stay here",
  );
  await page.route("**/api/profile", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Please try again" }),
    }),
  );
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByText("Please try again", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("About you", { exact: true })).toHaveValue(
    "A draft that should stay here",
  );
  await page.unroute("**/api/profile");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Identity & recovery", exact: true })
    .click();
  await expect(page).toHaveURL(/view=identity/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Identity & recovery", exact: true }),
  ).toBeVisible();
  expect(await page.getByRole("dialog").count()).toBe(0);
  await expect(
    page.getByText("External identity", { exact: true }),
  ).toBeVisible();
  const close = page.getByRole("button", { name: "Profile", exact: true });
  const bounds = await close.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(480);
});

test("member role menus confirm changes and preserve the last administrator", async ({
  page,
}) => {
  await connectAs(page);
  await openAdministration(page, "Members");
  const role = page
    .getByRole("button", { name: "Role for Alice", exact: true })
    .filter({ hasText: "Administrator" });
  await role.click();
  await page
    .getByRole("menuitem", { name: "Set as member", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(role).toContainText("Administrator");
  await role.click();
  await page
    .getByRole("menuitem", { name: "Set as member", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Change role", exact: true })
    .click();
  await expect(
    page.getByText("The last administrator cannot be removed", { exact: true }),
  ).toBeVisible();
  await expect(role).toContainText("Administrator");
});
