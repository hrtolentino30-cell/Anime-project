create or replace function public.facebook_episode_release_block_reason(p_episode_id uuid)
returns text
language sql
stable
set search_path to ''
as $function$
 select coalesce((
  select case
   when upper(coalesce(a.type,'')) = 'ONA'
     or coalesce(a.title,'') ~* '(^|[^A-Za-z0-9])ONA([^A-Za-z0-9]|$)'
     or coalesce(a.title_english,'') ~* '(^|[^A-Za-z0-9])ONA([^A-Za-z0-9]|$)'
     or coalesce(e.title,'') ~* '(^|[^A-Za-z0-9])ONA([^A-Za-z0-9]|$)'
     or coalesce(e.source_url,'') ~* '(^|[-_/])ona([-_/]|$)'
   then 'ONA titles are excluded from Facebook publishing'
   else public.facebook_release_block_reason(
    a.status,e.episode_number,
    greatest(a.latest_episode,(select max(x.episode_number) from public.episodes x where x.anime_id=e.anime_id)),
    e.air_date,
    (select count(*)::integer from public.episodes x
     where x.anime_id=e.anime_id
     and (x.air_date at time zone 'UTC')::date=(e.air_date at time zone 'UTC')::date)
   )
  end
  from public.episodes e join public.anime a on a.id=e.anime_id where e.id=p_episode_id
 ),case when exists(select 1 from public.episodes e join public.anime a on a.id=e.anime_id where e.id=p_episode_id)
        then null else 'Episode or anime metadata missing' end);
$function$;

update public.facebook_episode_queue q
set status='ignored',
    claimed_at=null,
    last_error='release_gate: ONA titles are excluded from Facebook publishing'
where q.status='pending'
  and public.facebook_episode_release_block_reason(q.episode_id)='ONA titles are excluded from Facebook publishing';

do $$
begin
  if not exists (select 1 from cron.job where jobname='facebook-publication-health') then
    perform cron.schedule(
      'facebook-publication-health',
      '*/15 * * * *',
      $cmd$select public.invoke_sync_edge('facebook-publication-health');$cmd$
    );
  end if;
end $$;
