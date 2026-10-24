export function validateEnvironment(): void {
  new Intl.DateTimeFormat("en", { timeZone: process.env.EVENTS_TIME_ZONE ?? "Europe/Bratislava" }).format();
  const interval = Number(process.env.IMPORT_INTERVAL_MINUTES ?? 30);
  if (!Number.isFinite(interval) || interval < 1 || interval > 1440) throw new Error("Invalid IMPORT_INTERVAL_MINUTES");
  const communitiesInterval = Number(process.env.COMMUNITIES_INTERVAL_MINUTES ?? 15);
  if (!Number.isFinite(communitiesInterval) || communitiesInterval < 1 || communitiesInterval > 1440) throw new Error("Invalid COMMUNITIES_INTERVAL_MINUTES");
  for (const [name, fallback, max] of [["BACKUP_INTERVAL_HOURS", 24, 168], ["BACKUP_RETENTION", 14, 365]] as const) {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`);
  }
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.IMPORT_SECRET || process.env.IMPORT_SECRET.length < 32 || process.env.IMPORT_SECRET === "change-me-in-production") {
    throw new Error("Production requires a random IMPORT_SECRET of at least 32 characters");
  }
  if (!process.env.CORS_ORIGIN?.trim()) throw new Error("Production requires CORS_ORIGIN");
  if (process.env.NOSTR_AUTH_SECRET && process.env.NOSTR_AUTH_SECRET.length < 32) throw new Error("NOSTR_AUTH_SECRET must be at least 32 characters");
  const hasPublic = !!process.env.VAPID_PUBLIC_KEY;
  const hasPrivate = !!process.env.VAPID_PRIVATE_KEY;
  if (hasPublic !== hasPrivate) throw new Error("Both VAPID keys are required");
  if (hasPublic && (!/^[\w-]{87}$/.test(process.env.VAPID_PUBLIC_KEY!) || !/^[\w-]{43}$/.test(process.env.VAPID_PRIVATE_KEY!))) {
    throw new Error("Invalid VAPID key format");
  }
}
