'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
      <div className="min-h-screen flex items-center justify-center bg-charcoal px-4 animate-fade-in">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-display-sm font-heading text-cream mb-3">Application Received</h1>
          <p className="text-cream/40 text-base mb-8 leading-relaxed">
            Thank you for your interest in becoming a Guidon Brewing wholesale member.
            We&apos;ll be in touch within 24 hours.
          </p>
          <Link href="/" className="btn-primary py-3 px-8">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal px-4 py-12">
      {/* Header */}
      <header className="max-w-lg mx-auto mb-8">
        <Link href="/" className="flex items-center gap-3 mb-8">
          <Image src="/logo.png" alt="Guidon Brewing" width={36} height={36} className="rounded-lg" />
          <span className="font-heading font-bold text-sm text-cream tracking-wide">GUIDON BREWING</span>
        </Link>

        <span className="section-label mb-2 block">Wholesale Application</span>
        <h1 className="text-display-sm font-heading text-cream mb-3">
          Become a Member
        </h1>
        <p className="text-cream/40 text-base leading-relaxed">
          Fill out the form below to apply for a wholesale account.
          We&apos;ll review your application and get back to you within 24 hours.
        </p>
      </header>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto">
        <div className="card space-y-5">
          <div>
            <span className="section-label mb-3 block">Business Information</span>
            <div className="space-y-3">
              <div>
                <label htmlFor="businessName" className="block text-sm font-medium text-cream/50 mb-1.5">Business Name *</label>
                <input id="businessName" type="text" className="input" placeholder="Your business name"
                  value={form.businessName} onChange={(e) => update('businessName', e.target.value)} />
              </div>
              <div>
                <label htmlFor="businessType" className="block text-sm font-medium text-cream/50 mb-1.5">Type of Business</label>
                <select id="businessType" className="input" value={form.businessType} onChange={(e) => update('businessType', e.target.value)}>
                  <option value="">Select type...</option>
                  <option value="bar">Bar</option>
                  <option value="restaurant">Restaurant</option>
                  <option value="bottle_shop">Bottle Shop</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-cream/50 mb-1.5">Address</label>
                <input id="address" type="text" className="input" placeholder="Street address, city, state, zip"
                  value={form.address} onChange={(e) => update('address', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.04] pt-5">
            <span className="section-label mb-3 block">Contact Details</span>
            <div className="space-y-3">
              <div>
                <label htmlFor="contactName" className="block text-sm font-medium text-cream/50 mb-1.5">Contact Name *</label>
                <input id="contactName" type="text" className="input" placeholder="Your full name"
                  value={form.contactName} onChange={(e) => update('contactName', e.target.value)} />
              </div>
              <div>
                <label htmlFor="applyEmail" className="block text-sm font-medium text-cream/50 mb-1.5">Email *</label>
                <input id="applyEmail" type="email" className="input" placeholder="you@example.com"
                  value={form.email} onChange={(e) => update('email', e.target.value)} />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-cream/50 mb-1.5">Phone</label>
                <input id="phone" type="tel" className="input" placeholder="(502) 555-0000"
                  value={form.phone} onChange={(e) => update('phone', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.04] pt-5">
            <span className="section-label mb-3 block">Volume</span>
            <div>
              <label htmlFor="volume" className="block text-sm font-medium text-cream/50 mb-1.5">Expected Monthly Volume</label>
              <select id="volume" className="input" value={form.expectedMonthlyVolume} onChange={(e) => update('expectedMonthlyVolume', e.target.value)}>
                <option value="">Select volume...</option>
                <option value="1-5 kegs">1-5 kegs</option>
                <option value="6-15 kegs">6-15 kegs</option>
                <option value="16-30 kegs">16-30 kegs</option>
                <option value="31-50 kegs">31-50 kegs</option>
                <option value="50+ kegs">50+ kegs</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3 border border-red-500/20">{error}</p>}

          <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </div>
      </form>

      <p className="text-center mt-8 text-cream/15 text-xs">
        <Link href="/" className="hover:text-cream/30 transition-colors">&larr; Back to Guidon Brewing</Link>
      </p>
    </div>
  );
}
