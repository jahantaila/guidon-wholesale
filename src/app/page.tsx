import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-charcoal flex flex-col items-center justify-center px-6">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gold/[0.03] rounded-full blur-[120px]" />
      </div>

      {/* Centered content */}
      <div className="relative text-center max-w-md w-full">
        <Image
          src="/logo.png"
          alt="Guidon Brewing"
          width={80}
          height={80}
          className="mx-auto mb-8 rounded-xl"
        />

        <h1 className="text-display-sm font-heading text-cream mb-3">
          Guidon Brewing
        </h1>
        <p className="text-cream/40 text-base mb-10 leading-relaxed">
          Wholesale keg ordering and management portal.
          Sign in to place orders or apply to become a wholesale customer.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/portal" className="btn-primary text-base py-3.5 px-8">
            Customer Login
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <Link href="/apply" className="btn-outline text-base py-3.5 px-8">
            Become a Customer
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 border-t border-white/[0.06] py-5 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-cream/15 text-xs">
            &copy; {new Date().getFullYear()} Guidon Brewing Company &bull; Veteran-Owned &bull; Louisville, KY
          </p>
          <Link href="/admin" className="text-cream/15 text-xs hover:text-cream/30 transition-colors">
            Admin
          </Link>
        </div>
      </footer>
    </div>
  );
}
