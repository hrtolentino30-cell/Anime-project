'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import type { VideoSource } from '@/lib/types';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { trackPlayback } from './Analytics';

export function Player({episodeId,animeId,sources,userId,initialPosition=0,nextEpisodeId}:{episodeId:string;animeId:string;sources:VideoSource[];userId:string|null;initialPosition?:number;nextEpisodeId?:string}){
  const [selected,setSelected]=useState(sources[0]?.id??'');
  const [notice,setNotice]=useState('');
  const [saveError,setSaveError]=useState('');
  const [autoNext,setAutoNext]=useState(true);
  const videoRef=useRef<HTMLVideoElement|null>(null);const milestones=useRef(new Set<number>());
  const source=useMemo(()=>sources.find(s=>s.id===selected)??sources[0],[sources,selected]);

  useEffect(()=>{if(!sources.some(s=>s.id===selected))setSelected(sources[0]?.id??'')},[sources,selected]);
  useEffect(()=>{if(!userId)return;const db=createSupabaseBrowserClient();void db.from('watch_history').upsert({user_id:userId,anime_id:animeId,episode_id:episodeId,watched_at:new Date().toISOString()},{onConflict:'user_id,episode_id'}).then((result:{error:unknown})=>{if(result.error)setSaveError('Watch history could not be saved.')})},[userId,episodeId,animeId]);

  useEffect(()=>{
    const video=videoRef.current;if(!video||!source)return;const url=source.stream_url??source.embed_url;if(!url)return;
    let hls:{destroy:()=>void}|undefined;let cancelled=false;const sourceIndex=sources.findIndex(s=>s.id===source.id);
    const failover=()=>{if(cancelled)return;const next=sources[sourceIndex+1];if(next){setNotice(`Source unavailable. Trying ${next.server_name}…`);setSelected(next.id)}else setNotice('This episode has no other healthy source right now.')};
    video.pause();video.removeAttribute('src');video.load();setNotice('');
    const onMeta=()=>{milestones.current.clear();void trackPlayback('play_start',animeId,episodeId,source.id,userId);if(initialPosition>0&&Number.isFinite(video.duration)&&initialPosition<video.duration-15){video.currentTime=initialPosition;setNotice(`Resumed from ${formatTime(initialPosition)}.`)}};
    const onTime=()=>{if(!video.duration)return;const p=video.currentTime/video.duration;for(const [t,n] of [[.25,25],[.5,50],[.75,75]] as const)if(p>=t&&!milestones.current.has(n)){milestones.current.add(n);void trackPlayback(`play_${n}`,animeId,episodeId,source.id,userId)}};const onError=()=>failover();video.addEventListener('loadedmetadata',onMeta);video.addEventListener('timeupdate',onTime);video.addEventListener('error',onError);
    if(source.source_type==='hls'){
      if(video.canPlayType('application/vnd.apple.mpegurl'))video.src=url;
      else void import('hls.js').then(({default:Hls})=>{if(cancelled||!Hls.isSupported()){if(!cancelled)failover();return}const instance=new Hls({enableWorker:true,capLevelToPlayerSize:true,maxBufferLength:30});hls=instance;instance.on(Hls.Events.ERROR,(_event:any,data:any)=>{if(data?.fatal)failover()});instance.loadSource(url);instance.attachMedia(video)}).catch(()=>failover());
    }else if(source.source_type==='mp4')video.src=url;
    return()=>{cancelled=true;video.removeEventListener('loadedmetadata',onMeta);video.removeEventListener('timeupdate',onTime);video.removeEventListener('error',onError);hls?.destroy();video.pause();video.removeAttribute('src');video.load()};
  },[source,initialPosition,sources]);

  useEffect(()=>{
    if(!userId)return;const db=createSupabaseBrowserClient();
    const save=async()=>{const video=videoRef.current;if(!video||!Number.isFinite(video.duration)||video.duration<=0)return true;const progress=await db.from('playback_progress').upsert({user_id:userId,episode_id:episodeId,anime_id:animeId,position_seconds:video.currentTime,duration_seconds:video.duration,completed:video.currentTime/video.duration>0.92,updated_at:new Date().toISOString()},{onConflict:'user_id,episode_id'});const error=progress.error;setSaveError(error?'Progress could not be saved.':'');return !error};
    const timer=setInterval(()=>void save(),30000);const video=videoRef.current;const onPause=()=>{void save()};const onEnded=()=>{void trackPlayback('play_complete',animeId,episodeId,source?.id,userId);void (async()=>{await save();if(autoNext&&nextEpisodeId){setNotice('Episode complete. Loading next episode…');setTimeout(()=>location.assign(`/watch/${nextEpisodeId}`),700)}})()};video?.addEventListener('pause',onPause);video?.addEventListener('ended',onEnded);
    return()=>{clearInterval(timer);video?.removeEventListener('pause',onPause);video?.removeEventListener('ended',onEnded);void save()};
  },[userId,episodeId,animeId,source?.id,nextEpisodeId,autoNext]);

  if(!source)return <div className="playerEmpty"><strong>No active player source is available.</strong><span>The source verifier may have disabled unhealthy mirrors, or ingestion is still pending.</span></div>;
  const url=source.stream_url??source.embed_url;const embed=source.source_type==='embed'||source.source_type==='other';
  return <div className="playerShell">
    <div className="playerFrame">{embed?<iframe src={url??''} title={`${source.server_name} player`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="no-referrer" loading="lazy"/>:<video ref={videoRef} controls playsInline preload="metadata"/>}</div>
    <div className="servers" aria-label="Playback servers"><span>Servers</span>{sources.map((s,index)=><button key={s.id} type="button" onClick={()=>{setNotice('');void trackPlayback('source_change',animeId,episodeId,s.id,userId);setSelected(s.id)}} className={s.id===source.id?'active':''} aria-pressed={s.id===source.id} title={`Play from ${s.server_name}`}><small>{s.language??'default'}</small>{s.server_name}{s.quality&&<em>{s.quality}</em>}{index>0&&s.source_type!=='hls'&&s.source_type!=='mp4'&&<em>fallback</em>}</button>)}{nextEpisodeId&&<label className="autoNext"><input type="checkbox" checked={autoNext} onChange={e=>setAutoNext(e.target.checked)}/>Auto-next</label>}</div>
    {(notice||saveError)&&<div className="playerNotice" role="status" aria-live="polite">{notice}{notice&&saveError?' · ':''}{saveError}</div>}
  </div>;
}
function formatTime(seconds:number){const total=Math.max(0,Math.floor(seconds)),m=Math.floor(total/60),s=total%60;return `${m}:${String(s).padStart(2,'0')}`}
