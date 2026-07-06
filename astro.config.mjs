import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  vite: {
    server: {
      watch: {
        ignored: ["**/.tmp_edge_*/**", "**/.aspire-*.png"]
      }
    }
  }
});
