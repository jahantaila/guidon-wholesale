import { test, expect } from "@playwright/test";

test("homepage renders Guidon Brewing branding", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Guidon/i);
});

test("embed order page loads product catalog anonymously", async ({ page }) => {
  // /order requires a portal session and redirects to /portal for anonymous users.
  // /embed/order is the public catalog widget Mike embeds in WordPress — no auth.
  await page.goto("/embed/order");
  await expect(page.getByRole("heading", { name: /order kegs/i })).toBeVisible({
    timeout: 15_000,
  });
});

test("portal login page is reachable", async ({ page }) => {
  await page.goto("/portal");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test("admin login is reachable", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.status()).toBeLessThan(500);
});
