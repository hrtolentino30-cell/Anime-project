import { declaredMedia } from './animotvslash-declared-media.mjs';
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { statSync, openSync, readSync, closeSync } from 'node:fs';

const proxy = (process.env.FACEBOOK_UPLOAD_PROXY_URL || '').trim();
const oidcBase = process.env.ACTIONS_ID_TOKEN_REQUEST_URL || '';
const oidcReq = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || '';
let token = '', tokenAt = 0, job, browser;
async function oidc() {
  if (token && Date.now() - tokenAt < 180000) return token;
  const r = await fetch(oidcBase + (oidcBase.includes('?') ? '&' : '?') + 'audience=animori-facebook-upload', {headers:{authorization:'Bearer ' + oidcReq},signal:AbortSignal.timeout(30000)});
  if (!r.ok) throw new Error('GitHub OIDC request failed: ' + r.status);
  token = (await r.json()).value; tokenAt = Date.now(); return token;
}
async function api(phase, body, query = '') {
  const headers = {authorization:'Bearer ' + await oidc()};
  if (job) { headers['x-episode-id'] = job.episode_id; headers['x-upload-attempt'] = String(job.attempts); }
  if (body) headers['content-type'] = Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json';
  const r = await fetch(proxy + '?phase=' + phase + query, {method:body ? 'POST' : 'GET',headers,body:body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined,signal:AbortSignal.timeout(110000)});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const error = new Error(`${phase} failed (${r.status}): ${JSON.stringify(data)}`);
    error.terminal = data.terminal === true;
    throw error;
  }
  return data;
}
async function verify(videoId) {
  for (let attempt=0; attempt<30; attempt++) {
    const data = await api('status',undefined,'&video_id=' + encodeURIComponent(videoId));
    console.log('FACEBOOK_PROCESSING=' + JSON.stringify(data));
    if (data.published === true && data.status?.video_status === 'ready') {
      await api('complete',{});
      console.log('FACEBOOK_PUBLISHED_VIDEO_ID=' + videoId);
      console.log('FACEBOOK_PERMALINK=' + (data.permalink_url || ''));
      return;
    }
    if (/error|failed/i.test(JSON.stringify(data.status || {}))) {
      const error = new Error('Facebook processing failed: ' + JSON.stringify(data.status)); error.terminal = true; throw error;
    }
    await new Promise(resolve => setTimeout(resolve,10000));
  }
  throw new Error('Facebook processing still pending; next run will reconcile this same video');
}
try {
  if (!proxy || !oidcBase || !oidcReq) throw new Error('Cloud upload proxy and GitHub OIDC are required');
  const requested = (process.env.ANIMOTV_EPISODE_URL || '').trim();
  job = (await api('next',undefined,requested ? '&episode_url=' + encodeURIComponent(requested) : '')).job;
  if (!job) { console.log('FACEBOOK_QUEUE_EMPTY'); process.exit(0); }
  console.log('FACEBOOK_QUEUE_CLAIMED=' + job.episode_id);
  if (job.finish_accepted && job.destination_video_id) {
    await verify(job.destination_video_id);
  } else {
    if (job.upload_started) throw new Error('Existing upload needs review; refusing a second video');
    browser = await chromium.launch({headless:true});
    const context = await browser.newContext();
    const page = await context.newPage();
    const hits = new Map();
    page.on('response', r => {
      const u=r.url();
      if (r.ok() && /\.m3u8(?:\?|$)/i.test(u)) hits.set(u,r.request().headers());
    });
    const response = await page.goto(job.episode_url,{waitUntil:'domcontentloaded',timeout:60000});
    if (!response?.ok()) throw new Error('Episode page failed: ' + response?.status());
    const declared = declaredMedia(await response.text(), job.episode_url);
    const browserAgent = await page.evaluate(() => navigator.userAgent);
    for (const media of declared) hits.set(media, {referer: job.episode_url, 'user-agent': browserAgent});
    console.log('DECLARED_MEDIA_COUNT=' + declared.length);
    const title = (await page.title()).replace(/\s*[-|–—:]?\s*ANIMOTVSLASH\s*$/i,'').trim();
    // Interact inside embedded frames: the old worker only clicked the outer document.
    const deadline = Date.now() + 65000;
    const clicked = new Set();
    // Exercise the page's ordinary mirror selector, instead of retrying only the default CDN.
    const mirror = page.locator('select.mirror').first();
    const mirrorValues = await mirror.locator('option').evaluateAll(options => options
      .filter(o => o.value && !/dub|animepahe/i.test(o.textContent || ''))
      .map(o => o.value)).catch(() => []);
    let mirrorIndex = 1, nextMirrorAt = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (!declared.length && Date.now() >= nextMirrorAt && mirrorIndex < Math.min(mirrorValues.length, 5)) {
        await mirror.selectOption(mirrorValues[mirrorIndex++], {timeout:3000}).catch(() => {});
        nextMirrorAt = Date.now() + 12000;
      }
      for (const frame of page.frames()) {
        if (frame.isDetached()) continue;
        await frame.locator('video').evaluateAll(videos => videos.forEach(v => { v.muted=true; v.play().catch(()=>{}); })).catch(()=>{});
        const controls = frame.locator('button, [role="button"], .vjs-big-play-button, .jw-icon-display, .plyr__control--overlaid, input[type="button"]');
        const n = Math.min(await controls.count().catch(()=>0),25);
        for (let i=0; i<n; i++) {
          const el=controls.nth(i);
          const label=await el.evaluate(e=>[e.textContent,e.getAttribute('aria-label'),e.getAttribute('title'),e.className].join(' ')).catch(()=>'');
          const key=frame.url()+'|'+i+'|'+label;
          if (!clicked.has(key) && /play|animo|moon|hydrax/i.test(label) && await el.isVisible().catch(()=>false)) {
            clicked.add(key); await el.click({timeout:1500}).catch(()=>{});
          }
        }
      }
      await page.waitForTimeout(1500);
    }
    console.log('PLAYER_FRAMES=' + JSON.stringify(page.frames().map(f=>f.url())));
    // ANIMOTVSLASH embeds the authorized Rumble playlist directly in its jw-player payload.
    // Browser autoplay can be blocked, so recover that declared playlist without depending on playback starting.
    for (const f of page.frames()) {
      const m=f.url().match(/\/jw-player\/([^/?#]+)/i);
      if (!m) continue;
      try {
        const raw=Buffer.from(decodeURIComponent(m[1]),'base64url').toString('utf8');
        const cfg=JSON.parse(raw);
        if (/^https:\/\/rumble\.com\/hls-vod\/.*\.m3u8(?:\?|$)/i.test(cfg.url || '')) hits.set(cfg.url,{});
      } catch {}
    }
    if (!hits.size) throw new Error('No declared MP4 or HLS source found after activating embedded players');
    const declaredRanks = new Map(declared.map((u, i) => [u, -100 + i]));
    const candidateRank = u => declaredRanks.has(u) ? declaredRanks.get(u) : /rumble\.com\/hls-vod\//i.test(u) ? 0 : /mega\/fetch\.nexabloom\.top/i.test(u) ? 2 : 1;
    console.log('MEDIA_CANDIDATES=' + JSON.stringify([...hits.keys()].map(u=>({host:new URL(u).host,rank:candidateRank(u)}))));
    const out='/tmp/facebook-upload.mp4';
    let ready=false;
    for (const [hls,headers] of [...hits.entries()].sort((a,b)=>candidateRank(a[0])-candidateRank(b[0]))) {
      // Replay the exact successful player request context. The CDN checks more than
      // Referer/User-Agent; preserving the browser's complete safe request header set
      // avoids stripping player-specific authorization signals.
      const cookies=(await context.cookies(hls)).map(x=>x.name+'='+x.value).join('; ');
      const blocked=new Set(['host','content-length','connection','accept-encoding','range']);
      const replayHeaders=Object.entries(headers)
        .filter(([k,v])=>v && !blocked.has(k.toLowerCase()) && !k.toLowerCase().startsWith('sec-ch-ua'))
        .map(([k,v])=>`${k}: ${v}\r\n`);
      if (cookies && !Object.keys(headers).some(k=>k.toLowerCase()==='cookie')) replayHeaders.push(`Cookie: ${cookies}\r\n`);
      const inputHeaders=replayHeaders.join('');
      console.log('MEDIA_REPLAY_HEADER_NAMES=' + JSON.stringify(replayHeaders.map(x=>x.split(':',1)[0])));
      const ff=spawnSync('ffmpeg',['-y','-nostdin','-rw_timeout','30000000','-http_persistent','0',...(inputHeaders ? ['-headers',inputHeaders] : []),'-i',hls,'-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',out],{encoding:'utf8',timeout:480000,maxBuffer:8*1024*1024});
      if (ff.status!==0) { console.error('MEDIA_REMUX_FAILED='+(ff.stderr || ff.error?.message || '').slice(-1600)); continue; }
      const probe=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',out],{encoding:'utf8',timeout:30000});
      if (probe.status!==0) continue;
      const info=JSON.parse(probe.stdout), video=info.streams?.find(s=>s.codec_type==='video'), audio=info.streams?.find(s=>s.codec_type==='audio');
      const duration=Number(info.format?.duration), audioDuration=Number(audio?.duration || duration);
      if (!video || !audio || video.height<480 || duration<300 || audioDuration<duration-10) { console.error('MEDIA_VALIDATION_FAILED: full episode, >=480p and full-length audio required'); continue; }
      console.log(`MEDIA_VALIDATED=${video.width}x${video.height} duration=${duration} audio=${audio.codec_name}`);
      ready=true; break;
    }
    await browser.close(); browser=null;
    if (!ready) throw new Error('No candidate passed full-episode audio/video validation');
    const size=statSync(out).size;
    let state=await api('start',{file_size:size});
    const videoId=String(state.video_id);
    console.log('FACEBOOK_UPLOAD_VIDEO_ID=' + videoId);
    const fd=openSync(out,'r');
    try {
      while (Number(state.start_offset)<Number(state.end_offset)) {
        const start=Number(state.start_offset), end=Number(state.end_offset);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<0 || end>size || end<=start) throw new Error('Invalid Meta upload offsets');
        const buf=Buffer.alloc(end-start), got=readSync(fd,buf,0,buf.length,start);
        if (got!==buf.length) throw new Error('Unexpected end of media file');
        state=await api('transfer',buf,'&start_offset='+start);
        if (Number(state.start_offset)<=start) throw new Error('Meta upload made no progress');
        console.log(`FACEBOOK_UPLOAD_PROGRESS=${state.start_offset}/${size}`);
      }
    } finally {closeSync(fd);}
    await api('finish',{title,description:title});
    await verify(videoId);
  }
} catch (error) {
  console.error('FACEBOOK_WORKER_FAILED=' + error.message);
  if (job) await api('fail',{error:error.message,terminal:!!error.terminal}).catch(e=>console.error('QUEUE_FAILURE_RECORD_FAILED='+e.message));
  process.exitCode=1;
} finally {if (browser) await browser.close();}
