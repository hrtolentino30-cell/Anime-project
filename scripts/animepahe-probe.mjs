import { chromium } from "playwright";
const endpoint=(process.env.ANIMEPAHE_DETECT_URL||"").trim(),secret=(process.env.MEDIA_BRIDGE_SECRET||"").replace(/[^\x20-\x7E]/g,"").trim();
if(!endpoint||!secret)throw new Error("Detector configuration missing");
const bases=["https://animepahe.com/","https://animepahe.pw/"];\nconst browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const forcedTitle=(process.env.ANIMEPAHE_FORCE_TITLE||"").trim();
const forcedEpisode=Number(process.env.ANIMEPAHE_FORCE_EPISODE||0);
let base=""; for(const b of bases){try{const rr=await page.goto(b,{waitUntil:"domcontentloaded",timeout:60000});await page.waitForTimeout(8000);console.log("ANIMEPAHE_DOMAIN="+b+" STATUS="+(rr?.status()||0));if(rr&&rr.status()<400){base=b;break}}catch(e){console.log("ANIMEPAHE_DOMAIN_ERROR="+b+" "+e.message)}} if(!base)throw new Error("No AnimePahe domain accepted this browser session");
const items=[];
const seen=new Set();
const add=(title,url,episode=null)=>{if(!title||!url)return;try{url=new URL(url,base).href}catch{return}if(!url.startsWith(base)||seen.has(url))return;seen.add(url);items.push({title:String(title).replace(/\s+/g," ").trim(),url,episode})};
for(const x of await page.locator("a").evaluateAll(as=>as.map(a=>({title:(a.textContent||"").trim(),url:a.href}))))add(x.title,x.url);
// Prefer the upstream airing feed: it exposes anime id + episode session directly.
try {
  const ar=await page.request.get(base+"api?m=airing&page=1",{headers:{referer:base}});
  if(ar.ok()){
    const aj=await ar.json().catch(()=>null);
    for(const e of aj?.data||[]){
      const ep=Number(e.episode), id=e.anime_id||e.id, es=e.session;
      if(!ep||!id||!es)continue;
      add((e.anime_title||e.title||"Anime")+" Episode "+ep,base+"play/"+id+"/"+es,ep);
    }
  }
} catch {}
const sessions=[...new Set(items.map(x=>x.url.match(/\/anime\/([^/?#]+)/)?.[1]).filter(Boolean))].slice(0,30);
for(const session of sessions){
 const api=base+"api?m=release&id="+encodeURIComponent(session)+"&sort=episode_desc&page=1";
 const res=await page.request.get(api,{headers:{referer:base}}).catch(()=>null); if(!res||!res.ok())continue;
 const j=await res.json().catch(()=>null); for(const e of j?.data||[]){const ep=Number(e.episode);const es=e.session;if(!ep||!es)continue;const parent=items.find(x=>x.url.includes("/anime/"+session));add((parent?.title||"Anime")+" Episode "+ep,base+"play/"+session+"/"+es,ep)}
}
if(forcedTitle&&forcedEpisode){
  try{
    const q=new URL(base+"api"); q.searchParams.set("m","search"); q.searchParams.set("q",forcedTitle); q.searchParams.set("_",String(Date.now()));
    const sr=await page.request.get(q.href,{headers:{referer:base}});
    console.log("ANIMEPAHE_FORCE_SEARCH_STATUS="+sr.status());
    if(sr.ok()){
      const sj=await sr.json().catch(()=>null);
      const hit=(sj?.data||[]).find(x=>String(x.title||"").toLowerCase().includes(forcedTitle.toLowerCase()))||(sj?.data||[])[0];
      if(hit){
        const rr=await page.request.get(base+"api?m=release&id="+encodeURIComponent(hit.session)+"&sort=episode_asc&page=1",{headers:{referer:base}});
        const rj=await rr.json().catch(()=>null); const last=Number(rj?.last_page||1); let eps=[...(rj?.data||[])];
        for(let p=2;p<=last;p++){const pr=await page.request.get(base+"api?m=release&id="+encodeURIComponent(hit.session)+"&sort=episode_asc&page="+p,{headers:{referer:base}});const pj=await pr.json().catch(()=>null);eps.push(...(pj?.data||[]))}
        const ep=eps.find(x=>Number(x.episode)===forcedEpisode);
        if(ep?.session)add(hit.title+" Episode "+forcedEpisode,base+"play/"+hit.session+"/"+ep.session,forcedEpisode);
      }
    }
  }catch(e){console.log("ANIMEPAHE_FORCE_ERROR="+e.message)}
}
console.log("ANIMEPAHE_DISCOVERED="+items.length);
const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-media-bridge-secret":secret},body:JSON.stringify({items:items.slice(0,100)})});
console.log("ANIMEPAHE_DETECT_STATUS="+r.status);console.log("ANIMEPAHE_DETECT_RESPONSE="+(await r.text()).slice(0,8000));if(!r.ok)process.exitCode=1;
await browser.close();
// Link Click S3E7 controlled validation
