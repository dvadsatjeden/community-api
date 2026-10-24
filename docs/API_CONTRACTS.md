# API v1

JSON over HTTPS, base path `/v1`. Errors use `{ error: string, fields?: string[] }`. Invalid JSON/validation → 400, missing identity → 401, wrong owner → 403, missing document → 404, rate limit → 429, unavailable source → 502/503. Administrative operations require `Authorization: Bearer <IMPORT_SECRET>`; without a valid configured secret they return 503.

Identity tokens use `X-Anonymous-Token` for personalized reads and Ideas operations. RSVP mutations carry `anonymousToken` in the JSON body. Tokens must be 32–128 characters from `[A-Za-z0-9_-]`. Tokens in query strings are no longer supported. Personalized responses are not cached.

## Configuration and health

- `GET /health`: checks DB connectivity; `{ ok: true, service: "community-api" }`.
- `GET /v1/config`: `{ apiBaseUrl, features: { events, map, push, nostrLogin, ideas }, vapidPublicKey }`. No WP handoff or client secrets.

## Events

`GET /v1/events?future=1&sort=asc&country=sk&region=...&category=...`

Returns `{ items: EventItem[], sync: SyncStatus }`. `future=0` includes past events; `sort=desc` reverses ordering. Filters are case-insensitive. Event fields: `id`, `title`, `startsAt` (ISO), optional `endsAt`, `locationName`, `city`, `country`, `region`, `category`, `description`, `imageUrl`, `sourceUrl`, `free_entry`, `ticket_link`, `lat`, `lng`.

Floating timestamps without an offset are interpreted in `EVENTS_TIME_ZONE` (default `Europe/Bratislava`), then stored as UTC. Explicit ISO offsets take precedence. PWA displays venue time for Slovakia/Czechia, including daylight saving time.

Events are imported from the configured comma-separated `EVENTS_SOURCE_URL` endpoints. Successful data is persisted; failed imports retain it. No fictional fallback event is returned. Before any successful snapshot, failed loading returns 503; an imported empty list returns 200.

- `GET /v1/import-status`: `SyncStatus`.
- `POST /v1/import/run`: admin; empty body `{}` only. Imports the configured source. Per-request URL overrides are rejected.
- `GET /v1/venues`: `{ items: VenueItem[] }`; currently a placeholder for future merchant integration.
- `GET /v1/articles`: cached proxy to the configured WordPress articles API (`ARTICLES_SOURCE_URL` optional).

`SyncStatus = { lastRunAt: ISO|null, lastSuccessAt: ISO|null, lastError: string|null, recordsImported: number }`.

## Communities: authoritative source API

Configure `COMMUNITIES_SOURCE_URL` with the upstream endpoint. Default: `https://www.dvadsatjeden.org/wp-json/community-map/v1/communities`, provided by `integrations/wordpress/community-source.php`. The old app plugin's `/wp-json/dvadsatjeden/v1/communities` remains a temporary compatible source until the independent exporter is installed.

Accepted upstream payload: `{ items: CommunitySourceItem[] }` or a bare array. Each item:

```json
{
  "id": "optional-stable-source-id",
  "name": "Dvadsatjeden Prievidza",
  "url": "https://signal.group/#example",
  "lat": 48.774,
  "lng": 18.625,
  "marker_image": ""
}
```

`id` is optional (string or integer), but source authors should provide it and keep it stable. `name`, HTTPS `url`, finite latitude/longitude are required. `marker_image` is optional: empty or an HTTP(S) image URL. Links may point to Signal groups or the official community website. Duplicate IDs or any malformed item reject the whole refresh.

The API derives a 24-character hex ID from source `id`; without one it hashes normalized name and coordinates. IDs do not depend on array order. Name/coordinate changes without an upstream ID create a new identity; supply stable source IDs to avoid this.

A successful refresh atomically replaces the snapshot, including removals. Explicit `items: []` clears the list. Network failure, invalid payload or an unavailable source keeps the previous list and records an error. The source is authoritative: app does not infer whether a Signal group is still active.

Refresh runs at startup, every `COMMUNITIES_INTERVAL_MINUTES` (default 15), and on stale reads. Concurrent refresh requests coalesce. Stale reads may return the prior snapshot while one refresh runs. Snapshots and sync status survive restarts. PWA refreshes every minute and on focus/visibility changes.

