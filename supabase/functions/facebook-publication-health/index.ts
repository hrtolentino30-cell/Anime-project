
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
const GV=Deno.env.get("META_GRAPH_VERSION")||"v26.0";
const PID=Deno.env.get("META_PAGE_ID")||"";
const BASE_TOKEN=Deno.env.get("META_PAGE_ACCESS_TOKEN")||"";
let PAGE_TOKEN_CACHE="";
async function pageToken(){
  if(PAGE_TOKEN_CACHE) return PAGE_TOKEN_CACHE;
  if(!BASE_TOKEN||!PID) throw new Error("Meta Page token derivation unavailable: configuration missing");

  try{
    const cached=await db.rpc("facebook_page_token_cache_get");
    if(!cached.error && typeof cached.data==="string" && cached.data.length>20){
      PAGE_TOKEN_CACHE=cached.data;
      return PAGE_TOKEN_CACHE;
    }
  }catch(e){
    console.error("PAGE_TOKEN_CACHE_READ_FAILED",e instanceof Error?e.message:String(e));
  }

  let lastError="unknown error";
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const r=await fetch(`https://graph.facebook.com/${GV}/me/accounts?fields=id,access_token&limit=100&access_token=${encodeURIComponent(BASE_TOKEN)}`,{signal:AbortSignal.timeout(30000)});
      const j=await r.json();
      if(!r.ok||j.error){
        lastError=j.error?.message||`HTTP ${r.status}`;
        if(Number(j.error?.code)===4) break;
      }else if(Array.isArray(j.data)){
        const page=j.data.find((x:any)=>String(x.id||"")===PID);
        if(page?.access_token){
          PAGE_TOKEN_CACHE=String(page.access_token);
          try{await db.rpc("facebook_page_token_cache_set",{p_token:PAGE_TOKEN_CACHE});}catch{}
          return PAGE_TOKEN_CACHE;
        }
        lastError="Animori Page token missing from /me/accounts";
      }else{
        lastError="Unexpected /me/accounts response";
      }
    }catch(e){
      lastError=e instanceof Error?e.message:String(e);
    }
    if(attempt<3) await new Promise(resolve=>setTimeout(resolve,800*attempt));
  }
  throw new Error(`Meta Page token derivation failed: ${lastError}`);
}

const SU=Deno.env.get("SUPABASE_URL")||"";
const SK=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";

const db=createClient(SU,SK,{auth:{persistSession:false,autoRefreshToken:false}});

async function authorized(req:Request){
  const supplied=req.headers.get("x-cron-secret");
  if(!supplied) return false;
  const {data,error}=await db.rpc("validate_sync_cron_secret",{p_secret:supplied});
  return !error && data===true;
}
async function graph(path:string){
  const sep=path.includes("?")?"&":"?";
  const r=await fetch(`https://graph.facebook.com/${GV}/${path}${sep}access_token=${encodeURIComponent(await pageToken())}`,{
    signal:AbortSignal.timeout(30000)
  });
  const j=await r.json();
  if(!r.ok||j.error) throw new Error(`Meta ${j.error?.code||r.status}: ${j.error?.message||"request failed"}`);
  return j;
}
Deno.serve(async(req)=>{
  if(!(await authorized(req))) return Response.json({error:"unauthorized"},{status:401});
  if(!PID||!BASE_TOKEN||!SU||!SK) return Response.json({error:"configuration missing"},{status:503});

  const since=new Date(Date.now()-6*60*60*1000).toISOString();
  const {data:rows,error}=await db
    .from("facebook_episode_queue")
    .select("episode_id,destination_video_id,published_at")
    .eq("status","published")
    .gte("published_at",since)
    .not("destination_video_id","is",null)
    .order("published_at",{ascending:false})
    .limit(50);
  if(error) throw error;

  const [reels,posts]=await Promise.all([
    graph(`${PID}/video_reels?limit=100&fields=id`),
    graph(`${PID}/published_posts?limit=100&fields=id,permalink_url,status_type`)
  ]);
  const reelIds=new Set((reels.data||[]).map((x:any)=>String(x.id||"")));
  const postUrls=(posts.data||[]).map((x:any)=>String(x.permalink_url||""));

  let healthy=0,issues=0;
  for(const row of rows||[]){
    const id=String(row.destination_video_id||"");
    if(!/^\d+$/.test(id)) continue;
    let video:any, surface:any;
    try{
      video=await graph(`${id}?fields=id,published,permalink_url,status,privacy`);
      surface={
        published:video.published===true,
        ready:video.status?.video_status==="ready",
        public:video.privacy?.value==="EVERYONE"||video.privacy?.description==="Public",
        reel:reelIds.has(id),
        published_post:postUrls.some((u:string)=>u.includes(`/reel/${id}/`))
      };
    }catch(e){
      surface={published:false,ready:false,public:false,reel:false,published_post:false,error:e instanceof Error?e.message:String(e)};
      video={id};
    }
    const ok=surface.published&&surface.ready&&surface.public&&surface.reel&&surface.published_post;
    if(ok) healthy++; else issues++;
    await db.from("facebook_episode_queue").update({
      checked_at:new Date().toISOString(),
      meta_status:{...video,_surface:surface,_health_checked_at:new Date().toISOString()}
    }).eq("episode_id",row.episode_id);
    if(!ok){
      await db.from("sync_events").insert({
        event_type:"FACEBOOK_PUBLICATION_SURFACE_MISSING",
        entity_id:row.episode_id,
        message:"Published Facebook video is not fully surfaced as a public Reel",
        details:{video_id:id,surface,published_at:row.published_at}
      });
    }
  }
  return Response.json({ok:true,checked:(rows||[]).length,healthy,issues});
});