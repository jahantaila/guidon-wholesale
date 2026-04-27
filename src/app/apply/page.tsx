'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { US_STATES } from '@/lib/utils';
export default function ApplyPage() {
  const [form, setForm] = useState({
    businessName: '',
    contactName: '',
    email: '',
    phone: '',
    streetAddress: '',
    city: '',
    state: '',
    zip: '',
    abcPermitNumber: '',
    businessType: '',
    expectedMonthlyVolume: '',
    // Default matches the server's fallback. 'no_preference' is an explicit
    // value so admin can tell "applicant picked no preference" from "field
    // was blank on an old app."
    preferredPaymentMethod: 'no_preference' as 'check' | 'fintech' | 'no_preference',
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
    // Required-field gate. Mirrors server-side validation in /api/applications
    // POST so the user gets an inline message instead of a 400 toast.
    const missing: string[] = [];
    if (!form.businessName.trim()) missing.push('Business Name');
    if (!form.contactName.trim()) missing.push('Contact Name');
    if (!form.email.trim()) missing.push('Email');
    if (!form.phone.trim()) missing.push('Phone');
    if (!form.abcPermitNumber.trim()) missing.push('ABC Permit Number');
    if (!form.streetAddress.trim()) missing.push('Street Address');
    if (!form.city.trim()) missing.push('City');
    if (!form.state.trim()) missing.push('State');
    if (!form.zip.trim()) missing.push('Zip');
    if (missing.length > 0) {
      setError(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required.`);
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
            Thank you for your interest in becoming a Guidon Brewing Co. wholesale member.
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
          <Image src="/logo.png" alt="Guidon Brewing Co." width={350} height={194} className="h-8 w-auto rounded-lg" />
          <span className="font-heading font-bold text-sm text-cream tracking-wide">GUIDON BREWING CO.</span>
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
                <input id="businessName" type="text" required autoComplete="organization" className="input" placeholder="Your business name"
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
                <label htmlFor="abcPermitNumber" className="block text-sm font-medium text-cream/50 mb-1.5">ABC Permit Number *</label>
                <input id="abcPermitNumber" type="text" required className="input" placeholder="e.g. NC-12345"
                  value={form.abcPermitNumber} onChange={(e) => update('abcPermitNumber', e.target.value)} />
              </div>
              <div>
                <label htmlFor="streetAddress" className="block text-sm font-medium text-cream/50 mb-1.5">Street Address *</label>
                <input id="streetAddress" type="text" required autoComplete="street-address" className="input" placeholder="123 Main St"
                  value={form.streetAddress} onChange={(e) => update('streetAddress', e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label htmlFor="city" className="block text-sm font-medium text-cream/50 mb-1.5">City *</label>
                  <input id="city" type="text" required autoComplete="address-level2" className="input" placeholder="Asheville"
                    value={form.city} onChange={(e) => update('city', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-cream/50 mb-1.5">State *</label>
                  <select id="state" required autoComplete="address-level1" className="input"
                    value={form.state} onChange={(e) => update('state', e.target.value)}>
                    <option value="">Select...</option>
                    {US_STATES.map((s) => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="zip" className="block text-sm font-medium text-cream/50 mb-1.5">Zip *</label>
                  <input id="zip" type="text" required autoComplete="postal-code" className="input" placeholder="28801"
                    value={form.zip} onChange={(e) => update('zip', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.04] pt-5">
            <span className="section-label mb-3 block">Contact Details</span>
            <div className="space-y-3">
              <div>
                <label htmlFor="contactName" className="block text-sm font-medium text-cream/50 mb-1.5">Contact Name *</label>
                <input id="contactName" type="text" required autoComplete="name" className="input" placeholder="Your full name"
                  value={form.contactName} onChange={(e) => update('contactName', e.target.value)} />
              </div>
              <div>
                <label htmlFor="applyEmail" className="block text-sm font-medium text-cream/50 mb-1.5">Email *</label>
                <input id="applyEmail" type="email" required autoComplete="email" className="input" placeholder="you@example.com"
                  value={form.email} onChange={(e) => update('email', e.target.value)} />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-cream/50 mb-1.5">Phone *</label>
                <input id="phone" type="tel" required autoComplete="tel" className="input" placeholder="(828) 555-0000"
                  value={form.phone} onChange={(e) => update('phone', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.04] pt-5">
            <span className="section-label mb-3 block">Preferred Payment Method</span>
            <p className="text-xs text-cream/35 mb-3">How do you plan to pay invoices? Helps us set up your account faster. You can change later.</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'check', label: 'Check', hint: 'Paper check' },
                { value: 'fintech', label: 'Fintech', hint: 'ACH / Zelle / card' },
                { value: 'no_preference', label: 'Either', hint: 'No preference' },
              ] as const).map((opt) => {
                const selected = form.preferredPaymentMethod === opt.value;
                return (
                  <label
                    key={opt.value}
                    className="cursor-pointer text-center rounded-xl border px-3 py-3 transition-all"
                    style={{
                      background: selected ? 'color-mix(in srgb, var(--brass) 14%, transparent)' : 'transparent',
                      borderColor: selected ? 'color-mix(in srgb, var(--brass) 55%, transparent)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <input
                      type="radio"
                      name="preferredPaymentMethod"
                      value={opt.value}
                      checked={selected}
                      onChange={() => update('preferredPaymentMethod', opt.value)}
                      className="sr-only"
                    />
                    <div className="text-sm font-heading font-bold text-cream">{opt.label}</div>
                    <div className="text-[10px] text-cream/40 mt-0.5">{opt.hint}</div>
                  </label>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3 border border-red-500/20">{error}</p>}

          <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </div>
      </form>

      <p className="text-center mt-8 text-cream/15 text-xs">
        <Link href="/" className="hover:text-cream/30 transition-colors">&larr; Back to Guidon Brewing Co.</Link>
      </p>
    </div>
  );
}
