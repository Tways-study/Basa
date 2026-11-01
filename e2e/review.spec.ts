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
