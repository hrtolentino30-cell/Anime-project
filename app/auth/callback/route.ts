import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const requestedNext = url.searchParams.get('next');
  const next = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/account';
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) { const loginUrl = new URL('/login', url.origin); loginUrl.searchParams.set('error', 'Unable to complete sign in. Please try again.'); return NextResponse.redirect(loginUrl); }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
