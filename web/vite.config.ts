import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MapLibre's worker imports shared code, so it is bundled as an ES module worker.
  worker: { format: 'es' },
  server: {
    port: 5173,
    // Same-origin `/api` in dev, matching the Firebase Hosting rewrite in production.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.tsx'],
    css: false,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
