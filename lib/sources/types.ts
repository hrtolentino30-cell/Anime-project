export type VideoSource = {
  serverName: string;
  sourceType: 'embed' | 'hls' | 'mp4' | 'other';
  url: string;
  quality?: string;
  language?: string;
};

export interface AnimeSourceProvider {
  scanLatest(): Promise<unknown[]>;
  getAnime(url: string): Promise<unknown>;
  getEpisode(url: string): Promise<unknown>;
  getVideoSources(url: string): Promise<VideoSource[]>;
}
