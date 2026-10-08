import { defineConfig } from "astro/config";

export default defineConfig({
  // Static output: the game is a client-only island, nothing needs a server runtime.
  output: "static",
});
