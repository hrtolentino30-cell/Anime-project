
alter table public.facebook_episode_queue
 add column if not exists priority integer not null default 0,
 add column if not exists upload_started boolean not null default false,
 add column if not exists upload_session_id text,
 add column if not exists finish_accepted boolean not null default false;
create or replace function public.queue_new_episode_for_facebook() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.source_url like 'https://animotvslash.org/%'
 and new.air_date >= now()-interval '3 days' and new.air_date <= now()+interval '1 day'
 and not exists(select 1 from public.facebook_episode_publications p where p.anime_id=new.anime_id and p.episode_number=new.episode_number)
 then insert into public.facebook_episode_queue(episode_id,episode_url,status)
 values(new.id,new.source_url,'pending') on conflict(episode_id) do nothing; end if;
 return new;
end $$;
create or replace function public.claim_facebook_upload(p_episode_url text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare q public.facebook_episode_queue%rowtype; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('facebook-upload-claim'));
 update public.facebook_episode_queue set status=case when upload_started and not finish_accepted then 'failed' else 'pending' end,
 last_error='Previous worker lease expired',claimed_at=null
 where status='processing' and claimed_at<now()-interval '25 minutes';
 select f.* into q from public.facebook_episode_queue f join public.episodes e on e.id=f.episode_id
 where f.status='pending' and (p_episode_url is null or f.episode_url=p_episode_url)
 and (f.attempts<3 or f.finish_accepted)
 and not exists(select 1 from public.facebook_episode_publications p where p.anime_id=e.anime_id and p.episode_number=e.episode_number)
 and not exists(select 1 from public.facebook_episode_queue other join public.episodes oe on oe.id=other.episode_id
 where oe.anime_id=e.anime_id and oe.episode_number=e.episode_number and other.episode_id<>f.episode_id
 and (other.status in ('processing','published') or other.upload_started))
 order by f.priority desc,f.created_at for update of f skip locked limit 1;
 if not found then return null; end if;
 update public.facebook_episode_queue set status='processing',claimed_at=now(),attempts=attempts+1
 where episode_id=q.episode_id returning to_jsonb(facebook_episode_queue.*) into result;
 return result;
