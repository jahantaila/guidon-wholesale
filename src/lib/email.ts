/**
 * Email notifications via Resend (https://resend.com).
 *
 * Graceful degradation: if RESEND_API_KEY is not set, every send() call logs
 * the email to the server console and returns success. That means the app
 * continues to function during development without credentials, and wiring
 * up Resend later is a one-line env-var change.
 *
 * Environment variables (all optional; all default to safe no-op behavior):
 *   RESEND_API_KEY    — secret Resend API key. Get at https://resend.com/api-keys
 *   EMAIL_FROM        — "Guidon Brewing <orders@guidonbrewing.com>"
 *                       Must be on a domain verified in Resend. Default:
 *                       "Guidon Brewing <onboarding@resend.dev>" for dev.
 *   EMAIL_ADMIN       — where brewery-side notifications go (new orders,
 *                       applications). Default: env EMAIL_FROM recipient.
 *   EMAIL_DISABLED    — set to "true" to completely silence all emails,
 *                       including console logs (useful for tests).
 */

import { Resend } from 'resend';
import { getNotificationEmails } from './data';

type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

const FROM_FALLBACK = 'Guidon Brewing <onboarding@resend.dev>';

/**
 * Strip surrounding quotes that users commonly paste into Vercel env UI.
 * `"Name <foo@bar>"` is a valid literal but Resend parses it as an email and
 * rejects with 422. Defensive cleanup of the most common paste-mistake.
 */
