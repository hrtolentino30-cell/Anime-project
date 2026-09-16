# Production deployment

## 1. Create and link a fresh Supabase project

Link the repository and apply migrations. The migrations prepare pg_trgm, pg_net, pg_cron and Vault, create the normalized schema, queue functions, RLS policies, search/discovery RPCs and retention helpers.

## 2. Configure private source access

Store the authorized upstream origin only in Supabase Vault. Do not place it in browser environment variables or committed configuration.

```sql
select vault.create_secret('https://AUTHORIZED_UPSTREAM_ORIGIN', 'source_base_url');
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
select vault.create_secret('YOUR_LONG_RANDOM_SECRET', 'sync_cron_secret');
```

Set the scheduler secret and optional crawler user-agent for Edge Functions, then deploy `scanner`, `worker`, `verify-sources`, and `admin-sync`. Scanner/worker/verifier validate `x-cron-secret` in application code; admin-sync requires a signed-in administrator.

## 3. Cron

The project uses Supabase Cron/pg_cron. Production schedules are created by migrations for scanning, worker processing, source verification, and retention cleanup.

## 4. Admin and initial import

Sign up normally, add the account to `public.admin_users`, then use `/admin` to run the initial catalog import. The worker processes anime and episode jobs and stores playback source mappings.

## 5. Vercel

Only public Supabase values belong in Vercel browser configuration:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

No content redeployment is required when synchronization updates the database.

## 6. Acceptance

The local acceptance script uses privileged credentials only from a trusted environment. Never prefix a service-role/secret key with `NEXT_PUBLIC_`.
