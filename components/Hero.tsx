import Image from 'next/image'; import Link from 'next/link'; import { Play, Info } from 'lucide-react';
export function Hero({anime}:{anime:any}){
  if(!anime)return <section className="hero emptyHero"><div><p className="eyebrow">AUTO-SYNCED CATALOG</p><h1>Your anime library is ready to ingest.</h1><p>Run the protected bootstrap import from Admin after connecting Supabase.</p></div></section>;
  const bg=anime.banner_url||anime.poster_url;
  return <section className="hero">{bg&&<Image src={bg} alt="" fill priority sizes="100vw" className="heroImage"/>}<div className="heroGradient"/><div className="heroContent"><p className="eyebrow">FEATURED · {anime.season??'LATEST'}</p><h1>{anime.title}</h1><p className="heroMeta">{[anime.type,anime.year,anime.status,anime.rating?`★ ${anime.rating}`:null].filter(Boolean).join(' · ')}</p><p className="heroDescription">{anime.description}</p><div className="heroButtons">{anime.latest_episode&&<Link className="primaryBtn" href={`/anime/${anime.slug}`}><Play size={18} fill="currentColor"/> Watch now</Link>}<Link className="ghostBtn" href={`/anime/${anime.slug}`}><Info size={18}/> Details</Link></div></div></section>
}
