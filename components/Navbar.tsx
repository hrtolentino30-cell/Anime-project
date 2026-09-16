import Link from 'next/link';
import { Bookmark, Compass, History, Home, Search, UserRound } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function Navbar() {
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();

  return (
    <>
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
          <Link href={user ? '/account' : '/login'} aria-label={user ? 'Account' : 'Sign in'}><UserRound size={19} /></Link>
        </div>
      </header>

      <nav className="mobileNav" aria-label="Mobile navigation">
        <Link href="/" className="mobileNavItem"><Home aria-hidden="true" /><span>Home</span></Link>
        <Link href="/browse" className="mobileNavItem"><Compass aria-hidden="true" /><span>Browse</span></Link>
        <Link href="/search" className="mobileNavItem"><Search aria-hidden="true" /><span>Search</span></Link>
        {user && <Link href="/my-list" className="mobileNavItem"><Bookmark aria-hidden="true" /><span>My List</span></Link>}
        <Link href={user ? '/account' : '/login'} className="mobileNavItem"><UserRound aria-hidden="true" /><span>{user ? 'Account' : 'Sign in'}</span></Link>
      </nav>
    </>
  );
}
