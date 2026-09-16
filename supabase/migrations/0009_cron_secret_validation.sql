create or replace function public.validate_sync_cron_secret(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'sync_cron_secret' and extensions.digest(convert_to(decrypted_secret, 'UTF8'), 'sha256') = extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256'));
$$;
revoke all on function public.validate_sync_cron_secret(text) from public, anon, authenticated;
grant execute on function public.validate_sync_cron_secret(text) to service_role;
