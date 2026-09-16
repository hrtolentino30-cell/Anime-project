import Link from 'next/link';
import { Search, UserRound, Bookmark, History } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function Navbar() {
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();

  return (
    <header className="nav">
      <Link href="/" className="brand" aria-label="Animori home">
        <span className="brandMark">A</span>
        <span>ANI<span>MORI</span></span>
      </Link>
      <nav className="navlinks" aria-label="Primary navigation">
        <Link href="/browse">Browse</Link>
        <Link href="/schedule">Schedule</Link>
        <Link href="/az">A–Z</Link>
      </nav>
      <div className="navActions">
        <Link href="/search" aria-label="Search"><Search size={19} /></Link>
        {user && (
          <>
            <Link href="/my-list" aria-label="My List"><Bookmark size={19} /></Link>
            <Link href="/history" aria-label="History"><History size={19} /></Link>
          </>
        )}
        <Link href={user ? '/account' : '/login'} aria-label="Account"><UserRound size={19} /></Link>
      </div>
    </header>
  );
}