function cleanEnvString(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function fromAddress(): string {
  return cleanEnvString(process.env.EMAIL_FROM) || FROM_FALLBACK;
}

/**
 * Reply-To address. We send FROM emails.derbyrestaurants.us (Derby Digital
 * shared transactional domain) but replies should land at the brewery's
 * real mailbox. Defaults to EMAIL_REPLY_TO env var; falls back to EMAIL_FROM
 * if not set.
 */
function defaultReplyTo(): string | undefined {
  return cleanEnvString(process.env.EMAIL_REPLY_TO) || undefined;
}

/**
 * Admin notification recipients, pulled from the admin-editable settings
 * table first, falling back to EMAIL_ADMIN env, then to a sensible default.
 * Called on every send, so changes in the settings UI take effect
 * immediately for subsequent events.
 */
async function adminRecipients(): Promise<string[]> {
  try {
    return await getNotificationEmails();
  } catch {
    if (process.env.EMAIL_ADMIN) {
      return process.env.EMAIL_ADMIN.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return ['sales@guidonbrewing.com'];
  }
}

/**
 * Canonical portal URL for email CTAs. Reads NEXT_PUBLIC_APP_URL which we
 * set in Vercel; falls back to the known prod URL so emails still link
 * somewhere reasonable if the env var is missing. Strips trailing slash.
 */
export function portalUrl(): string {
  const base = cleanEnvString(process.env.NEXT_PUBLIC_APP_URL) || 'https://guidon-wholesale.vercel.app';
  return `${base.replace(/\/$/, '')}/portal`;
}

let _client: Resend | null | undefined;

function getClient(): Resend | null {
  if (_client !== undefined) return _client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 'placeholder') {
    _client = null;
    return null;
  }
  _client = new Resend(apiKey);
  return _client;
}

/**
 * Core send. Returns { ok, id?, error? }. Never throws — failures are logged
 * and swallowed so a broken email provider can't take down order placement.
 */
export async function send(args: SendArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (process.env.EMAIL_DISABLED === 'true') {
    return { ok: true, id: 'disabled' };
  }

  const client = getClient();
  if (!client) {
    // Dev/no-creds mode: log to console so the engineer can see what would
    // have been sent. Truncate HTML so logs stay readable.
    const preview = args.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    console.log(
      `[email:stub] to=${Array.isArray(args.to) ? args.to.join(',') : args.to} | ${args.subject} | ${preview}${preview.length >= 200 ? '…' : ''}`,
    );
    return { ok: true, id: 'stub' };
  }

  try {
    const result = await client.emails.send({
      from: fromAddress(),
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: args.replyTo || defaultReplyTo(),
    });
    if (result.error) {
      console.error('[email:error]', result.error);
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email:exception]', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Shared Letterpress-Trade-Portal styled email shell. Matches DESIGN.md
 * tokens so the email feels like the web app.
 */
function emailShell(opts: { preheader?: string; title: string; body: string; footer?: string }): string {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;">${opts.preheader}</div>`
    : '';
  const footer =
    opts.footer ||
    'Guidon Brewing Co. &middot; 415 8th Ave. E., Hendersonville, NC 28792 &middot; guidonbrewing.com';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:24px 16px;background:#F5EFDF;font-family:Georgia,'Source Serif 4',serif;color:#2A2416;line-height:1.55;">
  ${preheader}
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;border:1px solid #D8CDA8;background:#FBF7EA;">
    <tr>
      <td style="padding:24px 28px 12px;border-bottom:1px solid #D8CDA8;">
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9E7A3B;font-weight:600;margin-bottom:6px;">Guidon Brewing Co.</div>
        <h1 style="margin:0;font-family:Georgia,serif;font-size:24px;font-weight:500;color:#2A2416;letter-spacing:-0.01em;">${escapeHtml(opts.title)}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 28px;font-size:15px;">
        ${opts.body}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;border-top:1px solid #D8CDA8;font-size:11px;color:#6B5F48;">
        ${footer}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatCurrencyForEmail(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents);
}

// ─── High-level triggers ──────────────────────────────────────────────────────

type OrderLine = { productName: string; size: string; quantity: number; unitPrice: number };

/**
 * Order placed. Sends two emails:
 *   1. Customer confirmation (to the ordering customer's email)
 *   2. Admin notification (to EMAIL_ADMIN)
 */
export async function notifyOrderPlaced(args: {
  orderId: string;
  customerEmail: string;
  customerName: string;
  businessName: string;
  items: OrderLine[];
  subtotal: number;
  totalDeposit: number;
  total: number;
  deliveryDate: string;
  notes?: string;
}): Promise<void> {
  const itemRows = args.items
    .map(
      (i) => `
        <tr>
          <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;">${escapeHtml(i.productName)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;font-family:monospace;">${escapeHtml(i.size)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;text-align:right;font-family:monospace;">${i.quantity}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;text-align:right;font-family:monospace;">${formatCurrencyForEmail(i.unitPrice * i.quantity)}</td>
        </tr>`,
    )
    .join('');

  const itemsTable = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px;margin:16px 0;">
      <thead>
        <tr style="background:#EEE5CE;">
          <th style="padding:6px 8px;text-align:left;font-weight:600;color:#6B5F48;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Beer</th>
          <th style="padding:6px 8px;text-align:left;font-weight:600;color:#6B5F48;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Size</th>
          <th style="padding:6px 8px;text-align:right;font-weight:600;color:#6B5F48;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Qty</th>
          <th style="padding:6px 8px;text-align:right;font-weight:600;color:#6B5F48;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div style="margin-top:8px;font-size:14px;color:#6B5F48;">
      Subtotal: <span style="color:#2A2416;font-family:monospace;">${formatCurrencyForEmail(args.subtotal)}</span><br/>
      Keg deposits: <span style="color:#2A2416;font-family:monospace;">${formatCurrencyForEmail(args.totalDeposit)}</span><br/>
      <strong style="color:#2A2416;">Total due on delivery: <span style="font-family:monospace;color:#9E7A3B;">${formatCurrencyForEmail(args.total)}</span></strong>
    </div>`;

  const portalCta = portalUrl();
  const customerHtml = emailShell({
    title: `Order ${args.orderId} received`,
    preheader: `We received your wholesale order. Delivery scheduled ${args.deliveryDate}.`,
    body: `
      <p>${escapeHtml(args.customerName)} &mdash; thank you for the order.</p>
      <p style="margin:12px 0;">We've scheduled delivery for <strong style="color:#9E7A3B;">${escapeHtml(args.deliveryDate)}</strong>. You'll get another email when it leaves the brewery.</p>
      ${itemsTable}
      ${args.notes ? `<p style="margin-top:12px;font-size:13px;color:#6B5F48;font-style:italic;">Your note: ${escapeHtml(args.notes)}</p>` : ''}
      <p style="margin:16px 0;">
        <a href="${portalCta}" style="display:inline-block;background:#9E7A3B;color:#F5EFDF;padding:10px 18px;text-decoration:none;font-weight:600;">View in portal &rarr;</a>
      </p>
      <p style="margin-top:20px;font-size:13px;color:#6B5F48;">Questions? Reply to this email or call the brewery.</p>
    `,
  });

  const adminHtml = emailShell({
    title: `New order from ${args.businessName}`,
    preheader: `${args.items.length} item(s), delivery ${args.deliveryDate}, ${formatCurrencyForEmail(args.total)}.`,
    body: `
      <p>New order <strong>${escapeHtml(args.orderId)}</strong> from <strong>${escapeHtml(args.businessName)}</strong> (${escapeHtml(args.customerEmail)}).</p>
      <p style="margin:12px 0;">Delivery: <strong style="color:#9E7A3B;">${escapeHtml(args.deliveryDate)}</strong>.</p>
      ${itemsTable}
      ${args.notes ? `<p style="margin-top:12px;font-size:13px;color:#6B5F48;font-style:italic;">Customer note: ${escapeHtml(args.notes)}</p>` : ''}
    `,
  });

  await Promise.all([
    send({
      to: args.customerEmail,
      subject: `Order ${args.orderId} received — delivery ${args.deliveryDate}`,
      html: customerHtml,
    }),
    (async () => {
      const adminTo = await adminRecipients();
      if (adminTo.length === 0) return { ok: true } as const;
      return send({
        to: adminTo,
        subject: `New order: ${args.businessName} (${args.orderId})`,
        html: adminHtml,
        replyTo: args.customerEmail,
      });
    })(),
  ]);
}

/**
 * Order status changed. Notifies the customer of transitions that matter to
 * them (confirmed, delivered, completed).
 */
export async function notifyOrderStatusChanged(args: {
  orderId: string;
  customerEmail: string;
  customerName: string;
  newStatus: 'confirmed' | 'delivered' | 'completed';
  deliveryDate: string;
}): Promise<void> {
  const copyByStatus: Record<typeof args.newStatus, { title: string; lead: string }> = {
    confirmed: {
      title: `Order ${args.orderId} confirmed`,
      lead: `Your order is confirmed and scheduled for delivery on <strong style="color:#9E7A3B;">${escapeHtml(args.deliveryDate)}</strong>.`,
    },
    delivered: {
      title: `Order ${args.orderId} delivered`,
      lead: `Your kegs have been delivered. An invoice for this order is on its way.`,
    },
    completed: {
      title: `Order ${args.orderId} completed`,
      lead: `This order is closed out. Thanks for choosing Guidon.`,
    },
  };
  const { title, lead } = copyByStatus[args.newStatus];
  const portalCta = portalUrl();

  await send({
    to: args.customerEmail,
    subject: title,
    html: emailShell({
      title,
      body: `<p>${escapeHtml(args.customerName)} &mdash;</p>
        <p style="margin:12px 0;">${lead}</p>
        <p style="margin:16px 0;">
          <a href="${portalCta}" style="display:inline-block;background:#9E7A3B;color:#F5EFDF;padding:10px 18px;text-decoration:none;font-weight:600;">View order in portal &rarr;</a>
        </p>
        <p style="margin:20px 0 0;font-size:13px;color:#6B5F48;font-style:italic;">Reply to this email if you have questions — it goes straight to the brewery.</p>`,
    }),
  });
}

/**
 * Wholesale application submitted. Notifies the applicant (thank-you) and
 * the admin (new application to review).
 */
export async function notifyApplicationSubmitted(args: {
  applicationId: string;
  applicantEmail: string;
  applicantName: string;
  businessName: string;
  phone?: string;
  expectedMonthlyVolume?: string;
  businessType?: string;
}): Promise<void> {
  const applicantHtml = emailShell({
    title: 'Application received',
    preheader: 'We got your wholesale application. We review within 24 hours.',
    body: `
      <p>${escapeHtml(args.applicantName)} &mdash;</p>
      <p style="margin:12px 0;">Thanks for applying to carry Guidon. We review new wholesale accounts within 24 hours and will email you at this address either way.</p>
      <p style="margin:12px 0;font-size:13px;color:#6B5F48;">If you need to reach us sooner, reply to this email.</p>
    `,
  });

  const adminHtml = emailShell({
    title: `New application: ${args.businessName}`,
    body: `
      <p>New wholesale application <strong>${escapeHtml(args.applicationId)}</strong></p>
      <div style="margin:12px 0;font-size:14px;">
        <div><strong>Business:</strong> ${escapeHtml(args.businessName)}</div>
        <div><strong>Contact:</strong> ${escapeHtml(args.applicantName)}</div>
        <div><strong>Email:</strong> ${escapeHtml(args.applicantEmail)}</div>
        ${args.phone ? `<div><strong>Phone:</strong> ${escapeHtml(args.phone)}</div>` : ''}
        ${args.businessType ? `<div><strong>Type:</strong> ${escapeHtml(args.businessType)}</div>` : ''}
        ${args.expectedMonthlyVolume ? `<div><strong>Expected volume:</strong> ${escapeHtml(args.expectedMonthlyVolume)}</div>` : ''}
      </div>
      <p style="margin-top:16px;"><a href="${(cleanEnvString(process.env.NEXT_PUBLIC_APP_URL) || 'https://guidon-wholesale.vercel.app')}/admin/applications" style="color:#9E7A3B;">Review in admin &rarr;</a></p>
    `,
  });

  await Promise.all([
    send({
      to: args.applicantEmail,
      subject: 'Guidon Brewing — Application received',
      html: applicantHtml,
    }),
    (async () => {
      const adminTo = await adminRecipients();
      if (adminTo.length === 0) return { ok: true } as const;
      return send({
        to: adminTo,
        subject: `New application: ${args.businessName}`,
        html: adminHtml,
        replyTo: args.applicantEmail,
      });
    })(),
  ]);
}

/**
 * Keg-return reminder. Admin clicks a button on a delivered order; this
 * emails the customer asking them to put in a return request on the
 * portal.
 */
export async function notifyKegReminder(args: {
  orderId: string;
  customerEmail: string;
  customerName: string;
  businessName: string;
  items: OrderLine[];
  deliveryDate: string;
  portalUrl?: string;
}): Promise<void> {
  const kegRows = args.items
    .map(
      (i) =>
        `<li style="margin:4px 0;"><span style="font-family:monospace;color:#9E7A3B;font-weight:600;">${i.quantity}</span> &middot; <em style="color:#6B5F48;">${escapeHtml(i.size)}</em> ${escapeHtml(i.productName)}</li>`,
    )
    .join('');

  await send({
    to: args.customerEmail,
    subject: `Keg return reminder — order ${args.orderId}`,
    html: emailShell({
      title: 'Time to return those kegs',
      preheader: `We still have kegs out from order ${args.orderId}.`,
      body: `
        <p>${escapeHtml(args.customerName)} &mdash;</p>
        <p style="margin:12px 0;">We still have kegs out from your order <strong>${escapeHtml(args.orderId)}</strong> (delivered ${escapeHtml(args.deliveryDate)}):</p>
        <ul style="margin:8px 0 16px 18px;font-size:14px;">${kegRows}</ul>
        <p style="margin:12px 0;">When you&rsquo;re ready, log into the portal and submit a return request so we can pick them up on your next delivery and credit the deposits back.</p>
        ${
          args.portalUrl
            ? `<p style="margin:14px 0;"><a href="${args.portalUrl}" style="display:inline-block;background:#9E7A3B;color:#F5EFDF;padding:10px 18px;text-decoration:none;font-weight:600;">Open wholesale portal &rarr;</a></p>`
            : ''
        }
        <p style="margin:20px 0 0;font-size:13px;color:#6B5F48;font-style:italic;">No rush — we just want to make sure our empties come home eventually. Reply if you already sent them and our tracking is stale.</p>
      `,
    }),
  });
}

/**
 * Low-stock alert. Fired when a product size's inventory crosses below the
 * threshold as a result of an order confirmation. Only goes to brewery
 * admin recipients — customers never see this. Keep it compact: subject
 * line has everything Mike needs to act.
 */
export async function notifyLowStock(args: {
  items: Array<{ productName: string; size: string; remaining: number }>;
}): Promise<void> {
  if (args.items.length === 0) return;
  const adminTo = await adminRecipients();
  if (adminTo.length === 0) return;

  const first = args.items[0];
  const subject = args.items.length === 1
    ? `Low stock: ${first.productName} ${first.size} (${first.remaining} left)`
    : `Low stock: ${args.items.length} sizes below threshold`;

  const rows = args.items.map(
    (i) => `<li style="margin:6px 0;"><strong style="color:#2A2416;">${escapeHtml(i.productName)}</strong> &middot; <span style="font-family:monospace;color:#6B5F48;">${escapeHtml(i.size)}</span> &middot; <span style="font-family:monospace;color:#C0392B;font-weight:600;">${i.remaining} remaining</span></li>`,
  ).join('');

  await send({
    to: adminTo,
    subject,
    html: emailShell({
      title: 'Low stock alert',
      preheader: `${args.items.length} product size${args.items.length === 1 ? '' : 's'} below threshold after the last order confirmation.`,
      body: `
        <p>These products are running low after the last order was confirmed. Brew or restock:</p>
        <ul style="margin:12px 0 16px 18px;font-size:14px;">${rows}</ul>
        <p style="font-size:13px;color:#6B5F48;font-style:italic;">This alert fires once when inventory crosses below 5. No further emails until you restock + it crosses back down.</p>
      `,
    }),
  });
}

/**
 * Heads-up email 24h before a recurring order auto-creates. Gives the
 * customer a window to pause or reach out with changes. Awaits nothing
 * beyond the send call — no admin CC (admin already sees it in portal).
 */
export async function notifyRecurringHeadsUp(args: {
  customerEmail: string;
  customerName: string;
  templateName: string;
  items: Array<{ productName: string; size: string; quantity: number }>;
  willFireAt: string;
}): Promise<void> {
  const portalCta = portalUrl();
  const rows = args.items.map(
    (i) => `<li style="margin:4px 0;"><strong>${i.quantity}</strong> &middot; <em>${escapeHtml(i.size)}</em> ${escapeHtml(i.productName)}</li>`,
  ).join('');
  const when = new Date(args.willFireAt).toLocaleString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
  });
  await send({
    to: args.customerEmail,
    subject: `Heads up: your "${args.templateName}" order will be placed tomorrow`,
    html: emailShell({
      title: 'Your recurring order is coming up',
      preheader: `"${args.templateName}" auto-places tomorrow. Pause or reach out if you need to change it.`,
      body: `
        <p>${escapeHtml(args.customerName)} &mdash;</p>
        <p style="margin:12px 0;">A heads-up that your recurring order <strong>"${escapeHtml(args.templateName)}"</strong> will auto-place on <strong style="color:#9E7A3B;">${escapeHtml(when)}</strong>:</p>
        <ul style="margin:8px 0 16px 18px;font-size:14px;">${rows}</ul>
        <p style="margin:16px 0;">No action needed if this still looks right. Want to pause or change it?</p>
        <p style="margin:16px 0;">
          <a href="${portalCta}" style="display:inline-block;background:#9E7A3B;color:#F5EFDF;padding:10px 18px;text-decoration:none;font-weight:600;">Open the portal &rarr;</a>
        </p>
        <p style="margin:20px 0 0;font-size:13px;color:#6B5F48;font-style:italic;">Or reply to this email — it goes to the brewery.</p>
      `,
    }),
  });
}

/**
 * Application decision. Called when an admin approves or rejects an
 * application. Includes portal login info on approval.
 */
export async function notifyApplicationDecision(args: {
  applicationId: string;
  applicantEmail: string;
  applicantName: string;
  businessName: string;
  decision: 'approved' | 'rejected';
  portalUrl?: string;
  tempPassword?: string;
}): Promise<void> {
  if (args.decision === 'approved') {
    await send({
      to: args.applicantEmail,
      subject: `Guidon Brewing — ${args.businessName} is approved`,
      html: emailShell({
        title: 'Welcome to Guidon wholesale',
        preheader: 'Your wholesale account is live.',
        body: `
          <p>${escapeHtml(args.applicantName)} &mdash;</p>
          <p style="margin:12px 0;">Your wholesale account for <strong>${escapeHtml(args.businessName)}</strong> is approved. You can now place orders through the portal.</p>
          ${
            args.portalUrl
              ? `<p style="margin:12px 0;"><a href="${args.portalUrl}" style="display:inline-block;background:#9E7A3B;color:#F5EFDF;padding:10px 18px;text-decoration:none;font-weight:600;">Open wholesale portal &rarr;</a></p>`
              : ''
          }
          ${
            args.tempPassword
              ? `<p style="margin:12px 0;font-size:13px;">Your temporary password: <code style="background:#EEE5CE;padding:2px 6px;">${escapeHtml(args.tempPassword)}</code> &mdash; change it on first login.</p>`
              : ''
          }
        `,
      }),
    });
  } else {
    await send({
      to: args.applicantEmail,
      subject: `Guidon Brewing — ${args.businessName} application update`,
      html: emailShell({
        title: 'Application update',
        body: `
          <p>${escapeHtml(args.applicantName)} &mdash;</p>
          <p style="margin:12px 0;">Thanks again for your interest in carrying Guidon. We're not able to take on <strong>${escapeHtml(args.businessName)}</strong> as a wholesale account at this time.</p>
          <p style="margin:12px 0;font-size:13px;color:#6B5F48;">If your situation changes or you have questions, reply to this email.</p>
        `,
      }),
    });
  }
}
