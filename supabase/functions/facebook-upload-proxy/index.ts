import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const REPO = "hrtolentino30-cell/Anime-project";
const WORKFLOW = `${REPO}/.github/workflows/animotvslash-media-probe.yml@refs/heads/main`;
const GV = Deno.env.get("META_GRAPH_VERSION") || "v26.0";
const PID = Deno.env.get("META_PAGE_ID") || "";
const PT = Deno.env.get("META_PAGE_ACCESS_TOKEN") || "";
const SU = Deno.env.get("SUPABASE_URL") || "";
const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
async function rpc(name: string, data: unknown) {
  const r = await fetch(`${SU}/rest/v1/rpc/${name}`, {method:"POST", headers:{apikey:SK,authorization:`Bearer ${SK}`,"content-type":"application/json"},body:JSON.stringify(data)});
  const result = await r.json();
  if (!r.ok) throw new Error(`Database ${name}: ${result.message || r.status}`);
  return result;
}
async function graph(path: string, body?: BodyInit) {
  const r = await fetch(`https://${body ? "graph-video" : "graph"}.facebook.com/${GV}/${path}`, {method:body ? "POST" : "GET",body,signal:AbortSignal.timeout(90000)});
  const result = await r.json();
  if (!r.ok || result.error) throw new Error(`Meta: ${result.error?.message || r.status}`);
  return result;
}
async function status(id: string) {
  if (!/^\d+$/.test(id)) throw new Error("Invalid video ID");
  return await graph(`${id}?fields=id,permalink_url,published,status&access_token=${encodeURIComponent(PT)}`);
}
Deno.serve(async (req: Request) => {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    const {payload} = await jwtVerify(token,JWKS,{issuer:"https://token.actions.githubusercontent.com",audience:"animori-facebook-upload"});
    if (payload.repository !== REPO || payload.ref !== "refs/heads/main" || payload.workflow_ref !== WORKFLOW || !["push","schedule","workflow_dispatch"].includes(String(payload.event_name))) throw new Error("Invalid workflow");
  } catch { return Response.json({error:"Unauthorized"},{status:401}); }
  if (!PID || !PT) return Response.json({error:"Meta configuration missing"},{status:503});
  try {
    const url = new URL(req.url), phase = url.searchParams.get("phase");
    if (phase === "next") return Response.json({job:await rpc("claim_facebook_upload",{p_episode_url:url.searchParams.get("episode_url") || null})});
    if (phase === "status") return Response.json(await status(url.searchParams.get("video_id") || ""));
    const episodeId = req.headers.get("x-episode-id"), attempt = Number(req.headers.get("x-upload-attempt"));
    if (!episodeId || !Number.isInteger(attempt) || attempt < 1) return Response.json({error:"Current queue lease required"},{status:409});
    const transition = (action: string,data: unknown={}) => rpc("facebook_upload_transition",{p_episode_id:episodeId,p_attempt:attempt,p_action:action,p_data:data});
    const r = await fetch(`${SU}/rest/v1/facebook_episode_queue?episode_id=eq.${encodeURIComponent(episodeId)}&select=*`,{headers:{apikey:SK,authorization:`Bearer ${SK}`}});
    if (!r.ok) throw new Error("Queue lookup failed");
    const [job] = await r.json();
    if (!job || job.status !== "processing" || job.attempts !== attempt) return Response.json({error:"Stale queue lease"},{status:409});
    if (phase === "fail") return Response.json({job:await transition("fail",await req.json())});
    if (phase === "start") {
      const data = await req.json();
      if (!Number.isSafeInteger(data.file_size) || data.file_size <= 0) throw new Error("Invalid file size");
      await transition("reserve");
      const result = await graph(`${PID}/videos`,new URLSearchParams({access_token:PT,upload_phase:"start",file_size:String(data.file_size)}));
      if (!result.video_id || !result.upload_session_id) throw new Error("Incomplete upload session response");
      await transition("session",result);
      return Response.json(result);
    }
    if (phase === "transfer") {
      if (!job.upload_session_id || job.finish_accepted) throw new Error("No transferable upload session");
      const body = new FormData();
      body.set("access_token",PT); body.set("upload_phase","transfer"); body.set("upload_session_id",job.upload_session_id);
      body.set("start_offset",url.searchParams.get("start_offset") || "0");
      body.set("video_file_chunk",new Blob([await req.arrayBuffer()]),"chunk.bin");
      return Response.json(await graph(`${PID}/videos`,body));
    }
    if (phase === "finish") {
      if (!job.upload_session_id) throw new Error("Missing upload session");
      if (job.finish_accepted) return Response.json({success:true});
      const data = await req.json();
      const result = await graph(`${PID}/videos`,new URLSearchParams({access_token:PT,upload_phase:"finish",upload_session_id:job.upload_session_id,title:data.title || "",description:data.description || ""}));
      if (result.success !== true) throw new Error("Meta did not accept upload finish");
      await transition("accepted");
      return Response.json(result);
    }
    if (phase === "complete") {
      const video = await status(job.destination_video_id || "");
      if (video.published !== true || video.status?.video_status !== "ready") return Response.json({error:"Video is not published and ready",video},{status:409});
      return Response.json({job:await transition("complete",{video_id:video.id,url:video.permalink_url})});
    }
    return Response.json({error:"Unknown phase"},{status:400});
  } catch (error) { return Response.json({error:error instanceof Error ? error.message : String(error)},{status:502}); }
});
