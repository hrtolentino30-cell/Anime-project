import{requireCronSecret,serviceClient,logEvent}from'../_shared/db.ts';

type Episode={id:string;source_url:string;source_episode_id:string;created_at:string;updated_at:string};
type Source={id:string;episode_id:string;source_type:string|null;stream_url:string|null;embed_url:string|null;verification_failures:number|null};

async function fetchText(url:string,referer:string,timeout=7000){
  const r=await fetch(url,{headers:{'user-agent':Deno.env.get('SOURCE_USER_AGENT')??'AnimoriPlaybackHealth/1.0',referer,accept:'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*'},redirect:'follow',signal:AbortSignal.timeout(timeout)});
  if(!r.ok)return{ok:false,status:r.status,text:''};
  return{ok:true,status:r.status,text:await r.text()};
}
function firstUri(manifest:string){
  return manifest.split(/\r?\n/).map(x=>x.trim()).find(x=>x&&!x.startsWith('#'))??null;
}
async function checkHls(url:string,referer:string){
  try{
    const first=await fetchText(url,referer);
    if(!first.ok||!first.text.includes('#EXTM3U'))return false;
    let manifestUrl=url,manifest=first.text,uri=firstUri(manifest);
    if(!uri)return false;
    if(/\.m3u8(?:\?|$)/i.test(uri)){
      manifestUrl=new URL(uri,url).href;
      const nested=await fetchText(manifestUrl,referer);
      if(!nested.ok||!nested.text.includes('#EXTM3U'))return false;
      manifest=nested.text;uri=firstUri(manifest);
      if(!uri)return false;
    }
    const mediaUrl=new URL(uri,manifestUrl).href;
    const seg=await fetch(mediaUrl,{headers:{Range:'bytes=0-2047','user-agent':Deno.env.get('SOURCE_USER_AGENT')??'AnimoriPlaybackHealth/1.0',referer},redirect:'follow',signal:AbortSignal.timeout(7000)});
    return seg.ok||seg.status===206;
  }catch{return false}
}
async function checkMp4(url:string,referer:string){
  try{
    const r=await fetch(url,{headers:{Range:'bytes=0-2047','user-agent':Deno.env.get('SOURCE_USER_AGENT')??'AnimoriPlaybackHealth/1.0',referer},redirect:'follow',signal:AbortSignal.timeout(7000)});
    return r.ok||r.status===206;
  }catch{return false}
}
async function checkEmbed(url:string,referer:string){
  try{
    const r=await fetch(url,{headers:{'user-agent':Deno.env.get('SOURCE_USER_AGENT')??'AnimoriPlaybackHealth/1.0',referer},redirect:'manual',signal:AbortSignal.timeout(7000)});
    if(r.status===403)return null;
    return r.status>=200&&r.status<400;
  }catch{return null}
}
async function sourceWorks(source:Source,referer:string){
  if(source.stream_url&&source.source_type==='hls')return await checkHls(source.stream_url,referer);
  if(source.stream_url&&source.source_type==='mp4')return await checkMp4(source.stream_url,referer);
  if(source.embed_url)return await checkEmbed(source.embed_url,referer);
  return false;
}

Deno.serve(async req=>{
  try{await requireCronSecret(req)}catch(response){return response as Response}
  const db=serviceClient();
  const {data:reports}=await db.from('episode_reports').select('episode_id').eq('status','open').in('reason',['playback','audio','wrong_episode']).order('created_at',{ascending:false}).limit(10);
  const reportIds=[...new Set((reports??[]).map((r:any)=>String(r.episode_id)))];
  const {data:recent,error:recentError}=await db.from('episodes').select('id,source_url,source_episode_id,created_at,updated_at').order('created_at',{ascending:false}).limit(24);
  if(recentError)return Response.json({error:recentError.message},{status:500});
  const byId=new Map<string,Episode>();
  if(reportIds.length){
    const {data:reported}=await db.from('episodes').select('id,source_url,source_episode_id,created_at,updated_at').in('id',reportIds);
    for(const ep of reported??[])byId.set(ep.id,ep as Episode);
  }
  for(const ep of recent??[])if(byId.size<14)byId.set(ep.id,ep as Episode);
  const episodes=[...byId.values()].slice(0,14);
  if(!episodes.length)return Response.json({ok:true,checked:0,repairs:0});
  const {data:sources,error}=await db.from('video_sources').select('id,episode_id,source_type,stream_url,embed_url,verification_failures').in('episode_id',episodes.map(e=>e.id)).eq('is_active',true).order('verification_failures',{ascending:true});
  if(error)return Response.json({error:error.message},{status:500});
  const grouped=new Map<string,Source[]>();
  for(const s of sources??[]){const list=grouped.get(s.episode_id)??[];list.push(s as Source);grouped.set(s.episode_id,list)}
  let broken=0,repairs=0,reportedRepairs=0;
  for(const ep of episodes){
    const all=grouped.get(ep.id)??[];
    const direct=all.filter(s=>s.stream_url&&(s.source_type==='hls'||s.source_type==='mp4')).slice(0,3);
    const embeds=all.filter(s=>s.embed_url).slice(0,2);
    let playable=false,unknown=false;
    for(const s of direct.length?direct:embeds){
      const result=await sourceWorks(s,ep.source_url);
      if(result===true){playable=true;break}
      if(result===null)unknown=true;
    }
    const reported=reportIds.includes(ep.id);
    const needsRepair=reported||(!playable&&!unknown);
    if(!needsRepair)continue;
    broken++;
    const {error:queueError}=await db.rpc('enqueue_sync_job',{p_source_url:ep.source_url,p_source_id:ep.source_episode_id,p_item_type:'episode',p_priority:0});
    if(queueError){console.error('repair enqueue failed',queueError.message);continue}
    repairs++;if(reported)reportedRepairs++;
    await logEvent(db,'PLAYBACK_HEALTH_REPAIR_QUEUED',{entityId:ep.id,sourceUrl:ep.source_url,message:reported?'Playback report queued for immediate source refresh':'Unplayable episode queued for immediate source refresh',details:{reported,activeSources:all.length,directChecked:direct.length,embedChecked:direct.length?0:embeds.length}});
  }
  if(repairs){
    const secret=Deno.env.get('SYNC_CRON_SECRET');
    const url=Deno.env.get('SUPABASE_URL');
    if(secret&&url){
      fetch(url+'/functions/v1/worker',{method:'POST',headers:{'x-cron-secret':secret},body:'{}'}).catch(e=>console.error('immediate worker kick failed',e));
    }
  }
  return Response.json({ok:true,checked:episodes.length,broken,repairs,reportedRepairs});
});
