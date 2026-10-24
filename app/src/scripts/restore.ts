import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Offline restore into a NEW path only. Never overwrite the running database.
const [source, target] = process.argv.slice(2);
if (!source || !target || resolve(source) === resolve(target) || existsSync(target)) throw new Error("Supply backup and NEW destination paths");
const db = new DatabaseSync(source, { readOnly: true });
try {
  if (db.prepare("PRAGMA integrity_check").get()!.integrity_check !== "ok") throw new Error("Backup integrity check failed");
  if (Number(db.prepare("PRAGMA user_version").get()!.user_version) !== 1) throw new Error("Unsupported schema version");
  if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Backup foreign key check failed");
} finally { db.close(); }
mkdirSync(dirname(resolve(target)), { recursive: true });
copyFileSync(source, target);
console.log("Backup verified and restored to a new database. Stop API and change DATABASE_PATH before restarting.");
