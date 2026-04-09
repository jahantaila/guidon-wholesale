import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Guidon Brewing Wholesale',
  robots: 'noindex',
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="embed-mode">{children}</div>;
}
