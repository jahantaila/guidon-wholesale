import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guidon Brewing Wholesale",
  description: "Wholesale keg ordering and management for Guidon Brewing Company - Veteran-owned craft brewery in Louisville, KY",
  keywords: ["craft beer", "wholesale", "kegs", "Louisville", "Kentucky", "brewery"],
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
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
