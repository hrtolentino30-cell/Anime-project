import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Animori', short_name: 'Animori', description: 'Find your next anime. Explore new episodes and save your favorites.', start_url: '/', display: 'standalone', background_color: '#0B0C0E', theme_color: '#0B0C0E', icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }, { src: '/apple-touch-icon.svg', sizes: '180x180', type: 'image/svg+xml', purpose: 'any' }]
  };
}
