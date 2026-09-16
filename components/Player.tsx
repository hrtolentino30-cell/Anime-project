'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import type { VideoSource } from '@/lib/types';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function Player({episodeId,animeId,sources,userId,initialPosition=0}:{episodeId:string;animeId:string;sources:VideoSource[];userId:string|null;initialPosition?:number}){
  const [selected,setSelected]=useState(sources[0]?.id??'');
  const source=useMemo(()=>sources.find(s=>s.id===selected)??sources[0],[sources,selected]);
  const videoRef=useRef<HTMLVideoElement|null>(null);

  useEffect(()=>{if(!userId)return;const db=createSupabaseBrowserClient();void db.from('watch_history').upsert({user_id:userId,anime_id:animeId,episode_id:episodeId,watched_at:new Date().toISOString()},{onConflict:'user_id,episode_id'})},[userId,episodeId,animeId]);

  useEffect(()=>{
    const video=videoRef.current;
    if(!video||!source)return;
    const url=source.stream_url??source.embed_url;
    if(!url)return;
    let hls:{destroy:()=>void}|undefined;
    let cancelled=false;
    video.removeAttribute('src');

    const onMeta=()=>{if(initialPosition>0&&Number.isFinite(video.duration)&&initialPosition<video.duration-15)video.currentTime=initialPosition};
    video.addEventListener('loadedmetadata',onMeta);

    if(source.source_type==='hls'){
      if(video.canPlayType('application/vnd.apple.mpegurl')){
        video.src=url;
      }else{
        void import('hls.js').then(({default:Hls})=>{
          if(cancelled||!Hls.isSupported())return;
          const instance=new Hls({enableWorker:true,capLevelToPlayerSize:true,maxBufferLength:30});
          hls=instance;
          instance.loadSource(url);
          instance.attachMedia(video);
        });
      }
    }else if(source.source_type==='mp4'){
      video.src=url;
    }

    return()=>{
      cancelled=true;
      video.removeEventListener('loadedmetadata',onMeta);
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  },[source,initialPosition]);

  useEffect(()=>{if(!userId)return;const db=createSupabaseBrowserClient();const save=async()=>{const video=videoRef.current;if(!video||!Number.isFinite(video.duration)||video.duration<=0)return;await Promise.all([db.from('playback_progress').upsert({user_id:userId,episode_id:episodeId,anime_id:animeId,position_seconds:video.currentTime,duration_seconds:video.duration,completed:video.currentTime/video.duration>0.92,updated_at:new Date().toISOString()},{onConflict:'user_id,episode_id'}),db.from('watch_history').upsert({user_id:userId,anime_id:animeId,episode_id:episodeId,watched_at:new Date().toISOString()},{onConflict:'user_id,episode_id'})])};const timer=setInterval(()=>void save(),10000);const video=videoRef.current;video?.addEventListener('pause',save);video?.addEventListener('ended',save);return()=>{clearInterval(timer);video?.removeEventListener('pause',save);video?.removeEventListener('ended',save);void save()}},[userId,episodeId,animeId,source?.id]);

  if(!source)return <div className="playerEmpty"><strong>No active player source is available.</strong><span>The source verifier may have disabled unhealthy mirrors, or ingestion is still pending.</span></div>;
  const url=source.stream_url??source.embed_url;
  const embed=source.source_type==='embed'||source.source_type==='other';

  return <div className="playerShell"><div className="playerFrame">{embed?<iframe src={url??''} title={`${source.server_name} player`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation" allowFullScreen referrerPolicy="no-referrer" loading="lazy"/>:<video ref={videoRef} controls playsInline preload="metadata"/>}</div><div className="servers" aria-label="Playback servers"><span>Servers</span>{sources.map(s=><button key={s.id} type="button" onClick={()=>setSelected(s.id)} className={s.id===source.id?'active':''} aria-pressed={s.id===source.id} title={`Play from ${s.server_name}`}><small>{s.language??'default'}</small>{s.server_name}{s.quality&&<em>{s.quality}</em>}</button>)}</div></div>;
}
