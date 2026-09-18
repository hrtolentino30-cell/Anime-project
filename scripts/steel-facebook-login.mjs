const STEEL_API = "https://api.steel.dev/v1";
const key = process.env.STEEL_API_KEY;
if (!key) throw new Error("Missing STEEL_API_KEY");

const headers = { "steel-api-key": key, "content-type": "application/json" };
const create = await fetch(`${STEEL_API}/sessions`, {
  method: "POST", headers,
  body: JSON.stringify({
    persistProfile: true,
    timeout: 900000,
    debugConfig: { interactive: true }
  })
});
if (!create.ok) throw new Error(`Steel session create failed: ${create.status} ${await create.text()}`);
const session = await create.json();

console.log("STEEL_SESSION_ID=" + session.id);
console.log("STEEL_PROFILE_ID=" + session.profileId);
console.log("FACEBOOK_LOGIN_URL=" + (session.debugUrl || session.sessionViewerUrl));
console.log("Open FACEBOOK_LOGIN_URL, complete the Facebook sign-in normally, and leave the session open.");
console.log("After sign-in, manually run the 'Finalize Facebook login' workflow with this session ID.");
