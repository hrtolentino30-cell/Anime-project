// Only read media explicitly declared by Animotvslash's own player configuration.
export function declaredMedia(html, episodeUrl) {
  const origin = new URL(episodeUrl).origin;
  const fragments = [html];
  for (const match of html.matchAll(/<option\b[^>]*value=["']([^"']+)["']/gi)) {
    try { fragments.push(Buffer.from(match[1], 'base64').toString('utf8')); } catch {}
  }
  const found = new Set();
  for (const fragment of fragments) {
    for (const match of fragment.matchAll(/(?:src|data-src)=["']([^"']+)["']/gi)) {
      try {
        const player = new URL(match[1].replace(/&amp;/g, '&'), episodeUrl);
        if (player.origin !== origin || !/^\/(?:jw|plyr|vidstack)-player\//.test(player.pathname)) continue;
        const payload = player.pathname.split('/')[2];
        const config = JSON.parse(Buffer.from(decodeURIComponent(payload), 'base64url').toString('utf8'));
        for (const key of ['url_1080', 'url_720', 'url', 'url_480']) {
          if (typeof config[key] !== 'string' || !config[key]) continue;
          const media = new URL(config[key]);
          if (media.protocol === 'https:' && /\.(?:m3u8|mp4)(?:$|\?)/i.test(media.href)) found.add(media.href);
        }
      } catch {}
    }
  }
  return [...found].sort((a, b) => Number(!/\.mp4(?:\?|$)/i.test(a)) - Number(!/\.mp4(?:\?|$)/i.test(b)));
}
