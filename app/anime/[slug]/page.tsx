import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Play } from 'lucide-react';
import type { Metadata } from 'next';
import { getAnimeBySlug } from '@/lib/data';
import { FavoriteButton } from '@/components/FavoriteButton';
import { AnimeCard } from '@/components/AnimeCard';
import { Analytics } from '@/components/Analytics';
export const revalidate=60;

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
 const {slug}=await params,data=await getAnimeBySlug(slug);if(!data)return{title:'Anime not found',robots:{index:false,follow:false}};
 const a=data.anime,description=(a.description||`Explore ${a.title}, episodes, cast and series information on Animori.`).replace(/\\s+/g,' ').trim().slice(0,160),canonical=`/anime/${a.slug}`,images=a.poster_url?[{url:a.poster_url,alt:`${a.title} anime poster`}]:undefined;
 return{title:a.title,description,alternates:{canonical},openGraph:{type:'website',url:canonical,title:a.title,description,images},twitter:{card:'summary_large_image',title:a.title,description,images:a.poster_url?[a.poster_url]:undefined}};
}

export default async function AnimePage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const data=await getAnimeBySlug(slug);
  if(!data)notFound();
  const {anime,episodes,related}=data;
  const first=episodes[0];
  const art=anime.banner_url||anime.poster_url;
  const altTitles=(anime.anime_titles??[]).map((x:any)=>x.title).filter((x:string)=>x&&x!==anime.title);
  const genres=(anime.anime_genres??[]).map((x:any)=>x.genres).filter(Boolean);
  const studios=(anime.anime_studios??[]).map((x:any)=>x.studios).filter(Boolean);
  const cast=(anime.anime_characters??[]).filter((x:any)=>x.characters).slice(0,12);
  const jsonLd={ '@context':'https://schema.org','@type':'TVSeries',name:anime.title,alternateName:altTitles.length?altTitles:undefined,description:anime.description||undefined,image:anime.poster_url?[anime.poster_url]:undefined,url:`https://www.animori.bond/anime/${anime.slug}`,genre:genres.map((g:any)=>g.name),datePublished:anime.year?`${anime.year}`:undefined,numberOfEpisodes:episodes.length||anime.total_episodes||undefined };


  const breadcrumbs={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:'https://www.animori.bond/'},{'@type':'ListItem',position:2,name:'Browse',item:'https://www.animori.bond/browse'},{'@type':'ListItem',position:3,name:anime.title,item:`https://www.animori.bond/anime/${anime.slug}`}]};
  return <div className="detailPage"><Analytics eventName="anime_view" animeId={anime.id}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,'\\u003c')}}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(breadcrumbs).replace(/</g,'\\u003c')}}/>
    {art&&<div className="detailBackdrop"><Image src={art} alt="" fill priority sizes="100vw" className="heroImage"/><div className="detailGradient"/></div>}
    <div className="detailContent pageWidth">
      <div className="detailPoster">{anime.poster_url?<Image src={anime.poster_url} alt={anime.title} fill sizes="220px"/>:<div className="posterFallback">{anime.title[0]}</div>}</div>
      <div className="detailInfo"><span className="eyebrow">{[anime.type,anime.status].filter(Boolean).join(' · ')}</span><h1>{anime.title}</h1>{altTitles.length>0&&<p className="altTitles">{altTitles.slice(0,4).join(' · ')}</p>}<p className="detailDescription">{anime.description||'Synopsis not available yet.'}</p>
        <div className="chips metaChips">{[anime.season,anime.year,anime.duration,anime.rating?`★ ${anime.rating}`:null].filter(Boolean).map(String).map(x=><span key={x}>{x}</span>)}{genres.map((g:any)=><Link key={g.id} href={`/browse?genre=${encodeURIComponent(g.slug)}`}>{g.name}</Link>)}</div>
        <p className="studios">{studios.length>0?<>Studio: {studios.map((s:any,i:number)=><span key={s.id}>{i>0?', ':''}<Link href={`/browse?studio=${encodeURIComponent(s.slug)}`}>{s.name}</Link></span>)}</>:'Studio information pending'}</p>
        <div className="heroButtons">{first&&<Link className="primaryBtn" href={`/watch/${first.id}`}><Play size={18} fill="currentColor"/>Start episode {first.episode_number}</Link>}<FavoriteButton animeId={anime.id}/></div>
      </div>
    </div>

    <section className="episodes pageWidth"><div className="sectionHead"><h2>Episodes</h2><span>{episodes.length} available</span></div><div className="episodeList">{episodes.map((ep:any)=><Link href={`/watch/${ep.id}`} key={ep.id}><span className="epNum">{String(ep.episode_number).padStart(2,'0')}</span><div><strong>{ep.title||`Episode ${ep.episode_number}`}</strong><small>{ep.air_date?new Date(ep.air_date).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Release date unavailable'}</small></div><Play size={16}/></Link>)}</div></section>

    {cast.length>0&&<section className="section pageWidth"><div className="sectionHead"><h2>Characters & voice cast</h2><span>{cast.length} shown</span></div><div className="castGrid">{cast.map((entry:any)=>{const c=entry.characters;const voice=c.character_voice_actors?.[0]?.voice_actors;return <article className="castCard" key={c.id}><div className="castImage">{c.image_url?<Image src={c.image_url} alt={c.name} fill sizes="72px"/>:<span>{c.name?.[0]??'?'}</span>}</div><div><strong>{c.name}</strong><small>{entry.role||'Character'}</small>{voice&&<p>{voice.name}{voice.language?` · ${voice.language}`:''}</p>}</div></article>})}</div></section>}

    {related.length>0&&<section className="section pageWidth"><div className="sectionHead"><h2>Related anime</h2></div><div className="cardGrid">{related.map((r:any)=>r.related&&<AnimeCard key={r.related.id} anime={r.related}/>)}</div></section>}
  </div>;
}
