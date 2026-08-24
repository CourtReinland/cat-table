/**
 * Visible play / title HUD stamp. Vite replaces `__BUILD_STAMP__` at
 * build time with `BUILD 5` + `git rev-parse --short HEAD`.
 */
export const BUILD_STAMP =
  typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'BUILD 5';
