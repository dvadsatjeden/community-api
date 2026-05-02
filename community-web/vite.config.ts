import { defineConfig, type Plugin } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginAssets = path.resolve(__dirname, "../wp-content/plugins/dvadsatjeden-community/assets");

/** Musí sedieť s `__APP_VERSION__` v bundli — inak banner „Nová verzia“ / UI ukáže inú semver než server. */
function writeWpVersionJsonPlugin(outputRoot: string, version: string): Plugin {
  return {
    name: "dvc-wp-version-json",
    apply: "build",
    writeBundle() {
      writeFileSync(
        path.join(outputRoot, "community-app.version.json"),
        `${JSON.stringify({ version })}\n`,
        "utf8",
      );
    },
  };
}

export default defineConfig({
  // Oproti `community-app.js` v WP plugine — nie koreň domény. Inak workery/ chunky idú na `/assets/...` a dajú 404.
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), writeWpVersionJsonPlugin(pluginAssets, pkg.version)],
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
