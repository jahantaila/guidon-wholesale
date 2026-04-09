import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-charcoal flex flex-col overflow-hidden">
      {/* Navigation */}
      <header className="relative z-10 border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-20">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gold-gradient rounded-lg flex items-center justify-center shadow-gold">
              <span className="text-charcoal font-heading font-black text-xl">G</span>
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold text-cream tracking-wide">GUIDON BREWING</h1>
              <p className="text-[11px] uppercase tracking-[0.25em] text-gold/60 font-semibold">Veteran-Owned Craft Brewery</p>
            </div>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/order" className="btn-primary text-sm px-5 py-2">
              Order Kegs
            </Link>
            <Link href="/portal" className="btn-outline text-sm px-5 py-2 hidden sm:inline-flex">
              Customer Portal
            </Link>
            <Link href="/admin" className="btn-ghost text-sm hidden sm:inline-flex">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center relative px-6">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gold/[0.03] rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-olive/[0.05] rounded-full blur-3xl" />
          {/* Military-style diagonal lines */}
          <div className="absolute top-0 right-0 w-1/3 h-full opacity-[0.02]"
            style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 20px, #D4A843 20px, #D4A843 21px)' }}
          />
        </div>

        <div className="relative max-w-4xl text-center animate-fade-in">
          {/* Rank-style badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gold/20 bg-gold/[0.05] mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-gold" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gold/80">
              Louisville, Kentucky
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-gold" />
          </div>

          <h2 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-heading font-black text-cream mb-2 tracking-tight leading-[0.9]">
            CRAFT BEER
          </h2>
          <h2 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-heading font-black mb-8 tracking-tight leading-[0.9]">
            <span className="text-gradient-gold">WHOLESALE</span>
          </h2>

          {/* Decorative divider */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-gold/40" />
            <div className="w-2 h-2 rotate-45 border border-gold/40" />
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-gold/40" />
          </div>

          <p className="text-lg sm:text-xl text-cream/50 mb-12 max-w-2xl mx-auto leading-relaxed font-light">
            Premium craft beer from Louisville&apos;s veteran-owned brewery.
            Order kegs online, track deliveries, and manage your account.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/order" className="btn-primary text-lg px-10 py-4 rounded-xl shadow-gold-lg hover:shadow-gold-lg">
              Browse &amp; Order Kegs
            </Link>
            <Link href="/portal" className="btn-outline text-lg px-10 py-4 rounded-xl">
              Customer Portal
            </Link>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-8 mt-16 text-cream/30 text-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gold/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Veteran-Owned</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gold/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Same-Day Processing</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gold/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span>Keg Tracking</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-6 px-6 text-center">
        <p className="text-cream/20 text-sm">
          &copy; {new Date().getFullYear()} Guidon Brewing Company. All rights reserved.
        </p>
        <p className="mt-1 text-cream/15 text-xs uppercase tracking-widest">
          Proudly Veteran-Owned &bull; Louisville, Kentucky
        </p>
      </footer>
    </div>
  );
}
