import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const requireImportSecret: RequestHandler = (req, res, next) => {
  const secret = process.env.IMPORT_SECRET;
  if (!secret || secret.length < 32 || secret === "change-me-in-production") {
    res.status(503).json({ error: "admin_not_configured" });
    return;
  }
  const actual = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
};

export function makeRateLimit(maxRequests: number, windowMs: number): RequestHandler {
  const counts = new Map<string, { count: number; resetAt: number }>();
  let nextCleanup = 0;
  return (req, res, next) => {
    const now = Date.now();
    if (now >= nextCleanup) {
      for (const [key, entry] of counts) if (entry.resetAt <= now) counts.delete(key);
      nextCleanup = now + windowMs;
    }
    const key = req.ip ?? "unknown";
    let entry = counts.get(key);
    if (!entry || entry.resetAt <= now) {
      if (counts.size >= 50_000) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      entry = { count: 0, resetAt: now + windowMs };
      counts.set(key, entry);
    }
    if (++entry.count > maxRequests) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    next();
  };
}
