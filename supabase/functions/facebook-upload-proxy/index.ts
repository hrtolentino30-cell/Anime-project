
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const REPO = "hrtolentino30-cell/Anime-project";
const WORKFLOW = `${REPO}/.github/workflows/animotvslash-media-probe.yml@refs/heads/main`;
const GV = Deno.env.get("META_GRAPH_VERSION") || "v26.0";
const PID = Deno.env.get("META_PAGE_ID") || "";
const BASE_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN") || "";
let PAGE_TOKEN_CACHE = "";

async function pageToken() {
  if (PAGE_TOKEN_CACHE) return PAGE_TOKEN_CACHE;
  if (!BASE_TOKEN || !PID) throw new Error("Meta Page token derivation unavailable: configuration missing");

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(
        `https://graph.facebook.com/${GV}/me/accounts?fields=id,access_token&limit=100&access_token=${encodeURIComponent(BASE_TOKEN)}`,
        { signal: AbortSignal.timeout(30000) }
      );
      const j = await r.json();
      if (!r.ok || j.error) {
        lastError = j.error?.message || `HTTP ${r.status}`;
      } else if (Array.isArray(j.data)) {
        const page = j.data.find((x: {id?: string; access_token?: string}) => String(x.id || "") === PID);
        if (page?.access_token) {
          PAGE_TOKEN_CACHE = String(page.access_token);
          return PAGE_TOKEN_CACHE;
        }
        lastError = "Animori Page token missing from /me/accounts";
      } else {
        lastError = "Unexpected /me/accounts response";
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 400 * attempt));
  }

  // Never fall back to the USER token for video operations.
  throw new Error(`Meta Page token derivation failed: ${lastError}`);
}
const SU = Deno.env.get("SUPABASE_URL") || "";
const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function rpc(name: string, data: unknown) {
  const r = await fetch(`${SU}/rest/v1/rpc/${name}`, {
    method:"POST",
    headers:{apikey:SK,authorization:`Bearer ${SK}`,"content-type":"application/json"},
    body:JSON.stringify(data)
  });
  const result = await r.json();
  if (!r.ok) throw new Error(`Database ${name}: ${result.message || r.status}`);
  return result;
}

async function graph(path: string, body?: BodyInit) {
  const r = await fetch(`https://${body ? "graph-video" : "graph"}.facebook.com/${GV}/${path}`, {
    method:body ? "POST" : "GET",
    body,
    signal:AbortSignal.timeout(90000)
  });
  const result = await r.json();
  if (!r.ok || result.error) {
    const error = new Error(`Meta: ${result.error?.message || r.status}`) as Error & {terminal?: boolean};
    error.terminal = [100,190,200].includes(Number(result.error?.code));
    throw error;
  }
  return result;
}

async function status(id: string) {
  if (!/^\d+$/.test(id)) throw new Error("Invalid video ID");
  return await graph(`${id}?fields=id,permalink_url,published,status,privacy&access_token=${encodeURIComponent(await pageToken())}`);
}

async function surface(id: string) {
  if (!/^\d+$/.test(id)) throw new Error("Invalid video ID");
  const [video,reels,posts] = await Promise.all([
    status(id),
    graph(`${PID}/video_reels?limit=100&fields=id&access_token=${encodeURIComponent(await pageToken())}`),
    graph(`${PID}/published_posts?limit=100&fields=id,permalink_url,status_type&access_token=${encodeURIComponent(await pageToken())}`)
  ]);
  const reel = Array.isArray(reels.data) && reels.data.some((x: {id?: string}) => String(x.id || "") === id);
  const post = Array.isArray(posts.data) && posts.data.some((x: {permalink_url?: string}) =>
    String(x.permalink_url || "").includes(`/reel/${id}/`)
  );
  const isPublic = video.privacy?.value === "EVERYONE" || video.privacy?.description === "Public";
  return {
    published: video.published === true,
    ready: video.status?.video_status === "ready",
    public: isPublic,
    reel,
    published_post: post,
    permalink_url: video.permalink_url || null
  };
}

