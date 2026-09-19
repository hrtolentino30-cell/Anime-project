// Short HLS episodes need a finite playlist, declared-player provenance,
// and matching source, video, audio, and output durations.
export function episodePlayerUrls(html, episodeUrl) {
  const urls = new Set();
  for (const option of html.matchAll(/<option\b[^>]*value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi)) {
    if (/dub|animepahe/i.test(option[2])) continue;
    try {
      const embed = Buffer.from(option[1], 'base64').toString('utf8');
      for (const iframe of embed.matchAll(/<iframe\b[^>]*src=["']([^"']+)["']/gi)) {
        const url = new URL(iframe[1].replace(/&amp;/g, '&'), episodeUrl);
        if (url.protocol === 'https:') urls.add(url.href);
      }
    } catch {}
  }
  return urls;
}
export function finiteHlsDuration(text) {
  const lines = String(text).trim().split(/\r?\n/).map(x => x.trim());
  if (lines[0] !== '#EXTM3U' || !lines.includes('#EXT-X-ENDLIST') ||
      lines.some(x => /^#EXT-X-(?:STREAM-INF|I-FRAMES-ONLY|GAP)/.test(x))) return null;
  let total = 0, segments = 0, waiting = false;
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      if (waiting) return null;
      const value = Number(line.slice(8).split(',')[0]);
      if (!Number.isFinite(value) || value <= 0) return null;
      total += value; waiting = true;
    } else if (line && !line.startsWith('#')) {
      if (!waiting) return null;
      segments++; waiting = false;
    }
  }
  return !waiting && segments >= 3 && Number.isFinite(total) ? total : null;
}
export function confirmedHlsShort({trustedPlayer, expected, source, output, video, audio}) {
  if (!trustedPlayer || ![expected, source, output, video, audio].every(Number.isFinite)) return false;
  return expected >= 30 && expected < 300 &&
    [source, output, video, audio].every(value => Math.abs(value - expected) <= 2);
}
