import Image from 'next/image';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { getHomeData } from '@/lib/data';
import { Hero } from '@/components/Hero';
import { Section } from '@/components/Section';
import { AnimeCard } from '@/components/AnimeCard';
export const revalidate=60;
export default async function Home(){
  const data=await getHomeData();
  const hero=data.updatedAnime.find((a:any)=>a.banner_url||a.poster_url)??data.updatedAnime[0];
  return <>
    <Hero anime={hero}/>
    {data.continuing.length>0&&<section className="section pageWidth"><div className="sectionHead"><div><span className="eyebrow">RESUME</span><h2>Continue watching</h2></div><Link href="/history">History</Link></div><div className="continueGrid">{data.continuing.map((row:any)=><Link href={`/watch/${row.episode_id}`} className="continueCard" key={row.episode_id}><div className="continuePoster">{row.poster_url&&<Image src={row.poster_url} alt="" fill sizes="160px"/>}<span><Play size={16} fill="currentColor"/></span></div><div><strong>{row.anime_title}</strong><p>Episode {row.episode_number}</p><div className="progress"><i style={{width:`${row.duration_seconds?Math.min(100,Number(row.position_seconds)/Number(row.duration_seconds)*100):0}%`}}/></div></div></Link>)}</div></section>}
    <section className="section pageWidth"><div className="sectionHead"><div><span className="eyebrow">FRESH FROM THE QUEUE</span><h2>Latest releases</h2></div><Link href="/schedule">Schedule</Link></div><div className="latestGrid">{data.latestEpisodes.slice(0,8).map((ep:any)=><Link href={`/watch/${ep.id}`} className="releaseCard" key={ep.id}><div className="releasePoster">{ep.anime?.poster_url&&<Image src={ep.anime.poster_url} alt="" fill sizes="120px"/>}</div><div><strong>{ep.anime?.title??ep.title}</strong><span>Episode {ep.episode_number}</span></div></Link>)}</div></section>
    <Section title="Recently updated" items={data.updatedAnime.slice(0,12)}/>
    <section className="section pageWidth"><div className="sectionHead"><div><span className="eyebrow">HIGH RATED</span><h2>Trending now</h2></div><Link href="/browse">View all</Link></div><div className="cardGrid">{[...data.updatedAnime].sort((a:any,b:any)=>(b.rating??0)-(a.rating??0)).slice(0,12).map((a:any)=><AnimeCard key={a.id} anime={a}/>)}</div></section>
    <Section title="Current season" items={data.seasonal}/><Section title="Movies" items={data.movies}/><Section title="Completed anime" items={data.completed}/>
  </>;
}
