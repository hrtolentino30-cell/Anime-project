import{requireCronSecret,serviceClient,logEvent}from'../_shared/db.ts';

type CheckResult=true|false|null;
type SourceRow={
  id:string;
  episode_id:string;
  source_type:string|null;
  embed_url:string|null;
  stream_url:string|null;
  verification_failures:number|null;
  episode?:{source_url?:string;source_episode_id?:string}|null;
};

const UA=()=>Deno.env.get('SOURCE_USER_AGENT')??'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36';

function iframeBlocked(response:Response){
  const xfo=(response.headers.get('x-frame-options')||'').toLowerCase();
  if(xfo.includes('deny')||xfo.includes('sameorigin'))return true;
  const csp=(response.headers.get('content-security-policy')||'').toLowerCase();
  const frame=csp.match(/frame-ancestors\s+([^;]+)/)?.[1]??'';
  if(frame&&(/'none'/.test(frame)||(/^\s*'self'\s*$/.test(frame))))return true;
  return false;
}

function obviousErrorPage(text:string){
  const sample=text.slice(0,16000).toLowerCase();
  return /attention required!\s*\|\s*cloudflare|sorry, you have been blocked|error\s*-\s*megaplay|page you're looking for doesn't exist|video (?:was )?not found|file not found|stream unavailable|this video is unavailable/.test(sample);
}

async function checkDirect(url:string,type:string|null,referer:string):Promise<CheckResult>{
  try{
    const headers:Record<string,string>={'user-agent':UA(),referer,Range:'bytes=0-4095'};
    const r=await fetch(url,{headers,redirect:'follow',signal:AbortSignal.timeout(7000)});
    if(!(r.ok||r.status===206))return false;
    if(type==='hls'||/\.m3u8(?:\?|$)/i.test(url)){
      const text=await r.text();
      return text.includes('#EXTM3U');
    }
    return true;
  }catch{return false}
}

async function checkEmbed(url:string,referer:string):Promise<CheckResult>{
  try{
    const r=await fetch(url,{
      headers:{'user-agent':UA(),referer,accept:'text/html,application/xhtml+xml,*/*'},
      redirect:'follow',
      signal:AbortSignal.timeout(7000)
    });
    if(iframeBlocked(r))return false;
    if(r.status===403||r.status===429)return null;
    if(!r.ok)return false;
    const text=await r.text();
    if(obviousErrorPage(text))return false;
    return true;
  }catch{return null}
}

async function checkSource(source:SourceRow):Promise<CheckResult>{
  const referer=source.episode?.source_url||'https://animori.bond/';
  if(source.stream_url)return checkDirect(source.stream_url,source.source_type,referer);
  if(source.embed_url)return checkEmbed(source.embed_url,referer);
  return false;
}

Deno.serve(async req=>{
  try{await requireCronSecret(req)}catch(response){return response as Response}
  const db=serviceClient();
  const{data:sources,error}=await db.from('video_sources')
    .select('id,episode_id,source_type,embed_url,stream_url,verification_failures,last_verified_at,episode:episode_id(source_url,source_episode_id)')
    .eq('is_active',true)
    .order('last_verified_at',{ascending:true,nullsFirst:true})
    .limit(80);
  if(error)return Response.json({error:error.message},{status:500});

  let failed=0,disabled=0,resyncs=0,unknown=0,passed=0,cursor=0;
  const rows=(sources??[]) as unknown as SourceRow[];

  async function verify(source:SourceRow){
    const result=await checkSource(source);
    const now=new Date().toISOString();
    if(result===true){
      passed++;
      await db.from('video_sources').update({verification_failures:0,last_verified_at:now}).eq('id',source.id);
      return;
    }
    if(result===null){
      unknown++;
      await db.from('video_sources').update({last_verified_at:now}).eq('id',source.id);
      return;
    }

    failed++;
    const failures=Number(source.verification_failures??0)+1;
    const inactive=failures>=3;
    await db.from('video_sources').update({verification_failures:failures,last_verified_at:now,is_active:!inactive}).eq('id',source.id);

    const ep=source.episode;
    if(ep?.source_url&&ep?.source_episode_id){
      await db.rpc('enqueue_sync_job',{p_source_url:ep.source_url,p_source_id:ep.source_episode_id,p_item_type:'episode',p_priority:1});
      resyncs++;
    }
    await logEvent(db,'VIDEO_SOURCE_FAILED',{
      entityId:source.id,
      message:inactive?'Source disabled after repeated verification failures':'Source verification failed; episode queued for fast website repair',
      details:{failures,resyncQueued:!!ep,sourceType:source.source_type}
    });
    if(inactive)disabled++;
  }

  const concurrency=8;
  await Promise.all(Array.from({length:Math.min(concurrency,rows.length)},async()=>{
    while(true){
      const index=cursor++;
      if(index>=rows.length)break;
      await verify(rows[index]);
    }
  }));

  return Response.json({ok:true,checked:rows.length,passed,failed,unknown,disabled,resyncs,concurrency})
});
