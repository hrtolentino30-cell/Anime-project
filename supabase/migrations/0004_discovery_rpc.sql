create or replace function public.record_source_discoveries(p_items jsonb)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare item jsonb; old_hash text; old_exists boolean; queued int := 0; fresh int := 0; changed int := 0; scanned int := 0; v_type public.sync_item_type;
begin
  if jsonb_typeof(p_items) <> 'array' then raise exception 'p_items must be an array'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    scanned := scanned + 1; v_type := (item->>'item_type')::public.sync_item_type;
    select scanner_hash, true into old_hash, old_exists from public.source_items where source_url=item->>'source_url';
    if not coalesce(old_exists,false) then
      fresh := fresh + 1;
      insert into public.source_items(source_url, source_id, item_type, scanner_hash, last_seen_at, last_queued_at) values(item->>'source_url', item->>'source_id', v_type, item->>'fingerprint', now(), now());
      perform public.enqueue_sync_job(item->>'source_url', item->>'source_id', v_type, coalesce((item->>'priority')::int,100)); queued := queued + 1;
    elsif old_hash is distinct from item->>'fingerprint' then
      changed := changed + 1;
      update public.source_items set source_id=item->>'source_id', item_type=v_type, scanner_hash=item->>'fingerprint', last_seen_at=now(), last_queued_at=now() where source_url=item->>'source_url';
      perform public.enqueue_sync_job(item->>'source_url', item->>'source_id', v_type, coalesce((item->>'priority')::int,100)); queued := queued + 1;
    else update public.source_items set last_seen_at=now() where source_url=item->>'source_url'; end if;
    old_exists := false; old_hash := null;
  end loop;
  return jsonb_build_object('scanned',scanned,'queued',queued,'new',fresh,'changed',changed);
end $$;
revoke all on function public.record_source_discoveries(jsonb) from public, anon, authenticated;
grant execute on function public.record_source_discoveries(jsonb) to service_role;
