'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/admin-fetch';

export default function SettingsPage() {
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Follow-up reminder emails. Off by default until Mike confirms who gets
  // them; the recipients box takes a comma-separated list.
  const [reminders, setReminders] = useState({ enabled: false, recipients: [] as string[] });
  const [reminderDraft, setReminderDraft] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  useEffect(() => {
    adminFetch('/api/admin/settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setEmails(Array.isArray(data.notificationEmails) ? data.notificationEmails : []);
        setVideoUrl(typeof data.onboardingVideoUrl === 'string' ? data.onboardingVideoUrl : '');
        if (data.followupReminders) {
          setReminders(data.followupReminders);
          setReminderDraft((data.followupReminders.recipients || []).join(', '));
        }
      })
      .catch(() => setError('Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const flash = (type: 'error' | 'success', text: string) => {
    if (type === 'error') { setError(text); setSuccess(''); }
    else { setSuccess(text); setError(''); window.setTimeout(() => setSuccess(''), 2000); }
  };

  const saveEmails = async (next: string[]) => {
    setSaving(true);
    setError(''); setSuccess('');
    try {
      const res = await adminFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationEmails: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed.');
      }
      const data = await res.json();
      setEmails(data.notificationEmails);
      flash('success', 'Saved.');
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const addEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = newEmail.trim().toLowerCase();
    if (!addr) return;
    if (emails.includes(addr)) {
      flash('error', `${addr} is already on the list.`);
      return;
    }
    const next = [...emails, addr];
    await saveEmails(next);
    setNewEmail('');
  };

  const saveReminders = async (enabled: boolean) => {
    setSaving(true);
    setError(''); setSuccess('');
    try {
      const recipients = reminderDraft.split(',').map((e) => e.trim()).filter(Boolean);
      const res = await adminFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followupReminders: { enabled, recipients } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      setReminders(data.followupReminders);
      setReminderDraft((data.followupReminders.recipients || []).join(', '));
      flash('success', 'Saved.');
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const saveVideoUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(''); setSuccess('');
    try {
      const res = await adminFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingVideoUrl: videoUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      setVideoUrl(data.onboardingVideoUrl || '');
      flash('success', 'Saved.');
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const removeEmail = async (addr: string) => {
    if (emails.length === 1) {
      flash('error', 'Keep at least one recipient so brewery alerts are delivered.');
      return;
    }
    const next = emails.filter((e) => e !== addr);
    await saveEmails(next);
  };

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <span className="section-label mb-1 block">Settings</span>
        <h2
          className="font-display"
          style={{
            fontSize: '2.5rem',
            fontVariationSettings: "'opsz' 72",
            color: 'var(--ink)',
            fontWeight: 500,
          }}
        >
          Brewery Settings
        </h2>
      </div>

      {loading ? (
        <div className="skeleton h-32 w-full" />
      ) : (
        <>
          {/* Notification recipients */}
          <section className="card p-5">
            <div className="mb-3">
              <span className="section-label">Notification Recipients</span>
              <p className="text-sm mt-1 italic" style={{ color: 'var(--muted)' }}>
                Addresses that get brewery-side alerts: new orders, applications,
                low-stock warnings. Customer confirmations go to the customer&rsquo;s own email.
              </p>
            </div>
            <ul className="border-t border-divider">
              {emails.map((addr) => (
                <li
                  key={addr}
                  className="py-3 border-b border-divider flex items-center justify-between gap-4"
                >
                  <div>
                    <p
                      className="font-variant-tabular"
                      style={{ color: 'var(--ink)', fontFamily: "'Source Serif 4', serif" }}
                    >
                      {addr}
                    </p>
                  </div>
                  <button
                    onClick={() => removeEmail(addr)}
                    disabled={saving || emails.length === 1}
                    className="btn-ghost text-sm"
                    style={{ color: emails.length === 1 ? 'var(--faint)' : 'var(--ruby)' }}
                    title={emails.length === 1 ? 'At least one recipient is required' : 'Remove'}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <form onSubmit={addEmail} className="flex items-stretch gap-2 mt-4">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="sales@guidonbrewing.com"
                className="input flex-1"
                disabled={saving}
              />
              <button type="submit" className="btn-primary" disabled={saving || !newEmail.trim()}>
                Add Recipient
              </button>
            </form>
          </section>

          {/* Follow-up reminders */}
          <section className="card p-5">
            <div className="mb-3">
              <span className="section-label">Follow-up Reminders</span>
              <p className="text-sm mt-1 italic" style={{ color: 'var(--muted)' }}>
                An email the day before and the morning of each follow-up scheduled in the CRM,
                sent around 8am Eastern. Goes only to the addresses below, never to customers.
              </p>
            </div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }} htmlFor="reminder-recipients">
              Send to (comma-separated)
            </label>
            <input
              id="reminder-recipients"
              className="input w-full mb-3"
              value={reminderDraft}
              onChange={(e) => setReminderDraft(e.target.value)}
              placeholder="mike@guidonbrewing.com"
              disabled={saving}
            />
            <div className="flex items-center gap-3">
              <button className="btn-primary" disabled={saving} onClick={() => saveReminders(reminders.enabled)}>
                Save recipients
              </button>
              <button className="btn-secondary" disabled={saving} onClick={() => saveReminders(!reminders.enabled)}>
                {reminders.enabled ? 'Turn off' : 'Turn on'}
              </button>
              <span className="text-sm" style={{ color: reminders.enabled ? 'var(--pine)' : 'var(--muted)' }}>
                {reminders.enabled ? 'On' : 'Off'}
              </span>
            </div>
          </section>

          {/* Setup walkthrough link in the welcome email */}
          <section className="card p-5">
            <div className="mb-3">
              <span className="section-label">New Account Walkthrough</span>
              <p className="text-sm mt-1 italic" style={{ color: 'var(--muted)' }}>
                A link to the account-setup video, added to the &ldquo;account approved&rdquo; email every
                new customer gets. Leave blank to leave it out.
              </p>
            </div>
            <form onSubmit={saveVideoUrl} className="flex items-stretch gap-2">
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://…"
                className="input flex-1"
                disabled={saving}
              />
              <button type="submit" className="btn-primary" disabled={saving}>
                Save link
              </button>
            </form>
          </section>

          {error && (
            <p className="text-sm" style={{ color: 'var(--ruby)' }}>
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm italic" style={{ color: 'var(--pine)' }}>
              {success}
            </p>
          )}

          <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
            Changes take effect immediately for any notification event or new order after save.
          </p>
        </>
      )}
    </div>
  );
}
