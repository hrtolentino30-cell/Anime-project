import { chromium } from "playwright";
const endpoint=(process.env.ANIMEPAHE_DETECT_URL||"").trim(),secret=(process.env.MEDIA_BRIDGE_SECRET||"").replace(/[^\x20-\x7E]/g,"").trim();
if(!endpoint||!secret)throw new Error("Detector configuration missing");
const bases=["https://animepahe.ru/","https://animepahe.com/","https://animepahe.org/","https://animepahe.pw/"];\nconst browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
let base=""; for(const b of bases){try{const rr=await page.goto(b,{waitUntil:"domcontentloaded",timeout:60000});await page.waitForTimeout(8000);if(rr&&rr.status()<400){base=b;break}}catch{}} if(!base)throw new Error("No AnimePahe domain accepted this browser session");
const items=[];
const seen=new Set();
const add=(title,url,episode=null)=>{if(!title||!url)return;try{url=new URL(url,base).href}catch{return}if(!url.startsWith(base)||seen.has(url))return;seen.add(url);items.push({title:String(title).replace(/\s+/g," ").trim(),url,episode})};
for(const x of await page.locator("a").evaluateAll(as=>as.map(a=>({title:(a.textContent||"").trim(),url:a.href}))))add(x.title,x.url);
const sessions=[...new Set(items.map(x=>x.url.match(/\/anime\/([^/?#]+)/)?.[1]).filter(Boolean))].slice(0,30);
for(const session of sessions){
 const api=base+"api?m=release&id="+encodeURIComponent(session)+"&sort=episode_desc&page=1";
 const res=await page.request.get(api,{headers:{referer:base}}).catch(()=>null); if(!res||!res.ok())continue;
 const j=await res.json().catch(()=>null); for(const e of j?.data||[]){const ep=Number(e.episode);const es=e.session;if(!ep||!es)continue;const parent=items.find(x=>x.url.includes("/anime/"+session));add((parent?.title||"Anime")+" Episode "+ep,base+"play/"+session+"/"+es,ep)}
}
console.log("ANIMEPAHE_DISCOVERED="+items.length);
const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-media-bridge-secret":secret},body:JSON.stringify({items:items.slice(0,100)})});
console.log("ANIMEPAHE_DETECT_STATUS="+r.status);console.log("ANIMEPAHE_DETECT_RESPONSE="+(await r.text()).slice(0,8000));if(!r.ok)process.exitCode=1;
await browser.close();
// Link Click S3E7 controlled validation
