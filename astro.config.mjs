import { defineConfig } from "astro/config";

export default defineConfig({
  // Static output: the game is a client-only island, nothing needs a server runtime.
  output: "static",
  vite: {
    build: {
      // The tree-shaken floor of three's WebGLRenderer alone (no game code)
      // measures 528 kB raw / 129 kB gzip in this setup (measured with a
      // minimal import probe, V4); the full game chunk is 627 kB raw / 159 kB
      // gzip. Getting the main chunk under the default 500 kB warning is not
      // possible with three r186, so raise the limit to just above the
      // measured game-chunk size: the warning still fires on real regressions.
      chunkSizeWarningLimit: 650,
    },
  },
});
