import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_SECRET = Deno.env.get("FACEBOOK_INGEST_SECRET")!;
const SOURCE_PAGE = Deno.env.get("FACEBOOK_SOURCE_PAGE_URL") ?? "https://www.facebook.com/profile.php?id=61569593189979";
const DESTINATION_PAGE_ID = Deno.env.get("META_PAGE_ID")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const supplied = req.headers.get("x-ingest-secret");
  if (!INGEST_SECRET || supplied !== INGEST_SECRET) return new Response("Unauthorized", { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const rows = Array.isArray(body) ? body : [body];
  if (!rows.length || rows.length > 100) return Response.json({ error: "Submit 1-100 items" }, { status: 400 });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const accepted = [];
  for (const item of rows) {
    if (!item?.url || (!item.post_id && !item.video_id)) {
      accepted.push({ ok: false, error: "url and post_id or video_id required" });
      continue;
    }
    const record = {
      source_page: SOURCE_PAGE,
      source_post_id: item.post_id ?? null,
      source_video_id: item.video_id ?? null,
      source_url: item.url,
      source_caption: item.caption ?? null,
      source_published_at: item.published_at ?? null,
      media_url: item.media_url ?? null,
      media_hash: item.media_hash ?? null,
      destination_page_id: DESTINATION_PAGE_ID,
      status: item.media_url ? "media_ready" : "detected",
    };
    const { data, error } = await db.from("facebook_sync_items").upsert(record, {
      onConflict: item.video_id ? "source_page,source_video_id" : "source_page,source_post_id",
      ignoreDuplicates: true,
    }).select("id,status").maybeSingle();
    accepted.push(error ? { ok: false, error: error.message } : { ok: true, id: data?.id ?? null, status: data?.status ?? "duplicate" });
  }
  return Response.json({ accepted });
});
