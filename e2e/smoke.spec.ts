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
  // /portal first renders a checkingSession loader (just the logo),
  // then transitions to the sign-in form after /api/portal/login returns.
  // Cold dev-server compiles can be slow; give it 30s.
  await page.goto("/portal", { waitUntil: "networkidle" });
  await expect(page.getByPlaceholder(/you@example\.com|email/i)).toBeVisible({
    timeout: 30_000,
  });
});

test("admin login is reachable", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.status()).toBeLessThan(500);
});
