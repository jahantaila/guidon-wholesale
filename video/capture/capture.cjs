/**
 * Captures the portal screens for the onboarding video.
 *
 * Runs against the LOCAL demo server only (npm run dev with placeholder
 * Supabase keys, so data comes from data/*.json and no email is sent).
 * Usage:
 *   SEED_DIR=/path/to/seed node video/capture/capture.cjs
 *
 * SEED_DIR holds the demo data/*.json state to reset to before each run
 * (placing the demo order writes to data/). Output:
 *   video/public/shots/*.png   2x screenshots (1440x900 CSS viewport)
 *   video/src/shots.json       element boxes, in CSS px, for cursor targets
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '../../node_modules/playwright'));

const BASE = process.env.BASE_URL || 'http://localhost:3010';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
  throw new Error('capture.cjs only runs against a local demo server');
}
const ROOT = path.join(__dirname, '../..');
const SHOTS = path.join(__dirname, '../public/shots');
const META = path.join(__dirname, '../src/shots.json');
const W = 1440;
const H = 900;

const EMAIL = 'marcus@brassbelltavern.com';
const TEMP_PW = 'Welcome-4821';
const NEW_PW = 'BrassBell2026';

function resetData() {
  const seed = process.env.SEED_DIR;
  if (!seed) throw new Error('Set SEED_DIR to the demo data snapshot');
  for (const f of fs.readdirSync(seed)) {
    if (f.endsWith('.json')) fs.copyFileSync(path.join(seed, f), path.join(ROOT, 'data', f));
  }
}

function emailHtml() {
  // Mirrors notifyApplicationDecision('approved') in src/lib/email.ts,
  // shown inside a plain mail-client header.
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body{margin:0;background:#EDE6D3;font-family:'Helvetica Neue',Arial,sans-serif;color:#2A2416}
  .mail{max-width:900px;margin:0 auto;background:#fff;min-height:900px;box-shadow:0 0 0 1px #DDD3B8}
  .hdr{padding:28px 40px 18px;border-bottom:1px solid #EEE}
  .subj{font-size:24px;font-weight:600;margin:0 0 14px}
  .from{display:flex;align-items:center;gap:12px;font-size:14px}
  .av{width:40px;height:40px;border-radius:50%;background:#9E7A3B;color:#F5EFDF;display:flex;align-items:center;justify-content:center;font-weight:700}
  .muted{color:#888}
  .body{padding:8px 0}
</style></head><body><div class="mail">
<div class="hdr"><p class="subj">Guidon Brewing Co. — The Brass Bell Tavern is approved</p>
<div class="from"><div class="av">G</div><div><strong>Guidon Brewing Co.</strong> <span class="muted">&lt;wholesale@guidonbrewing.com&gt;</span><br><span class="muted">to Marcus Johnson</span></div></div></div>
<div class="body">
<div style="padding:24px 16px;background:#F5EFDF;font-family:Georgia,'Source Serif 4',serif;color:#2A2416;line-height:1.55;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;border:1px solid #D8CDA8;background:#FBF7EA;">
<tr><td style="padding:24px 28px 12px;border-bottom:1px solid #D8CDA8;">
<div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9E7A3B;font-weight:600;margin-bottom:6px;">Guidon Brewing Co.</div>
<h1 style="margin:0;font-family:Georgia,serif;font-size:24px;font-weight:500;color:#2A2416;letter-spacing:-0.01em;">Welcome to Guidon wholesale</h1></td></tr>
<tr><td style="padding:20px 28px;font-size:15px;">
<p>Marcus Johnson &mdash;</p>
<p style="margin:12px 0;">Your wholesale account for <strong>The Brass Bell Tavern</strong> is approved. You can now place orders through the portal.</p>
<p style="margin:12px 0;"><a id="cta" href="#" style="display:inline-block;background:#9E7A3B;color:#F5EFDF;padding:10px 18px;text-decoration:none;font-weight:600;">Open wholesale portal &rarr;</a></p>
<p style="margin:12px 0;font-size:13px;">Your temporary password: <code id="temppw" style="background:#EEE5CE;padding:2px 6px;">${TEMP_PW}</code> &mdash; change it on first login.</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #D8CDA8;font-size:11px;color:#6B5F48;">Guidon Brewing Co. &middot; 415 8th Ave. E., Hendersonville, NC 28792 &middot; guidonbrewing.com</td></tr>
</table></div></div></div></body></html>`;
}

(async () => {
  resetData();
  fs.mkdirSync(SHOTS, { recursive: true });
  const meta = {};
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  );
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();

  const box = async (loc) => {
    await loc.first().waitFor({ state: 'visible', timeout: 15000 });
    const b = await loc.first().boundingBox();
    const sy = await p.evaluate(() => window.scrollY);
    return { x: Math.round(b.x), y: Math.round(b.y + sy), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const shot = async (name, targets = {}, opts = {}) => {
    await p.waitForTimeout(opts.settle ?? 700);
    const boxes = {};
    for (const [k, loc] of Object.entries(targets)) boxes[k] = await box(loc);
    await p.mouse.move(0, 0);
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: !!opts.fullPage });
    const height = opts.fullPage ? await p.evaluate(() => document.documentElement.scrollHeight) : H;
    meta[name] = { file: `shots/${name}.png`, width: W, height, boxes };
    console.log('captured', name);
  };

  // 1. Welcome email
  await p.setContent(emailHtml());
  await shot('email', { cta: p.locator('#cta'), temppw: p.locator('#temppw') });

  // 2. Sign in
  await p.goto(`${BASE}/portal`, { waitUntil: 'networkidle' });
  await shot('landing', { signin: p.getByRole('button', { name: 'Sign In' }) }, { settle: 1500 });
  await p.getByRole('button', { name: 'Sign In' }).click();
  const signinTargets = () => ({
    email: p.locator('#email'),
    password: p.locator('input[placeholder="Enter your password"]'),
    submit: p.locator('form').getByRole('button', { name: 'Sign In' }),
  });
  await p.locator('#email').blur();
  await shot('signin-empty', signinTargets());
  await p.fill('#email', EMAIL);
  await shot('signin-email', signinTargets());
  await p.fill('input[placeholder="Enter your password"]', TEMP_PW);
  await shot('signin-filled', signinTargets());
  await p.locator('form').getByRole('button', { name: 'Sign In' }).click();

  // 3. Set password
  const newPw = p.locator('input[placeholder="Min 6 characters"]').first();
  const confirmPw = p.locator('input[placeholder="Re-enter new password"]').first();
  const setPwBtn = p.getByRole('button', { name: 'Set password' });
  await newPw.waitFor();
  await newPw.blur();
  await shot('setpw-empty', { newPw, confirmPw, submit: setPwBtn });
  await newPw.fill(NEW_PW);
  await confirmPw.fill(NEW_PW);
  await confirmPw.blur();
  await shot('setpw-filled', { newPw, confirmPw, submit: setPwBtn });
  await setPwBtn.click();

  // 4. Overview
  const tab = (name) => p.getByRole('button', { name, exact: true }).first();
  await tab('Overview').waitFor();
  await shot('overview', {
    tabs: p.locator('nav, [role=tablist]').first().or(tab('Overview')),
    stats: p.getByText('Total Orders', { exact: false }).first(),
    kegs: p.getByText('Keg Balances', { exact: false }).first(),
    recent: p.getByText('Recent Orders', { exact: false }).first(),
    browseTab: tab('Browse & Order'),
  }, { settle: 1500 });

  // 5. Browse & order
  await tab('Browse & Order').click();
  // Nearest ancestor of the beer name that holds its own Add to Cart button.
  const card = p.getByText('Guidon Kolsch', { exact: true }).first()
    .locator('xpath=ancestor::*[.//button[normalize-space()="Add to Cart"]][1]');
  const cardTargets = () => ({
    card,
    quarter: card.getByRole('button', { name: 'Quarter Barrel' }),
    plus: card.locator('button').filter({ has: p.locator('path[d="M12 4v16m8-8H4"]') }),
    add: card.getByRole('button', { name: 'Add to Cart' }),
  });
  await shot('browse-0', cardTargets(), { fullPage: true, settle: 1500 });
  await card.getByRole('button', { name: 'Quarter Barrel' }).click();
  await card.locator('button').filter({ has: p.locator('path[d="M12 4v16m8-8H4"]') }).click();
  await shot('browse-1', cardTargets(), { fullPage: true });
  await card.getByRole('button', { name: 'Add to Cart' }).click();
  const reviewCart = p.getByRole('button', { name: /Review Cart/ });
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot('browse-2', { ...cardTargets(), review: reviewCart }, { fullPage: true, settle: 400 });

  // 6. Checkout (let the "added to cart" toast clear first)
  await p.getByText('added to cart').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await reviewCart.click();
  const ret = (s) => p.getByLabel(new RegExp(`${s}.*empties to return`));
  const ack = p.locator('input[type=checkbox]').last();
  const place = p.getByRole('button', { name: 'Place Order' });
  const checkoutTargets = () => ({
    modal: p.getByText('Review & Place Order').first(),
    delivery: p.getByText('Thursdays and Fridays').first(),
    returns: p.getByText('Keg Returns', { exact: true }).first(),
    ackBox: ack,
    place,
  });
  await shot('checkout-0', checkoutTargets());
  const inputs = p.locator('input[type=number]');
  const n = await inputs.count();
  const returnBoxes = [];
  for (let i = 0; i < n; i++) returnBoxes.push(await box(inputs.nth(i)));
  // Two empty sixth-barrels and one quarter go back on this delivery.
  const labels = await Promise.all([...Array(n).keys()].map((i) => inputs.nth(i).getAttribute('aria-label')));
  for (let i = 0; i < n; i++) {
    const l = labels[i] || '';
    if (/1\/6|sixth/i.test(l)) await inputs.nth(i).fill('2');
    else if (/1\/4|quarter/i.test(l)) await inputs.nth(i).fill('1');
  }
  await p.locator('body').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
  if (!(await place.isVisible())) await reviewCart.click();
  await shot('checkout-1', checkoutTargets());
  await ack.check();
  await shot('checkout-2', checkoutTargets());
  meta['checkout-0'].boxes.returnInputs = returnBoxes;
  meta['checkout-0'].returnLabels = labels;
  await place.click();

  // 7. Confirmation lands on Order History
  await p.getByText('Order History').first().waitFor();
  await p.waitForTimeout(1500);
  await shot('orders', {
    tab: tab('Order History'),
    newOrder: p.getByText(/^pending$/i).first()
      .locator('xpath=ancestor::*[.//*[starts-with(normalize-space(), "ord-")]][1]'),
  }, { settle: 800 });

  // 8. Invoices
  await tab('Invoices').click();
  await shot('invoices', { tab: tab('Invoices') }, { settle: 1200 });

  // 9. Account
  await tab('Account').click();
  await shot('account', { tab: tab('Account') }, { fullPage: true, settle: 1200 });

  // 10. Help
  await tab('Help').click();
  await shot('help', { tab: tab('Help') }, { fullPage: true, settle: 1200 });

  fs.writeFileSync(META, JSON.stringify(meta, null, 2));
  await browser.close();
  console.log('wrote', META);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
