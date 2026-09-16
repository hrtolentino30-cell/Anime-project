# Animori

Production-oriented Next.js + Supabase application that keeps a normalized anime catalog synchronized from an authorized private upstream source without frontend redeploys.

## Architecture

```text
Private upstream adapter
  -> lightweight scanner (home / update / added / schedule)
  -> source_items fingerprint ledger
  -> sync_queue (deduplicated pending/processing jobs)
  -> detailed worker
  -> normalized Supabase Postgres
  -> Next.js App Router on Vercel
```

Included: Next.js App Router + TypeScript, Supabase Auth, normalized catalog schema, RLS, PostgreSQL queue with SKIP LOCKED, private source adapter, scanner/worker/verifier/admin Edge Functions, Supabase Cron, polished catalog/watch/account/admin pages, multi-server playback abstraction, progress persistence/resume, and production acceptance scripts.

The upstream origin is stored privately in Supabase Vault and is never a public frontend environment variable.

Public frontend environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never expose a Supabase secret/service-role key or private upstream configuration to browser code.
