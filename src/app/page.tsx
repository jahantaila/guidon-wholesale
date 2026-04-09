import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-charcoal flex flex-col overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gold/[0.03] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-olive/[0.05] rounded-full blur-3xl" />
        <div className="absolute top-0 right-0 w-1/3 h-full opacity-[0.02]"
          style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 20px, #D4A843 20px, #D4A843 21px)' }}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center relative px-6">
        <div className="relative max-w-3xl w-full text-center animate-fade-in">
          {/* Logo */}
          <div className="w-20 h-20 bg-gold-gradient rounded-2xl flex items-center justify-center shadow-gold-lg mx-auto mb-6">
            <span className="text-charcoal font-heading font-black text-4xl">G</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-heading font-black text-cream mb-2 tracking-tight leading-[0.9]">
            GUIDON BREWING
          </h1>
          <p className="text-lg sm:text-xl text-gold/70 font-heading font-semibold tracking-wide mb-2">
            WHOLESALE PORTAL
          </p>

          {/* Location badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gold/20 bg-gold/[0.05] mb-12">
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-gold" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gold/80">
              Veteran-Owned &bull; Louisville, Kentucky
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-gold" />
          </div>

          {/* 3 CTA Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-2xl mx-auto">
            {/* Customer Portal */}
            <Link href="/portal"
              className="group relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gold/30 bg-gold/[0.05] hover:bg-gold/[0.12] hover:border-gold/60 transition-all duration-300 hover:shadow-gold-lg"
            >
              <div className="w-14 h-14 rounded-xl bg-gold-gradient flex items-center justify-center shadow-gold group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-heading font-black text-cream group-hover:text-gold transition-colors">
                  Customer Portal
                </h2>
                <p className="text-xs text-cream/40 mt-1 leading-relaxed">
                  Browse products, place orders &amp; track deliveries
                </p>
              </div>
            </Link>

            {/* Admin Dashboard */}
            <Link href="/admin"
              className="group relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-olive/30 bg-olive/[0.05] hover:bg-olive/[0.12] hover:border-olive/60 transition-all duration-300 hover:shadow-gold-lg"
            >
              <div className="w-14 h-14 rounded-xl bg-olive flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-cream" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-heading font-black text-cream group-hover:text-gold transition-colors">
                  Admin Dashboard
                </h2>
                <p className="text-xs text-cream/40 mt-1 leading-relaxed">
                  Manage orders, customers &amp; keg inventory
                </p>
              </div>
            </Link>

            {/* Become a Wholesale Member */}
            <Link href="/apply"
              className="group relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gold/30 bg-charcoal-100 hover:bg-gold/[0.08] hover:border-gold/50 transition-all duration-300 hover:shadow-gold-lg"
            >
              <div className="w-14 h-14 rounded-xl bg-charcoal-200 border-2 border-gold/40 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-heading font-black text-cream group-hover:text-gold transition-colors">
                  Become a Member
                </h2>
                <p className="text-xs text-cream/40 mt-1 leading-relaxed">
                  Apply for a wholesale account today
                </p>
              </div>
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
