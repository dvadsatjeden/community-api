import { backupDatabase, closeDatabase, databasePath } from "../storage/database.js";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
if (!existsSync(databasePath())) throw new Error("Live database does not exist");
const destination = process.argv[2];
if (!destination || resolve(destination) === resolve(databasePath()) || existsSync(destination)) {
  throw new Error("Supply a new backup destination different from the live database");
}
await backupDatabase(destination);
closeDatabase();
console.log("Database backup completed");
