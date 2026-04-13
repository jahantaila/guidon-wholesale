'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type EmbedType = 'order' | 'portal';

const EMBED_OPTIONS: { key: EmbedType; label: string; description: string; path: string }[] = [
  {
    key: 'order',
    label: 'Order Widget',
    description: 'Embeddable product catalog and ordering form. Customers can browse beers, add to cart, and place wholesale orders directly from your website.',
    path: '/embed/order',
  },
  {
    key: 'portal',
    label: 'Customer Portal',
    description: 'Full customer portal with login, order history, keg balances, and product browsing. Best for a dedicated wholesale page on your site.',
    path: '/embed/portal',
  },
];

export default function EmbedPage() {
  const [selectedType, setSelectedType] = useState<EmbedType>('order');
  const [copied, setCopied] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://guidon-wholesale.vercel.app');

  const selected = EMBED_OPTIONS.find((o) => o.key === selectedType)!;
  const embedUrl = `${baseUrl}${selected.path}`;

  const iframeCode = `<!-- Guidon Brewing Wholesale ${selected.label} -->
<div id="guidon-wholesale-embed">
  <iframe
    src="${embedUrl}"
    style="width:100%;border:none;min-height:600px;"
    id="guidon-frame"
    allow="clipboard-write"
  ></iframe>
</div>
<script>
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'guidon-resize') {
      var frame = document.getElementById('guidon-frame');
      if (frame) frame.style.height = e.data.height + 'px';
    }
  });
</script>`;

  const wordpressCode = `<!-- Add this to a WordPress page using a Custom HTML block -->
${iframeCode}`;

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-charcoal px-4 py-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <Link href="/" className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-gold rounded-lg flex items-center justify-center">
            <span className="text-charcoal font-heading font-black text-lg">G</span>
          </div>
          <span className="font-heading font-bold text-sm text-cream tracking-wide">GUIDON BREWING</span>
        </Link>

        <span className="section-label mb-2 block">Website Integration</span>
        <h1 className="text-display-sm font-heading text-cream mb-3">Embed Code</h1>
        <p className="text-cream/40 text-base leading-relaxed mb-10 max-w-xl">
          Add the Guidon Brewing wholesale ordering experience directly to your website.
          Choose a widget type below and copy the embed code.
        </p>

        {/* Type selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {EMBED_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSelectedType(opt.key)}
              className={cn(
                'card-interactive text-left p-5 cursor-pointer',
                selectedType === opt.key && 'border-gold/40 bg-gold/5'
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  'w-3 h-3 rounded-full border-2 transition-all',
                  selectedType === opt.key ? 'border-gold bg-gold' : 'border-cream/20'
                )} />
                <h3 className="font-heading font-bold text-sm text-cream">{opt.label}</h3>
              </div>
              <p className="text-xs text-cream/30 leading-relaxed pl-6">{opt.description}</p>
            </button>
          ))}
        </div>

        {/* Base URL */}
        <div className="mb-6">
          <span className="section-label mb-2 block">Your App URL</span>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value.replace(/\/$/, ''))}
            className="input max-w-md"
            placeholder="https://your-domain.com"
          />
          <p className="text-xs text-cream/20 mt-1.5">
            Change this if your app is deployed to a custom domain.
          </p>
        </div>

        {/* HTML Embed Code */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">HTML / Custom Website</span>
            <button
              onClick={() => handleCopy(iframeCode)}
              className={cn('btn-ghost text-xs px-3 py-1.5 rounded-lg border', copied ? 'border-emerald-500/30 text-emerald-400' : 'border-white/[0.08] text-cream/40')}
            >
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
          <div className="bg-charcoal-200 border border-white/[0.08] rounded-xl p-4 overflow-x-auto">
            <pre className="text-xs text-cream/50 font-mono whitespace-pre leading-relaxed">{iframeCode}</pre>
          </div>
        </div>

        {/* WordPress Code */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">WordPress (Custom HTML Block)</span>
            <button
              onClick={() => handleCopy(wordpressCode)}
              className="btn-ghost text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] text-cream/40"
            >
              Copy Code
            </button>
          </div>
          <div className="bg-charcoal-200 border border-white/[0.08] rounded-xl p-4 overflow-x-auto">
            <pre className="text-xs text-cream/50 font-mono whitespace-pre leading-relaxed">{wordpressCode}</pre>
          </div>
        </div>

        {/* Preview */}
        <div>
          <span className="section-label mb-3 block">Preview</span>
          <div className="card p-0 overflow-hidden">
            <div className="bg-charcoal-200 px-4 py-2 border-b border-white/[0.06] flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
              </div>
              <span className="text-[10px] text-cream/20 font-mono ml-2">{embedUrl}</span>
            </div>
            <iframe
              src={selected.path}
              className="w-full border-none"
              style={{ minHeight: '500px' }}
              title={`Preview: ${selected.label}`}
            />
          </div>
        </div>

        {/* Help */}
        <div className="mt-10 card">
          <h3 className="font-heading font-bold text-sm text-cream mb-3">Integration Notes</h3>
          <ul className="space-y-2 text-xs text-cream/35 leading-relaxed">
            <li className="flex gap-2">
              <span className="text-gold shrink-0">1.</span>
              The iframe auto-resizes to fit its content using postMessage. No fixed height needed.
            </li>
            <li className="flex gap-2">
              <span className="text-gold shrink-0">2.</span>
              For WordPress, paste the code into a <strong className="text-cream/50">Custom HTML</strong> block on any page.
            </li>
            <li className="flex gap-2">
              <span className="text-gold shrink-0">3.</span>
              The embed uses a transparent background and inherits your site&apos;s scroll behavior.
            </li>
            <li className="flex gap-2">
              <span className="text-gold shrink-0">4.</span>
              Orders placed through the embed go through the same system as the main portal.
            </li>
          </ul>
        </div>

        <p className="text-center mt-8 text-cream/15 text-xs">
          <Link href="/" className="hover:text-cream/30 transition-colors">&larr; Back to Guidon Brewing</Link>
        </p>
      </div>
    </div>
  );
}
