// Isolated diagnostics only. No credentials, production writes, or uploads.
import { pathToFileURL } from 'node:url';
export const origin = 'https://animepahe.pw';
export function classify(status, text) {
  if (/sorry, you have been blocked|verify you are human|checking your browser|<title>just a moment/i.test(text)) return 'blocked';
  if (status < 200 || status >= 300) return 'http_error';
  return 'accessible';
}
export function parseAiring(payload) {
  if (!payload || !Array.isArray(payload.data)) throw new Error('Unexpected airing response; data array missing');
  const candidates = [];
  const seen = new Set();
  for (const row of payload.data) {
    const title = typeof row.anime_title === 'string' ? row.anime_title.trim() : '';
    const animeId = String(row.anime_id ?? '');
    const session = typeof row.session === 'string' ? row.session : '';
    const episode = Number(row.episode);
    if (!title || !/^[1-9][0-9]*$/.test(animeId) || !/^[a-zA-Z0-9-]+$/.test(session) ||
        !Number.isFinite(episode) || episode <= 0) continue;
    const key = animeId + ':' + episode;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({title, anime_id: animeId, episode, session,
      play_url: origin + '/play/' + animeId + '/' + session});
  }
  return candidates;
}
export async function probe(fetcher = fetch) {
  const report = {origin, mode: 'read-only', ready_for_switch: false,
    media_download: 'not_tested', facebook_publish: 'not_tested'};
  async function read(path) {
    const response = await fetcher(origin + path, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(25000),
      headers: {accept: path === '/' ? 'text/html' : 'application/json'}
    });
    return {status: response.status, text: await response.text()};
  }
  const home = await read('/');
  report.home = {status: home.status, result: classify(home.status, home.text)};
  // Fail closed: do not try alternate routes/domains after an access block.
  if (report.home.result !== 'accessible') return {...report, result: report.home.result};
  const feed = await read('/api?m=airing&page=1');
  report.feed = {status: feed.status, result: classify(feed.status, feed.text)};
  if (report.feed.result !== 'accessible') return {...report, result: report.feed.result};
  let candidates;
  try { candidates = parseAiring(JSON.parse(feed.text)); }
  catch (error) { return {...report, result: 'invalid_feed', error: error.message}; }
  return {...report, result: candidates.length ? 'discovery_only' : 'no_candidates',
    candidates, candidate_count: candidates.length};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await probe();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.result === 'discovery_only' ? 0 : 2;
  } catch (error) {
    console.log(JSON.stringify({mode:'read-only', ready_for_switch:false,
      result:'transport_error', error:error.message}));
    process.exitCode = 2;
  }
}
