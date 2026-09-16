import Image from 'next/image';
import Link from 'next/link';
import type { Anime } from '@/lib/types';
export function AnimeCard({anime,badge}:{anime:Partial<Anime>&{id?:string;slug:string;title:string;poster_url?:string|null};badge?:string}){
  return <Link href={`/anime/${anime.slug}`} className="animeCard"><div className="posterWrap">{anime.poster_url?<Image src={anime.poster_url} alt={anime.title} fill sizes="(max-width:700px) 46vw,(max-width:1100px) 23vw,180px" className="poster"/>:<div className="posterFallback">{anime.title.slice(0,1)}</div>}<div className="posterShade"/>{badge&&<span className="episodeBadge">{badge}</span>}{anime.type&&<span className="typeBadge">{anime.type}</span>}</div><div className="cardBody"><h3>{anime.title}</h3><p>{[anime.year,anime.status,anime.rating?`★ ${Number(anime.rating).toFixed(1)}`:null].filter(Boolean).join(' · ')}</p></div></Link>;
}
