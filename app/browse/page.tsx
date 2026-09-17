import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AnimeCard } from '@/components/AnimeCard';

export const metadata: Metadata = { title: 'Browse anime' };
export const revalidate = 60;
const PAGE_SIZE = 36;
const CARD_FIELDS = 'id,slug,title,poster_url,type,status,year,rating,updated_at';
const EMPTY_ID = '00000000-0000-0000-0000-000000000000';
const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'];
const STATUSES = ['Ongoing', 'Completed', 'Upcoming', 'Hiatus'];
const TYPES = ['TV', 'Movie', 'OVA', 'ONA', 'Special'];

export default async function BrowsePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const value = (key: string) => typeof raw[key] === 'string' ? raw[key] as string : '';
  const choice = (key: string, options: string[]) => options.find(option => option.toLowerCase() === value(key).toLowerCase()) ?? '';
  const year = /^\d{4}$/.test(value('year')) ? value('year') : '';
  const filters = {
    genre: value('genre').slice(0, 120), studio: value('studio').slice(0, 120),
    year, season: choice('season', SEASONS), status: choice('status', STATUSES),
    type: choice('type', TYPES), sort: choice('sort', ['updated', 'rating', 'title']) || 'updated',
  };
  const requestedPage = Number(value('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, entry]) => { if (entry && !(key === 'sort' && entry === 'updated')) params.set(key, entry); });
  const pageUrl = (target: number) => {
    const next = new URLSearchParams(params);
    if (target > 1) next.set('page', String(target));
    return `/browse${next.size ? `?${next}` : ''}`;
  };

  const db = await createSupabaseServerClient();
  const [genresResult, studiosResult] = await Promise.all([
    db.from('genres').select('id,name,slug').order('name'),
    db.from('studios').select('id,name,slug').order('name').limit(100),
  ]);
  const genres = genresResult.data ?? [];
  const studios = studiosResult.data ?? [];
  let query = db.from('anime').select(CARD_FIELDS, { count: 'exact' });
  if (year) query = query.eq('year', Number(year));
  if (filters.season) query = query.ilike('season', filters.season);
  if (filters.status) query = query.ilike('status', `%${filters.status}%`);
  if (filters.type) query = query.ilike('type', `%${filters.type}%`);

  // Reuse the existing normalized relations; there are no schema or RPC changes.
  const [genreLinks, studioLinks] = await Promise.all([
    filters.genre ? db.from('anime_genres').select('anime_id').eq('genre_id', genres.find(item => item.slug === filters.genre)?.id ?? EMPTY_ID) : Promise.resolve(null),
    filters.studio ? db.from('anime_studios').select('anime_id').eq('studio_id', studios.find(item => item.slug === filters.studio)?.id ?? EMPTY_ID) : Promise.resolve(null),
  ]);
  if (genreLinks) query = query.in('id', genreLinks.data?.length ? genreLinks.data.map(item => item.anime_id) : [EMPTY_ID]);
  if (studioLinks) query = query.in('id', studioLinks.data?.length ? studioLinks.data.map(item => item.anime_id) : [EMPTY_ID]);
  if (filters.sort === 'rating') query = query.order('rating', { ascending: false, nullsFirst: false });
  else if (filters.sort === 'title') query = query.order('title');
  query = query.order('updated_at', { ascending: false }).order('id');
  const { data: anime, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const loadError = error || genresResult.error || studiosResult.error || genreLinks?.error || studioLinks?.error;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total > 0 && page > pages) redirect(pageUrl(pages));
  const years = Array.from({ length: 60 }, (_, index) => String(new Date().getFullYear() - index));
  if (year && !years.includes(year)) years.push(year);

  return <div className="pageWidth standalone">
    <div className="pageIntro"><span className="eyebrow">EXPLORE THE CATALOG</span><h1>Find your next story.</h1><p>Old favorites, new worlds, and everything in between.</p></div>
    <form action="/browse" className="filters" key={params.toString()} aria-label="Filter anime">
      <Filter label="Genre" name="genre" value={filters.genre} all="All genres" options={genres.map(item => ({ value: item.slug, label: item.name }))} />
      <Filter label="Year" name="year" value={year} all="All years" options={years} />
      <Filter label="Season" name="season" value={filters.season} all="All seasons" options={SEASONS} />
      <Filter label="Status" name="status" value={filters.status} all="Any status" options={STATUSES} />
      <Filter label="Type" name="type" value={filters.type} all="All types" options={TYPES} />
      <Filter label="Studio" name="studio" value={filters.studio} all="Any studio" options={studios.map(item => ({ value: item.slug, label: item.name }))} />
      <label>Sort by<select name="sort" defaultValue={filters.sort}><option value="updated">Recently updated</option><option value="rating">Highest rated</option><option value="title">Title A–Z</option></select></label>
      <div className="filterActions"><button className="primaryBtn" type="submit"><SlidersHorizontal size={16} aria-hidden="true" />Apply filters</button>{params.size > 0 && <Link href="/browse" className="filterReset">Reset filters</Link>}</div>
    </form>
    {loadError ? <div className="emptyState" role="alert"><h2>The catalog is taking a moment</h2><p>We couldn’t load the anime list. Please try again.</p><a href={pageUrl(page)} className="primaryBtn">Try again</a></div> : <>
      <p className="resultCount">{total > 0 && anime?.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} anime` : 'No results'}</p>
      <div className="browseGrid">{anime?.map(item => <AnimeCard key={item.id} anime={item} />)}</div>
      {!anime?.length && <div className="emptyState"><h2>No anime found</h2><p>Try another genre or clear your filters to explore the full catalog.</p><Link href="/browse" className="primaryBtn">Browse all anime</Link></div>}
      {pages > 1 && <nav className="pagination" aria-label="Catalog pages">
        {page > 1 ? <Link className="ghostBtn" href={pageUrl(page - 1)} rel="prev"><ChevronLeft size={17} aria-hidden="true" />Previous</Link> : <span className="ghostBtn disabled" aria-disabled="true">Previous</span>}
        <span>Page {page} of {pages}</span>
        {page < pages ? <Link className="ghostBtn" href={pageUrl(page + 1)} rel="next">Next<ChevronRight size={17} aria-hidden="true" /></Link> : <span className="ghostBtn disabled" aria-disabled="true">Next</span>}
      </nav>}
    </>}
  </div>;
}

function Filter({ label, name, value, all, options }: {
  label: string; name: string; value: string; all: string; options: (string | { value: string; label: string })[];
}) {
  return <label>{label}<select name={name} defaultValue={value}><option value="">{all}</option>{options.map(item => {
    const option = typeof item === 'string' ? { value: item, label: item } : item;
    return <option key={option.value} value={option.value}>{option.label}</option>;
  })}</select></label>;
}
