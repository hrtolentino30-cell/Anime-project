import { notFound } from 'next/navigation';
import { Player } from '@/components/Player';
import type { VideoSource } from '@/lib/types';

export const dynamic = 'force-dynamic';

type QaCase = 'mp4' | 'hls' | 'relay' | 'failover' | 'servers' | 'embed';

const episodeId = '9517df52-255a-4216-998b-08629b519a94';
const animeId = '1cca92f2-b677-4202-9edb-c4ab13ce1857';
const animeSlug = 'rezero-starting-life-in-another-world-season-4';

const siblings = [
  { id: 'cfd77a4a-8b0b-4b9e-8fec-b3cf89790045', episode_number: 6, title: 'Episode 6' },
  { id: episodeId, episode_number: 7, title: 'Episode 7' },
  { id: 'c3da0332-e418-4643-997b-3db89e871450', episode_number: 8, title: 'Episode 8' },
];

const base = {
  episode_id: episodeId,
  quality: 'QA',
  language: 'en',
  is_active: true,
  verification_failures: 0,
  last_verified_at: '2099-01-01T00:00:00.000Z',
};

function fixtures(kind: QaCase): VideoSource[] {
  if (kind === 'mp4') return [{
    ...base,
    id: 'qa-mp4',
    server_name: 'QA MP4',
    source_type: 'mp4',
    stream_url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  }];

  if (kind === 'hls' || kind === 'relay') return [{
    ...base,
    id: `qa-${kind}`,
    server_name: kind === 'relay' ? 'QA Relayed HLS' : 'QA Direct HLS',
    source_type: 'hls',
    stream_url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  }];

  if (kind === 'servers') return [
    {
      ...base,
      id: 'qa-server-mp4',
      server_name: 'QA MP4 Server',
      source_type: 'mp4',
      stream_url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    },
    {
      ...base,
      id: 'qa-server-hls',
      server_name: 'QA HLS Server',
      source_type: 'hls',
      stream_url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    },
  ];

  if (kind === 'embed') return [{
    ...base,
    id: 'qa-embed',
    server_name: 'QA External Embed',
    source_type: 'embed',
    embed_url: 'https://www.youtube.com/embed/M7lc1UVf-VE?autoplay=0&controls=1',
  }];

  return [
    {
      ...base,
      id: 'qa-unhealthy',
      server_name: 'Filtered Unhealthy',
      source_type: 'hls',
      stream_url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      verification_failures: 3,
    },
    {
      ...base,
      id: 'qa-expired',
      server_name: 'Filtered Expired',
      source_type: 'hls',
      stream_url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8?expires=1',
    },
    {
      ...base,
      id: 'qa-guard-blocked',
      server_name: 'QA Guard Blocked',
      source_type: 'hls',
      stream_url: 'https://doubleclick.net/video.m3u8',
    },
    {
      ...base,
      id: 'qa-bad',
      server_name: 'QA Broken HLS',
      source_type: 'hls',
      stream_url: 'https://test-streams.mux.dev/does-not-exist.m3u8',
    },
    {
      ...base,
      id: 'qa-fallback',
      server_name: 'QA MP4 Fallback',
      source_type: 'mp4',
      stream_url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    },
  ];
}

export default async function PlayerQaPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const params = await searchParams;
  const requested = params.case;
  const kind: QaCase =
    requested === 'hls' || requested === 'relay' || requested === 'failover' || requested === 'servers' || requested === 'embed'
      ? requested
      : 'mp4';

  return <main style={{ padding: '24px', maxWidth: 1180, margin: '0 auto' }}>
    <div data-testid="qa-case" data-case={kind} style={{ marginBottom: 12, opacity: .7 }}>
      Player QA · {kind}
    </div>
    <Player
      episodeId={episodeId}
      animeId={animeId}
      animeSlug={animeSlug}
      animeTitle="Animori Player QA"
      episodeNumber={7}
      episodeTitle={`Portable player · ${kind}`}
      sources={fixtures(kind)}
      siblings={siblings}
      userId={null}
      initialPosition={0}
      qaMode
      relayAllHls={kind === 'relay'}
    />
  </main>;
}
