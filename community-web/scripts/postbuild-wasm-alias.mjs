import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isStandalone = process.argv[2] === "standalone";
const assetsDir = isStandalone
  ? path.resolve(__dirname, "../../standalone-dist/assets")
  : path.resolve(__dirname, "../../wp-content/plugins/dvadsatjeden-community/assets");

const writeAppVersionJson = () => {
  if (!existsSync(assetsDir)) return;
  const metaPathCandidates = [
    path.join(assetsDir, ".dvc-build-meta.json"),
    path.join(assetsDir, "..", ".dvc-build-meta.json"),
  ];
  const metaPath = metaPathCandidates.find((p) => existsSync(p));
  if (metaPath) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      const file = path.join(assetsDir, "community-app.version.json");
      writeFileSync(
        file,
        `${JSON.stringify({
          version: String(meta.version ?? ""),
          buildId: String(meta.buildId ?? ""),
          builtAt: typeof meta.builtAt === "string" ? meta.builtAt : new Date().toISOString(),
        })}\n`,
      );
      return;
    } catch {
      /* fall through — legacy */
    }
  }
  const pkg = JSON.parse(readFileSync(path.join(__dirname, "../package.json"), "utf8"));
  const file = path.join(assetsDir, "community-app.version.json");
  writeFileSync(file, `${JSON.stringify({ version: String(pkg.version ?? "0") })}\n`);
};

const pickSqliteHashedWasm = () => {
  const files = readdirSync(assetsDir);
  const matches = files.filter((f) => /^sqlite3-[^.]+\.wasm$/.test(f));
  return matches.length > 0 ? matches[0] : null;
};

const main = () => {
  if (!existsSync(assetsDir)) {
    return;
  }
  writeAppVersionJson();
  const hashed = pickSqliteHashedWasm();
  if (!hashed) {
    return;
  }
  const from = path.join(assetsDir, hashed);
  const to = path.join(assetsDir, "sqlite3.wasm");
  cpSync(from, to);
};

main();

