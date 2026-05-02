/**
 * Krátke hex ID pre `__APP_BUILD_ID__` a `community-app.version.json`.
 *
 * Poradie:
 * 1. Prvá neprázdna env premenná: `DEPLOY_REVISION`, `CI_COMMIT_SHA`, `GITHUB_SHA`
 *    (normálne git SHA alebo CI revízia) — ideálne pre dedikované standalone deploye.
 * 2. Inak SHA256(`package.json` + obsah všetkých súborov pod `src/`), pričom do hashu vstupujú
 *    cesty relatívne ku `src/` v POSIX tvare (`/`), nie absolútne cesty — stabilné naprieč CI/OS.
 *
 * Výstup je vždy prvých 10 hex znakov SHA256.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const REV_ENV_KEYS = ["DEPLOY_REVISION", "CI_COMMIT_SHA", "GITHUB_SHA"] as const;

function collectSrcFiles(dir: string, out: string[]): void {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) collectSrcFiles(p, out);
    else out.push(p);
  }
}

/** Relatívna cesta od `srcRoot`, vždy POSIX `/` — stabilný digest naprieč CI/OS. */
function srcRelativePosix(srcRoot: string, absolutePath: string): string {
  return relative(srcRoot, absolutePath).split(sep).join("/");
}

export function computeDvcBuildId(pkgJsonPath: string, srcRoot: string): string {
  for (const key of REV_ENV_KEYS) {
    const v = process.env[key]?.trim();
    if (v) return createHash("sha256").update(v).digest("hex").slice(0, 10);
  }

  const h = createHash("sha256");
  h.update(readFileSync(pkgJsonPath, "utf8"));
  const files: string[] = [];
  collectSrcFiles(srcRoot, files);
  files.sort();
  for (const f of files) {
    h.update(srcRelativePosix(srcRoot, f));
    h.update(readFileSync(f));
  }
  return h.digest("hex").slice(0, 10);
}
