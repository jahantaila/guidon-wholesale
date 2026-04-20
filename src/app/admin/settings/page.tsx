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

  useEffect(() => {
    adminFetch('/api/admin/settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setEmails(Array.isArray(data.notificationEmails) ? data.notificationEmails : []))
      .catch(() => setError('Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const saveEmails = async (next: string[]) => {
    setSaving(true);
    setError('');
    setSuccess('');
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
      setSuccess('Saved.');
      window.setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const addEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = newEmail.trim().toLowerCase();
    if (!addr) return;
    if (emails.includes(addr)) {
      setError(`${addr} is already on the list.`);
      return;
    }
    const next = [...emails, addr];
    await saveEmails(next);
    setNewEmail('');
  };

  const removeEmail = async (addr: string) => {
    if (emails.length === 1) {
      setError('Keep at least one recipient so brewery alerts are delivered.');
      return;
    }
    const next = emails.filter((e) => e !== addr);
    await saveEmails(next);
  };

  return (
    <div className="space-y-8 max-w-2xl">
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
          Notification Recipients
        </h2>
        <p className="mt-3 italic" style={{ color: 'var(--muted)' }}>
          Addresses that receive brewery-side alerts: new orders placed, new
          wholesale applications submitted, and (future) low-stock warnings.
          Customer confirmations go to the customer&rsquo;s own email; these
          recipients are the <em>internal</em> list.
        </p>
      </div>

      {loading ? (
        <div className="skeleton h-32 w-full" />
      ) : (
        <>
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

          <form onSubmit={addEmail} className="flex items-stretch gap-2">
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
            Changes take effect immediately for any notification event fired
            after save.
          </p>
        </>
      )}
    </div>
  );
}
