'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ApplyPage() {
  const [form, setForm] = useState({
    businessName: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    businessType: '',
    expectedMonthlyVolume: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.businessName.trim() || !form.contactName.trim() || !form.email.trim()) {
      setError('Business Name, Contact Name, and Email are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to submit application.');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-charcoal px-4 animate-fade-in relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-gold/[0.02] rounded-full blur-3xl" />
        </div>
        <div className="w-full max-w-md relative text-center">
          <div className="w-20 h-20 bg-emerald-500/20 border-2 border-emerald-500/40 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-heading font-black text-cream mb-3">Application Received</h1>
          <p className="text-cream/50 text-lg mb-8">
            Thank you for your interest in becoming a Guidon Brewing wholesale member. We will contact you within 24 hours.
          </p>
          <Link href="/" className="btn-primary px-8 py-3 text-lg">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-charcoal px-4 py-12 animate-fade-in relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-gold/[0.02] rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-lg relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gold-gradient rounded-xl flex items-center justify-center shadow-gold mx-auto mb-4">
            <span className="text-charcoal font-heading font-black text-2xl">G</span>
          </div>
          <h1 className="text-3xl font-heading font-black text-cream">Become a Wholesale Member</h1>
          <p className="mt-2 text-cream/30 text-sm">Fill out the form below and we&apos;ll get back to you within 24 hours.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label htmlFor="businessName" className="block text-sm font-semibold text-cream/60 mb-1.5">Business Name *</label>
            <input id="businessName" type="text" className="input" placeholder="Your business name"
              value={form.businessName} onChange={(e) => update('businessName', e.target.value)} />
          </div>

          <div>
            <label htmlFor="contactName" className="block text-sm font-semibold text-cream/60 mb-1.5">Contact Name *</label>
            <input id="contactName" type="text" className="input" placeholder="Your full name"
              value={form.contactName} onChange={(e) => update('contactName', e.target.value)} />
          </div>

          <div>
            <label htmlFor="applyEmail" className="block text-sm font-semibold text-cream/60 mb-1.5">Email *</label>
            <input id="applyEmail" type="email" className="input" placeholder="you@example.com"
              value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-semibold text-cream/60 mb-1.5">Phone</label>
            <input id="phone" type="tel" className="input" placeholder="(502) 555-0000"
              value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-semibold text-cream/60 mb-1.5">Address</label>
            <input id="address" type="text" className="input" placeholder="Street address, city, state, zip"
              value={form.address} onChange={(e) => update('address', e.target.value)} />
          </div>

          <div>
            <label htmlFor="businessType" className="block text-sm font-semibold text-cream/60 mb-1.5">Type of Business</label>
            <select id="businessType" className="input" value={form.businessType} onChange={(e) => update('businessType', e.target.value)}>
              <option value="">Select type...</option>
              <option value="bar">Bar</option>
              <option value="restaurant">Restaurant</option>
              <option value="bottle_shop">Bottle Shop</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="volume" className="block text-sm font-semibold text-cream/60 mb-1.5">Expected Monthly Volume</label>
            <select id="volume" className="input" value={form.expectedMonthlyVolume} onChange={(e) => update('expectedMonthlyVolume', e.target.value)}>
              <option value="">Select volume...</option>
              <option value="1-5 kegs">1-5 kegs</option>
              <option value="6-15 kegs">6-15 kegs</option>
              <option value="16-30 kegs">16-30 kegs</option>
              <option value="31-50 kegs">31-50 kegs</option>
              <option value="50+ kegs">50+ kegs</option>
            </select>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">{error}</p>}

          <button type="submit" className="btn-primary w-full py-3 text-lg" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>

        <p className="text-center mt-6 text-cream/20 text-xs">
          <Link href="/" className="hover:text-cream/40 transition-colors">&larr; Back to Guidon Brewing</Link>
        </p>
      </div>
    </div>
  );
}
