import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guidon Brewing Wholesale",
  description: "Wholesale keg ordering and management for Guidon Brewing Company — veteran-owned craft brewery in Hendersonville, NC",
  keywords: ["craft beer", "wholesale", "kegs", "Hendersonville", "North Carolina", "brewery", "veteran-owned"],
  openGraph: {
    title: "Guidon Brewing Wholesale",
    description: "Wholesale keg ordering and management for Guidon Brewing Company",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-charcoal text-cream" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
