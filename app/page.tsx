import Image from 'next/image';
import Link from 'next/link';
import { Bookmark, CalendarDays, ChevronRight, Grid3X3, ListFilter, Play } from 'lucide-react';
import { getHomeData } from '@/lib/data';
import { Hero } from '@/components/Hero';
import { AnimeCard } from '@/components/AnimeCard';
import './home.css';

export const revalidate = 60;

export default async function Home() {
  const data = await getHomeData();
  const hero = data.updatedAnime.find((a: any) => a.banner_url || a.poster_url) ?? data.updatedAnime[0];
  const latest = data.latestEpisodes.slice(0, 6);
  const recentlyUpdated = data.updatedAnime.filter((a: any) => a.id !== hero?.id).slice(0, 8);
  return <div className="homePage">
    <div className="homeLead pageWidth">
      <Hero anime={hero} />
      <aside className="homeUpdates" aria-label="Newest episodes">
        <div className="sectionHead">
          <div><span className="eyebrow">JUST IN</span><h2>New episodes</h2></div>
          <Link href="/schedule">Schedule <ChevronRight size={14} /></Link>
        </div>
        <div className="homeUpdateList">
          {!latest.length && <p className="homeUpdatesEmpty">New episodes will appear here as they become available.</p>}
          {latest.map((ep: any) => <Link href={`/watch/${ep.id}`} className="homeUpdateRow" key={ep.id}>
            <div className="homeUpdatePoster">
              {ep.anime?.poster_url
                ? <Image src={ep.anime.poster_url} alt="" fill sizes="52px" />
                : <span>{(ep.anime?.title ?? ep.title ?? '?').slice(0, 1)}</span>}
            </div>
            <div className="homeUpdateText">
              <strong>{ep.anime?.title ?? ep.title}</strong>
              <span>Episode {ep.episode_number}</span>
            </div>
            <Play size={15} fill="currentColor" aria-hidden="true" />
          </Link>)}
        </div>
      </aside>
    </div>

    <nav className="homeQuick pageWidth" aria-label="Quick links">
      <Link href="/browse"><Grid3X3 size={16} />Browse</Link>
      <Link href="/schedule"><CalendarDays size={16} />Schedule</Link>
      <Link href="/az"><ListFilter size={16} />A–Z</Link>
      <Link href="/my-list"><Bookmark size={16} />My List</Link>
    </nav>

    {data.continuing.length > 0 && <section className="section homeContinue pageWidth">
      <div className="sectionHead"><div><span className="eyebrow">RESUME</span><h2>Continue watching</h2></div><Link href="/history">History <ChevronRight size={14} /></Link></div>
      <div className="continueGrid">{data.continuing.slice(0, 6).map((row: any) => <Link href={`/watch/${row.episode_id}`} className="continueCard" key={row.episode_id}>
        <div className="continuePoster">{row.poster_url && <Image src={row.poster_url} alt="" fill sizes="160px" />}<span><Play size={16} fill="currentColor" /></span></div>
        <div><strong>{row.anime_title}</strong><p>Episode {row.episode_number}</p><div className="progress"><i style={{ width: `${row.duration_seconds ? Math.min(100, Number(row.position_seconds) / Number(row.duration_seconds) * 100) : 0}%` }} /></div></div>
      </Link>)}</div>
    </section>}

    <Shelf eyebrow="FRESH" title="Recently updated" href="/browse" items={recentlyUpdated} />
    <Shelf eyebrow="ALL-TIME" title="Highly rated" href="/browse?sort=rating" items={data.highlyRated.slice(0, 8)} />
    <Shelf eyebrow="FOLLOW THE STORY" title="Airing now" href="/browse?status=Ongoing" items={data.seasonal.slice(0, 8)} />

    <div className="homeMiniShelves pageWidth">
      <MiniShelf title="Movies" href="/browse?type=movie" items={data.movies.slice(0, 4)} />
      <MiniShelf title="Completed" href="/browse?status=completed" items={data.completed.slice(0, 4)} />
    </div>
  </div>;
}

function Shelf({ eyebrow, title, href, items }: { eyebrow: string; title: string; href: string; items: any[] }) {
  if (!items.length) return null;
  return <section className="section homeShelf pageWidth">
    <div className="sectionHead"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><Link href={href}>View all <ChevronRight size={14} /></Link></div>
    <div className="cardGrid">{items.map((anime: any) => <AnimeCard key={anime.id} anime={anime} />)}</div>
  </section>;
}

function MiniShelf({ title, href, items }: { title: string; href: string; items: any[] }) {
  if (!items.length) return null;
  return <section className="homeMiniShelf">
    <div className="sectionHead"><h2>{title}</h2><Link href={href}>View all <ChevronRight size={14} /></Link></div>
    <div className="homeMiniList">{items.map((anime: any) => <Link href={`/anime/${anime.slug}`} key={anime.id}>
      <div className="homeMiniPoster">{anime.poster_url ? <Image src={anime.poster_url} alt="" fill sizes="46px" /> : <span>{anime.title.slice(0, 1)}</span>}</div>
      <div><strong>{anime.title}</strong><span>{[anime.year, anime.type, anime.rating ? `★ ${Number(anime.rating).toFixed(1)}` : null].filter(Boolean).join(' · ')}</span></div>
      <ChevronRight size={15} aria-hidden="true" />
    </Link>)}</div>
  </section>;
}
