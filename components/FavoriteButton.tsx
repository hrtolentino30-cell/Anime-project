'use client';
import { useEffect,useState } from 'react';
import { Heart } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function FavoriteButton({animeId}:{animeId:string}){
  const [active,setActive]=useState(false);
  const [userId,setUserId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let cancelled=false;
    const db=createSupabaseBrowserClient();
    void (async()=>{
      const {data:{user}}=await db.auth.getUser();
      if(cancelled)return;
      setUserId(user?.id??null);
      if(!user)return;
      const {data,error}=await db.from('favorites').select('anime_id').eq('user_id',user.id).eq('anime_id',animeId).maybeSingle();
      if(cancelled)return;
      if(error){setError('Could not load My List status.');return}
      setActive(Boolean(data));
    })();
    return()=>{cancelled=true};
  },[animeId]);

  async function toggle(){
    if(!userId){location.href='/login';return}
    if(busy)return;
    const previous=active;
    const next=!previous;
    setBusy(true);
    setError('');
    setActive(next);
    const db=createSupabaseBrowserClient();
    const result=next
      ?await db.from('favorites').upsert({user_id:userId,anime_id:animeId},{onConflict:'user_id,anime_id'})
      :await db.from('favorites').delete().eq('user_id',userId).eq('anime_id',animeId);
    if(result.error){
      setActive(previous);
      setError('My List could not be updated. Please try again.');
    }
    setBusy(false);
  }

  return <span className="favoriteControl"><button className={active?'primaryBtn':'ghostBtn'} disabled={busy} onClick={toggle} aria-pressed={active} aria-busy={busy}><Heart size={18} fill={active?'currentColor':'none'}/>{busy?'Saving…':active?'In My List':'Add to My List'}</button>{error&&<small className="inlineError" role="status" aria-live="polite">{error}</small>}</span>;
}
