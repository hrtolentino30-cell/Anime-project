import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";

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

// Prefer the HLS playback source. It carries the real adaptive-quality streams and audio.
const candidates=[...new Set([...videos,...hits])].filter(u=>/\.m3u8(?:\?|$)|\.mp4(?:\?|$)/i.test(u));
console.log("DIRECT_MEDIA_JSON="+JSON.stringify(candidates));
const hls=candidates.find(u=>/\.m3u8(?:\?|$)/i.test(u));
const previewMp4=candidates.find(u=>/\.mp4(?:\?|$)/i.test(u));
if(hls) {
  console.log("SOURCE_HLS="+hls);
  const out="/tmp/facebook-upload.mp4";
  const ff=spawnSync("ffmpeg",["-y","-i",hls,"-map","0:v:0","-map","0:a:0","-c","copy","-movflags","+faststart",out],{encoding:"utf8",timeout:240000});
  if(ff.status!==0) {
    console.error("FFMPEG_REMUX_FAILED="+(ff.stderr||"").slice(-1500));
    process.exitCode=1;
  } else {
    const probe=spawnSync("ffprobe",["-v","error","-show_entries","stream=codec_type,width,height,codec_name","-of","json",out],{encoding:"utf8"});
    console.log("MEDIA_PROBE="+probe.stdout.trim());
    const info=JSON.parse(probe.stdout||"{\"streams\":[]}");
    const video=info.streams?.find(s=>s.codec_type==="video");
    const audio=info.streams?.find(s=>s.codec_type==="audio");
    if(!video || !audio || (video.height||0)<480) {
      console.error("MEDIA_VALIDATION_FAILED=requires audio and at least 480p");
      process.exitCode=1;
    } else {
      console.log("FACEBOOK_MEDIA_READY="+out+" bytes="+statSync(out).size+" resolution="+video.width+"x"+video.height);
    }
  }
} else {
  console.error("NO_HLS_SOURCE_FOUND; refusing low-quality preview MP4="+(previewMp4||"none"));
  process.exitCode=1;
}
