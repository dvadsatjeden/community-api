import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ImportStatus } from "../contracts";

const statusPath = (): string =>
  process.env.IMPORT_STATUS_PATH
    ? resolve(process.env.IMPORT_STATUS_PATH)
    : resolve(process.cwd(), "data", "import-status.json");

const defaults = (): ImportStatus => ({
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  recordsImported: 0,
});

let cached: ImportStatus | null = null;

const load = (): ImportStatus => {
  if (cached !== null) return cached;
  const p = statusPath();
  if (!existsSync(p)) {
    cached = defaults();
    return cached;
  }
  try {
    cached = JSON.parse(readFileSync(p, "utf8")) as ImportStatus;
  } catch {
    cached = defaults();
  }
  return cached;
};

const save = (): void => {
  if (cached === null) return;
  const p = statusPath();
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(cached) + "\n", "utf8");
};

export const getImportStatus = (): ImportStatus => load();

export const markImport = (recordsImported: number): ImportStatus => {
  const now = new Date().toISOString();
  const s = load();
  s.lastRunAt = now;
  s.lastSuccessAt = now;
  s.lastError = null;
  s.recordsImported = recordsImported;
  save();
  return s;
};

export const markImportError = (error: string): ImportStatus => {
  const s = load();
  s.lastRunAt = new Date().toISOString();
  s.lastError = error;
  save();
  return s;
};
