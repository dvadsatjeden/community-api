import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createApp } from "./server.js";
import { getDatabase, writeSnapshot } from "./storage/database.js";
let server: Server;
let base: string;
const token = "a".repeat(64);
const payload = { title: "Community project", description: "A detailed description of a community project.", categoryId: "community" };
async function request(path: string, method = "GET", body?: unknown, auth = token) {
  return fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Anonymous-Token": auth }, body: body === undefined ? undefined : JSON.stringify(body) });
}
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server?.close(() => resolve())); });
beforeEach(() => { getDatabase().exec("DELETE FROM rsvp; DELETE FROM ideas; DELETE FROM push_subscriptions; DELETE FROM snapshots;"); vi.unstubAllEnvs(); });
describe("HTTP API", () => {
  it("rejects invalid input without saving it", async () => {
    for (const body of [null, { eventId: {}, anonymousToken: token, status: "going" }, { eventId: "e", anonymousToken: token, status: "wrong" }]) expect((await request("/v1/rsvp", "POST", body)).status).toBe(400);
    expect(getDatabase().prepare("SELECT * FROM rsvp").all()).toEqual([]);
    expect((await request("/v1/ideas", "POST", { ...payload, websiteUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await request("/v1/ideas", "POST", { ...payload, title: {} })).status).toBe(400);
  });
  it("recovers votes with the same token and removes them", async () => {
    expect((await request("/v1/rsvp", "POST", { eventId: "e", anonymousToken: token, status: "going" })).status).toBe(202);
    await request("/v1/rsvp", "POST", { eventId: "e", anonymousToken: token, status: "maybe" });
    expect(await (await request("/v1/rsvp/mine")).json()).toEqual({ items: { e: "maybe" } });
    await request("/v1/rsvp", "DELETE", { eventId: "e", anonymousToken: token });
    expect(await (await request("/v1/rsvp/mine")).json()).toEqual({ items: {} });
  });
  it("fails closed without an admin secret and rejects unauthenticated admins", async () => {
    vi.stubEnv("IMPORT_SECRET", "");
    expect((await request("/v1/import/run", "POST", {})).status).toBe(503);
    vi.stubEnv("IMPORT_SECRET", "c".repeat(64));
    expect((await request("/v1/import/run", "POST", {})).status).toBe(401);
    const response = await fetch(`${base}/v1/import/run`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${"c".repeat(64)}` }, body: JSON.stringify({ sourceUrl: "http://127.0.0.1/private" }) });
    expect(response.status).toBe(400);
  });
  it("protects authorship, hides hashes and validates comment parents", async () => {
    const idea = await (await request("/v1/ideas", "POST", payload)).json() as { id: string };
    expect(idea).not.toHaveProperty("authorTokenHash");
    expect((await request(`/v1/ideas/${idea.id}`, "PATCH", { title: "Changed title" }, "b".repeat(64))).status).toBe(403);
    const comment = await (await request(`/v1/ideas/${idea.id}/comments`, "POST", { kind: "comment", body: "Hello" })).json() as { id: string };
    expect((await request(`/v1/ideas/another/comments/${comment.id}`, "DELETE")).status).toBe(404);
    expect(JSON.stringify(await (await request("/v1/ideas")).json())).not.toContain("authorTokenHash");
    const mine = await (await request(`/v1/ideas/${idea.id}/comments`)).json();
    const theirs = await (await request(`/v1/ideas/${idea.id}/comments`, "GET", undefined, "b".repeat(64))).json();
    expect(mine.items[0].isOwner).toBe(true);
    expect(theirs.items[0].isOwner).toBe(false);
  });
  it("enforces feature flags and rejects arbitrary push destinations", async () => {
    vi.stubEnv("IDEAS_ENABLED", "false");
    expect((await request("/v1/ideas")).status).toBe(404);
    expect((await request("/v1/ideas", "POST", payload)).status).toBe(404);
    expect((await request("/v1/push/subscribe", "POST", { endpoint: "https://127.0.0.1/private", keys: { auth: "a".repeat(22), p256dh: "b".repeat(87) } })).status).toBe(400);
  });
  it("distinguishes a valid empty events list and disables personalized caching", async () => {
    writeSnapshot("events", []);
    expect(await (await request("/v1/events")).json()).toMatchObject({ items: [] });
    expect((await request("/v1/rsvp/mine")).headers.get("cache-control")).toBe("no-store");
    expect((await fetch(`${base}/v1/rsvp/mine?anonymousToken=${token}`)).status).toBe(400);
  });
  it("returns JSON for malformed JSON requests", async () => {
    const response = await fetch(`${base}/v1/rsvp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });
});
