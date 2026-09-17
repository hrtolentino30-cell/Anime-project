import type { Metadata } from 'next';
import { SearchBox } from '@/components/SearchBox';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams;
  const query = (typeof params.q === 'string' ? params.q : '').slice(0, 160);
  return <div className="pageWidth standalone narrow"><div className="pageIntro"><span className="eyebrow">THE NEXT STORY STARTS HERE</span><h1>Find your anime.</h1></div><SearchBox key={query} initial={query} /></div>;
}
