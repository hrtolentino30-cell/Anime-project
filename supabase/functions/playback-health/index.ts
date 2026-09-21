import{requireCronSecret,serviceClient,logEvent}from'../_shared/db.ts';

type Episode={
  id:string;
  source_url:string;
  source_episode_id:string;
  created_at:string;
  updated_at:string;
  last_scraped_at?:string|null;
};
type Source={
  id:string;
  episode_id:string;
  server_name:string|null;
  source_type:string|null;
  stream_url:string|null;
  embed_url:string|null;
  verification_failures:number|null;
  last_verified_at:string|null;
};
type CheckResult=true|false|null;

const UA=()=>Deno.env.get('SOURCE_USER_AGENT')??'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36';

async function fetchText(url:string,referer:string,timeout=6500){
  const r=await fetch(url,{headers:{'user-agent':UA(),referer,accept:'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*'},redirect:'follow',signal:AbortSignal.timeout(timeout)});
  if(!r.ok)return{ok:false,status:r.status,text:'',response:r};
  return{ok:true,status:r.status,text:await r.text(),response:r};
}
function firstUri(manifest:string){
  return manifest.split(/\r?\n/).map(x=>x.trim()).find(x=>x&&!x.startsWith('#'))??null;
}
function iframeBlocked(response:Response){
  const xfo=(response.headers.get('x-frame-options')||'').toLowerCase();
  if(xfo.includes('deny')||xfo.includes('sameorigin'))return true;
  const csp=(response.headers.get('content-security-policy')||'').toLowerCase();
  const frame=csp.match(/frame-ancestors\s+([^;]+)/)?.[1]??'';
  return !!frame&&(/'none'/.test(frame)||(/^\s*'self'\s*$/.test(frame)));
}
function obviousErrorPage(text:string){
  const sample=text.slice(0,16000).toLowerCase();
  return /attention required!\s*\|\s*cloudflare|sorry, you have been blocked|error\s*-\s*megaplay|page you're looking for doesn't exist|video (?:was )?not found|file not found|stream unavailable|this video is unavailable/.test(sample);
}
async function checkHls(url:string,referer:string):Promise<CheckResult>{
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
    const seg=await fetch(mediaUrl,{headers:{Range:'bytes=0-4095','user-agent':UA(),referer},redirect:'follow',signal:AbortSignal.timeout(6500)});
    return seg.ok||seg.status===206;
  }catch{return false}
}
async function checkMp4(url:string,referer:string):Promise<CheckResult>{
  try{
    const r=await fetch(url,{headers:{Range:'bytes=0-4095','user-agent':UA(),referer},redirect:'follow',signal:AbortSignal.timeout(6500)});
    return r.ok||r.status===206;
  }catch{return false}
}
async function checkEmbed(url:string,referer:string):Promise<CheckResult>{
  try{
    const r=await fetch(url,{
      headers:{'user-agent':UA(),referer,accept:'text/html,application/xhtml+xml,*/*'},
      redirect:'follow',
      signal:AbortSignal.timeout(6500)
    });
    if(iframeBlocked(r))return false;
    if(r.status===403||r.status===429)return null;
    if(!r.ok)return false;
    const text=await r.text();
    if(obviousErrorPage(text))return false;
    return true;
  }catch{return null}
}
async function sourceWorks(source:Source,referer:string):Promise<CheckResult>{
  if(source.stream_url&&source.source_type==='hls')return checkHls(source.stream_url,referer);
  if(source.stream_url&&source.source_type==='mp4')return checkMp4(source.stream_url,referer);
  if(source.stream_url)return checkMp4(source.stream_url,referer);
  if(source.embed_url)return checkEmbed(source.embed_url,referer);
  return false;
}
function embedRank(source:Source){
  const raw=source.embed_url||'';
  try{
    const host=new URL(raw).hostname.toLowerCase();
    if(host==='tryembed.us.cc'||host.endsWith('.tryembed.us.cc'))return 0;
    if(host.includes('animotvslash'))return 3;
    if(host.includes('vidnest'))return 4;
    if(host.includes('megaplay'))return 5;
  }catch{}
  return 2;
}
function staleEpisode(ep:Episode,hours:number){
  const t=Date.parse(ep.last_scraped_at||ep.updated_at||ep.created_at);
  return !Number.isFinite(t)||Date.now()-t>hours*60*60*1000;
}

