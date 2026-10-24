import { z } from "zod";
import { makeRateLimit, requireImportSecret } from "./http/security.js";
import { anonymousToken, validateBody, rsvpSchema, removeRsvpSchema, createIdeaSchema, updateIdeaSchema, createCommentSchema, updateCommentSchema, pushSubscriptionSchema } from "./http/validation.js";
import { getDatabase } from "./storage/database.js";
import express from "express";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import { getRawEvents, importEventsFromSource, isEventsCacheEmpty, selectEvents } from "./modules/events/events.controller.js";
import { getCachedCoords } from "./modules/geocoding/geocoding.js";
import { getSubscriptionCount, getVapidPublicKey, removeSubscription, saveSubscription, sendTestNotification } from "./modules/push/push.js";
import { listVenues } from "./modules/map/map.controller.js";
import { getImportStatus, markImportError } from "./modules/import/import-status.controller.js";
import { getMyRsvp, getRsvpCounts, removeRsvp, submitRsvp } from "./modules/rsvp/rsvp.controller.js";
import { getArticles } from "./modules/articles/articles.js";
import { getCommunities, getCommunityUrl, refreshCommunities, getCommunitySyncStatus } from "./modules/communities/communities.js";
import { isNostrAuthConfigured, nostrAuthChallengeGet, nostrAuthVerifyPost } from "./modules/nostr-auth/nostr-auth.controller.js";
import {
  createComment, createIdea, deleteCommentById, deleteIdeaById,
  getIdeaById, getMyIdeaUpvotes, listCategories, listCommentsForIdea,
  listIdeas, removeIdeaUpvote, updateCommentById, updateIdeaById, upvoteIdea,
} from "./modules/ideas/ideas.controller.js";

function publicDocument(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicDocument);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "authorTokenHash").map(([key, item]) => [key, publicDocument(item)]));
  return value;
}

