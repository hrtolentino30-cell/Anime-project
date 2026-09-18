import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft,ChevronRight } from 'lucide-react';
import { getWatchData } from '@/lib/data';
import { cache } from 'react';
import { Player } from '@/components/Player';
export const dynamic='force-dynamic';
const getPageWatchData=cache((episodeId:string)=>getPageWatchData(episodeId));
export async function generateMetadata({params}:{params:Promise<{episodeId:string}>}):Promise<Metadata>{const {episodeId}=await params,data=await getPageWatchData(episodeId);if(!data)return{title:'Episode not found',robots:{index:false,follow:false}};const e=data.episode,a=e.anime,title=`${a?.title??'Anime'} Episode ${e.episode_number}`,description=(e.title||a?.description||`Watch ${title} on Animori.`).replace(/\s+/g,' ').slice(0,160);return{title,description,alternates:{canonical:`/watch/${episodeId}`},robots:{index:true,follow:true,'max-video-preview':-1},openGraph:{type:'video.episode',title,description,url:`/watch/${episodeId}`,images:a?.poster_url?[{url:a.poster_url,alt:`${a.title} poster`}]:undefined}}}
export default async function WatchPage({params}:{params:Promise<{episodeId:string}>}){
  const {episodeId}=await params;
  const data=await getPageWatchData(episodeId);
  if(!data)notFound();
  const {episode,sources,siblings,progress,userId}=data;
  const index=siblings.findIndex((s:any)=>s.id===episode.id);
  const prev=siblings[index-1],next=siblings[index+1];
  const anime=episode.anime;
  const jsonLd={'@context':'https://schema.org','@type':'TVEpisode',name:`${anime?.title??'Anime'} Episode ${episode.episode_number}`,episodeNumber:Number(episode.episode_number),partOfSeries:anime?{'@type':'TVSeries',name:anime.title,url:`https://animori.bond/anime/${anime.slug}`}:undefined,url:`https://animori.bond/watch/${episode.id}`};
  return <div className="watchPage pageWidth"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,'\\u003c')}}/>
    <div className="watchHead"><div><span className="eyebrow">{anime?.title}</span><h1>Episode {episode.episode_number}{episode.title?` · ${episode.title.replace(anime?.title??'','').trim()}`:''}</h1></div><div className="episodeNav">{prev&&<Link href={`/watch/${prev.id}`}><ChevronLeft/>Previous</Link>}{next&&<Link href={`/watch/${next.id}`}>Next<ChevronRight/></Link>}</div></div>
    <Player episodeId={episode.id} animeId={episode.anime_id} sources={sources as any} userId={userId} initialPosition={Number(progress?.position_seconds??0)} nextEpisodeId={next?.id}/>
    <section className="watchInfo"><Link href={`/anime/${anime?.slug}`} className="eyebrow">ALL EPISODES</Link><h2>{anime?.title}</h2><p>{anime?.description}</p></section>
  </div>;
}
