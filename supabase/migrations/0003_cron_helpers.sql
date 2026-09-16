-- Before scheduling, create these Vault secrets once:
-- select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
-- select vault.create_secret('YOUR_LONG_RANDOM_SECRET', 'sync_cron_secret');

create or replace function public.invoke_sync_edge(p_function text)
returns bigint
language plpgsql security definer set search_path=public, vault, net as $$
declare
  base_url text;
  secret text;
  request_id bigint;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name='project_url' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name='sync_cron_secret' limit 1;
  if base_url is null or secret is null then raise exception 'Vault secrets project_url and sync_cron_secret must be configured'; end if;
  select net.http_post(url := rtrim(base_url,'/') || '/functions/v1/' || p_function, headers := jsonb_build_object('content-type','application/json','x-cron-secret',secret), body := '{}'::jsonb, timeout_milliseconds := 25000) into request_id;
  return request_id;
end $$;
revoke all on function public.invoke_sync_edge(text) from public, anon, authenticated;
grant execute on function public.invoke_sync_edge(text) to postgres, service_role;
