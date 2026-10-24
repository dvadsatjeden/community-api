import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupDatabase, closeDatabase, getDatabase, readSnapshot, transaction, writeSnapshot } from "./database.js";
import { runScheduledBackup } from "./maintenance.js";
import { importLegacyData } from "./legacy.js";

const directories: string[] = [];
afterEach(() => {
  closeDatabase();
  process.env.DATABASE_PATH = ":memory:";
  delete process.env.LEGACY_DATA_DIR;
  delete process.env.BACKUP_DIR;
  delete process.env.BACKUP_RETENTION;
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("transactional storage", () => {
  it("rolls back all writes on failure", () => {
    expect(() => transaction(() => { writeSnapshot("one", [1]); throw new Error("fail"); })).toThrow();
    expect(readSnapshot("one")).toBeNull();
  });
  it("persists across connections and creates a restorable consistent backup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "community-db-test-")); directories.push(dir);
    closeDatabase(); process.env.DATABASE_PATH = join(dir, "live.sqlite");
    writeSnapshot("communities", ["A"]);
    await backupDatabase(join(dir, "backup.sqlite"));
    writeSnapshot("communities", ["B"]);
    closeDatabase();
    expect(readSnapshot("communities")).toEqual(["B"]);
    closeDatabase(); process.env.DATABASE_PATH = join(dir, "backup.sqlite");
    expect(readSnapshot("communities")).toEqual(["A"]);
    expect(getDatabase().prepare("PRAGMA integrity_check").get()!.integrity_check).toBe("ok");
  });
  it("retains only the configured scheduled backups without deleting manual or incomplete copies", async () => {
    const dir = mkdtempSync(join(tmpdir(), "community-retention-test-")); directories.push(dir);
    process.env.BACKUP_DIR = dir;
    process.env.BACKUP_RETENTION = "1";
    writeFileSync(join(dir, "scheduled-community-2020-01-01T00-00-00-000Z.sqlite"), "old");
    writeFileSync(join(dir, "manual.sqlite"), "keep");
    writeFileSync(join(dir, "incomplete.sqlite.partial"), "keep");
    await runScheduledBackup();
    const files = readdirSync(dir);
    expect(files).toContain("manual.sqlite");
    expect(files).toContain("incomplete.sqlite.partial");
    expect(files).not.toContain("scheduled-community-2020-01-01T00-00-00-000Z.sqlite");
    expect(files.filter(name => name.startsWith("scheduled-community-"))).toHaveLength(1);
  });

  it("does not silently replace a corrupt legacy file with empty data", () => {
    const dir = mkdtempSync(join(tmpdir(), "community-legacy-test-")); directories.push(dir);
    process.env.LEGACY_DATA_DIR = dir;
    writeFileSync(join(dir, "rsvp-votes.json"), "invalid json");
    expect(importLegacyData).toThrow();
    expect(readSnapshot("legacy-imported")).toBeNull();
  });
  it("imports legacy votes once without changing token hashes", () => {
    const dir = mkdtempSync(join(tmpdir(), "community-legacy-test-")); directories.push(dir);
    process.env.LEGACY_DATA_DIR = dir;
    const hash = "a".repeat(64);
    writeFileSync(join(dir, "rsvp-votes.json"), JSON.stringify({ event: { [hash]: "going" } }));
    importLegacyData(); importLegacyData();
    expect(getDatabase().prepare("SELECT token_hash, status FROM rsvp").all()).toEqual([{ token_hash: hash, status: "going" }]);
  });
});
