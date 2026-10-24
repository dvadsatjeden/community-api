import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

let connection: DatabaseSync | undefined;

export function databasePath(): string {
  return process.env.DATABASE_PATH ?? resolve(process.cwd(), "data/community.sqlite");
}

export function getDatabase(): DatabaseSync {
  if (connection) return connection;
  const path = databasePath();
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
  const version = Number(db.prepare("PRAGMA user_version").get()!.user_version);
  if (version > 1) {
    db.close();
    throw new Error("Database schema is newer than this application");
  }
  if (version === 0) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE rsvp (
        event_id TEXT NOT NULL, token_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('going', 'maybe', 'not_going')),
        PRIMARY KEY(event_id, token_hash)
      );
      CREATE INDEX rsvp_token ON rsvp(token_hash);
      CREATE TABLE ideas (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE TABLE comments (
        id TEXT PRIMARY KEY, idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
        data TEXT NOT NULL CHECK(json_valid(data))
      );
      CREATE INDEX comments_idea ON comments(idea_id);
      CREATE TABLE upvotes (
        idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE, token_hash TEXT NOT NULL,
        PRIMARY KEY(idea_id, token_hash)
      );
      CREATE TABLE push_subscriptions (endpoint TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE TABLE push_deliveries (
        event_id TEXT NOT NULL, endpoint TEXT NOT NULL REFERENCES push_subscriptions(endpoint) ON DELETE CASCADE,
        PRIMARY KEY(event_id, endpoint)
      );
      CREATE TABLE snapshots (name TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
      PRAGMA user_version = 1;
      COMMIT;`);
  }
  connection = db;
  return db;
}

export function transaction<T>(run: () => T): T {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = run();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function readSnapshot<T>(name: string): T | null {
  const row = getDatabase().prepare("SELECT data FROM snapshots WHERE name = ?").get(name);
  return row ? JSON.parse(String(row.data)) as T : null;
}

export function writeSnapshot(name: string, data: unknown): void {
  getDatabase().prepare("INSERT INTO snapshots(name, data) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data")
    .run(name, JSON.stringify(data));
}

export async function backupDatabase(destination: string): Promise<void> {
  mkdirSync(dirname(resolve(destination)), { recursive: true });
  await backup(getDatabase(), destination);
}

export function closeDatabase(): void {
  connection?.close();
  connection = undefined;
}
