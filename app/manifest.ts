import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Our Space',
    short_name: 'Our Space',
    lang: 'es',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5efe5',
    theme_color: '#f5efe5',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
