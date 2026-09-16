import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft,ChevronRight } from 'lucide-react';
import { getWatchData } from '@/lib/data';
import { Player } from '@/components/Player';
export const dynamic='force-dynamic';
export default async function WatchPage({params}:{params:Promise<{episodeId:string}>}){
  const {episodeId}=await params; const data=await getWatchData(episodeId); if(!data)notFound();
  const {episode,sources,siblings,progress,userId}=data; const index=siblings.findIndex((s:any)=>s.id===episode.id); const prev=siblings[index-1],next=siblings[index+1]; const anime=episode.anime;
  return <div className="watchPage pageWidth"><div className="watchHead"><div><span className="eyebrow">{anime?.title}</span><h1>Episode {episode.episode_number}{episode.title?` · ${episode.title.replace(anime?.title??'','').trim()}`:''}</h1></div><div className="episodeNav">{prev&&<Link href={`/watch/${prev.id}`}><ChevronLeft/>Previous</Link>}{next&&<Link href={`/watch/${next.id}`}>Next<ChevronRight/></Link>}</div></div><Player episodeId={episode.id} animeId={episode.anime_id} sources={sources as any} userId={userId} initialPosition={Number(progress?.position_seconds??0)}/><section className="watchInfo"><Link href={`/anime/${anime?.slug}`} className="eyebrow">ALL EPISODES</Link><h2>{anime?.title}</h2><p>{anime?.description}</p></section></div>;
}
