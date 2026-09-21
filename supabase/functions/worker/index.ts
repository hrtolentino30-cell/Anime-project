import{requireCronSecret,serviceClient,logEvent,getUpstreamBaseUrl}from'../_shared/db.ts';
import{UpstreamProvider}from'../_shared/sources/upstream/index.ts';
import{ingestAnime,ingestEpisode}from'../_shared/ingest.ts';

function errorMessage(error:unknown){
  if(error instanceof Error)return error.stack??error.message;
  if(error&&typeof error==='object'){
    const value=error as Record<string,unknown>,parts=[value.message,value.details,value.hint,value.code].filter((part):part is string=>typeof part==='string'&&part.length>0);
    if(parts.length)return parts.join(' | ');
    try{return JSON.stringify(error)}catch{}
  }
  return String(error)
}

function capacity(backlog:number,urgentRepairs:number){
  // Older repair pages can resolve many dynamic mirrors and are heavier than
  // normal discovery jobs. Keep repair batches smaller, while normal sync
  // still drains at the proven 8-job sequential rate.
  const max=urgentRepairs>0?4:8;
  return{limit:Math.max(1,Math.min(max,backlog||1)),concurrency:1};
}

Deno.serve(async req=>{
  try{await requireCronSecret(req)}catch(response){return response as Response}
  const db=serviceClient();
  let provider:UpstreamProvider;
  try{provider=new UpstreamProvider(await getUpstreamBaseUrl(db))}
  catch(error){return Response.json({error:errorMessage(error)},{status:500})}

  await db.rpc('recover_stale_sync_jobs',{p_age:'3 minutes'});

  const now=new Date().toISOString();
  const[{count:backlog,error:backlogError},{count:urgentRepairs,error:urgentError}]=await Promise.all([
    db.from('sync_queue').select('id',{count:'exact',head:true}).eq('status','pending').lte('available_at',now),
    db.from('sync_queue').select('id',{count:'exact',head:true}).eq('status','pending').lte('available_at',now).lte('priority',2)
  ]);
  if(backlogError||urgentError)return Response.json({error:(backlogError??urgentError)?.message},{status:500});
  const pending=Math.max(0,Number(backlog??0));
  const urgent=Math.max(0,Number(urgentRepairs??0));
  const mode=capacity(pending,urgent);

  const{data:run,error:runError}=await db.from('sync_runs').insert({run_type:'worker',details:{backlog:pending,urgent_repairs:urgent,batch_limit:mode.limit,concurrency:mode.concurrency}}).select('id').single();
  if(runError)return Response.json({error:runError.message},{status:500});

  const{data:jobs,error}=await db.rpc('claim_sync_jobs',{p_limit:mode.limit});
  if(error)return Response.json({error:error.message},{status:500});

  const list=jobs??[];
  const stats={new_anime:0,new_episodes:0,updated_anime:0,updated_episodes:0,errors:0};
  let cursor=0;

  async function processJob(job:any){
    try{
      const result=job.item_type==='anime'
        ?await ingestAnime(db,provider,job.source_url,run.id)
        :await ingestEpisode(db,provider,job.source_url,run.id);
      if(job.item_type==='anime'){
        if(result.isNew)stats.new_anime++;
        else if(result.changed)stats.updated_anime++;
      }else{
        if(result.isNew)stats.new_episodes++;
        else if(result.changed)stats.updated_episodes++;
      }
      await db.from('sync_queue').update({status:'completed',completed_at:new Date().toISOString(),last_error:null}).eq('id',job.id);
    }catch(err){
      stats.errors++;
      const message=errorMessage(err),terminal=job.attempts>=job.max_attempts,backoffSeconds=Math.min(1800,20*2**Math.max(0,job.attempts-1));
      await db.from('sync_queue').update({
        status:terminal?'failed':'pending',
        started_at:null,
        completed_at:terminal?new Date().toISOString():null,
        available_at:new Date(Date.now()+backoffSeconds*1000).toISOString(),
        last_error:message.slice(0,12000)
      }).eq('id',job.id);
      await logEvent(db,terminal?'SCRAPE_FAILED':'QUEUE_RETRY',{
        runId:run.id,sourceUrl:job.source_url,message,
        details:{attempts:job.attempts,maxAttempts:job.max_attempts,backoffSeconds}
      });
    }
  }

  await Promise.all(Array.from({length:Math.min(mode.concurrency,list.length)},async()=>{
    while(true){
      const index=cursor++;
      if(index>=list.length)break;
      await processJob(list[index]);
    }
  }));

  const{count:remaining}=await db.from('sync_queue').select('id',{count:'exact',head:true}).eq('status','pending').lte('available_at',new Date().toISOString());
  await db.from('sync_runs').update({
    finished_at:new Date().toISOString(),
    items_scanned:list.length,
    ...stats,
    details:{backlog_before:pending,backlog_after:Number(remaining??0),urgent_repairs:urgent,batch_limit:mode.limit,concurrency:mode.concurrency}
  }).eq('id',run.id);

  return Response.json({ok:true,runId:run.id,processed:list.length,backlogBefore:pending,backlogAfter:Number(remaining??0),urgentRepairs:urgent,batchLimit:mode.limit,concurrency:mode.concurrency,...stats})
});
