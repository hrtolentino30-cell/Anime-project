import { chromium } from "playwright";
const endpoint=(process.env.ANIMEPAHE_DETECT_URL||"").trim();
const secret=(process.env.MEDIA_BRIDGE_SECRET||"").replace(/[^\x20-\x7E]/g,"").trim();
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const api=[];
page.on("response",async r=>{const u=r.url();if(/animepahe|api|release|episode/i.test(u)){let body="";try{const ct=r.headers()["content-type"]||"";if(/json/.test(ct))body=(await r.text()).slice(0,200000)}catch{}api.push({status:r.status(),url:u,body})}});
await page.goto("https://animepahe.pw/",{waitUntil:"domcontentloaded",timeout:60000});await page.waitForTimeout(5000);
console.log("ANIMEPAHE_TITLE="+await page.title());
console.log("ANIMEPAHE_URL="+page.url());
const dom=await page.locator("a").evaluateAll(as=>as.map(a=>({title:(a.textContent||"").replace(/\s+/g," ").trim(),url:a.href})).filter(x=>x.title&&x.url));
const found=new Map();
const add=(title,url)=>{try{const u=new URL(url,"https://animepahe.pw/").href;if(!u.startsWith("https://animepahe.pw/"))return;const key=u;if(!found.has(key))found.set(key,{title:String(title||"").replace(/\s+/g," ").trim(),url:u})}catch{}};
for(const x of dom)add(x.title,x.url);
for(const x of api){if(!x.body)continue;try{const j=JSON.parse(x.body);const walk=v=>{if(!v)return;if(Array.isArray(v))return v.forEach(walk);if(typeof v==="object"){const title=v.title||v.anime_title||v.name||v.episode_title||"";const url=v.url||v.link||v.episode_url||v.session&&("/play/"+v.session);if(title&&url)add(title,url);Object.values(v).forEach(walk)}};walk(j)}catch{}}
const items=[...found.values()];
console.log("ANIMEPAHE_DISCOVERED="+items.length);
console.log("ANIMEPAHE_ITEMS_JSON="+JSON.stringify(items.slice(0,300)));
if(endpoint&&secret){const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-media-bridge-secret":secret},body:JSON.stringify({items})});const t=await r.text();console.log("ANIMEPAHE_DETECT_STATUS="+r.status);console.log("ANIMEPAHE_DETECT_RESPONSE="+t.slice(0,8000));if(!r.ok)process.exitCode=1}else{throw new Error("Detector configuration missing")}
await browser.close();