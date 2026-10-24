import type { ImportStatus } from "../contracts.js";
import { readSnapshot, writeSnapshot } from "../../storage/database.js";

export const getImportStatus = (): ImportStatus => readSnapshot<ImportStatus>("events-status") ?? {
  lastRunAt: null, lastSuccessAt: null, lastError: null, recordsImported: 0,
};
export function markImport(recordsImported: number): ImportStatus {
  const now = new Date().toISOString();
  const status = { lastRunAt: now, lastSuccessAt: now, lastError: null, recordsImported };
  writeSnapshot("events-status", status);
  return status;
}
export function markImportError(error: string): ImportStatus {
  const status = { ...getImportStatus(), lastRunAt: new Date().toISOString(), lastError: error };
  writeSnapshot("events-status", status);
  return status;
}
