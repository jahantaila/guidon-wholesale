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
      .then((data) => {
        setEmails(Array.isArray(data.notificationEmails) ? data.notificationEmails : []);
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
