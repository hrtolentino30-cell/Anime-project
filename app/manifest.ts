import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Animori',
    short_name: 'Animori',
    description: 'Find your next anime. Explore new episodes and save your favorites.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c0d0f',
    theme_color: '#0c0d0f',
  };
}
