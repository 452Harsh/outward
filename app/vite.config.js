import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Cross-origin isolation enables SharedArrayBuffer, which llama.cpp (wllama)
// needs for multi-threaded CPU inference. Same headers are set by the server.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Outward',
        short_name: 'Outward',
        description: 'Your story happens outside.',
        theme_color: '#10201b',
        background_color: '#10201b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Includes the llama.cpp runtime (wllama.wasm, ~9 MB), the ONNX runtime for Whisper (~14 MB)
        // and the narration clips, so all of it works offline. Model weights are not here:
        // wllama keeps them in OPFS and Transformers.js in Cache Storage.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest,wasm,mp3}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        // ONNX Runtime also references its WebGPU builds; Whisper uses the CPU build only.
        globIgnores: ['**/*.asyncify*', '**/*.jsep*', '**/*.jspi*'],
        navigateFallback: '/index.html',
        // Model weights are cached by WebLLM itself (phase 2); the API is network-only.
        navigateFallbackDenylist: [/^\/api\//, /^\/models\//],
        cleanupOutdatedCaches: true,
        // Story-pack narration is put into this cache when a pack is downloaded,
        // so it plays offline. Range support lets the audio element seek.
        runtimeCaching: [
          {
            urlPattern: /\/packs\/[a-z0-9-]+\/audio\/[a-z0-9-]+\.mp3$/,
            handler: 'CacheFirst',
            options: { cacheName: 'outward-packs', rangeRequests: true },
          },
        ],
      },
    }),
  ],
  server: {
    headers: isolation,
    proxy: { '/api': 'http://localhost:10000', '/models': 'http://localhost:10000' },
  },
  preview: { headers: isolation },
  worker: { format: 'es' },
});
