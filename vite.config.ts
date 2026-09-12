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
      includeAssets: ['favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Instay Manage',
        short_name: 'Instay Manage',
        description: 'One system for rent, tenants, staff and reports.',
        // The installed app opens on sign-in, not the marketing landing page — RequireAuth already
        // bounces an anonymous visitor from /dashboard to /sign-in, but starting there directly
        // skips that extra redirect hop, and SignIn.tsx itself now sends an already-signed-in
        // visitor straight through to /dashboard, so either way there's no flash of a page that
        // isn't where they're actually headed.
        start_url: '/sign-in',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111827',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
