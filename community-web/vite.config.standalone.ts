import { defineConfig, type Plugin } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, "../standalone-dist");

/**
 * `postbuild-wasm-alias.mjs` tiež zapíše tento súbor, ale až po skončení Vite buildu.
 * Workbox manifest sa skladá v `closeBundle` — bez súboru na disku v čase buildu sa
 * `community-app.version.json` nedostane do precache → fetch ide na sieť (nová verzia)
 * zatiaľ čo `community-app.js` ostane starý z cache → nekonečný „Nová verzia“ banner.
 */
function writeStandaloneVersionJsonPlugin(outputRoot: string, version: string): Plugin {
  return {
    name: "dvc-standalone-version-json",
    apply: "build",
    writeBundle() {
      const dir = path.join(outputRoot, "assets");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, "community-app.version.json"),
        `${JSON.stringify({ version })}\n`,
        "utf8"
      );
    },
  };
}

export default defineConfig({
  base: "/",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    writeStandaloneVersionJsonPlugin(outDir, pkg.version),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      /** `workbox.globPatterns` sa pri injectManifest nepredáva do workbox-build — treba tu. */
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,wasm,json}"],
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
        globPatterns: ["**/*.{js,css,html,wasm,json}"],
        navigateFallback: "/index-standalone.html",
      },
    }),
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
});
