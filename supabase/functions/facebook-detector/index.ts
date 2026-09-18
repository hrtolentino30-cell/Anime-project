const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SOURCE_PAGE = Deno.env.get("FACEBOOK_SOURCE_PAGE_URL") ?? "";
const DESTINATION_PAGE_ID = Deno.env.get("META_PAGE_ID") ?? "";

// The source Page is not administered by this app. Detection therefore accepts records
// only from an explicitly configured authorized ingestion feed/adapter. It never bypasses
// Facebook access controls or attempts to extract protected media.
Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("SYNC_CRON_SECRET");
  if (cronSecret && req.headers.get("x-sync-secret") !== cronSecret) return new Response("Unauthorized", { status: 401 });
  const feed = Deno.env.get("FACEBOOK_AUTHORIZED_INGEST_URL");
  if (!feed) return Response.json({ ok: true, detected: 0, waiting_for: "FACEBOOK_AUTHORIZED_INGEST_URL" });
  const response = await fetch(feed, { headers: { accept: "application/json" } });
  if (!response.ok) return Response.json({ error: "Authorized ingestion feed unavailable" }, { status: 502 });
  const rows = await response.json() as Array<{ post_id?: string; video_id?: string; url: string; caption?: string; published_at?: string; media_url?: string; media_hash?: string }>;
  let detected = 0;
  for (const row of rows) {
    if (!row.url || (!row.post_id && !row.video_id)) continue;
    const payload = {
      source_page: SOURCE_PAGE, source_post_id: row.post_id ?? null, source_video_id: row.video_id ?? null,
      source_url: row.url, source_caption: row.caption ?? null, source_published_at: row.published_at ?? null,
      media_url: row.media_url ?? null, media_hash: row.media_hash ?? null, destination_page_id: DESTINATION_PAGE_ID,
      status: row.media_url ? "media_ready" : "detected", downloaded_at: row.media_url ? new Date().toISOString() : null
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/facebook_sync_items?on_conflict=source_page,source_post_id`, {
      method: "POST",
      headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "content-type": "application/json", prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(payload)
    });
    if (r.ok) detected++;
  }
  return Response.json({ ok: true, detected });
});
