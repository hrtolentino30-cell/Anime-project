const STEEL_API = "https://api.steel.dev/v1";
const key = process.env.STEEL_API_KEY;
const sessionId = process.env.STEEL_SESSION_ID;
if (!key || !sessionId) throw new Error("Missing STEEL_API_KEY or STEEL_SESSION_ID");
const res = await fetch(`${STEEL_API}/sessions/${encodeURIComponent(sessionId)}/release`, {
  method: "POST",
  headers: { "steel-api-key": key, "content-type": "application/json" }
});
if (!res.ok) throw new Error(`Steel release failed: ${res.status} ${await res.text()}`);
console.log("Session released. Steel will persist the Facebook login into its profile.");
