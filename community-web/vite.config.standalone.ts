import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, "../standalone-dist");

export default defineConfig({
  base: "/",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
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
