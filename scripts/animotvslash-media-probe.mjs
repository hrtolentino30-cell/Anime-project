import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { statSync, openSync, readSync, closeSync } from "node:fs";

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
      const proxy=(process.env.FACEBOOK_UPLOAD_PROXY_URL||"").trim();
      const oidcBase=process.env.ACTIONS_ID_TOKEN_REQUEST_URL||"", oidcReq=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||"";
      if(proxy&&oidcBase&&oidcReq){
        const tr=await fetch(oidcBase+(oidcBase.includes("?")?"&":"?")+"audience=animori-facebook-upload",{headers:{authorization:"Bearer "+oidcReq}});
        if(!tr.ok) throw new Error("GitHub OIDC token request failed "+tr.status);
        const jwt=(await tr.json()).value;
        const size=statSync(out).size;
        let r=await fetch(proxy+"?phase=start",{method:"POST",headers:{authorization:"Bearer "+jwt,"content-type":"application/json"},body:JSON.stringify({file_size:size})});
        let state=await r.json(); if(!r.ok) throw new Error("Facebook upload start failed "+JSON.stringify(state));
        const sid=String(state.upload_session_id), videoId=String(state.video_id||"");
        const fd=openSync(out,"r");
        try{
          while(Number(state.start_offset)<Number(state.end_offset)){
            const start=Number(state.start_offset), end=Number(state.end_offset), len=end-start;
            const buf=Buffer.alloc(len); const got=readSync(fd,buf,0,len,start);
            r=await fetch(proxy+"?phase=transfer&upload_session_id="+encodeURIComponent(sid)+"&start_offset="+start,{method:"POST",headers:{authorization:"Bearer "+jwt,"content-type":"application/octet-stream"},body:buf.subarray(0,got),duplex:"half"});
            state=await r.json(); if(!r.ok) throw new Error("Facebook upload transfer failed "+JSON.stringify(state));
            console.log("FACEBOOK_UPLOAD_PROGRESS="+state.start_offset+"/"+size);
          }
        } finally { closeSync(fd); }
        r=await fetch(proxy+"?phase=finish",{method:"POST",headers:{authorization:"Bearer "+jwt,"content-type":"application/json"},body:JSON.stringify({upload_session_id:sid,title:pageTitle,description:pageTitle})});
        const fin=await r.json(); if(!r.ok||fin.success===false) throw new Error("Facebook upload finish failed "+JSON.stringify(fin));
        console.log("FACEBOOK_UPLOAD_ACCEPTED_VIDEO_ID="+videoId);
        let verified=false;
        for(let attempt=1;attempt<=12;attempt++){
          await new Promise(resolve=>setTimeout(resolve,10000));
          const sr=await fetch(proxy+"?phase=status&video_id="+encodeURIComponent(videoId),{headers:{authorization:"Bearer "+jwt}});
          const sj=await sr.json().catch(()=>({}));
          console.log("FACEBOOK_STATUS_CHECK_"+attempt+"="+JSON.stringify(sj));
          const processing=sj?.status?.video_status||sj?.status?.processing_phase?.status||"";
          if(sr.ok && sj.published===true && !/processing|uploading|error|failed/i.test(String(processing))){verified=true;console.log("FACEBOOK_PUBLISHED_VIDEO_ID="+videoId);if(sj.permalink_url)console.log("FACEBOOK_PERMALINK="+sj.permalink_url);break;}
          if(/error|failed/i.test(String(processing)))throw new Error("Facebook post-upload processing failed "+JSON.stringify(sj));
        }
        if(!verified)throw new Error("Facebook upload accepted but public/published verification timed out");
      } else console.log("FACEBOOK_DIRECT_UPLOAD_SKIPPED=OIDC proxy unavailable");
      const pageId=(process.env.META_PAGE_ID||"").trim();
      const pageToken=(process.env.META_PAGE_ACCESS_TOKEN||"").replace(/[^\\x20-\\x7E]/g,"").trim();
      const graphVersion=(process.env.META_GRAPH_VERSION||"v26.0").trim();
      if(pageId && pageToken) {
        const { default: FormData } = await import("form-data");
        const form=new FormData();
        form.append("access_token",pageToken);
        form.append("description",pageTitle);
        form.append("source",createReadStream(out),{filename:"animori-episode.mp4",contentType:"video/mp4",knownLength:statSync(out).size});
        const upload=await fetch(`https://graph-video.facebook.com/${graphVersion}/${pageId}/videos`,{method:"POST",headers:form.getHeaders(),body:form,duplex:"half"});
        const responseText=await upload.text();
        console.log("FACEBOOK_DIRECT_UPLOAD_STATUS="+upload.status);
        console.log("FACEBOOK_DIRECT_UPLOAD_RESPONSE="+responseText.slice(0,500));
        if(!upload.ok) process.exitCode=1;
      } else {
        console.log("FACEBOOK_DIRECT_UPLOAD_SKIPPED=missing Meta runner secrets");
      }
    }
  }
} else {
  console.error("NO_HLS_SOURCE_FOUND; refusing low-quality preview MP4="+(previewMp4||"none"));
  process.exitCode=1;
}
