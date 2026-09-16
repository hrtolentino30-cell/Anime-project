create or replace function public.get_upstream_base_url()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'source_base_url' limit 1
$$;
revoke all on function public.get_upstream_base_url() from public, anon, authenticated;
grant execute on function public.get_upstream_base_url() to service_role;
