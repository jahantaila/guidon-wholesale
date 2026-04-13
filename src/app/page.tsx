import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="bg-charcoal flex flex-col items-center px-6 py-12">
      {/* Centered content */}
      <div className="text-center max-w-sm w-full">
        <Image
          src="/logo.png"
          alt="Guidon Brewing"
          width={64}
          height={64}
          className="mx-auto mb-6 rounded-xl"
        />

        <h1 className="text-2xl font-heading text-cream mb-2">
          Guidon Brewing
        </h1>
        <p className="text-cream/40 text-sm mb-8 leading-relaxed">
          Wholesale keg ordering and management.
          Sign in or apply to become a wholesale customer.
        </p>

        <div className="flex flex-col gap-3">
          <Link href="/portal" className="btn-primary text-sm py-3 px-6 w-full">
            Customer Login
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <Link href="/apply" className="btn-outline text-sm py-3 px-6 w-full">
            Become a Customer
          </Link>
        </div>

        <Link href="/admin" className="inline-block mt-8 text-cream/10 text-[10px] hover:text-cream/25 transition-colors">
          Admin
        </Link>
      </div>
    </div>
  );
}