end $$;
create or replace function public.facebook_upload_transition(p_episode_id uuid,p_attempt integer,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare q public.facebook_episode_queue%rowtype; e public.episodes%rowtype; existing text;
begin
 select * into q from public.facebook_episode_queue where episode_id=p_episode_id for update;
 if not found or q.status<>'processing' or q.attempts<>p_attempt then raise exception 'Upload lease is no longer current'; end if;
 if p_action='reserve' then
  if q.upload_started then raise exception 'Upload already started; reconcile existing video'; end if;
  select * into e from public.episodes where id=p_episode_id for update;
  if exists(select 1 from public.facebook_episode_publications p where p.anime_id=e.anime_id and p.episode_number=e.episode_number)
   then raise exception 'Episode already published'; end if;
  update public.facebook_episode_queue set upload_started=true where episode_id=p_episode_id;
 elsif p_action='session' then
  if not q.upload_started or q.destination_video_id is not null or coalesce(p_data->>'video_id','')!~'^[0-9]+$' then raise exception 'Invalid upload session'; end if;
  update public.facebook_episode_queue set destination_video_id=p_data->>'video_id',upload_session_id=p_data->>'upload_session_id' where episode_id=p_episode_id;
 elsif p_action='accepted' then
  if q.destination_video_id is null then raise exception 'Missing video'; end if;
  update public.facebook_episode_queue set finish_accepted=true where episode_id=p_episode_id;
 elsif p_action='complete' then
  if not q.finish_accepted or q.destination_video_id is distinct from p_data->>'video_id' then raise exception 'Video mismatch'; end if;
  select * into e from public.episodes where id=p_episode_id for update;
  select destination_video_id into existing from public.facebook_episode_publications where anime_id=e.anime_id and episode_number=e.episode_number;
  if existing is not null and existing<>q.destination_video_id then raise exception 'Conflicting publication'; end if;
  insert into public.facebook_episode_publications(anime_id,episode_number,destination_video_id,destination_url,source_name,published_at)
  values(e.anime_id,e.episode_number,q.destination_video_id,p_data->>'url','animotvslash',now())
  on conflict(anime_id,episode_number) do nothing;
  update public.facebook_episode_queue set status='published',published_at=now(),last_error=null where episode_id=p_episode_id;
 elsif p_action='fail' then
  update public.facebook_episode_queue set
  status=case when q.finish_accepted and coalesce((p_data->>'terminal')::boolean,false)=false then 'pending'
              when not q.upload_started and q.attempts<3 then 'pending' else 'failed' end,
  claimed_at=null,last_error=left(p_data->>'error',1000) where episode_id=p_episode_id;
 else raise exception 'Unknown transition'; end if;
 return (select to_jsonb(f.*) from public.facebook_episode_queue f where episode_id=p_episode_id);
end $$;
revoke all on function public.claim_facebook_upload(text),public.facebook_upload_transition(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_facebook_upload(text),public.facebook_upload_transition(uuid,integer,text,jsonb) to service_role;
revoke execute on function public.claim_facebook_episode_queue(),public.complete_facebook_episode_queue(uuid,text,text) from public,anon,authenticated;
-- Archive only unstarted imports whose source date proves they are catalog backfill.
update public.facebook_episode_queue q set status='failed',last_error='Catalog backfill excluded: source release is older than 3 days'
from public.episodes e where e.id=q.episode_id and q.status='pending' and not q.upload_started
and e.air_date<now()-interval '3 days';
-- Explicitly requested episodes precede automatically discovered releases.
update public.facebook_episode_queue set priority=100 where episode_url='https://animotvslash.org/i-became-a-legend-after-my-10-year-long-last-stand-episode-12/';
update public.facebook_episode_queue set priority=90 where episode_url='https://animotvslash.org/the-frontier-lord-begins-with-zero-subjects-episode-12/';

create or replace function public.claim_facebook_upload(p_episode_url text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare q public.facebook_episode_queue%rowtype; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('facebook-upload-claim'));
 update public.facebook_episode_queue f set status=case when f.upload_started and not f.finish_accepted then 'failed' when f.attempts>=3 and not f.finish_accepted then 'failed' else 'pending' end,last_error='Previous worker lease expired',claimed_at=null
 where f.status='processing' and f.claimed_at<now()-interval '25 minutes';
 select f.* into q from public.facebook_episode_queue f join public.episodes e on e.id=f.episode_id
 where f.status='pending' and (p_episode_url is null or f.episode_url=p_episode_url)
 and (f.priority>0 or f.finish_accepted or (e.air_date>=now()-interval '3 days' and e.air_date<=now()+interval '1 day'))
 and (f.attempts<3 or f.finish_accepted)
 and not exists(select 1 from public.facebook_episode_publications p where p.anime_id=e.anime_id and p.episode_number=e.episode_number)
 and not exists(select 1 from public.facebook_episode_queue other join public.episodes oe on oe.id=other.episode_id
 where oe.anime_id=e.anime_id and oe.episode_number=e.episode_number and other.episode_id<>f.episode_id
 and (other.status in ('processing','published') or other.upload_started))
 order by f.priority desc,f.created_at for update of f skip locked limit 1;
 if not found then return null; end if;
 update public.facebook_episode_queue set status='processing',claimed_at=now(),attempts=attempts+1
 where episode_id=q.episode_id returning to_jsonb(facebook_episode_queue.*) into result;
 return result;
end $$;

drop trigger if exists trg_queue_new_episode_for_facebook on public.episodes;
create trigger trg_queue_new_episode_for_facebook after insert or update of air_date,source_url on public.episodes for each row execute function public.queue_new_episode_for_facebook();
alter function public.touch_facebook_sync_item() set search_path='';
create or replace function public.claim_facebook_episode_queue() returns table(episode_id uuid,episode_url text,attempts integer)
language plpgsql security invoker set search_path='' as $$ begin raise exception 'Legacy upload client retired; use claim_facebook_upload'; end $$;
