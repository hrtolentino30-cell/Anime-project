'use client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
export function SignOutButton(){async function signOut(){await createSupabaseBrowserClient().auth.signOut();location.href='/';}return <button className="ghostBtn" onClick={signOut}>Sign out</button>}
