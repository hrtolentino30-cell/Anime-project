'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Search, X } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Anime } from '@/lib/types';

type SearchResult = { query: string; rows: Anime[]; status: 'loading' | 'ready' | 'error' };

export function SearchBox({ initial = '' }: { initial?: string }) {
  const [query, setQuery] = useState(initial);
  const [result, setResult] = useState<SearchResult>({ query: '', rows: [], status: 'ready' });
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const tracked = useRef('');
  const term = query.trim();
  const searchable = term.length >= 2;
  const current = result.query === term;
  const loading = searchable && (!current || result.status === 'loading');
  const failed = searchable && current && result.status === 'error';
  const rows = searchable && current && result.status === 'ready' ? result.rows : [];

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(async () => {
      setResult({ query: term, rows: [], status: 'loading' });
      try {
        const { data, error } = await createSupabaseBrowserClient()
          .rpc('search_anime', { p_query: term, p_limit: 24 })
          .abortSignal(controller.signal);
        if (!cancelled) { const rows=(data ?? []); setResult({ query: term, rows: error ? [] : rows, status: error ? 'error' : 'ready' }); if(!error&&tracked.current!==term){tracked.current=term;void createSupabaseBrowserClient().from('search_events').insert({query:term,result_count:rows.length})} }
      } catch {
        if (!cancelled) setResult({ query: term, rows: [], status: 'error' });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [term, attempt]);

  const status = !searchable ? 'Enter at least two characters to search.' : loading ? 'Searching…' : failed ? 'Search is unavailable. Please try again.' : `${rows.length}${rows.length === 24 ? '+' : ''} ${rows.length === 1 ? 'result' : 'results'} for “${term}”`;

  return <div className="searchExperience">
    <form action="/search" className="bigSearch" role="search">
      <Search size={22} aria-hidden="true" />
      <label htmlFor="catalog-search" className="srOnly">Search anime titles</label>
      <input ref={input} id="catalog-search" name="q" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search anime titles…" maxLength={160} autoFocus autoComplete="off" aria-describedby="search-status" />
      {query && <button type="button" className="searchClear" aria-label="Clear search" onClick={() => { setQuery(''); input.current?.focus(); }}><X size={19} /></button>}
    </form>
    <p id="search-status" className="resultCount" role="status" aria-live="polite">{status}</p>
    <div aria-busy={loading}>
      {loading && <div className="searchSkeleton" aria-hidden="true">{[0, 1, 2].map(item => <div key={item}><i /><span /></div>)}</div>}
      {failed && <div className="emptyState"><h2>Let’s try that again</h2><p>We couldn’t load your results.</p><button className="primaryBtn" onClick={() => setAttempt(value => value + 1)}>Retry search</button></div>}
      {searchable && !loading && !failed && rows.length === 0 && <div className="emptyState"><Search size={28} aria-hidden="true" /><h2>No titles found</h2><p>Try a different spelling, a shorter title, or the Japanese name.</p><Link href="/browse" className="ghostBtn">Browse all anime</Link></div>}
      {!searchable && <div className="searchPrompt"><p>Search by English, Japanese, or alternate title.</p><Link href="/browse">Explore the catalog <ArrowUpRight size={16} aria-hidden="true" /></Link></div>}
      {rows.length > 0 && <div className="searchResults">{rows.map(row => <Link href={`/anime/${row.slug}`} key={row.id}>
        {row.poster_url ? <Image src={row.poster_url} alt="" width={64} height={90} /> : <span className="searchPosterFallback" aria-hidden="true">{row.title.slice(0, 1)}</span>}
        <div><strong>{row.title}</strong><span>{[row.title_japanese, row.type, row.year].filter(Boolean).join(' · ')}</span></div>
        <ArrowUpRight size={18} aria-hidden="true" />
      </Link>)}</div>}
    </div>
  </div>;
}
