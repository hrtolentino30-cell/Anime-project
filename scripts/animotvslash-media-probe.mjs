import { chromium } from "playwright";

const pageUrl = process.env.ANIMOTV_EPISODE_URL || "https://animotvslash.org/the-beginning-after-the-end-season-2-episode-10/";
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
const hits = new Set();

page.on("response", r => {
  const u=r.url();
  if (/\.m3u8(?:\?|$)|\.mp4(?:\?|$)|master\.m3u8|playlist\.m3u8/i.test(u)) hits.add(u);
});

await page.goto(pageUrl,{waitUntil:"domcontentloaded",timeout:60000});
await page.waitForTimeout(4000);

// Try visible player/server controls to trigger lazy media requests.
const controls = page.locator("button, a");
const count = Math.min(await controls.count(), 40);
for (let i=0;i<count;i++) {
  const el=controls.nth(i);
  const text=((await el.innerText().catch(()=>"")).trim());
  if (/ANIMO|Moon|Hydrax|VidHide|Vidara|play/i.test(text)) {
    await el.click({timeout:2000}).catch(()=>{});
    await page.waitForTimeout(1200);
  }
}

const frames = await page.locator("iframe").evaluateAll(els => els.map(e => e.src).filter(Boolean));
const videos = await page.locator("video").evaluateAll(els => els.flatMap(v => [v.currentSrc,v.src,...[...v.querySelectorAll("source")].map(s=>s.src)]).filter(Boolean));

console.log("EPISODE_URL="+pageUrl);
for(const u of [...new Set([...frames,...videos,...hits])]) console.log("MEDIA_CANDIDATE="+u);
const pageTitle=await page.title();
await browser.close();

// Emit machine-readable direct media URLs for downstream ingestion.
const candidates=[...new Set([...videos,...hits])].filter(u=>/\.m3u8(?:\?|$)|\.mp4(?:\?|$)/i.test(u));
console.log("DIRECT_MEDIA_JSON="+JSON.stringify(candidates));
const directMp4=candidates.find(u=>/\.mp4(?:\?|$)/i.test(u));
if(directMp4) {
  console.log("DIRECT_MP4="+directMp4);
  const cleanEnv=v=>(v||"").trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9_:\/.?=&%-]+$/g,"");
  const bridgeUrl=cleanEnv(process.env.FACEBOOK_RESOLVED_MEDIA_URL);
  const bridgeSecret=cleanEnv(process.env.MEDIA_BRIDGE_SECRET);
  if (bridgeUrl && bridgeSecret) {
    const payload={episode_url:pageUrl,caption:pageTitle,media_url:directMp4};
    const ir=await fetch(bridgeUrl,{method:"POST",headers:{"content-type":"application/json","x-media-bridge-secret":bridgeSecret},body:JSON.stringify(payload)});
    console.log("FACEBOOK_BRIDGE_STATUS="+ir.status);
    console.log("FACEBOOK_BRIDGE_RESPONSE="+(await ir.text()).slice(0,500));
  } else console.log("FACEBOOK_BRIDGE_SKIPPED=missing bridge configuration");
}
