'use client';
import { createBrowserClient } from '@supabase/ssr';
let client: ReturnType<typeof createBrowserClient>|undefined;
export function createSupabaseBrowserClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)throw new Error('Missing public Supabase environment variables');if(!client)client=createBrowserClient(url,key);return client}
