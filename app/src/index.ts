import express from "express";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import { getRawEvents, importEventsFromSource, isEventsCacheEmpty, selectEvents } from "./modules/events/events.controller";
import { getCachedCoords } from "./modules/geocoding/geocoding";
import { getSubscriptionCount, getVapidPublicKey, removeSubscription, saveSubscription, sendTestNotification } from "./modules/push/push";
import { listVenues } from "./modules/map/map.controller";
import { getImportStatus, markImport, markImportError } from "./modules/import/import-status.controller";
import { getMyRsvp, getRsvpCounts, removeRsvp, submitRsvp } from "./modules/rsvp/rsvp.controller";
import { getArticles } from "./modules/articles/articles";
import { getCommunities, getCommunityUrl } from "./modules/communities/communities";
import { isNostrAuthConfigured, nostrAuthChallengeGet, nostrAuthVerifyPost } from "./modules/nostr-auth/nostr-auth.controller";
import {
  createComment, createIdea, deleteCommentById, deleteIdeaById,
  getIdeaById, getMyIdeaUpvotes, listCategories, listCommentsForIdea,
  listIdeas, removeIdeaUpvote, updateCommentById, updateIdeaById, upvoteIdea,
} from "./modules/ideas/ideas.controller";

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
      nostrAuthChallenge: "GET /v1/auth/nostr/challenge",
      nostrAuthVerify: "POST /v1/auth/nostr/verify",
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "community-api" });
});

const publicApiBaseUrl =
  (process.env.PUBLIC_API_BASE_URL ?? process.env.API_PUBLIC_URL ?? "https://api.dvadsatjeden.org").replace(/\/$/, "");

