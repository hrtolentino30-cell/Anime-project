const productionHosts = new Set(['akamai-static.shorttv.live']);

function allowedHosts() {
  const hosts = new Set(productionHosts);
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    hosts.add('test-streams.mux.dev');
  }
  return hosts;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

function validateTarget(raw: string) {
  if (!raw || raw.length > 4096) throw new Error('invalid_url');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('invalid_url');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid_url');
  if (url.port && url.port !== '443') throw new Error('invalid_url');
  if (!allowedHosts().has(url.hostname.toLowerCase())) throw new Error('host_not_allowed');
  return url;
}

async function fetchAllowed(url: URL, request: Request, redirects = 0): Promise<Response> {
  const target = validateTarget(url.toString());
  const headers = new Headers();
  const range = request.headers.get('range');
  if (range) headers.set('range', range);
  headers.set('accept', request.headers.get('accept') || '*/*');
  headers.set('user-agent', 'Animori-HLS-Relay/1.0');

  const response = await fetch(target, {
    method: 'GET',
    headers,
    redirect: 'manual',
    cache: 'no-store',
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location || redirects >= 3) return response;
    const next = validateTarget(new URL(location, target).toString());
    return fetchAllowed(next, request, redirects + 1);
  }
  return response;
}

function proxyUrl(url: URL) {
  return '/api/hls-proxy?url=' + encodeURIComponent(url.toString());
}

function rewriteManifest(text: string, baseUrl: URL) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (!trimmed.startsWith('#')) {
        try {
          return proxyUrl(validateTarget(new URL(trimmed, baseUrl).toString()));
        } catch {
          return line;
        }
      }
      return line.replace(/URI="([^"]+)"/g, (_match, value: string) => {
        try {
          const resolved = validateTarget(new URL(value, baseUrl).toString());
          return 'URI="' + proxyUrl(resolved).replace(/"/g, '%22') + '"';
        } catch {
          return 'URI="' + value + '"';
        }
      });
    })
    .join('\n');
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'Range,Accept',
      'access-control-max-age': '86400',
    },
  });
}

export async function GET(request: Request) {
  let target: URL;
  try {
    const requestUrl = new URL(request.url);
    target = validateTarget(requestUrl.searchParams.get('url') || '');
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid_url' }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetchAllowed(target, request);
  } catch {
    return json({ ok: false, error: 'upstream_unavailable' }, 502);
  }

  let finalUrl: URL;
  try {
    finalUrl = validateTarget(upstream.url || target.toString());
  } catch {
    return json({ ok: false, error: 'redirect_not_allowed' }, 502);
  }

  const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
  const isManifest = contentType.includes('mpegurl') || finalUrl.pathname.toLowerCase().endsWith('.m3u8');
  const headers = new Headers({
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
  });

  if (isManifest) {
    const text = await upstream.text();
    if (!upstream.ok) {
      headers.set('content-type', contentType || 'text/plain; charset=utf-8');
      headers.set('cache-control', 'no-store');
      return new Response(text, { status: upstream.status, headers });
    }
    headers.set('content-type', 'application/vnd.apple.mpegurl');
    headers.set('cache-control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=30');
    return new Response(rewriteManifest(text, finalUrl), { status: upstream.status, headers });
  }

  for (const name of ['content-type','content-length','content-range','accept-ranges','etag','last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set(
    'cache-control',
    upstream.ok
      ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600'
      : 'no-store',
  );
  return new Response(upstream.body, { status: upstream.status, headers });
}
