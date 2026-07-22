import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // es2020 keeps esbuild lowering class static blocks etc. so older
    // Safari (iOS < 16.4) can parse the bundle
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
