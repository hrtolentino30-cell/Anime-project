import type { Metadata, Viewport } from 'next';
import './globals.css';
import './polish.css';
import { Header } from '@/components/Header';

export const metadata: Metadata = {
  metadataBase: new URL('https://animori.vercel.app'),
  title: {
    default: 'Animori',
    template: '%s · Animori',
  },
  description: 'Discover and watch anime from a catalog that stays synchronized automatically.',
  applicationName: 'Animori',
  openGraph: {
    type: 'website',
    siteName: 'Animori',
    title: 'Animori',
    description: 'Discover and watch anime from a catalog that stays synchronized automatically.',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Animori',
    description: 'Discover and watch anime from a catalog that stays synchronized automatically.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#07090e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
        <footer className="footer">
          <div className="brand">
            <span className="brandMark">A</span>
            <span>ANI<span>MORI</span></span>
          </div>
          <p>Your anime catalog, kept fresh automatically.</p>
        </footer>
      </body>
    </html>
  );
}
