# Animori Source Bridge

Minimal browser-side bridge for authorized AnimePahe access. It does not automate or bypass site challenges. After the user has normally opened an AnimePahe /play/ page, it submits only the episode title, number and current play URL to Animori's secured detector endpoint.

Load this folder as an unpacked Chromium extension, open its options page once, save the existing MEDIA_BRIDGE_SECRET, then browse normally. No cookies, clearance tokens, or media are exported.
