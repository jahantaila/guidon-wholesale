import { test, expect } from "@playwright/test";

test("homepage renders Guidon Brewing branding", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Guidon/i);
});

test("order page loads product catalog", async ({ page }) => {
  await page.goto("/order");
  await expect(page.locator("body")).toContainText(/IPA|Lager|Stout|Pale Ale/i);
});

test("admin login is reachable", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.status()).toBeLessThan(500);
});
