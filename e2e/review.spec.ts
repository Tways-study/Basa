import { expect, test } from "@playwright/test";

// A phone-sized screen, the size the review screen is designed for.
test.use({ viewport: { width: 390, height: 844 } });

test("review happy path: decide every field, confirm, read the summary, print is enabled", async ({ page }) => {
  await page.goto("/review-preview");
  await expect(page.getByRole("heading", { name: "Review the scan" })).toBeVisible();

  const progress = page.getByRole("status").first();
  await expect(progress).toContainText("0 of 20 fields decided");
  await expect(progress).toContainText("still need you");

  // Nothing is decided yet, so the record cannot be confirmed or printed.
  const confirmRecord = page.getByRole("button", { name: "Confirm record" });
  const print = page.getByRole("button", { name: "Print patient copy" });
  await expect(confirmRecord).toBeDisabled();
  await expect(print).toBeDisabled();

  // Flagged-first: the first region on screen is one that has a field needing a person.
  const firstRegion = page.locator("section[aria-labelledby^='review-region-']").first();
  await expect(firstRegion.getByText("Needs you").first()).toBeVisible();

  // Nothing is preselected on a flagged field: every flagged group starts with no option checked.
  const flaggedGroups = page.locator("fieldset", { has: page.getByText("Needs you") }).getByRole("radiogroup");
  for (let i = 0, n = await flaggedGroups.count(); i < n; i++) {
    await expect(flaggedGroups.nth(i).locator("input:checked")).toHaveCount(0);
  }

  // Bulk confirm settles the matching fields only, never a flagged one.
  await page.getByRole("button", { name: /Confirm \d+ matching/ }).click();
  await expect(progress).toContainText("still need you");
  await expect(confirmRecord).toBeDisabled();

  // The person settles each flagged field by picking a reader's value.
  for (let i = 0, n = await flaggedGroups.count(); i < n; i++) {
    await flaggedGroups.nth(i).getByRole("radio").first().check();
  }
  await expect(progress).toContainText("20 of 20 fields decided");
  await expect(confirmRecord).toBeEnabled();

  await confirmRecord.click();
  await expect(page.getByText("The record is confirmed and saved")).toBeVisible();
  await expect(print).toBeEnabled();

  // The summary restates the confirmed record and cites a region for every line.
  const summary = page.getByRole("heading", { name: "Summary of the confirmed record" });
  await expect(summary).toBeVisible();
  const lines = page.locator("#record-summary-heading ~ ul button");
  await expect(lines.first()).toContainText("Region");
  expect(await lines.count()).toBeGreaterThan(0);

  // Pointing at a line draws its source region heavier on the photo; leaving it clears that.
  await lines.first().hover();
  await expect(page.locator("span.border-4")).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(page.locator("span.border-4")).toHaveCount(0);

  // Changing an answer after confirming hides the summary and disables print until it is saved again.
  await page.getByRole("radio", { name: "Can't be read" }).first().check();
  await expect(print).toBeDisabled();
  await expect(summary).toBeHidden();

  // No sideways scroll at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Back to home is at the top and the bottom, and asks before dropping unsaved answers", async ({ page }) => {
  await page.goto("/review-preview");
  const back = page.getByRole("link", { name: "Back to home" });

  // Clean: a plain link at the top, 44px tall, no sideways scroll at phone width.
  await expect(back).toHaveCount(2);
  const box = await back.first().boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // After deciding one field the answers are unsaved: leaving asks first.
  await page.getByRole("button", { name: /Confirm \d+ matching/ }).click();
  await expect(page.getByRole("link", { name: "Back to home" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to home" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Leave without confirming?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stay and keep reviewing" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Back to home" }).first().click();
  await page.getByRole("dialog").getByRole("link", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test.describe("the photo stays in view while checking rows", () => {
  test("phone: the dock follows the region, collapses, and never covers Confirm record", async ({ page }) => {
    await page.goto("/review-preview");
    const dock = page.getByRole("region", { name: "Photo of the region you are checking" }).first();
    await expect(dock).toBeVisible();

    // Scroll the third region to the reading line: the dock names it, and stays on screen.
    const third = page.locator("section[aria-labelledby^='review-region-']").nth(2);
    const label = (await third.getByRole("heading").first().textContent()) ?? "";
    const n = label.match(/^(\d+)\./)?.[1];
    await third.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    await expect(dock).toContainText(`Region ${n},`);
    const box = await dock.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844 + 1);

    // Tapping into a field of another region switches the dock to that region.
    await page.locator("section[aria-labelledby^='review-region-']").first().getByRole("radio").first().focus();
    await expect(dock).not.toContainText(`Region ${n},`);

    // Hide and show; the choice survives a reload.
    const toggle = dock.getByRole("button", { name: "Hide photo" });
    await toggle.click();
    await expect(dock.getByRole("button", { name: "Show photo" })).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(page.getByRole("button", { name: "Show photo" })).toBeVisible();
    await page.getByRole("button", { name: "Show photo" }).click();

    // At the very bottom the last control is clear of the dock.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const confirm = await page.getByRole("button", { name: "Confirm record" }).boundingBox();
    const docked = await dock.boundingBox();
    expect((confirm?.y ?? 0) + (confirm?.height ?? 0)).toBeLessThanOrEqual((docked?.y ?? 0) + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("desktop: the side panel stays visible and shows the region in view", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/review-preview");
    const panel = page.getByRole("region", { name: "Photo of the region you are checking" }).and(page.locator(":visible"));
    await expect(panel).toBeVisible();
    await page.locator("section[aria-labelledby^='review-region-']").nth(2).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    await expect(panel).toBeInViewport();
    await expect(panel.getByRole("heading")).toContainText("Region");
  });
});
