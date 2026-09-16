import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Animori',
    short_name: 'Animori',
    description: 'Discover and watch anime from a catalog that stays synchronized automatically.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0b0f',
    theme_color: '#0b0b0f',
  };
}
