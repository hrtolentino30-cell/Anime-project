import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Play } from 'lucide-react';
import type { Anime } from '@/lib/types';

export function Hero({ anime }: { anime?: Anime }) {
  if (!anime) return <section className="hero emptyHero"><div className="heroContent"><p className="eyebrow">WELCOME TO ANIMORI</p><h1>Your next story awaits.</h1><p className="heroDescription">The catalog is taking a moment to load. Explore anime or check back soon.</p><Link className="primaryBtn" href="/browse">Explore anime <ArrowUpRight size={18} /></Link></div></section>;
  const artwork = anime.banner_url || anime.poster_url;
  return <section className="hero" aria-label="Featured anime">
    {artwork && <Image src={artwork} alt="" fill preload sizes="(max-width: 900px) 100vw, 70vw" className="heroImage" />}
    <div className="heroGradient" />
    <div className="heroContent">
      <p className="eyebrow"><span className="featureRule" />IN THE SPOTLIGHT</p>
      <h1>{anime.title}</h1>
      <p className="heroMeta">{[anime.type, anime.year, anime.status, anime.rating ? `★ ${Number(anime.rating).toFixed(1)}` : null].filter(Boolean).join('  ·  ')}</p>
      <p className="heroDescription">{anime.description}</p>
      <div className="heroButtons">
        <Link className="primaryBtn" href={`/anime/${anime.slug}`}>{anime.latest_episode ? <><Play size={17} fill="currentColor" aria-hidden="true" />Watch anime</> : <>Explore series <ArrowUpRight size={17} aria-hidden="true" /></>}</Link>
        <Link className="heroBrowse" href="/browse">Browse the catalog <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
    </div>
  </section>;
}
