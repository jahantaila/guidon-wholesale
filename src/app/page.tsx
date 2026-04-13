import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="bg-charcoal flex flex-col items-center px-6 py-16">
      {/* Centered content */}
      <div className="text-center max-w-sm w-full animate-fade-in">
        <div className="relative inline-block mb-8">
          <div className="absolute inset-0 bg-gold/20 rounded-2xl blur-xl scale-110" />
          <Image
            src="/logo.png"
            alt="Guidon Brewing"
            width={72}
            height={72}
            className="relative rounded-2xl"
          />
        </div>

        <h1 className="text-2xl font-heading text-cream mb-2">
          Guidon Brewing
        </h1>
        <p className="text-cream/35 text-sm mb-10 leading-relaxed max-w-xs mx-auto">
          Wholesale keg ordering and management.
          Sign in or apply to become a wholesale customer.
        </p>

        <div className="flex flex-col gap-3">
          <Link href="/portal" className="btn-primary text-sm py-3.5 px-6 w-full">
            Customer Login
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <Link href="/apply" className="btn-outline text-sm py-3.5 px-6 w-full">
            Become a Customer
          </Link>
        </div>

        <Link href="/admin" className="inline-block mt-10 text-cream/[0.08] text-[10px] hover:text-cream/20 transition-colors duration-300">
          Admin
        </Link>
      </div>
    </div>
  );
}