- `GET /v1/communities`: `{ items: PublicCommunity[], sync: SyncStatus }`; public items omit `url` and contain stable API `id`. First load with unavailable source and no snapshot → 502.
- `GET /v1/communities/:id/join`: resolves the current snapshot by stable ID and redirects; removed IDs → 404. Rate limited. Redirecting does not make the destination secret from a visitor.
- `GET /v1/communities/status`: `SyncStatus`.
- `POST /v1/communities/sync`: admin; forces refresh.

## RSVP

- `POST /v1/rsvp`: `{ eventId: string (1–500), anonymousToken, status: "going"|"maybe"|"not_going" }` → 202 `{ eventId, counts }`.
- `DELETE /v1/rsvp`: `{ eventId, anonymousToken }` → 202 `{ eventId, counts }`.
- `GET /v1/rsvp/mine`: identity header → `{ items: Record<eventId, status> }`, including an empty object after all votes are removed.
- `GET /v1/rsvp/:eventId/counts`: `{ eventId, counts: { going, maybe, not_going } }`.
- `GET /v1/rsvp/counts`: counts for all events in the current snapshot in one response: `{ items: Record<eventId, counts> }`.

One vote per `(eventId, SHA256(token))`. Setting the same status repeatedly is idempotent. Counts are indicative: one person can create multiple identities.

## Ideas, comments, votes

`IDEAS_ENABLED=false` disables reads and writes on `/v1/ideas`.

- `GET /ideas/categories` → `{ items }`.
- `GET /ideas`: `category`, `q`, `sort=newest|upvotes`, `showArchived=1`; optional identity header supplies `isOwner`.
- `GET /ideas/:id`: detail with counts and optional `myUpvote`, `isOwner`.
- `POST /ideas`: identity required; `title` (5–120), `description` (20–5000), `categoryId` (`infra|events|education|tools|community|other`), optional `categoryOther` (required for other), `websiteUrl` (HTTP/S), `signalUrl` (HTTPS signal.group), `authorPseudonym` (max 80).
- `PATCH /ideas/:id`: owner; partial create fields plus `status=published|archived`.
- `DELETE /ideas/:id`: owner; deletes associated comments and votes transactionally via foreign keys.
- `GET /ideas/:id/comments`: `{ items }`.
- `POST /ideas/:id/comments`: identity; `{ kind: "comment"|"suggestion"|"remark", body: string (1–2000), authorPseudonym? }`.
- `PATCH /ideas/:id/comments/:cid`: owner; `body?`, `authorPseudonym?`. Parent idea must match.
- `DELETE /ideas/:id/comments/:cid`: owner. Parent idea must match.
- `POST /ideas/:id/upvote`: identity; sets a vote idempotently → `{ upvoted: true, upvoteCount }` for published ideas. Use DELETE to remove.
- `DELETE /ideas/:id/upvote`: identity → `{ upvoteCount }`.
- `GET /ideas/upvotes/mine`: identity → `{ items: Record<ideaId, true> }`.

Credential hashes are never returned. Operator moderation: admin `DELETE /v1/admin/ideas/:id` and `DELETE /v1/admin/comments/:id`, both return 204.

## Push

- `POST /push/subscribe`: browser PushSubscription (`endpoint`, `keys.auth`, `keys.p256dh`, optional `expirationTime`). HTTPS destinations restricted to supported browser push services (FCM, Mozilla, Apple, Windows) to avoid arbitrary server requests.
- `DELETE /push/subscribe`: `{ endpoint }`.
- `POST /push/test`: admin; `{ subscription: PushSubscription }`.

Requires a matching VAPID keypair. Delivery results are tracked per subscription/event only after successful delivery; transient failures retry on later imports, 404/410 subscriptions are removed. Delivery is not exactly-once: a crash after sending and before recording can cause a repeat.

## Optional Nostr login

Requires stable `NOSTR_AUTH_SECRET` (min 32 characters). `REDIS_URL` optionally shares one-time challenge storage; otherwise memory is used.

- `GET /auth/nostr/challenge`: `{ challengeId, kind: 27241, message }`; expires in 5 minutes.
- `POST /auth/nostr/verify`: `{ event }`, valid Schnorr signature, kind 27241, `tags: [["challenge", id]]`, `created_at` within ±5 minutes.
- Success: `{ ownerId, rsvpToken, mnemonic, nostrPubkeyHex, npub }`. Mnemonic and token are sensitive. Server derives the same account from the mnemonic as the browser, enabling backup recovery.

All auth responses carrying challenges or credentials use `no-store`. Invalid/reused challenges → 400; disabled login or failed challenge store → 503. The server knows Nostr-derived mnemonic; see SEED_ACCOUNT_FLOW.md.
