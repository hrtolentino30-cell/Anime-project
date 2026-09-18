'use client';
import { useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
const KEY='animori_sid';
function sid(){let id=sessionStorage.getItem(KEY);if(!id){id=crypto.randomUUID();sessionStorage.setItem(KEY,id)}return id}
function device(){const w=innerWidth;return w<768?'mobile':w<1100?'tablet':'desktop'}
export function Analytics({eventName='page_view',animeId,episodeId,userId}:{eventName?:'page_view'|'anime_view';animeId?:string;episodeId?:string;userId?:string|null}){useEffect(()=>{const db=createSupabaseBrowserClient();let ref:string|undefined;try{ref=document.referrer?new URL(document.referrer).hostname:undefined}catch{}void db.from('analytics_events').insert({session_id:sid(),event_name:eventName,anime_id:animeId??null,episode_id:episodeId??null,user_id:userId??null,path:location.pathname,referrer_host:ref,device_type:device()})},[eventName,animeId,episodeId,userId]);return null}
export async function trackPlayback(event_name:string,anime_id:string,episode_id:string,source_id?:string,user_id?:string|null){const db=createSupabaseBrowserClient();return db.from('analytics_events').insert({session_id:sid(),event_name,anime_id,episode_id,source_id:source_id??null,user_id:user_id??null,path:location.pathname,device_type:device()})}
