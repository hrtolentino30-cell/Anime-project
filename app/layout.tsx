import type { Metadata, Viewport } from 'next';
import './globals.css';
import './polish.css';
import './experience.css';
import './final-polish.css';
import { Header } from '@/components/Header';
import { Brand } from '@/components/Brand';
import Link from 'next/link';

export const metadata: Metadata = {
  metadataBase: new URL('https://animori.vercel.app'),
  title: { default: 'Animori', template: '%s · Animori' },
  description: 'Find your next anime. Explore new episodes, save your favorites, and pick up where you left off.',
  applicationName: 'Animori',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  openGraph: { type: 'website', siteName: 'Animori', title: 'Animori', description: 'Find your next anime. Explore new episodes and save your favorites.', url: '/' },
  twitter: { card: 'summary_large_image', title: 'Animori', description: 'Find your next anime. Explore new episodes and save your favorites.' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0c0d0f' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><a href="#main-content" className="skipLink">Skip to content</a><Header/><main id="main-content" tabIndex={-1}>{children}</main><footer className="footer"><Link href="/" aria-label="Animori home"><Brand/></Link><nav aria-label="Footer navigation"><Link href="/browse">Browse anime</Link><Link href="/schedule">Release schedule</Link><Link href="/my-list">My List</Link></nav></footer></body></html>;
}
