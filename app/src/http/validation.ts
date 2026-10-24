import { z } from "zod";
import type { RequestHandler } from "express";

export const anonymousToken = z.string().trim().min(32).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const httpUrl = z.url().max(2048).refine(value => { try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; } }, "Expected an HTTP(S) URL");
const optionalUrl = z.union([httpUrl, z.literal("")]).optional();
const ideaFields = {
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(5000),
  categoryId: z.enum(["infra", "events", "education", "tools", "community", "other"]),
  categoryOther: z.string().trim().max(120).optional(),
  websiteUrl: optionalUrl,
  signalUrl: z.union([z.url().max(2048).refine(value => {
    try { const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "signal.group" && !url.username && !url.password; } catch { return false; }
  }, "Expected a Signal group URL"), z.literal("")]).optional(),
  authorPseudonym: z.string().trim().max(80).optional(),
};
export const createIdeaSchema = z.object(ideaFields);
export const updateIdeaSchema = createIdeaSchema.partial().extend({ status: z.enum(["published", "archived"]).optional() });
export const createCommentSchema = z.object({
  kind: z.enum(["comment", "suggestion", "remark"]), body: z.string().trim().min(1).max(2000),
  authorPseudonym: ideaFields.authorPseudonym,
});
export const updateCommentSchema = createCommentSchema.omit({ kind: true }).partial();
export const rsvpSchema = z.object({
  eventId: z.string().trim().min(1).max(500), anonymousToken,
  status: z.enum(["going", "maybe", "not_going"]),
});
export const removeRsvpSchema = rsvpSchema.omit({ status: true });
export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const allowed = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "notify.windows.com"];
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(4096).refine(isPushEndpoint, "Unsupported push service"),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/) }),
});

export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "invalid_request", fields: result.error.issues.map(issue => issue.path.join(".")) });
      return;
    }
    req.body = result.data;
    next();
  };
}