app.get("/v1/config", (_req, res) => {
  res.json({
    apiBaseUrl: publicApiBaseUrl,
    features: {
      events: true,
      map: true,
      push: !!getVapidPublicKey(),
      nostrLogin: isNostrAuthConfigured(),
      ideas: process.env.IDEAS_ENABLED !== "false",
    },
    vapidPublicKey: getVapidPublicKey(),
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

app.get("/v1/articles", async (_req, res) => {
  try {
    res.json(await getArticles());
  } catch {
    res.status(502).json({ error: "articles unavailable" });
  }
});

const joinRateLimit = makeRateLimit(10, 60_000);
const nostrAuthRateLimit = makeRateLimit(40, 60_000);

app.get("/v1/communities", async (_req, res) => {
  try {
    const items = await getCommunities();
    const safe = items.map(({ url: _url, ...rest }, id) => ({ id, ...rest }));
    res.json({ items: safe });
  } catch {
    res.status(502).json({ error: "communities unavailable" });
  }
});

app.get("/v1/auth/nostr/challenge", nostrAuthRateLimit, nostrAuthChallengeGet);
app.post("/v1/auth/nostr/verify", nostrAuthRateLimit, nostrAuthVerifyPost);

app.get("/v1/communities/:id/join", joinRateLimit, async (req, res) => {
  const rawId = req.params.id;
  const id = parseInt(Array.isArray(rawId) ? (rawId[0] ?? "") : rawId, 10);
  if (isNaN(id) || id < 0) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const url = await getCommunityUrl(id);
    if (!url) { res.status(404).json({ error: "Not found" }); return; }
    res.redirect(302, url);
  } catch {
    res.status(502).json({ error: "unavailable" });
  }
});

app.post("/v1/push/subscribe", (req, res) => {
  const sub = req.body as { endpoint?: string; keys?: unknown };
  if (!sub?.endpoint || !sub?.keys) {
    return res.status(400).json({ error: "Invalid push subscription object" });
  }
  saveSubscription(sub as Parameters<typeof saveSubscription>[0]);
  return res.status(201).json({ ok: true, subscribers: getSubscriptionCount() });
});

app.delete("/v1/push/subscribe", (req, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  removeSubscription(endpoint);
  return res.status(200).json({ ok: true });
});

app.post("/v1/push/test", requireImportSecret, async (req, res) => {
  const sub = req.body?.subscription as Parameters<typeof sendTestNotification>[0] | undefined;
  if (!sub) return res.status(400).json({ error: "subscription required" });
  try {
    await sendTestNotification(sub);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
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

// ── Ideas routes ────────────────────────────────────────────────────────────
const ideasWriteRateLimit = makeRateLimit(20, 60_000);

const requireAnonToken = (req: Request, res: Response, next: NextFunction): void => {
  const token = typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"].trim() : "";
  if (!token) { res.status(401).json({ error: "X-Anonymous-Token header required" }); return; }
  (req as Request & { anonToken: string }).anonToken = token;
  next();
};

app.get("/v1/ideas/categories", (_req, res) => {
  res.json({ items: listCategories() });
});

app.get("/v1/ideas/upvotes/mine", (req, res) => {
  const token =
    (typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : "") ||
    (typeof req.query.voterToken === "string" ? req.query.voterToken : "");
  if (!token) return res.status(400).json({ error: "voterToken is required" });
  return res.json({ items: getMyIdeaUpvotes(token) });
});

app.get("/v1/ideas", (req, res) => {
  const category = typeof req.query.category === "string" && req.query.category.trim() ? req.query.category.trim() : undefined;
  const q = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;
  const sortRaw = typeof req.query.sort === "string" ? req.query.sort.trim() : "newest";
  const sort = sortRaw === "upvotes" ? "upvotes" : "newest";
  res.json({ items: listIdeas({ category, q, sort }) });
});

app.get("/v1/ideas/:id", (req, res) => {
  const voterToken = typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : undefined;
  const idea = getIdeaById(req.params.id, voterToken);
  if (!idea) return res.status(404).json({ error: "not found" });
  return res.json(idea);
});

app.post("/v1/ideas", ideasWriteRateLimit, requireAnonToken, (req, res) => {
  const ownerToken = (req as Request & { anonToken: string }).anonToken;
  const { title, description, categoryId, categoryOther, authorPseudonym } = req.body ?? {};
  const result = createIdea({ title, description, categoryId, categoryOther, authorPseudonym, ownerToken });
  if (!result.ok) return res.status(400).json({ error: result.error });
  return res.status(201).json(result.idea);
});

app.patch("/v1/ideas/:id", ideasWriteRateLimit, requireAnonToken, (req, res) => {
  const ownerToken = (req as Request & { anonToken: string }).anonToken;
  const { title, description, categoryId, categoryOther, authorPseudonym } = req.body ?? {};
  const result = updateIdeaById(req.params.id, { title, description, categoryId, categoryOther, authorPseudonym, ownerToken });
  if (!result.ok) return res.status(result.status ?? 400).json({ error: result.error });
  return res.json(result.idea);
});

app.delete("/v1/ideas/:id", requireAnonToken, (req, res) => {
  const ownerToken = (req as Request & { anonToken: string }).anonToken;
  const result = deleteIdeaById(req.params.id, ownerToken);
  if (!result.ok) return res.status(result.status ?? 400).json({ error: result.error });
  return res.status(204).end();
});

app.get("/v1/ideas/:id/comments", (req, res) => {
  res.json({ items: listCommentsForIdea(req.params.id) });
});

app.post("/v1/ideas/:id/comments", ideasWriteRateLimit, requireAnonToken, (req, res) => {
  const ownerToken = (req as Request & { anonToken: string }).anonToken;
  const { kind, body, authorPseudonym } = req.body ?? {};
  const result = createComment({ ideaId: req.params.id, kind, body, authorPseudonym, ownerToken });
  if (!result.ok) return res.status(result.status ?? 400).json({ error: result.error });
  return res.status(201).json(result.comment);
});

app.patch("/v1/ideas/:id/comments/:cid", ideasWriteRateLimit, requireAnonToken, (req, res) => {
  const ownerToken = (req as Request & { anonToken: string }).anonToken;
  const { body, authorPseudonym } = req.body ?? {};
  const result = updateCommentById(req.params.cid, { body, authorPseudonym, ownerToken });
  if (!result.ok) return res.status(result.status ?? 400).json({ error: result.error });
  return res.json(result.comment);
});

app.delete("/v1/ideas/:id/comments/:cid", requireAnonToken, (req, res) => {
  const ownerToken = (req as Request & { anonToken: string }).anonToken;
  const result = deleteCommentById(req.params.cid, ownerToken);
  if (!result.ok) return res.status(result.status ?? 400).json({ error: result.error });
  return res.status(204).end();
});

app.post("/v1/ideas/:id/upvote", ideasWriteRateLimit, (req, res) => {
  const voterToken =
    (typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : "") ||
    (typeof req.body?.voterToken === "string" ? req.body.voterToken : "");
  if (!voterToken) return res.status(400).json({ error: "voterToken is required" });
  return res.json(upvoteIdea(req.params.id, voterToken));
});

app.delete("/v1/ideas/:id/upvote", (req, res) => {
  const voterToken =
    (typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : "") ||
    (typeof req.body?.voterToken === "string" ? req.body.voterToken : "");
  if (!voterToken) return res.status(400).json({ error: "voterToken is required" });
  return res.json(removeIdeaUpvote(req.params.id, voterToken));
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
