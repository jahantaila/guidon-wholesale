import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="bg-olive text-cream py-4 px-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold tracking-wide">Guidon Brewing</h1>
            <p className="text-cream-200 text-sm">Veteran-Owned Craft Brewery &bull; Louisville, KY</p>
          </div>
          <nav className="flex gap-4">
            <Link href="/order" className="btn-secondary text-sm">
              Order Kegs
            </Link>
            <Link href="/portal" className="btn-outline border-cream text-cream hover:bg-cream hover:text-olive text-sm">
              Customer Portal
            </Link>
            <Link href="/admin" className="text-cream-200 hover:text-white text-sm py-2.5">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-3xl text-center animate-fade-in">
          <h2 className="text-5xl md:text-6xl font-heading font-bold text-olive mb-6">
            Craft Beer,<br />
            <span className="text-amber">Wholesale</span>
          </h2>
          <p className="text-lg text-brown-700 mb-10 max-w-xl mx-auto">
            Premium craft beer from Louisville&apos;s veteran-owned brewery.
            Order kegs online, track your deliveries, and manage your account.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/order" className="btn-primary text-lg px-10 py-3">
              Browse &amp; Order Kegs
            </Link>
            <Link href="/portal" className="btn-outline text-lg px-10 py-3">
              Customer Portal
            </Link>
          </div>
        </div>
      </main>

      <footer className="bg-brown text-cream-200 py-6 px-6 text-center text-sm">
        <p>&copy; {new Date().getFullYear()} Guidon Brewing Company. All rights reserved.</p>
        <p className="mt-1 text-cream-300">Proudly veteran-owned &bull; Louisville, Kentucky</p>
      </footer>
    </div>
  );
}