export function createApp() {
  const app = express();

  // CORS: allow configured origins, or all origins when CORS_ORIGIN is not set (dev).
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
    : true;
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json({ limit: "32kb" }));

  const rsvpRateLimit = makeRateLimit(30, 60_000);
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.TRUST_PROXY?.split(",").map(value => value.trim()).filter(Boolean) ?? false);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/v1", makeRateLimit(600, 60_000));

  app.use("/v1", (req, res, next) => {
    const token = req.headers["x-anonymous-token"];
    if (token !== undefined && !anonymousToken.safeParse(token).success) {
      res.status(400).json({ error: "invalid_anonymous_token" });
      return;
    }
    next();
  });

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
    getDatabase().prepare("SELECT 1").get();
    res.json({ ok: true, service: "community-api" });
  });

  const publicApiBaseUrl =
    (process.env.PUBLIC_API_BASE_URL?.trim() || process.env.API_PUBLIC_URL?.trim() || "https://api.dvadsatjeden.org").replace(/\/$/, "");

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
    if (isEventsCacheEmpty()) return res.status(503).json({ error: "event_source_unavailable" });
    const items = selectEvents(getRawEvents(), { futureOnly: future, sort, country, region, category });
    const enriched = items.map((e) => {
      if (!e.locationName) return e;
      const coords = getCachedCoords(e.locationName);
      return coords ? { ...e, lat: coords[0], lng: coords[1] } : e;
    });
    res.json({ items: enriched, sync: getImportStatus() });
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
      const safe = items.map(({ url: _url, ...rest }) => rest);
      res.json({ items: safe, sync: getCommunitySyncStatus() });
    } catch {
      res.status(502).json({ error: "communities unavailable" });
    }
  });

  app.get("/v1/auth/nostr/challenge", nostrAuthRateLimit, nostrAuthChallengeGet);
  app.post("/v1/auth/nostr/verify", nostrAuthRateLimit, nostrAuthVerifyPost);

  app.get("/v1/communities/:id/join", joinRateLimit, async (req, res) => {
    const id = String(req.params.id);
    if (!/^[a-f0-9]{24}$/.test(id)) { res.status(400).json({ error: "invalid_id" }); return; }
    try {
      const url = await getCommunityUrl(id);
      if (!url) { res.status(404).json({ error: "Not found" }); return; }
      res.redirect(302, url);
    } catch {
      res.status(502).json({ error: "unavailable" });
    }
  });

  app.post("/v1/push/subscribe", rsvpRateLimit, validateBody(pushSubscriptionSchema), (req, res) => {
    const sub = req.body as { endpoint?: string; keys?: unknown };
    if (!sub?.endpoint || !sub?.keys) {
      return res.status(400).json({ error: "Invalid push subscription object" });
    }
    saveSubscription(sub as Parameters<typeof saveSubscription>[0]);
    return res.status(201).json({ ok: true, subscribers: getSubscriptionCount() });
  });

  app.delete("/v1/push/subscribe", rsvpRateLimit, validateBody(pushSubscriptionSchema.pick({ endpoint: true })), (req, res) => {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    removeSubscription(endpoint);
    return res.status(200).json({ ok: true });
  });

  app.post("/v1/push/test", requireImportSecret, validateBody(z.object({ subscription: pushSubscriptionSchema })), async (req, res) => {
    const sub = req.body?.subscription as Parameters<typeof sendTestNotification>[0] | undefined;
    if (!sub) return res.status(400).json({ error: "subscription required" });
    try {
      await sendTestNotification(sub);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/v1/rsvp/counts", (_req, res) => {
    res.json({ items: Object.fromEntries(getRawEvents().map(event => [event.id, getRsvpCounts(event.id)])) });
  });

  app.get("/v1/rsvp/:eventId/counts", (req, res) => {
    res.json({ eventId: String(req.params.eventId), counts: getRsvpCounts(String(req.params.eventId)) });
  });

  // Accepts token from X-Anonymous-Token header (preferred) or anonymousToken query param (legacy).
  app.get("/v1/rsvp/mine", (req, res) => {
    const anonymousToken =
      (typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : "") ||
      "";
    if (!anonymousToken) {
      return res.status(400).json({ error: "anonymousToken is required" });
    }
    return res.json({ items: getMyRsvp(anonymousToken) });
  });

  app.post("/v1/rsvp", rsvpRateLimit, validateBody(rsvpSchema), (req, res) => {
    const { eventId, anonymousToken, status } = req.body ?? {};
    if (!eventId || !anonymousToken || !status) {
      return res.status(400).json({ error: "eventId, anonymousToken and status are required" });
    }
    const counts = submitRsvp({ eventId, anonymousToken, status });
    return res.status(202).json({ eventId, counts });
  });

  app.delete("/v1/rsvp", rsvpRateLimit, validateBody(removeRsvpSchema), (req, res) => {
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

  app.post("/v1/import/run", requireImportSecret, validateBody(z.strictObject({})), async (_req, res) => {
    try {
      await importEventsFromSource(process.env.EVENTS_SOURCE_URL);
      res.json(getImportStatus());
    } catch (error) {
      markImportError("event_source_unavailable");
      res.status(502).json({
        error: "Import failed",

      });
    }
  });

  app.use("/v1/ideas", (_req, res, next) => {
    if (process.env.IDEAS_ENABLED === "false") { res.status(404).json({ error: "not_found" }); return; }
    next();
  });

  app.get("/v1/communities/status", (_req, res) => res.json(getCommunitySyncStatus()));
  app.post("/v1/communities/sync", requireImportSecret, async (_req, res) => {
    try { await refreshCommunities(); res.json(getCommunitySyncStatus()); }
    catch { res.status(502).json({ error: "community_source_unavailable" }); }
  });

  // ── Ideas routes ────────────────────────────────────────────────────────────
  const ideasWriteRateLimit = makeRateLimit(20, 60_000);

  const requireAnonToken = (req: Request, res: Response, next: NextFunction): void => {
    const parsed = anonymousToken.safeParse(req.headers["x-anonymous-token"]);
    if (!parsed.success) { res.status(401).json({ error: "invalid_anonymous_token" }); return; }
    (req as Request & { anonToken: string }).anonToken = parsed.data;
    next();
  };

  app.get("/v1/ideas/categories", (_req, res) => {
    res.json({ items: listCategories() });
  });

  app.get("/v1/ideas/upvotes/mine", (req, res) => {
    const token =
      (typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : "") ||
      "";
    if (!token) return res.status(400).json({ error: "voterToken is required" });
    return res.json({ items: getMyIdeaUpvotes(token) });
  });

  app.get("/v1/ideas", (req, res) => {
    const category = typeof req.query.category === "string" && req.query.category.trim() ? req.query.category.trim() : undefined;
    const q = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;
    const sortRaw = typeof req.query.sort === "string" ? req.query.sort.trim() : "newest";
    const sort = sortRaw === "upvotes" ? "upvotes" : "newest";
    const showArchived = req.query.showArchived === "1";
    const ownerToken = typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : undefined;
    res.json(publicDocument({ items: listIdeas({ category, q, sort, showArchived, ownerToken }) }));
  });

  app.get("/v1/ideas/:id", (req, res) => {
    const voterToken = typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : undefined;
    const idea = getIdeaById(String(req.params.id), voterToken);
    if (!idea) return res.status(404).json({ error: "not found" });
    return res.json(publicDocument(idea));
  });

  app.post("/v1/ideas", ideasWriteRateLimit, requireAnonToken, validateBody(createIdeaSchema), (req, res) => {
    const ownerToken = (req as Request & { anonToken: string }).anonToken;
    const { title, description, categoryId, categoryOther, websiteUrl, signalUrl, authorPseudonym } = req.body ?? {};
    const result = createIdea({ title, description, categoryId, categoryOther, websiteUrl, signalUrl, authorPseudonym, ownerToken });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.status(201).json(publicDocument(result.idea));
  });

  app.patch("/v1/ideas/:id", ideasWriteRateLimit, requireAnonToken, validateBody(updateIdeaSchema), (req, res) => {
    const ownerToken = (req as Request & { anonToken: string }).anonToken;
    const { title, description, categoryId, categoryOther, websiteUrl, signalUrl, authorPseudonym, status } = req.body ?? {};
    const result = updateIdeaById(String(req.params.id), { title, description, categoryId, categoryOther, websiteUrl, signalUrl, authorPseudonym, status, ownerToken });
    if (!result.ok) return res.status(result.status ?? 400).json({ error: result.error });
    return res.json(publicDocument(result.idea));
  });

  app.delete("/v1/ideas/:id", ideasWriteRateLimit, requireAnonToken, (req, res) => {
    const ownerToken = (req as Request & { anonToken: string }).anonToken;
    const result = deleteIdeaById(String(req.params.id), ownerToken);
    if (!result.ok) return res.status(result.status ?? 400).json({ error: result.error });
    return res.status(204).end();
  });

  app.get("/v1/ideas/:id/comments", (req, res) => {
    res.json(publicDocument({ items: listCommentsForIdea(String(req.params.id), typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : undefined) }));
  });

  app.post("/v1/ideas/:id/comments", ideasWriteRateLimit, requireAnonToken, validateBody(createCommentSchema), (req, res) => {
    const ownerToken = (req as Request & { anonToken: string }).anonToken;
    const { kind, body, authorPseudonym } = req.body ?? {};
    const result = createComment({ ideaId: String(req.params.id), kind, body, authorPseudonym, ownerToken });
    if (!result.ok) return res.status(result.status ?? 400).json({ error: result.error });
    return res.status(201).json(publicDocument({ ...result.comment, isOwner: true }));
  });

  app.patch("/v1/ideas/:id/comments/:cid", ideasWriteRateLimit, requireAnonToken, validateBody(updateCommentSchema), (req, res) => {
    if (!listCommentsForIdea(String(req.params.id)).some(comment => comment.id === String(req.params.cid))) {
      return res.status(404).json({ error: "not_found" });
    }
    const ownerToken = (req as Request & { anonToken: string }).anonToken;
    const { body, authorPseudonym } = req.body ?? {};
    const result = updateCommentById(String(req.params.cid), { body, authorPseudonym, ownerToken });
    if (!result.ok) return res.status(result.status ?? 400).json({ error: result.error });
    return res.json(publicDocument({ ...result.comment, isOwner: true }));
  });

  app.delete("/v1/ideas/:id/comments/:cid", ideasWriteRateLimit, requireAnonToken, (req, res) => {
    if (!listCommentsForIdea(String(req.params.id)).some(comment => comment.id === String(req.params.cid))) {
      return res.status(404).json({ error: "not_found" });
    }
    const ownerToken = (req as Request & { anonToken: string }).anonToken;
    const result = deleteCommentById(String(req.params.cid), ownerToken);
    if (!result.ok) return res.status(result.status ?? 400).json({ error: result.error });
    return res.status(204).end();
  });

  app.post("/v1/ideas/:id/upvote", ideasWriteRateLimit, requireAnonToken, (req, res) => {
    const voterToken =
      (typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : "") ||
      (typeof req.body?.voterToken === "string" ? req.body.voterToken : "");
    if (!voterToken) return res.status(400).json({ error: "voterToken is required" });
    return res.json(upvoteIdea(String(req.params.id), voterToken));
  });

  app.delete("/v1/ideas/:id/upvote", ideasWriteRateLimit, requireAnonToken, (req, res) => {
    const voterToken =
      (typeof req.headers["x-anonymous-token"] === "string" ? req.headers["x-anonymous-token"] : "") ||
      (typeof req.body?.voterToken === "string" ? req.body.voterToken : "");
    if (!voterToken) return res.status(400).json({ error: "voterToken is required" });
    return res.json(removeIdeaUpvote(String(req.params.id), voterToken));
  });

  app.delete("/v1/admin/ideas/:id", requireImportSecret, (req, res) => {
    getDatabase().prepare("DELETE FROM ideas WHERE id = ?").run(String(req.params.id));
    res.status(204).end();
  });
  app.delete("/v1/admin/comments/:id", requireImportSecret, (req, res) => {
    getDatabase().prepare("DELETE FROM comments WHERE id = ?").run(String(req.params.id));
    res.status(204).end();
  });

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
    if (status === 400 || status === 413) {
      res.status(status).json({ error: status === 413 ? "payload_too_large" : "invalid_request" });
      return;
    }
    console.error("API request failed", error instanceof Error ? error.name : "UnknownError");
    res.status(500).json({ error: "internal_error" });
  });
  return app;
}
