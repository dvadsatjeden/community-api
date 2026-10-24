import { createApp } from "./server.js";
import { validateEnvironment } from "./config.js";
import { closeDatabase, getDatabase } from "./storage/database.js";
import { importEventsFromSource } from "./modules/events/events.controller.js";
import { refreshCommunities } from "./modules/communities/communities.js";

import { importLegacyData } from "./storage/legacy.js";

import { startBackups } from "./storage/maintenance.js";

validateEnvironment();
getDatabase();
importLegacyData();
const stopBackups = startBackups();
const server = createApp().listen(Number(process.env.PORT ?? 3021), () => {
  console.log("community-api listening");
});
const syncEvents = () => importEventsFromSource().catch(() => console.error("Event source unavailable; keeping last successful data"));
const syncCommunities = () => refreshCommunities().catch(() => console.error("Community source unavailable; keeping last successful data"));
void syncEvents();
void syncCommunities();
const timers = [
  setInterval(syncEvents, Number(process.env.IMPORT_INTERVAL_MINUTES ?? 30) * 60_000),
  setInterval(syncCommunities, Number(process.env.COMMUNITIES_INTERVAL_MINUTES ?? 15) * 60_000),
];
function shutdown(): void {
  timers.forEach(clearInterval);
  stopBackups();
  server.close(() => { closeDatabase(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
