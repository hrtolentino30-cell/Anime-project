# Facebook authentication bootstrap

The scheduled monitor never stores or uses the Facebook password. It restores a Playwright browser session from the GitHub Actions secret `FACEBOOK_AUTH_STATE_B64`.

To create that secret, run the bootstrap on a trusted computer:

```bash
npm install
npx playwright install chromium
node scripts/facebook-auth-bootstrap.mjs
```

Log in only in the Facebook browser window. After the normal Facebook feed is visible, return to the terminal and press Enter. The script writes `facebook-auth-state.b64`, which is ignored by git. Its contents belong in the repository Actions secret named `FACEBOOK_AUTH_STATE_B64`. Delete the local file after the secret is saved.

If Facebook later invalidates the session, repeat the bootstrap. The monitor intentionally does not bypass login challenges, CAPTCHA, 2FA, or checkpoints.
