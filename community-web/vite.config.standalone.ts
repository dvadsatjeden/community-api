import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, "../standalone-dist");

export default defineConfig({
  base: "/",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
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
