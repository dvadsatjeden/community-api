import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginAssets = path.resolve(__dirname, "../wp-content/plugins/dvadsatjeden-community/assets");

export default defineConfig({
  // Oproti `community-app.js` v WP plugine — nie koreň domény. Inak workery/ chunky idú na `/assets/...` a dajú 404.
  base: "./",
  plugins: [react()],
  build: {
    outDir: pluginAssets,
    // Výstup už je v `.../plugin/assets/`. Predvolené `build.assetsDir: "assets"` dá
    // `.../assets/assets/...` — zlé URL a 404/ HTML namiesto .wasm.
    assetsDir: "",
    // Do not delete `.gitkeep` and other hand-maintained files in the plugin `assets/` folder.
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
      output: {
        entryFileNames: "community-app.js",
        // CSS ostáva pevné meno; ostatné assety (napr. .wasm) s hash, aby sa neprepisovali.
        assetFileNames: (info) => {
          const n = (info as { name?: string }).name ?? "asset";
          if (n.endsWith(".css")) {
            return "community-app[extname]";
          }
          return "[name]-[hash][extname]";
        },
        chunkFileNames: "d21c-[name]-[hash].js",
      },
    },
  },
});
