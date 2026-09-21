import type { Metadata, Viewport } from 'next';
import './globals.css';
import './polish.css';
import './experience.css';
import './final-polish.css';
import './player.css';
import { Header } from '@/components/Header';
import { Brand } from '@/components/Brand';
import Link from 'next/link';
import Script from 'next/script';
import { Analytics } from '@/components/Analytics';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.animori.bond'),
  title: { default: 'Animori', template: '%s · Animori' },
  description: 'Find your next anime. Explore new episodes, save your favorites, and pick up where you left off.',
  applicationName: 'Animori',
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', sizes: 'any' }], apple: '/apple-touch-icon.svg' },
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  openGraph: { type: 'website', siteName: 'Animori', title: 'Animori', description: 'Find your next anime. Explore new episodes and save your favorites.', url: '/' },
  twitter: { card: 'summary_large_image', title: 'Animori', description: 'Find your next anime. Explore new episodes and save your favorites.' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0B0C0E' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Analytics/><a href="#main-content" className="skipLink">Skip to content</a><Header/><main id="main-content" tabIndex={-1}>{children}</main><footer className="footer"><Link href="/" aria-label="Animori home"><Brand/></Link><nav aria-label="Footer navigation"><Link href="/browse">Browse anime</Link><Link href="/schedule">Release schedule</Link><Link href="/my-list">My List</Link><a href="mailto:hello@animori.bond">Contact</a></nav></footer><Script id="cloudflare-web-analytics" type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"622ad87d5197446aaa22d280f004c6c2"}' strategy="afterInteractive"/></body></html>;
}
