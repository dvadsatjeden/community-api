import { defineConfig, type Plugin } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, "../standalone-dist");

function computeBuildId(pkgJsonPath: string): string {
  return createHash("sha256")
    .update(readFileSync(pkgJsonPath, "utf8"))
    .update(String(Date.now()))
    .digest("hex")
    .slice(0, 10);
}

/**
 * Zápis `community-app.version.json` + `.dvc-build-meta.json` až v `closeBundle` (po PWA),
 * aby `buildId` sedel s `define` z rovnakého behu buildu. Súbor **nie** v Workbox precache
 * — fetch ide vždy na sieť a slúži ako signál nového deployu.
 */
function writeStandaloneBuildMetaPlugin(
  outputRoot: string,
  version: string,
  buildId: string,
): Plugin {
  return {
    name: "dvc-standalone-build-meta",
    apply: "build",
    closeBundle: {
      order: "post",
      handler() {
        const builtAt = new Date().toISOString();
        const meta = { version, buildId, builtAt };
        writeFileSync(path.join(outputRoot, ".dvc-build-meta.json"), `${JSON.stringify(meta)}\n`);
        writeFileSync(
          path.join(outputRoot, "assets", "community-app.version.json"),
          `${JSON.stringify(meta)}\n`,
        );
      },
    },
  };
}

export default defineConfig(({ command }) => {
  const pkgPath = path.resolve(__dirname, "package.json");
  const buildId = command === "build" ? computeBuildId(pkgPath) : "dev";

  return {
    base: "/",
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      react(),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        registerType: "autoUpdate",
        injectRegister: "auto",
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,wasm}"],
        },
        manifest: {
          name: "Dvadsatjeden Community",
          short_name: "21 Community",
          description: "Komunitná appka pre Bitcoinerov na Slovensku a v Česku",
          theme_color: "#0f1114",
          background_color: "#0f1114",
          display: "standalone",
          start_url: "/",
          scope: "/",
          lang: "sk",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,wasm}"],
          navigateFallback: "/index-standalone.html",
        },
      }),
      writeStandaloneBuildMetaPlugin(outDir, pkg.version, buildId),
    ],
    build: {
      outDir,
      assetsDir: "assets",
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: path.resolve(__dirname, "index-standalone.html"),
        output: {
          entryFileNames: "assets/community-app.js",
          assetFileNames: (info) => {
            const n = (info as { name?: string }).name ?? "asset";
            if (n.endsWith(".css")) return "assets/community-app[extname]";
            return "assets/[name]-[hash][extname]";
          },
          chunkFileNames: "assets/d21c-[name]-[hash].js",
        },
      },
    },
  };
});
