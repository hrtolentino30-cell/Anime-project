import { chromium } from "playwright";
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const hits=[];
page.on("response",r=>{const u=r.url();if(/animepahe|\.m3u8|\.mp4|kwik|episode|play/i.test(u))hits.push({status:r.status(),url:u})});
await page.goto("https://animepahe.pw/anime",{waitUntil:"domcontentloaded",timeout:60000});await page.waitForTimeout(4000);
console.log("ANIMEPAHE_TITLE="+await page.title());
console.log("ANIMEPAHE_LINKS_JSON="+JSON.stringify(await page.locator("a").evaluateAll(as=>as.map(a=>({text:(a.textContent||"").trim(),href:a.href})).filter(x=>x.href.includes("animepahe")).slice(0,100))));
console.log("ANIMEPAHE_RESPONSES_JSON="+JSON.stringify(hits.slice(-100)));await browser.close();