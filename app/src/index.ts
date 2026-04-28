import express from "express";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import { getRawEvents, importEventsFromSource, isEventsCacheEmpty, selectEvents } from "./modules/events/events.controller";
import { getCachedCoords } from "./modules/geocoding/geocoding";
import { listVenues } from "./modules/map/map.controller";
import { getImportStatus, markImport, markImportError } from "./modules/import/import-status.controller";
import { getMyRsvp, getRsvpCounts, removeRsvp, submitRsvp } from "./modules/rsvp/rsvp.controller";

const app = express();

// CORS: allow configured origins, or all origins when CORS_ORIGIN is not set (dev).
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : true;
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Simple in-memory rate limiter (no external dep).
const makeRateLimit = (maxRequests: number, windowMs: number) => {
  const counts = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = counts.get(key);
    if (!entry || now > entry.resetAt) {
      counts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (entry.count >= maxRequests) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    entry.count++;
    next();
  };
};
const rsvpRateLimit = makeRateLimit(20, 60_000);

// Import secret guard: requires Authorization: Bearer <IMPORT_SECRET> when env is set.
const requireImportSecret = (req: Request, res: Response, next: NextFunction): void => {
  const secret = process.env.IMPORT_SECRET;
  if (!secret) {
    next();
    return;
  }
  if (req.headers["authorization"] === `Bearer ${secret}`) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
};

app.get("/", (_req, res) => {
  res.json({
    service: "community-api",
    docs: "Useful paths",
    paths: {
      health: "/health",
      events: "/v1/events?future=1&sort=asc",
      venues: "/v1/venues",
      rsvp: "/v1/rsvp",
      importStatus: "/v1/import-status",
      importRun: "POST /v1/import/run",
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "community-api" });
});

app.get("/v1/config", (_req, res) => {
  res.json({
    apiBaseUrl: "https://api.dvadsatjeden.org",
    features: { events: true, map: true, push: false },
    sources: {
      events: process.env.EVENTS_SOURCE_URL ?? "",
      venues: "",
    },
  });
});

app.get("/v1/events", async (req, res) => {
  if (isEventsCacheEmpty()) {
    try {
      await importEventsFromSource(process.env.EVENTS_SOURCE_URL);
    } catch (_error) {
      // Serve fallback/cached events.
    }
  }

  const future =
    req.query.future === undefined
      ? true
      : !["0", "false", "no"].includes(String(req.query.future).toLowerCase());

  const sort = String(req.query.sort ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const country = typeof req.query.country === "string" && req.query.country.trim().length > 0 ? req.query.country.trim() : undefined;
  const region = typeof req.query.region === "string" && req.query.region.trim().length > 0 ? req.query.region.trim() : undefined;
  const category = typeof req.query.category === "string" && req.query.category.trim().length > 0 ? req.query.category.trim() : undefined;
  const items = selectEvents(getRawEvents(), { futureOnly: future, sort, country, region, category });
  const enriched = items.map((e) => {
    if (!e.locationName) return e;
    const coords = getCachedCoords(e.locationName);
    return coords ? { ...e, lat: coords[0], lng: coords[1] } : e;
  });
  res.json({ items: enriched });
});

app.get("/v1/venues", (_req, res) => {
  res.json({ items: listVenues() });
});

app.get("/v1/rsvp/:eventId/counts", (req, res) => {
  res.json({ eventId: req.params.eventId, counts: getRsvpCounts(req.params.eventId) });
});

// Accepts token from X-Anonymous-Token header (preferred) or anonymousToken query param (legacy).
app.get("/v1/rsvp/mine", (req, res) => {
  const anonymousToken =
    (typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : "") ||
    (typeof req.query.anonymousToken === "string" ? req.query.anonymousToken : "");
  if (!anonymousToken) {
    return res.status(400).json({ error: "anonymousToken is required" });
  }
  return res.json({ items: getMyRsvp(anonymousToken) });
});

app.post("/v1/rsvp", rsvpRateLimit, (req, res) => {
  const { eventId, anonymousToken, status } = req.body ?? {};
  if (!eventId || !anonymousToken || !status) {
    return res.status(400).json({ error: "eventId, anonymousToken and status are required" });
  }
  const counts = submitRsvp({ eventId, anonymousToken, status });
  return res.status(202).json({ eventId, counts });
});

app.delete("/v1/rsvp", (req, res) => {
  const { eventId, anonymousToken } = req.body ?? {};
  if (!eventId || !anonymousToken) {
    return res.status(400).json({ error: "eventId and anonymousToken are required" });
  }
  const counts = removeRsvp({ eventId, anonymousToken });
  return res.status(202).json({ eventId, counts });
});

app.get("/v1/import-status", (_req, res) => {
  res.json(getImportStatus());
});

app.post("/v1/import/run", requireImportSecret, async (_req, res) => {
  try {
    const sourceUrlRaw = (_req.body?.sourceUrl as string | undefined) ?? process.env.EVENTS_SOURCE_URL;
    const sourceUrl = typeof sourceUrlRaw === "string" && sourceUrlRaw.trim().length > 0
      ? sourceUrlRaw.trim()
      : undefined;

    const importedEvents = await importEventsFromSource(sourceUrl);
    res.json(markImport(importedEvents));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    markImportError(detail);
    res.status(502).json({
      error: "Import failed",
      detail,
    });
  }
});

const port = Number(process.env.PORT ?? 3021);
const intervalMinutes = Number(process.env.IMPORT_INTERVAL_MINUTES ?? 30);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`community-api listening on ${port}`);

  // Warm up cache on startup.
  importEventsFromSource(process.env.EVENTS_SOURCE_URL).catch(() => {});

  // Periodic re-import.
  setInterval(() => {
    importEventsFromSource(process.env.EVENTS_SOURCE_URL).catch(() => {});
  }, intervalMinutes * 60 * 1000);
});