Deno.serve(async req=>{
  try{await requireCronSecret(req)}catch(response){return response as Response}
  const db=serviceClient();

  const[{data:reports},{data:degraded},{data:oldest},{data:recent,error:recentError}]=await Promise.all([
    db.from('episode_reports').select('episode_id').eq('status','open').in('reason',['playback','audio','wrong_episode']).order('created_at',{ascending:false}).limit(14),
    db.from('video_sources').select('episode_id').eq('is_active',true).gt('verification_failures',0).order('last_verified_at',{ascending:false}).limit(30),
    db.from('video_sources').select('episode_id,last_verified_at').eq('is_active',true).order('last_verified_at',{ascending:true,nullsFirst:true}).limit(240),
    db.from('episodes').select('id,source_url,source_episode_id,created_at,updated_at,last_scraped_at').order('created_at',{ascending:false}).limit(30)
  ]);
  if(recentError)return Response.json({error:recentError.message},{status:500});

  const reportIds=[...new Set((reports??[]).map((r:any)=>String(r.episode_id)))];
  const degradedIds=[...new Set((degraded??[]).map((r:any)=>String(r.episode_id)))];
  const oldestIds=[...new Set((oldest??[]).map((r:any)=>String(r.episode_id)))].slice(0,24);
  const byId=new Map<string,Episode>();
  const priorityIds=[...new Set([...reportIds,...degradedIds,...oldestIds])];

  if(priorityIds.length){
    const{data:priority}=await db.from('episodes')
      .select('id,source_url,source_episode_id,created_at,updated_at,last_scraped_at')
      .in('id',priorityIds);
    for(const ep of priority??[])byId.set(ep.id,ep as Episode);
  }
  for(const ep of recent??[])if(byId.size<36)byId.set(ep.id,ep as Episode);
  const episodes=[...byId.values()].slice(0,36);
  if(!episodes.length)return Response.json({ok:true,checked:0,repairs:0});

  const{data:sources,error}=await db.from('video_sources')
    .select('id,episode_id,server_name,source_type,stream_url,embed_url,verification_failures,last_verified_at')
    .in('episode_id',episodes.map(e=>e.id))
    .eq('is_active',true)
    .order('verification_failures',{ascending:true});
  if(error)return Response.json({error:error.message},{status:500});

  const grouped=new Map<string,Source[]>();
  for(const s of sources??[]){
    const list=grouped.get(s.episode_id)??[];
    list.push(s as Source);
    grouped.set(s.episode_id,list);
  }

  let broken=0,repairs=0,reportedRepairs=0,embedOnlyRepairs=0,cursor=0;
  const repairBudget=10;

  async function inspect(ep:Episode){
    const all=grouped.get(ep.id)??[];
    const direct=all.filter(s=>s.stream_url&&(s.source_type==='hls'||s.source_type==='mp4')).slice(0,3);
    const embeds=all.filter(s=>s.embed_url).sort((a,b)=>embedRank(a)-embedRank(b)).slice(0,4);
    const candidates=direct.length?direct:embeds;

    let playable=false,unknown=false,hardFailure=false;
    for(const s of candidates){
      const result=await sourceWorks(s,ep.source_url);
      if(result===true){playable=true;break}
      if(result===null)unknown=true;
      if(result===false)hardFailure=true;
    }

    const reported=reportIds.includes(ep.id);
    const embedOnly=direct.length===0;
    const staleEmbedOnly=embedOnly&&staleEpisode(ep,18);
    const needsRepair=reported||all.length===0||(!playable&&(hardFailure||(!unknown)||staleEmbedOnly));
    if(!needsRepair)return;

    broken++;
    if(repairs>=repairBudget&&!reported)return;
    const{error:queueError}=await db.rpc('enqueue_sync_job',{
      p_source_url:ep.source_url,
      p_source_id:ep.source_episode_id,
      p_item_type:'episode',
      p_priority:reported?0:1
    });
    if(queueError){console.error('repair enqueue failed',queueError.message);return}
    repairs++;
    if(reported)reportedRepairs++;
    if(embedOnly)embedOnlyRepairs++;
    await logEvent(db,'PLAYBACK_HEALTH_REPAIR_QUEUED',{
      entityId:ep.id,
      sourceUrl:ep.source_url,
      message:reported?'Playback report queued for immediate website repair':'Unplayable or stale embed-only episode queued for fast website repair',
      details:{reported,embedOnly,activeSources:all.length,directChecked:direct.length,embedChecked:direct.length?0:embeds.length}
    });
  }

  const concurrency=6;
  await Promise.all(Array.from({length:Math.min(concurrency,episodes.length)},async()=>{
    while(true){
      const index=cursor++;
      if(index>=episodes.length)break;
      await inspect(episodes[index]);
    }
  }));

  const{data:integrity,error:integrityError}=await db.rpc('enqueue_catalog_integrity_repairs',{p_limit:4});
  if(integrityError)console.error('catalog integrity enqueue failed',integrityError.message);
  const integrityQueued=Number((integrity as any)?.queued??0);

  if(repairs||integrityQueued){
    const secret=Deno.env.get('SYNC_CRON_SECRET');
    const url=Deno.env.get('SUPABASE_URL');
    if(secret&&url){
      fetch(url+'/functions/v1/worker',{method:'POST',headers:{'x-cron-secret':secret},body:'{}'}).catch(e=>console.error('immediate worker kick failed',e));
    }
  }

  return Response.json({
    ok:true,
    checked:episodes.length,
    broken,
    repairs,
    reportedRepairs,
    embedOnlyRepairs,
    degradedPrioritized:degradedIds.length,
    oldestPrioritized:oldestIds.length,
    integrity:integrity??null,
    concurrency
  })
});
