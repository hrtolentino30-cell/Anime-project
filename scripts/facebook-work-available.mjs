import fs from 'node:fs';

const proxy=(process.env.FACEBOOK_UPLOAD_PROXY_URL||'').trim();
const oidcBase=process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'';
const oidcToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'';
const requested=(process.env.ANIMOTV_EPISODE_URL||'').trim();
if(!proxy||!oidcBase||!oidcToken)throw new Error('Facebook queue probe requires proxy and GitHub OIDC');
if(requested){
  console.log('FACEBOOK_WORK_AVAILABLE=true');
  console.log('FACEBOOK_PENDING_COUNT=1');
  if(process.env.GITHUB_OUTPUT){
    fs.appendFileSync(process.env.GITHUB_OUTPUT,'has_work=true\n');
    fs.appendFileSync(process.env.GITHUB_OUTPUT,'pending_count=1\n');
  }
  process.exit(0);
}

const tokenResponse=await fetch(
  oidcBase+(oidcBase.includes('?')?'&':'?')+'audience=animori-facebook-upload',
  {headers:{authorization:'Bearer '+oidcToken},signal:AbortSignal.timeout(30000)}
);
if(!tokenResponse.ok)throw new Error('OIDC request failed: '+tokenResponse.status);
const token=(await tokenResponse.json()).value;
const r=await fetch(proxy+'?phase=available',{
  headers:{authorization:'Bearer '+token},
  signal:AbortSignal.timeout(30000)
});
if(!r.ok)throw new Error('Availability request failed: '+r.status+' '+await r.text());
const data=await r.json();
const value=data.available===true?'true':'false';
const pending=Math.max(0,Math.min(2,Number(data.pending)||0));
console.log('FACEBOOK_WORK_AVAILABLE='+value);
console.log('FACEBOOK_PENDING_COUNT='+pending);
if(process.env.GITHUB_OUTPUT){
  fs.appendFileSync(process.env.GITHUB_OUTPUT,'has_work='+value+'\n');
  fs.appendFileSync(process.env.GITHUB_OUTPUT,'pending_count='+pending+'\n');
}
