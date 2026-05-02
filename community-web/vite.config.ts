import { defineConfig, type Plugin } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { computeDvcBuildId } from "./vite-build-id";
const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginAssets = path.resolve(__dirname, "../wp-content/plugins/dvadsatjeden-community/assets");

function writeWpBuildMetaPlugin(outputRoot: string, version: string, buildId: string): Plugin {
  return {
    name: "dvc-wp-build-meta",
    apply: "build",
    closeBundle: {
      order: "post",
      handler() {
        const builtAt = new Date().toISOString();
        const meta = { version, buildId, builtAt };
        writeFileSync(path.join(outputRoot, ".dvc-build-meta.json"), `${JSON.stringify(meta)}\n`);
        writeFileSync(path.join(outputRoot, "community-app.version.json"), `${JSON.stringify(meta)}\n`);
      },
    },
  };
}

export default defineConfig(({ command }) => {
  const pkgPath = path.resolve(__dirname, "package.json");
  const srcRoot = path.resolve(__dirname, "src");
  const buildId = command === "build" ? computeDvcBuildId(pkgPath, srcRoot) : "dev";

  return {
    // Oproti `community-app.js` v WP plugine — nie koreň domény. Inak workery/ chunky idú na `/assets/...` a dajú 404.
    base: "./",
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [react(), writeWpBuildMetaPlugin(pluginAssets, pkg.version, buildId)],
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
  };
});
