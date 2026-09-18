const INDEX = "https://animotvslash.org/search-videos/";
const UA = "Mozilla/5.0 (compatible; AnimoriSync/1.0)";
const html = await (await fetch(INDEX,{headers:{"user-agent":UA}})).text();
const strip=s=>s.replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&#8217;|&rsquo;/g,"’").replace(/\s+/g," ").trim();
const matches=[...html.matchAll(/<a\b[^>]*href=["']([^"']*\/videos\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
const map=new Map();
for(const m of matches){const url=new URL(m[1],INDEX).href.split("#")[0];const title=strip(m[2]);if(title&&!map.has(url))map.set(url,{url,title});}
const items=[...map.values()];
if(!items.length) throw new Error("No /videos/ entries found");
console.log("ANIMOTVSLASH_DISCOVERED="+items.length);
for(const item of items) console.log(JSON.stringify(item));
