import Link from 'next/link';
import { Bookmark, Compass, History, Home, Search, UserRound } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NavLink } from './NavLink';
import { Brand } from './Brand';

export async function Navbar() {
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  return <>
    <header className="nav">
      <Link href="/" aria-label="Animori home"><Brand /></Link>
      <nav className="navlinks" aria-label="Primary navigation">
        <NavLink href="/">Home</NavLink><NavLink href="/browse">Browse</NavLink>
        <NavLink href="/schedule">Schedule</NavLink><NavLink href="/az">A–Z</NavLink>
      </nav>
      <form action="/search" className="navSearch" role="search">
        <Search size={17} aria-hidden="true" />
        <label className="srOnly" htmlFor="nav-search">Search anime</label>
        <input id="nav-search" name="q" type="search" placeholder="Find your next anime" maxLength={160} />
        <button type="submit" aria-label="Search anime"><Search size={17} aria-hidden="true" /></button>
      </form>
      <div className="navActions">
        <NavLink href="/search" className="navSearchLink" label="Search"><Search size={19} /></NavLink>
        {user && <><NavLink href="/my-list" label="My List"><Bookmark size={19} /></NavLink><NavLink href="/history" label="History"><History size={19} /></NavLink></>}
        <NavLink href={user ? '/account' : '/login'} className="navAccount" label={user ? 'Account' : 'Sign in'}><UserRound size={18} /><span>{user ? 'Account' : 'Sign in'}</span></NavLink>
      </div>
    </header>
    <nav className="mobileNav" aria-label="Mobile navigation">
      <NavLink href="/" className="mobileNavItem"><Home aria-hidden="true" /><span>Home</span></NavLink>
      <NavLink href="/browse" className="mobileNavItem"><Compass aria-hidden="true" /><span>Browse</span></NavLink>
      <NavLink href="/search" className="mobileNavItem"><Search aria-hidden="true" /><span>Search</span></NavLink>
      {user && <NavLink href="/my-list" className="mobileNavItem"><Bookmark aria-hidden="true" /><span>My List</span></NavLink>}
      <NavLink href={user ? '/account' : '/login'} className="mobileNavItem"><UserRound aria-hidden="true" /><span>{user ? 'Account' : 'Sign in'}</span></NavLink>
    </nav>
  </>;
}
