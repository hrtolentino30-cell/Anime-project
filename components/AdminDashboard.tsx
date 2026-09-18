import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AdminControls,DisableSourceButton,RetryButton } from './AdminControls';

function safeError(value?:string|null){return(value??'').replace(/https?:\/\/[^\s/)]+/gi,'[upstream]').replace(/\b[a-z0-9.-]+\.(?:org|com|net|pro|ru)\b/gi,'[upstream]')}
function isNaturallyArchived(job:any,replacements:Set<string>){return replacements.has(job.source_url)||job.source_url?.includes('/community/')||/HTTP 404|episodes_anime_id_episode_number_key|already exists/i.test(job.last_error??'')}

export async function AdminDashboard(){
  const db=await createSupabaseServerClient();
  const [animeResult,episodeResult,openResult,{data:latestEpisode},{data:activeQueue},{data:failedRows},{data:runs},{data:events},{data:sources}]=await Promise.all([
    db.from('anime').select('id',{count:'exact',head:true}),
    db.from('episodes').select('id',{count:'exact',head:true}),
    db.from('sync_queue').select('id',{count:'exact',head:true}).in('status',['pending','processing']),
    db.from('episodes').select('id,episode_number,updated_at,anime:anime_id(title)').order('updated_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('sync_queue').select('id,status,source_id,item_type,created_at,last_error').in('status',['pending','processing']).order('priority').order('created_at').limit(30),
    db.from('sync_queue').select('id,status,source_id,source_url,item_type,created_at,last_error').eq('status','failed').order('created_at',{ascending:false}).limit(100),
    db.from('sync_runs').select('id,run_type,started_at,finished_at,items_scanned,new_anime,new_episodes,updated_anime,updated_episodes,errors').order('started_at',{ascending:false}).limit(12),
    db.from('sync_events').select('id,event_type,message,created_at').order('created_at',{ascending:false}).limit(25),
    db.from('video_sources').select('id,server_name,source_type,is_active,verification_failures,last_verified_at,episode:episode_id(episode_number,anime:anime_id(title))').or('verification_failures.gt.0,is_active.eq.false').order('verification_failures',{ascending:false}).limit(12),
  ]);

  const failed=failedRows??[];
  const failedUrls=[...new Set(failed.map((x:any)=>x.source_url).filter(Boolean))];
  const {data:replacementRows}=failedUrls.length?await db.from('sync_queue').select('source_url').in('source_url',failedUrls).in('status',['pending','processing','completed']):{data:[] as any[]};
  const replacements=new Set((replacementRows??[]).map((x:any)=>x.source_url));
  const actionable=failed.filter((job:any)=>!isNaturallyArchived(job,replacements));
  const archivedCount=failed.length-actionable.length;
  const lastRun=runs?.[0];
  const {data:analytics}=await db.rpc('analytics_admin_summary',{p_days:30});
  const a=(analytics??{}) as any;

  return <div className="adminPage">
    <div className="adminKicker"><strong>Operations</strong><span>Live catalog & ingestion health</span></div><div className="statsGrid"><Stat label="Anime" value={animeResult.count??0}/><Stat label="Episodes" value={episodeResult.count??0}/><Stat label="Open queue" value={openResult.count??0}/><Stat label="Needs attention" value={actionable.length}/><Stat label="Latest episode" value={latestEpisode?`${(latestEpisode.anime as any)?.title??'—'} · EP ${latestEpisode.episode_number}`:'—'}/><Stat label="Latest sync" value={lastRun?.finished_at?new Date(lastRun.finished_at).toLocaleString():'—'}/></div>
    <div className="adminKicker"><strong>Audience · 30 days</strong><span>First-party measured events; no modeled traffic</span></div><div className="statsGrid analyticsGrid"><Stat label="Sessions" value={a.sessions??0}/><Stat label="Known users" value={a.users??0}/><Stat label="Anime views" value={a.anime_views??0}/><Stat label="Play starts" value={a.play_starts??0}/><Stat label="Completion" value={`${a.completion_rate??0}%`}/><Stat label="Avg session" value={`${a.avg_session_minutes??0}m`}/></div>
    <AdminControls/>

    <section className="adminSection"><div className="sectionHead"><h2>Queue</h2><span>{openResult.count??0} active · {archivedCount} stale/resolved failures hidden</span></div><div className="adminTable"><div className="adminRow head"><span>Status</span><span>Item</span><span>Type</span><span>Created</span><span>Action</span></div>{[...(activeQueue??[]),...actionable.slice(0,10)].map((job:any)=><div className="adminRow" key={job.id}><span className={`status ${job.status}`}>{job.status}</span><span>{job.source_id??'Queued item'}</span><span>{job.item_type}</span><span>{new Date(job.created_at).toLocaleString()}</span>{job.status==='failed'?<RetryButton id={job.id}/>:<span/>}{job.last_error&&<code>{safeError(job.last_error).slice(0,600)}</code>}</div>)}</div></section>

    <section className="adminSection"><div className="sectionHead"><h2>Problematic video sources</h2><span>Three verification failures deactivate a source.</span></div><div className="adminTable"><div className="adminRow head"><span>State</span><span>Server / episode</span><span>Fails</span><span>Verified</span><span>Action</span></div>{(sources??[]).map((s:any)=><div className="adminRow" key={s.id}><span className={`status ${s.is_active?'processing':'failed'}`}>{s.is_active?'active':'inactive'}</span><span>{s.server_name} · {(s.episode as any)?.anime?.title??'Unknown'} EP {(s.episode as any)?.episode_number??'—'}</span><span>{s.verification_failures}</span><span>{s.last_verified_at?new Date(s.last_verified_at).toLocaleString():'never'}</span><DisableSourceButton id={s.id} disabled={!s.is_active}/></div>)}</div></section>

    <section className="adminSection"><div className="sectionHead"><h2>Sync history</h2></div><div className="runGrid">{(runs??[]).map((r:any)=><article key={r.id}><strong>{r.run_type}</strong><span>{new Date(r.started_at).toLocaleString()}</span><p>{r.items_scanned} items · {r.new_anime+r.new_episodes} new · {r.updated_anime+r.updated_episodes} updated · {r.errors} errors</p></article>)}</div></section>
    <section className="adminSection"><div className="sectionHead"><h2>Sync events</h2></div><div className="eventList">{(events??[]).map((e:any)=><article key={e.id}><span className="eventType">{e.event_type}</span><div><strong>{safeError(e.message)||'Sync event'}</strong><small>{new Date(e.created_at).toLocaleString()}</small></div></article>)}</div></section>
  </div>;
}

function Stat({label,value}:{label:string;value:string|number}){return <div className="stat"><span>{label}</span><strong title={String(value)}>{value}</strong></div>}
