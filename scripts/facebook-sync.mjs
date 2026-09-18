import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const required = ["SUPABASE_URL","FACEBOOK_INGEST_SECRET","FACEBOOK_AUTH_STATE_B64"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);

const sources = (process.env.FACEBOOK_SOURCE_URLS || "").split("\n").map(x=>x.trim()).filter(Boolean);
if (!sources.length) throw new Error("Missing FACEBOOK_SOURCE_URLS");

const statePath = path.resolve("auth-state.json");
await fs.writeFile(statePath, Buffer.from(process.env.FACEBOOK_AUTH_STATE_B64, "base64"), { mode: 0o600 });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: statePath });
const page = await context.newPage();
const accepted = [];

function stableId(url="") {
  const m = url.match(/(?:videos\/|reel\/|posts\/)([^/?#]+)/i);
  return m?.[1] || crypto.createHash("sha256").update(url).digest("hex").slice(0,32);
}

async function ingest(item) {
  const r = await fetch(`${process.env.SUPABASE_URL}/functions/v1/facebook-ingest`, {
    method: "POST",
    headers: {"content-type":"application/json","x-ingest-secret":process.env.FACEBOOK_INGEST_SECRET},
    body: JSON.stringify(item)
  });
  if (!r.ok) throw new Error(`ingest ${r.status}: ${await r.text()}`);
  return r.json();
}

for (const sourceUrl of sources) {
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (/login|checkpoint/i.test(page.url())) throw new Error("Facebook session requires legitimate reauthentication");
  await page.waitForTimeout(3500);

  const posts = await page.locator('a[href*="/videos/"],a[href*="/reel/"]').evaluateAll((els) => {
    const seen = new Set();
    return els.map(a => {
      const href = a.href;
      if (!href || seen.has(href)) return null;
      seen.add(href);
      const article = a.closest('[role="article"]');
      const caption = article?.innerText?.slice(0,5000) || "";
      return { href, caption };
    }).filter(Boolean).slice(0,12);
  });

  for (const post of posts) {
    const postId = stableId(post.href);
    const result = await ingest({
      source_url: sourceUrl,
      url: post.href,
      post_id: postId,
      caption: post.caption
    });
    accepted.push({sourceUrl, postId, result});
  }
}

await context.close();
await browser.close();
await fs.rm(statePath, { force: true });
console.log(JSON.stringify({ok:true, checked:sources.length, accepted}, null, 2));
