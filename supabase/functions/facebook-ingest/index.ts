import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const U=Deno.env.get("SUPABASE_URL")!,K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,S=Deno.env.get("FACEBOOK_INGEST_SECRET")!,D=Deno.env.get("META_PAGE_ID")!;
Deno.serve(async(req)=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 if(!S||req.headers.get("x-ingest-secret")!==S)return new Response("Unauthorized",{status:401});
 let b:any;try{b=await req.json()}catch{return Response.json({error:"Invalid JSON"},{status:400})}
 const rows=Array.isArray(b)?b:[b];if(!rows.length||rows.length>100)return Response.json({error:"Submit 1-100 items"},{status:400});
 const db=createClient(U,K),out=[];
 for(const x of rows){
  if(!x?.source_url||!x?.url||(!x.post_id&&!x.video_id)){out.push({ok:false,error:"source_url, url and post_id or video_id required"});continue}
  const {data:src}=await db.from("facebook_sync_sources").select("source_url,enabled").eq("source_url",x.source_url).maybeSingle();
  if(!src?.enabled){out.push({ok:false,error:"Source is not registered or disabled"});continue}
  if(x.media_hash){const {data:dupe}=await db.from("facebook_sync_items").select("id,status").eq("media_hash",x.media_hash).is("canonical_item_id",null).maybeSingle();if(dupe){out.push({ok:true,duplicate:true,canonical_item_id:dupe.id});continue}}
  const rec={source_page:x.source_url,source_post_id:x.post_id??null,source_video_id:x.video_id??null,source_url:x.url,source_caption:x.caption??null,source_published_at:x.published_at??null,media_url:x.media_url??null,media_hash:x.media_hash??null,content_fingerprint:x.content_fingerprint??null,destination_page_id:D,status:x.media_url?"media_ready":"detected"};
  const {data,error}=await db.from("facebook_sync_items").upsert(rec,{onConflict:x.video_id?"source_page,source_video_id":"source_page,source_post_id",ignoreDuplicates:true}).select("id,status").maybeSingle();
  out.push(error?{ok:false,error:error.message}:{ok:true,id:data?.id??null,status:data?.status??"duplicate"});
 }
 return Response.json({accepted:out});
});