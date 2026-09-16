export type Anime = {
  id: string; slug: string; title: string; title_english?: string | null; title_japanese?: string | null;
  description?: string | null; poster_url?: string | null; banner_url?: string | null; type?: string | null;
  status?: string | null; season?: string | null; year?: number | null; rating?: number | null; duration?: string | null;
  latest_episode?: number | null; total_episodes?: number | null;
};

export type VideoSource = {
  id: string; episode_id: string; server_name: string; source_type: 'embed'|'hls'|'mp4'|'other';
  embed_url?: string | null; stream_url?: string | null; quality?: string | null; language?: string | null; is_active: boolean;
};
