import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset paths so dist/ works from any static host or sub-folder
  build: { chunkSizeWarningLimit: 800 },
});
