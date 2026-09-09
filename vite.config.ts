import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Instay — Property Management',
        short_name: 'Instay',
        description: 'One system for rent, tenants, staff and reports.',
        start_url: '/dashboard',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111827',
        icons: [
          { src: '/favicon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/favicon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Precache the app shell (JS/CSS/HTML) so the dashboard opens with no network call.
        // Supabase calls are cross-origin and not covered here — offline reads/writes for
        // that data go through the Dexie-backed cache in src/lib/offline, not response caching.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // The app ships as one JS bundle (~2.6MB unminified-adjacent) rather than code-split
        // chunks — raise Workbox's 2MB precache cap so the shell still gets fully cached instead
        // of silently excluding the app's own JS. Revisit if/when the bundle is code-split.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
