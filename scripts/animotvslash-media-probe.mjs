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

const frames = await page.locator("iframe").evaluateAll(els => els.map(e => e.src).filter(Boolean));
const videos = await page.locator("video").evaluateAll(els => els.flatMap(v => [v.currentSrc,v.src,...[...v.querySelectorAll("source")].map(s=>s.src)]).filter(Boolean));

console.log("EPISODE_URL="+pageUrl);
for(const u of [...new Set([...frames,...videos,...hits])]) console.log("MEDIA_CANDIDATE="+u);
await browser.close();
