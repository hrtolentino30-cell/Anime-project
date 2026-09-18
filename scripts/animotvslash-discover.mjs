const SOURCE = "https://animotvslash.org/";
const html = await (await fetch(SOURCE, { headers: { "user-agent": "Mozilla/5.0 AnimoriSync/1.0" } })).text();

const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
  .map(m => new URL(m[1], SOURCE).href)
  .filter(u => u.startsWith(SOURCE) && !u.includes("/anime/"));

const candidates = [...new Set(links)].filter(u =>
  /episode|\/videos\//i.test(new URL(u).pathname)
);

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  source: SOURCE,
  candidates: candidates.slice(0, 100)
}, null, 2));
