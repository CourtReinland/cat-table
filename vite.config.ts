import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

function gitShort(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

/** GS-STEER-STAMP — baked into HUD / title so a phone hard-refresh is unambiguous. */
export const BUILD_STAMP = `BUILD 8 ${gitShort()}`;

export default defineConfig({
  base: './',
  define: {
    __BUILD_STAMP__: JSON.stringify(BUILD_STAMP),
  },
  plugins: [
    {
      name: 'hud-build-stamp',
      transformIndexHtml(html) {
        return html.replaceAll('{{BUILD_STAMP}}', BUILD_STAMP);
      },
    },
  ],
  build: {
    // es2020 keeps esbuild lowering class static blocks etc. so older
    // Safari (iOS < 16.4) can parse the bundle
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
