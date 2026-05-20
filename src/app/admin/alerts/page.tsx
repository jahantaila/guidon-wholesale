'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import type { WholesaleAlert } from '@/lib/types';

/**
 * Admin CMS for the wholesale portal alert popup.
 *
 * One alert is active at a time — the brewery told us to keep this simple.
 * The form prepopulates from whatever's currently published (or the seed
 * record when nothing's been saved yet). Saving overwrites in place; the
 * dismissal state on customers' browsers persists across edits so a
 * date-only tweak doesn't re-pester customers who already acknowledged it.
 * To intentionally re-show to everyone, tick "Reset dismissals" before save
 * — that bumps the alert id and busts the per-customer localStorage flag.
 */
export default function AlertsAdminPage() {
  const [alert, setAlert] = useState<WholesaleAlert | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [active, setActive] = useState(true);
  const [endsAt, setEndsAt] = useState(''); // YYYY-MM-DD or ''
  const [resetDismissals, setResetDismissals] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    adminFetch('/api/admin/alerts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: WholesaleAlert | null) => {
        if (data && typeof data === 'object' && 'id' in data) {
          setAlert(data);
          setTitle(data.title);
          setBody(data.body);
          setActive(data.active);
          // <input type="date"> expects YYYY-MM-DD. The stored endsAt may
          // include a time component (T23:59:59) from the PUT handler.
          setEndsAt(data.endsAt ? data.endsAt.slice(0, 10) : '');
        }
      })
      .catch(() => setError('Failed to load the current alert.'))
      .finally(() => setLoading(false));
  }, []);

  const flash = (type: 'error' | 'success', text: string) => {
    if (type === 'error') { setError(text); setSuccess(''); }
    else { setSuccess(text); setError(''); window.setTimeout(() => setSuccess(''), 3000); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { flash('error', 'Title is required.'); return; }
    if (!body.trim()) { flash('error', 'Body is required.'); return; }
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          active,
          endsAt: endsAt || null,
          resetDismissals,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (HTTP ${res.status})`);
      }
      const saved: WholesaleAlert = await res.json();
      setAlert(saved);
      setResetDismissals(false);
      flash(
        'success',
        resetDismissals
          ? 'Saved. Customers who previously dismissed will see this on their next visit.'
          : 'Saved. Live on the wholesale portal now.',
      );
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <span className="section-label mb-1 block">Communication</span>
        <h2
          className="font-display"
          style={{
            fontSize: '2.5rem',
            fontVariationSettings: "'opsz' 72",
            color: 'var(--ink)',
            fontWeight: 500,
          }}
        >
          Wholesale Alert
        </h2>
        <p className="text-sm mt-2 italic" style={{ color: 'var(--muted)' }}>
          A single dismissable popup shown to wholesale customers on the portal home.
          Use this for price changes, holiday closures, inventory advisories — anything
          you want every customer to see once before they keep ordering.
        </p>
      </div>

      {loading ? (
        <div className="skeleton h-64 w-full" />
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <section className="card p-5 space-y-5">
            <div>
              <label htmlFor="alert-title" className="section-label block mb-2">Title</label>
              <input
                id="alert-title"
                type="text"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Keg Price Update"
                maxLength={80}
                required
              />
              <p className="text-xs italic mt-1" style={{ color: 'var(--muted)' }}>
                Headline displayed at the top of the popup. Keep it short — under 60 characters.
              </p>
            </div>

            <div>
              <label htmlFor="alert-body" className="section-label block mb-2">Body</label>
              <textarea
                id="alert-body"
                className="input resize-y min-h-[140px]"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Tell customers what they need to know. Line breaks become paragraphs."
                maxLength={1000}
                required
              />
              <p className="text-xs italic mt-1" style={{ color: 'var(--muted)' }}>
                Plain text. Press Enter for a paragraph break. Up to 1000 characters.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
              <div>
                <label htmlFor="alert-endsat" className="section-label block mb-2">End Date <span className="text-xs italic font-normal" style={{ color: 'var(--muted)' }}>(optional)</span></label>
                <input
                  id="alert-endsat"
                  type="date"
                  className="input"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
                <p className="text-xs italic mt-1" style={{ color: 'var(--muted)' }}>
                  Auto-hides the popup after this day. Leave blank for no expiry.
                </p>
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer pb-3">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Active</span>
                </label>
              </div>
            </div>

            <div className="pt-2 border-t border-divider">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetDismissals}
                  onChange={(e) => setResetDismissals(e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer"
                />
                <span className="text-sm" style={{ color: 'var(--ink)' }}>
                  Reset dismissals
                  <span className="block text-xs italic mt-0.5" style={{ color: 'var(--muted)' }}>
                    Tick this when you want customers who already clicked &ldquo;Got it&rdquo; to see the alert again. Use sparingly — frequent re-shows train people to dismiss without reading.
                  </span>
                </span>
              </label>
            </div>
          </section>

          {/* Preview pane — mirrors the actual portal popup styling so admin
              sees what customers will get before publishing. */}
          <section>
            <span className="section-label mb-2 block">Preview</span>
            <div className="rounded-2xl border border-divider p-6 bg-charcoal-100 shadow-sm">
              <div className="max-w-md mx-auto bg-charcoal-100 rounded-2xl border border-gold/30">
                <div className="px-6 py-5 border-b border-white/[0.06]">
                  <span className="section-label" style={{ color: 'var(--brass)' }}>Important Notice</span>
                  <h3 className="font-heading text-xl font-bold text-cream mt-1">
                    {title || '(Title)'}
                  </h3>
                </div>
                <div className="px-6 py-5 text-sm text-cream/70 leading-relaxed whitespace-pre-line">
                  {body || '(Body — what customers will read.)'}
                </div>
                <div className="px-6 py-4 border-t border-white/[0.06] flex justify-end">
                  <span className="px-5 py-2 text-sm rounded font-semibold" style={{ background: 'var(--brass)', color: 'var(--paper)' }}>
                    Got it
                  </span>
                </div>
              </div>
            </div>
          </section>

          {error && (
            <p className="text-sm" style={{ color: 'var(--ruby)' }}>{error}</p>
          )}
          {success && (
            <p className="text-sm italic" style={{ color: 'var(--pine)' }}>{success}</p>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs italic" style={{ color: 'var(--muted)' }}>
              {alert ? `Last updated ${new Date(alert.updatedAt).toLocaleString()}` : 'No alert published yet.'}
            </p>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save & Publish'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
