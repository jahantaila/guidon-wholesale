import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-charcoal flex flex-col">
      {/* Header bar */}
      <header className="relative z-10 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gold rounded-lg flex items-center justify-center">
              <span className="text-charcoal font-heading font-black text-xl">G</span>
            </div>
            <span className="font-heading font-black text-lg text-cream tracking-tight">GUIDON</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/apply" className="btn-ghost text-xs">
              Apply
            </Link>
            <Link href="/portal" className="btn-primary text-xs py-2 px-4">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center relative px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold/[0.04] rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-4xl w-full py-20 sm:py-28">
          <div className="mb-6">
            <span className="section-label">Veteran-Owned Craft Brewery &bull; Louisville, KY</span>
          </div>

          <h1 className="text-display-sm sm:text-display font-heading text-cream mb-6 max-w-3xl">
            Wholesale<br />
            <span className="text-gradient-gold">Ordering Portal</span>
          </h1>

          <p className="text-lg sm:text-xl text-cream/50 max-w-xl mb-10 leading-relaxed font-body">
            Order craft kegs direct from the brewery. Real-time inventory,
            keg tracking, and streamlined wholesale management.
          </p>

          <div className="flex flex-wrap gap-4 mb-16">
            <Link href="/portal" className="btn-primary text-base py-3.5 px-8">
              Customer Portal
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link href="/order" className="btn-outline text-base py-3.5 px-8">
              Quick Order
            </Link>
            <Link href="/admin" className="btn-secondary text-base py-3.5 px-8">
              Admin
            </Link>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-interactive group">
              <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="font-heading font-bold text-cream text-sm mb-1">8 Craft Beers on Tap</h3>
              <p className="text-xs text-cream/35 leading-relaxed">
                From session ales to bold IPAs. 1/2, 1/4, and 1/6 barrel kegs available.
              </p>
            </div>

            <div className="card-interactive group">
              <div className="w-10 h-10 rounded-lg bg-olive/20 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-olive-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="font-heading font-bold text-cream text-sm mb-1">Keg Tracking Built In</h3>
              <p className="text-xs text-cream/35 leading-relaxed">
                Track deposits, returns, and outstanding balances per customer in real time.
              </p>
            </div>

            <div className="card-interactive group">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-heading font-bold text-cream text-sm mb-1">Same-Day Processing</h3>
              <p className="text-xs text-cream/35 leading-relaxed">
                Orders placed before noon ship same day. Pay on delivery, no upfront charges.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-6 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-cream/20 text-xs">
            &copy; {new Date().getFullYear()} Guidon Brewing Company
          </p>
          <div className="flex items-center gap-6 text-cream/20 text-xs">
            <Link href="/apply" className="hover:text-cream/40 transition-colors">Become a Member</Link>
            <Link href="/portal" className="hover:text-cream/40 transition-colors">Customer Portal</Link>
            <Link href="/admin" className="hover:text-cream/40 transition-colors">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
