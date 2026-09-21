import { chromium } from 'playwright';

const commitCandidates=/^(1|true|yes)$/i.test(process.env.ANIMEPAHE_COMMIT_CANDIDATES||'');
const endpoint=(process.env.ANIMEPAHE_DETECT_URL||'').trim();
const secret=(process.env.MEDIA_BRIDGE_SECRET||'').replace(/[^\x20-\x7E]/g,'').trim();
if(commitCandidates&&(!endpoint||!secret))throw new Error('Live detector configuration missing');

const bases=['https://animepahe.pw/','https://animepahe.com/'];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({
  viewport:{width:1280,height:900},
  locale:'en-US',
  timezoneId:'Asia/Manila'
});
const page=await context.newPage();

async function settle(url){
  let response=null;
  try{response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000})}catch(e){console.log('ANIMEPAHE_NAV_ERROR='+url+' '+e.message)}
  await page.waitForTimeout(12000);
  const state=await page.evaluate(()=>({
    url:location.href,
    title:document.title,
    text:(document.body?.innerText||'').slice(0,500)
  })).catch(()=>({url:page.url(),title:'',text:''}));
  console.log('ANIMEPAHE_DOMAIN='+url+' STATUS='+(response?.status()||0)+' FINAL='+state.url+' TITLE='+JSON.stringify(state.title));
  const challenged=/just a moment|checking your browser|verify you are human|attention required|access denied/i.test(state.title+' '+state.text);
  return {accepted:!challenged&&/^https:\/\/animepahe\.(?:pw|com)\//i.test(state.url),challenged,state,status:response?.status()||0};
}

let base='';
for(const candidate of bases){
  const result=await settle(candidate);
  if(result.accepted){base=new URL(result.state.url).origin+'/';break}
  console.log('ANIMEPAHE_BLOCKED='+candidate+' challenged='+result.challenged);
}
if(!base){
  console.log('ANIMEPAHE_RESULT=blocked_by_cloudflare');
  console.log('ANIMEPAHE_DRY_RUN=true');
  await browser.close();
  process.exit(0);
}

async function pageFetch(path){
  const result=await page.evaluate(async path=>{
    const r=await fetch(path,{
      credentials:'include',
      headers:{accept:'application/json,text/plain,*/*','x-requested-with':'XMLHttpRequest'}
    });
    return {status:r.status,text:await r.text(),url:r.url};
  },path);
  let json=null;
  try{json=JSON.parse(result.text)}catch{}
  return {...result,json};
}

const airing=await pageFetch(new URL('api?m=airing&page=1',base).href);
console.log('ANIMEPAHE_AIRING_STATUS='+airing.status);
if(airing.status!==200||!airing.json)throw new Error('AnimePahe airing API unavailable inside accepted browser session');
const rows=Array.isArray(airing.json.data)?airing.json.data:[];
console.log('ANIMEPAHE_AIRING_COUNT='+rows.length);
console.log('ANIMEPAHE_AIRING_KEYS='+JSON.stringify([...new Set(rows.flatMap(x=>Object.keys(x||{})))].slice(0,40)));

const items=[];
const seen=new Set();
function add(item){
  if(!item?.title||!item?.url)return;
  let url;try{url=new URL(item.url,base).href}catch{return}
  if(!url.startsWith(base)||seen.has(url))return;
  seen.add(url);
  items.push({title:String(item.title).replace(/\s+/g,' ').trim(),url,episode:Number(item.episode)||null});
}
for(const e of rows){
  const episode=Number(e.episode);
  const animeSession=e.anime_session||e.anime_session_id||e.anime_id||e.session_id;
  const episodeSession=e.session||e.episode_session;
  const title=e.anime_title||e.title||e.anime?.title||'Anime';
  if(episode&&animeSession&&episodeSession)add({title:title+' Episode '+episode,url:`play/${animeSession}/${episodeSession}`,episode});
}

const anchors=await page.locator('a[href]').evaluateAll(as=>as.map(a=>({title:(a.textContent||'').trim(),url:a.href})).filter(x=>x.title&&x.url));
for(const a of anchors){
  if(/\/play\//i.test(a.url))add({title:a.title,url:a.url});
}

console.log('ANIMEPAHE_DISCOVERED='+items.length);
console.log('ANIMEPAHE_SAMPLE='+JSON.stringify(items.slice(0,10)));

if(commitCandidates){
  const r=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/json','x-media-bridge-secret':secret},
    body:JSON.stringify({items:items.slice(0,100)})
  });
  const body=await r.text();
  console.log('ANIMEPAHE_DETECT_STATUS='+r.status);
  console.log('ANIMEPAHE_DETECT_RESPONSE='+body.slice(0,4000));
  if(!r.ok)process.exitCode=1;
}else{
  console.log('ANIMEPAHE_DRY_RUN=true');
}

await browser.close();
