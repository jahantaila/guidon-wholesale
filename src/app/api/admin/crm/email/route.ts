import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { extractError } from '@/lib/extract-error';
import { getCustomer, getCrmContact, createCrmActivity } from '@/lib/data';
import { send, emailShell, plainTextToHtml, isEmailConfigured } from '@/lib/email';
import { generateId } from '@/lib/utils';
import type { CrmActivity } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MAX_SUBJECT = 200;
const MAX_BODY = 20_000;

/**
 * POST /api/admin/crm/email
 * Body: { subjectId, subject, body }
 *
 * Sends one email to one customer or lead, from the brewery's configured
 * sending address with Reply-To pointing at sales@guidonbrewing.com — so a
 * reply lands in Mike's normal inbox.
 *
 * On success it logs a `sent_email` activity against that account. That is the
 * point: it keeps the contact history current without anyone remembering to
 * type into it, which two months of production data says will not happen.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }

  try {
    // Refuse before doing anything visible. Without an API key `send()`
    // returns ok:true with id 'stub' and only console-logs, so trusting it
    // would report a successful send, and write an activity claiming one,
    // while the recipient gets nothing.
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: 'Email is not configured on the server, so nothing was sent.' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const subjectId = typeof body?.subjectId === 'string' ? body.subjectId.trim() : '';
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body?.body === 'string' ? body.body.trim() : '';

    if (!subjectId) {
      return NextResponse.json({ error: 'subjectId is required.' }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: 'A subject line is required.' }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: 'The message is empty.' }, { status: 400 });
    }
    if (subject.length > MAX_SUBJECT || message.length > MAX_BODY) {
      return NextResponse.json({ error: 'That message is too long to send.' }, { status: 400 });
    }

    // Resolve which side of the CRM union this id is, and get an address.
    const customer = await getCustomer(subjectId);
    const contact = customer ? undefined : await getCrmContact(subjectId);
    const recipient = customer || contact;
    if (!recipient) {
      return NextResponse.json({ error: 'No customer or lead with that id.' }, { status: 404 });
    }

    const to = (recipient.email || '').trim();
    if (!to) {
      return NextResponse.json(
        { error: `${recipient.businessName} has no email address on file.` },
        { status: 400 },
      );
    }

    const result = await send({
      to,
      subject,
      // plainTextToHtml escapes first. emailShell interpolates the body raw,
      // so passing unescaped admin text would render as live HTML in the
      // recipient's inbox.
      html: emailShell({
        title: subject,
        preheader: message.slice(0, 120),
        body: plainTextToHtml(message),
      }),
      text: message,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: `Could not send: ${result.error || 'unknown error'}` },
        { status: 502 },
      );
    }

    // Log it. Non-fatal: the email really did go out, so failing the request
    // here would tell Mike it didn't and invite him to send it twice.
    let logged = true;
    try {
      const activity: CrmActivity = {
        id: generateId('act'),
        customerId: customer ? subjectId : null,
        contactId: customer ? null : subjectId,
        type: 'sent_email',
        occurredAt: new Date().toISOString(),
        notes: subject,
        source: 'system',
        createdAt: new Date().toISOString(),
      };
      await createCrmActivity(activity);
    } catch (err) {
      logged = false;
      console.error('[crm/email] send succeeded but activity log failed:', err);
    }

    return NextResponse.json({ sent: true, to, logged, id: result.id });
  } catch (err) {
    console.error('[crm/email] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}
