
begin;
do $$
declare u text:='https://example.invalid/animori-priority-regression'; result jsonb; original_id uuid; promoted_id uuid; actual integer; picked text;
begin
 result:=public.record_source_discoveries(jsonb_build_array(jsonb_build_object('source_url',u,'source_id','episode:priority-regression','item_type','episode','fingerprint','catalog-a','priority',10)));
 select id,priority into original_id,actual from public.sync_queue where source_url=u and status='pending';
 if actual<>40 then raise exception 'Catalog imports must use background priority'; end if;
 update public.sync_queue set available_at=now()+interval '10 minutes',attempts=1 where id=original_id;
 result:=public.record_source_discoveries(jsonb_build_array(jsonb_build_object('source_url',u,'source_id','episode:priority-regression','item_type','episode','fingerprint','index-a','discovery_origin','index')));
 select id,priority into promoted_id,actual from public.sync_queue where source_url=u and status='pending';
 if original_id<>promoted_id or actual<>0 then raise exception 'Existing job was not promoted in place'; end if;
 if not exists(select 1 from public.sync_queue where id=original_id and attempts=1 and available_at>now()) then raise exception 'Promotion reset retries or backoff'; end if;
 perform public.record_source_discoveries(jsonb_build_array(jsonb_build_object('source_url',u,'source_id','episode:priority-regression','item_type','episode','fingerprint','catalog-b','priority',10)));
 if (select index_fingerprint from public.source_items where source_url=u)<>'index-a' then raise exception 'Catalog overwrote index fingerprint'; end if;
 result:=public.record_source_discoveries(jsonb_build_array(jsonb_build_object('source_url',u,'source_id','episode:priority-regression','item_type','episode','fingerprint','index-a','discovery_origin','index')));
 if (result->>'queued')::integer<>0 then raise exception 'Unchanged index generated redundant work'; end if;
 if (select count(*) from public.sync_queue where source_url=u and status in ('pending','processing'))<>1 then raise exception 'Duplicate active jobs'; end if;
 update public.sync_queue set available_at=now()-interval '1 second' where id=original_id;
 select source_url into picked from public.claim_sync_jobs(1);
 if picked<>u then raise exception 'Newest urgent release was not claimed first: %',picked; end if;
end $$;
select 'PASS: background priority, promotion, preserved retry backoff, separate fingerprints, deduplication, urgent claim order' as result;
rollback;