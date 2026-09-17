import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Anime } from '@/lib/types';

export function AnimeCard({ anime, badge }: { anime: Partial<Anime> & { slug: string; title: string }; badge?: string }) {
  return <Link href={`/anime/${anime.slug}`} className="animeCard">
    <div className="posterWrap">
      {anime.poster_url ? <Image src={anime.poster_url} alt="" fill sizes="(max-width: 600px) 45vw, (max-width: 1100px) 23vw, 210px" className="poster" /> : <div className="posterFallback" aria-hidden="true">{anime.title.slice(0, 1)}</div>}
      <div className="posterShade" />
      {badge && <span className="episodeBadge">{badge}</span>}
      {anime.type && <span className="typeBadge">{anime.type}</span>}
      <span className="cardExplore" aria-hidden="true"><ArrowUpRight size={22} /></span>
    </div>
    <div className="cardBody"><h3>{anime.title}</h3><p>{[anime.year, anime.status, anime.rating ? `★ ${Number(anime.rating).toFixed(1)}` : null].filter(Boolean).join(' · ')}</p></div>
  </Link>;
}
