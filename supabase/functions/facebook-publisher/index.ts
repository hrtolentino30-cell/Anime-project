type SyncItem = {
  id: number;
  media_url: string | null;
  source_caption: string | null;
  retry_count: number;
};

const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") ?? "v26.0";
const PAGE_ID = Deno.env.get("META_PAGE_ID") ?? "";
const PAGE_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function headers() {
  return { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "content-type": "application/json" };
}

async function patch(id: number, body: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/facebook_sync_items?id=eq.${id}`, {
    method: "PATCH", headers: headers(), body: JSON.stringify(body),
  });
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("SYNC_CRON_SECRET");
  if (cronSecret && req.headers.get("x-sync-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!PAGE_ID || !PAGE_TOKEN) return Response.json({ error: "Meta publishing secrets are not configured" }, { status: 503 });

  const q = encodeURIComponent("in.(media_ready,retry)");
  const now = encodeURIComponent(new Date().toISOString());
  const res = await fetch(`${SUPABASE_URL}/rest/v1/facebook_sync_items?select=id,media_url,source_caption,retry_count&status=${q}&or=(next_attempt_at.is.null,next_attempt_at.lte.${now})&order=detected_at.asc&limit=1`, { headers: headers() });
  const [item] = await res.json() as SyncItem[];
  if (!item) return Response.json({ ok: true, processed: 0 });
  if (!item.media_url) { await patch(item.id, { status: "failed", last_error: "Missing authorized media_url" }); return Response.json({ ok: false, id: item.id }, { status: 422 }); }

  await patch(item.id, { status: "uploading", last_error: null });
  const body = new URLSearchParams({ access_token: PAGE_TOKEN, file_url: item.media_url });
  if (item.source_caption) body.set("description", item.source_caption);

  try {
    const upload = await fetch(`https://graph-video.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/videos`, { method: "POST", body });
    const data = await upload.json();
    if (!upload.ok || !data.id) throw new Error(data?.error?.message ?? `Meta upload failed (${upload.status})`);
    await patch(item.id, { status: "published", destination_video_id: String(data.id), uploaded_at: new Date().toISOString(), last_error: null });
    return Response.json({ ok: true, processed: 1, id: item.id, destination_video_id: String(data.id) });
  } catch (error) {
    const retries = item.retry_count + 1;
    const terminal = retries >= 5;
    await patch(item.id, {
      status: terminal ? "failed" : "retry",
      retry_count: retries,
      last_error: error instanceof Error ? error.message : String(error),
      next_attempt_at: terminal ? null : new Date(Date.now() + Math.min(3600, 60 * 2 ** retries) * 1000).toISOString(),
    });
    return Response.json({ ok: false, id: item.id, retry_count: retries }, { status: 502 });
  }
});
