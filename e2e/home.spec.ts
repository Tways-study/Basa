import { expect, test } from "@playwright/test";

// The home page links to two ready-made scans so a visitor with no chart can still open one.
test("home lists the sample charts as large links, with no sideways scroll at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const links = page.getByRole("link", { name: /Sample chart/ });
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await link.getAttribute("href")).toMatch(/^\/scans\/[0-9a-f-]{36}$/);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
