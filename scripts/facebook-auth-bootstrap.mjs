import { chromium } from "playwright";
import fs from "node:fs/promises";

const out = process.argv[2] || "facebook-auth-state.b64";
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });

console.log("\nLog into Facebook in the browser window. Do not enter credentials in this terminal.");
console.log("When Facebook home/feed is visible, return here and press ENTER.\n");
process.stdin.resume();
await new Promise(resolve => process.stdin.once("data", resolve));

if (/login|checkpoint/i.test(page.url())) {
  console.error("Facebook is not in a normal authenticated state yet.");
  await browser.close();
  process.exit(2);
}

const state = await context.storageState();
await fs.writeFile(out, Buffer.from(JSON.stringify(state)).toString("base64") + "\n", {mode:0o600});
console.log(`Created ${out}. Treat this file as a secret. It is ignored by git.`);
await browser.close();
