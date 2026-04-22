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
  // /portal first renders a checkingSession loader (just the logo), then
  // transitions to the "choose" screen: two buttons, "Sign In" and
  // "Become a customer". Cold dev-server compiles can be slow; give it 30s
  // to reach the choose screen, then click Sign In to reveal the email form.
  await page.goto("/portal", { waitUntil: "networkidle" });
  const signInBtn = page.getByRole("button", { name: /^sign in$/i });
  await expect(signInBtn).toBeVisible({ timeout: 30_000 });
  await signInBtn.click();
  await expect(page.getByPlaceholder(/you@example\.com|email/i)).toBeVisible({
    timeout: 5_000,
  });
});

test("admin login is reachable", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.status()).toBeLessThan(500);
});