Deno.serve(async (req: Request) => {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    const {payload} = await jwtVerify(token,JWKS,{
      issuer:"https://token.actions.githubusercontent.com",
      audience:"animori-facebook-upload"
    });
    if (
      payload.repository !== REPO ||
      payload.ref !== "refs/heads/main" ||
      payload.workflow_ref !== WORKFLOW ||
      !["push","schedule","workflow_dispatch"].includes(String(payload.event_name))
    ) throw new Error("Invalid workflow");
  } catch {
    return Response.json({error:"Unauthorized"},{status:401});
  }

  if (!PID || !BASE_TOKEN) return Response.json({error:"Meta configuration missing"},{status:503});

  try {
    const url = new URL(req.url), phase = url.searchParams.get("phase");

    if (phase === "available") {
      const r = await fetch(`${SU}/rest/v1/facebook_episode_queue?status=eq.pending&select=episode_id&limit=2`, {
        headers:{apikey:SK,authorization:`Bearer ${SK}`}
      });
      if (!r.ok) throw new Error("Queue availability lookup failed");
      const rows = await r.json();
      const pending = Array.isArray(rows) ? rows.length : 0;
      return Response.json({available:pending > 0,pending});
    }

    if (phase === "next") {
      return Response.json({job:await rpc("claim_facebook_upload",{
        p_episode_url:url.searchParams.get("episode_url") || null
      })});
    }

    if (phase === "status") {
      const id = url.searchParams.get("video_id") || "";
      const video = await status(id);
      await fetch(`${SU}/rest/v1/facebook_episode_queue?destination_video_id=eq.${encodeURIComponent(id)}`,{
        method:"PATCH",
        headers:{apikey:SK,authorization:`Bearer ${SK}`,"content-type":"application/json"},
        body:JSON.stringify({meta_status:video,checked_at:new Date().toISOString()})
      });
      return Response.json(video);
    }

    if (phase === "surface") {
      const id = url.searchParams.get("video_id") || "";
      return Response.json(await surface(id));
    }

    const episodeId = req.headers.get("x-episode-id");
    const attempt = Number(req.headers.get("x-upload-attempt"));
    if (!episodeId || !Number.isInteger(attempt) || attempt < 1) {
      return Response.json({error:"Current queue lease required"},{status:409});
    }

    const progress = async (data: unknown) => {
      const result = await fetch(
        `${SU}/rest/v1/facebook_episode_queue?episode_id=eq.${encodeURIComponent(episodeId)}&attempts=eq.${attempt}&status=eq.processing`,
        {
          method:"PATCH",
          headers:{apikey:SK,authorization:`Bearer ${SK}`,"content-type":"application/json"},
          body:JSON.stringify(data)
        }
      );
      if (!result.ok) console.error("Could not persist upload progress",result.status);
    };

    const transition = (action: string,data: unknown={}) =>
      rpc("facebook_upload_transition",{
        p_episode_id:episodeId,
        p_attempt:attempt,
        p_action:action,
        p_data:data
      });

    const r = await fetch(`${SU}/rest/v1/facebook_episode_queue?episode_id=eq.${encodeURIComponent(episodeId)}&select=*`,{
      headers:{apikey:SK,authorization:`Bearer ${SK}`}
    });
    if (!r.ok) throw new Error("Queue lookup failed");
    const [job] = await r.json();
    if (!job || job.status !== "processing" || job.attempts !== attempt) {
      return Response.json({error:"Stale queue lease"},{status:409});
    }

    if (phase === "fail") {
      return Response.json({job:await transition("fail",await req.json())});
    }

    if (phase === "start") {
      const data = await req.json();
      if (!Number.isSafeInteger(data.file_size) || data.file_size <= 0) throw new Error("Invalid file size");
      await transition("reserve");
      const result = await graph(`${PID}/videos`,new URLSearchParams({
        access_token:await pageToken(),
        upload_phase:"start",
        file_size:String(data.file_size)
      }));
      if (!result.video_id || !result.upload_session_id) throw new Error("Incomplete upload session response");
      await transition("session",result);
      await progress({file_bytes:data.file_size,progress_at:new Date().toISOString()});
      return Response.json(result);
    }

    if (phase === "transfer") {
      if (!job.upload_session_id || job.finish_accepted) throw new Error("No transferable upload session");
      const body = new FormData();
      body.set("access_token",await pageToken());
      body.set("upload_phase","transfer");
      body.set("upload_session_id",job.upload_session_id);
      body.set("start_offset",url.searchParams.get("start_offset") || "0");
      body.set("video_file_chunk",new Blob([await req.arrayBuffer()]),"chunk.bin");
      const result = await graph(`${PID}/videos`,body);
      await progress({upload_bytes:Number(result.start_offset || 0),progress_at:new Date().toISOString()});
      return Response.json(result);
    }

    if (phase === "finish") {
      if (!job.upload_session_id) throw new Error("Missing upload session");
      if (job.finish_accepted) return Response.json({success:true});
      const data = await req.json();
      const result = await graph(`${PID}/videos`,new URLSearchParams({
        access_token:await pageToken(),
        upload_phase:"finish",
        upload_session_id:job.upload_session_id,
        title:data.title || "",
        description:data.description || ""
      }));
      if (result.success !== true) throw new Error("Meta did not accept upload finish");
      await transition("accepted");
      return Response.json(result);
    }

    if (phase === "complete") {
      const id = String(job.destination_video_id || "");
      const visibility = await surface(id);
      if (!visibility.published || !visibility.ready || !visibility.public || !visibility.reel || !visibility.published_post) {
        return Response.json({
          error:"Video is not yet fully surfaced as a public Reel",
          surface:visibility
        },{status:409});
      }
      return Response.json({
        surface:visibility,
        job:await transition("complete",{
          video_id:id,
          url:visibility.permalink_url
            ? new URL(visibility.permalink_url,"https://www.facebook.com").href
            : null
        })
      });
    }

    return Response.json({error:"Unknown phase"},{status:400});
  } catch (error) {
    return Response.json({
      error:error instanceof Error ? error.message : String(error),
      terminal:(error as {terminal?: boolean})?.terminal === true
    },{status:502});
  }
});