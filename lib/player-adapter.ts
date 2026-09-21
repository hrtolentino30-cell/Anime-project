import type { VideoSource } from '@/lib/types';

export type PortableSourceType = 'direct' | 'hls' | 'embed';
export type PortableSourceHealth = 'healthy' | 'unknown' | 'expiring' | 'unhealthy';

export type AnimoriPlayerSource = {
  id: string;
  provider: string;
  label: string;
  type: PortableSourceType;
  url: string;
  priority: number;
  health: PortableSourceHealth;
  expiresAt: string | null;
};

function parseExpiryCandidate(raw: string | null): number | null {
  if (!raw) return null;
  const value = raw.trim();
  if (/^\d{10,13}$/.test(value)) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return value.length >= 13 ? n : n * 1000;
  }
  if (/^[0-9a-f]{8,16}$/i.test(value)) {
    const n = Number.parseInt(value, 16);
    if (Number.isFinite(n) && n > 1_000_000_000) return n * 1000;
  }
  return null;
}

export function inferSourceExpiry(url: string): string | null {
  try {
    const parsed = new URL(url);
    for (const key of ['expires', 'expiry', 'expiration', 'exp', 'oe']) {
      const value = parseExpiryCandidate(parsed.searchParams.get(key));
      if (value) return new Date(value).toISOString();
    }
  } catch {}
  return null;
}

export function sourceHealth(source: VideoSource, now = Date.now()): PortableSourceHealth {
  if (!source.is_active) return 'unhealthy';
  if ((source.verification_failures ?? 0) >= 2) return 'unhealthy';
  if ((source.verification_failures ?? 0) > 0) return 'unknown';
  const verified = source.last_verified_at ? Date.parse(source.last_verified_at) : NaN;
  if (Number.isFinite(verified) && now - verified <= 12 * 60 * 60 * 1000) return 'healthy';
  return 'unknown';
}

export function sourceIsUsable(source: AnimoriPlayerSource, now = Date.now()) {
  if (!source.url) return false;
  if (source.health === 'unhealthy') return false;
  if (source.expiresAt) {
    const expiry = Date.parse(source.expiresAt);
    if (Number.isFinite(expiry) && expiry <= now + 120_000) return false;
  }
  return true;
}

export function adaptAnimoriSources(sources: VideoSource[]): AnimoriPlayerSource[] {
  return sources
    .map((source, priority): AnimoriPlayerSource | null => {
      const url = source.stream_url ?? source.embed_url;
      if (!url) return null;
      const type: PortableSourceType =
        source.source_type === 'hls' ? 'hls' :
        source.source_type === 'mp4' ? 'direct' :
        'embed';
      const quality = source.quality ? ` · ${source.quality}` : '';
      const language = source.language ? ` · ${source.language}` : '';
      return {
        id: source.id,
        provider: source.server_name,
        label: `${source.server_name}${quality}${language}`,
        type,
        url,
        priority,
        health: sourceHealth(source),
        expiresAt: inferSourceExpiry(url),
      };
    })
    .filter((source): source is AnimoriPlayerSource => Boolean(source))
    .filter((source) => sourceIsUsable(source))
    .sort((a, b) => a.priority - b.priority);
}

export function needsAnimoriHlsRelay(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === 'akamai-static.shorttv.live' &&
      parsed.pathname.startsWith('/hls-encrypted/');
  } catch {
    return false;
  }
}

const blockedHostParts = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'popads.net',
  'popcash.net',
];
const blockedPathParts = ['/ads/', '/advert/', '/tracking/', '/pixel/'];

export function mediaUrlAllowed(raw: string) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (blockedHostParts.some((part) => host === part || host.endsWith(`.${part}`))) return false;
    if (blockedPathParts.some((part) => path.includes(part))) return false;
    return true;
  } catch {
    return false;
  }
}
