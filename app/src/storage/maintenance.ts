import { readdirSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { backupDatabase, databasePath, writeSnapshot } from "./database.js";

export async function runScheduledBackup(): Promise<void> {
  const directory = process.env.BACKUP_DIR ?? join(dirname(databasePath()), "backups");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = join(directory, `scheduled-community-${stamp}.sqlite`);
  // Interrupted copies are never counted as a completed backup.
  await backupDatabase(`${destination}.partial`);
  renameSync(`${destination}.partial`, destination);
  const files = readdirSync(directory).filter(name => /^scheduled-community-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.sqlite$/.test(name)).sort().reverse();
  // Only scheduler-owned copies are eligible; manual backups are never deleted.
  for (const file of files.slice(Number(process.env.BACKUP_RETENTION ?? 14))) unlinkSync(join(directory, file));
  writeSnapshot("backup-status", { lastSuccessAt: new Date().toISOString(), lastError: null });
}

/** Local recovery copies. An off-server destination must be configured independently. */
export function startBackups(): () => void {
  if (databasePath() === ":memory:") return () => {};
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await runScheduledBackup(); }
    catch { console.error("Scheduled database backup failed"); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(run, Number(process.env.BACKUP_INTERVAL_HOURS ?? 24) * 3_600_000);
  timer.unref();
  return () => clearInterval(timer);
}
