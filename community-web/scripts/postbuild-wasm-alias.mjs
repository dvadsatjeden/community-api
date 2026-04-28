import { cpSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.resolve(__dirname, "../../../wp-content/plugins/dvadsatjeden-community/assets");

const pickSqliteHashedWasm = () => {
  const files = readdirSync(assetsDir);
  const matches = files.filter((f) => /^sqlite3-[^.]+\.wasm$/.test(f));
  return matches.length > 0 ? matches[0] : null;
};

const main = () => {
  if (!existsSync(assetsDir)) {
    return;
  }
  const hashed = pickSqliteHashedWasm();
  if (!hashed) {
    return;
  }
  const from = path.join(assetsDir, hashed);
  const to = path.join(assetsDir, "sqlite3.wasm");
  cpSync(from, to);
};

main();

