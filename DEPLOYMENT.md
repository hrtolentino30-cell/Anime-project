# Production deployment

## 1. Create and link a fresh Supabase project

Install the Supabase CLI locally (or use a connected Supabase integration), log in, and link this repository to the new project.

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migrations enable/prepare pg_trgm, pg_net, pg_cron and Vault, create the normalized schema, queue functions, RLS policies, search RPC, discovery RPC and periodic-refresh helper.

## 2. Deploy Edge Functions

Generate one long random scheduler secret, then set only crawler-specific secrets. Hosted Edge Functions already receive Supabase project credentials from Supabase; the shared client supports current `SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS` and legacy key fallbacks.

```bash
supabase secrets set \
  SOURCE_BASE_URL=https://animotvslash.org \
  SOURCE_USER_AGENT='AnimeSyncBot/1.0 (+authorized synchronization)' \
  SYNC_CRON_SECRET='YOUR_LONG_RANDOM_SECRET'

supabase functions deploy scanner --no-verify-jwt
supabase functions deploy worker --no-verify-jwt
supabase functions deploy verify-sources --no-verify-jwt
supabase functions deploy admin-sync
```

`scanner`, `worker`, and `verify-sources` intentionally disable gateway JWT verification but validate `x-cron-secret` in application code. `admin-sync` requires a signed-in user JWT and membership in `admin_users`.

## 3. Configure Vault and Cron

Run in Supabase SQL Editor, using the same `SYNC_CRON_SECRET` value:

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
select vault.create_secret('YOUR_LONG_RANDOM_SECRET', 'sync_cron_secret');

select cron.schedule('anime-source-scan', '*/2 * * * *', $$select public.invoke_sync_edge('scanner');$$);
select cron.schedule('anime-sync-worker', '* * * * *', $$select public.invoke_sync_edge('worker');$$);
select cron.schedule('video-source-health', '17 */6 * * *', $$select public.invoke_sync_edge('verify-sources');$$);
```

The project uses Supabase Cron/pg_cron rather than frequent Vercel Cron.

## 4. Create the first admin

Sign up normally through `/register`, then promote that account once from SQL:

```sql
insert into public.admin_users(user_id)
select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
on conflict do nothing;
```

Thereafter `/admin` is protected by Auth plus the `admin_users` RLS-backed membership check.

## 5. Initial import

Open `/admin` and run **Initial catalog import**. This scans `/anime/list-mode/` and its detected pagination, queuing anime. The worker processes those jobs; each anime ingestion queues its episodes, and episode ingestion stores playback source mappings.

You can watch queue depth, failures, sync runs and parser events in the same dashboard.

## 6. Deploy Next.js to Vercel

Set only the public Supabase values in the Vercel project:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Then deploy the repository with the standard Next.js preset. No content redeployment is needed after this: catalog pages read from Supabase and update as ingestion changes rows.

## 7. Auth URLs

In Supabase Auth URL configuration set your Vercel production URL as Site URL and allow:

```text
https://YOUR_DOMAIN/auth/callback
https://YOUR_DOMAIN/account
```

## 8. Production acceptance

After bootstrap has started, run:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
SUPABASE_SECRET_KEY=sb_secret_... \
SYNC_CRON_SECRET='YOUR_LONG_RANDOM_SECRET' \
npm run acceptance
```

The secret key is used only by the local acceptance process and must never be prefixed with `NEXT_PUBLIC_` or added to browser code.
