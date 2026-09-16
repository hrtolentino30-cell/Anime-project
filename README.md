# AnimeSync

Production-oriented Next.js + Supabase application that keeps a normalized anime catalog synchronized from the authorized AnimeTVSlash source without frontend redeploys.

## Architecture

```text
AnimeTVSlash
  -> lightweight scanner (home / update / added / schedule)
  -> source_items fingerprint ledger
  -> sync_queue (deduplicated pending/processing jobs)
  -> detailed worker
  -> normalized Supabase Postgres
  -> Next.js App Router on Vercel
```

Included: Next.js App Router + TypeScript, Supabase Auth, normalized catalog schema, RLS, PostgreSQL queue with SKIP LOCKED, source adapter, scanner/worker/verifier/admin Edge Functions, Supabase Cron, polished catalog/watch/account/admin pages, multi-server playback abstraction, progress persistence/resume, and production acceptance scripts.

Public frontend environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never expose a Supabase secret/service-role key to browser code.
