create or replace function public.analytics_admin_overview(p_days integer default 30)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v jsonb; begin
 if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'insufficient_privilege' using errcode='42501'; end if;
 with e as (select * from public.analytics_events where created_at>=now()-make_interval(days=>greatest(1,least(p_days,90)))),
 dly as (select created_at::date as event_date,count(distinct session_id) as sessions,count(*) as events from e group by 1 order by 1),
 dev as (select coalesce(device_type,'unknown') as device,count(*) as events from e group by 1 order by 2 desc),
 refs as (select coalesce(nullif(referrer_host,''),'direct') as referrer,count(*) as events from e group by 1 order by 2 desc limit 10),
 ttl as (select a.title,count(*) as views from e join public.anime a on a.id=e.anime_id where e.event_name='anime_view' group by a.id,a.title order by 2 desc limit 10)
 select jsonb_build_object('dau',(select count(distinct session_id) from e where created_at>=now()-interval '1 day'),'wau',(select count(distinct session_id) from e where created_at>=now()-interval '7 days'),'mau',(select count(distinct session_id) from e where created_at>=now()-interval '30 days'),'daily',coalesce((select jsonb_agg(dly) from dly),'[]'::jsonb),'devices',coalesce((select jsonb_agg(dev) from dev),'[]'::jsonb),'referrers',coalesce((select jsonb_agg(refs) from refs),'[]'::jsonb),'top_titles',coalesce((select jsonb_agg(ttl) from ttl),'[]'::jsonb),'funnel',jsonb_build_object('starts',(select count(*) from e where event_name='play_start'),'p25',(select count(*) from e where event_name='play_25'),'p50',(select count(*) from e where event_name='play_50'),'p75',(select count(*) from e where event_name='play_75'),'complete',(select count(*) from e where event_name='play_complete'))) into v; return v; end $$;
revoke all on function public.analytics_admin_overview(integer) from public,anon;
grant execute on function public.analytics_admin_overview(integer) to authenticated;
delete from public.search_events where created_at < now()-interval '90 days';