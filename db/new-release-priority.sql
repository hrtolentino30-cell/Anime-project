
alter table public.source_items add column if not exists index_fingerprint text;
alter table public.source_items add column if not exists last_index_seen_at timestamptz;

create or replace function public.enqueue_sync_job(p_source_url text,p_source_id text,p_item_type public.sync_item_type,p_priority integer default 100)
returns uuid language plpgsql security invoker set search_path='' as $$
declare out_id uuid; effective_priority integer;
begin
 effective_priority:=case when p_priority=10 then 40 else coalesce(p_priority,100) end;
 insert into public.sync_queue as q(source_url,source_id,item_type,priority)
 values(p_source_url,p_source_id,p_item_type,effective_priority)
 on conflict(source_url,item_type) where status in ('pending','processing')
 do update set priority=least(q.priority,excluded.priority),updated_at=now()
 returning id into out_id;
 return out_id;
end $$;

create or replace function public.record_source_discoveries(p_items jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; old_row public.source_items%rowtype; old_hash text; inserted integer;
 queued integer:=0; fresh integer:=0; changed integer:=0; scanned integer:=0;
 v_type public.sync_item_type; index_scan boolean; job_priority integer;
begin
 if jsonb_typeof(p_items)<>'array' then raise exception 'p_items must be an array'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  scanned:=scanned+1;
  v_type:=(item->>'item_type')::public.sync_item_type;
  index_scan:=coalesce(item->>'discovery_origin','catalog')='index';
  insert into public.source_items(source_url,source_id,item_type,scanner_hash,last_seen_at)
  values(item->>'source_url',item->>'source_id',v_type,item->>'fingerprint',now())
  on conflict(source_url) do nothing;
  get diagnostics inserted=row_count;
  select * into old_row from public.source_items where source_url=item->>'source_url' for update;
  old_hash:=case when index_scan then old_row.index_fingerprint else old_row.scanner_hash end;
  job_priority:=case when index_scan and v_type='episode' and not exists(select 1 from public.episodes e where e.source_url=item->>'source_url') then 0
                     when index_scan and v_type='episode' then 20
                     when index_scan then 30 else 40 end;
  update public.source_items set source_id=item->>'source_id',item_type=v_type,last_seen_at=now(),
   scanner_hash=case when not index_scan then item->>'fingerprint' else scanner_hash end,
   index_fingerprint=case when index_scan then item->>'fingerprint' else index_fingerprint end,
   last_index_seen_at=case when index_scan then now() else last_index_seen_at end
   where source_url=item->>'source_url';
  if inserted=1 or old_hash is distinct from item->>'fingerprint' then
   if inserted=1 then fresh:=fresh+1; else changed:=changed+1; end if;
   perform public.enqueue_sync_job(item->>'source_url',item->>'source_id',v_type,job_priority);
   update public.source_items set last_queued_at=now() where source_url=item->>'source_url';
   queued:=queued+1;
  elsif index_scan then
   -- Promote an existing wait without resetting its retry backoff or retry count.
   update public.sync_queue set priority=least(priority,job_priority),updated_at=now()
   where source_url=item->>'source_url' and item_type=v_type and status='pending' and priority>job_priority;
  end if;
 end loop;
 return jsonb_build_object('scanned',scanned,'queued',queued,'new',fresh,'changed',changed);
end $$;

create or replace function public.claim_sync_jobs(p_limit integer default 3)
returns setof public.sync_queue language plpgsql security invoker set search_path='' as $$
begin
 return query
 with picked as (
  select q.id from public.sync_queue q left join public.source_items s on s.source_url=q.source_url
  where q.status='pending' and q.available_at<=now() and q.attempts<q.max_attempts
  order by q.priority asc,case when q.priority=0 then s.created_at end desc nulls last,q.created_at asc,q.id
  for update of q skip locked limit greatest(1,least(p_limit,3))
 )
 update public.sync_queue q set status='processing',started_at=now(),updated_at=now(),attempts=q.attempts+1
 from picked where q.id=picked.id returning q.*;
end $$;

revoke all on function public.enqueue_sync_job(text,text,public.sync_item_type,integer),public.record_source_discoveries(jsonb),public.claim_sync_jobs(integer) from public,anon,authenticated;
grant execute on function public.enqueue_sync_job(text,text,public.sync_item_type,integer),public.record_source_discoveries(jsonb),public.claim_sync_jobs(integer) to service_role;
update public.sync_queue set priority=40,updated_at=now() where status='pending' and priority=10 and item_type='episode';
