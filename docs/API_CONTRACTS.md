# Community API Contracts

Base path: `/v1`

Event source used by importer:
- default: `https://prevadzky.dvadsatjeden.org/wp-json/dvadsatjeden-events/v1/list?country=sk`
- optional all countries: `https://prevadzky.dvadsatjeden.org/wp-json/dvadsatjeden-events/v1/list`

## `GET /events`
- Query:
  - `future` (default: `1`)
    - `1` (default) returns only events with `startsAt >= now`
    - `0` includes past events
  - `sort` (default: `asc`)
    - `asc` sorts by `startsAt` ascending
    - `desc` sorts by `startsAt` descending
  - `country` — filter by country code (case-insensitive), e.g. `sk`
  - `region` — filter by region/state (case-insensitive)
  - `category` — filter by normalized category name (case-insensitive), e.g. `MeetUpy`
- Response: `{ items: EventItem[] }`
- `EventItem`:
  - `id: string`
  - `title: string`
  - `startsAt: ISO8601`
  - `endsAt?: ISO8601`
  - `locationName?: string`
  - `city?: string`
  - `sourceUrl?: string`

## `GET /venues`
- Response: `{ items: VenueItem[] }`
- `VenueItem`:
  - `id: string`
  - `name: string`
  - `lat: number`
  - `lng: number`
  - `address?: string`
  - `category?: string`
  - `sourceUrl?: string`

## `POST /rsvp`
- Request:
  - `eventId: string`
  - `anonymousToken: string`
  - `status: "going" | "maybe" | "not_going"`
- Behavior:
  - one vote per (`eventId`, `anonymousToken`)
  - token is hashed server-side before storage
- Response: `{ eventId, counts }`

## `GET /rsvp/mine`
- Auth: `X-Anonymous-Token: <token>` header (preferred) or `?anonymousToken=<token>` query param (legacy)
- Response: `{ items: Record<eventId, RsvpStatus> }`

## `GET /rsvp/:eventId/counts`
- Response:
  - `eventId: string`
  - `counts: { going: number, maybe: number, not_going: number }`

## `GET /import-status`
- Response:
  - `lastRunAt: ISO8601 | null`
  - `lastSuccessAt: ISO8601 | null`
  - `lastError: string | null`
  - `recordsImported: number`

## `POST /import/run`
- Auth: `Authorization: Bearer <IMPORT_SECRET>` (required when `IMPORT_SECRET` env is set)
- Triggers one source sync cycle (admin operation).
- Optional request body:
  - `sourceUrl?: string` (overrides default/ENV source for this run)
- Response: same payload as `GET /import-status`.

## Nostr login (optional)

Requires `NOSTR_AUTH_SECRET` on the API server. When unset, `GET /v1/auth/nostr/challenge` returns `503` with `{ error: "nostr_auth_not_configured" }` and `features.nostrLogin` in `GET /v1/config` is `false`.

Optional `REDIS_URL`: when set, auth challenges are stored in Redis with TTL (shared across API instances and restarts). When unset, challenges are kept in process memory only.

### `GET /v1/auth/nostr/challenge`

- Response `200`:
  - `challengeId: string` — hex, single-use, expires in 5 minutes
  - `kind: number` — always `27241` (custom auth event kind)
  - `message: string` — human-readable hint for the signer UI
  - Headers: `Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0` (nonce must not be cached)
- Response `503`: `{ error: "challenge_store_unavailable" }` if the challenge store (e.g. Redis) fails

### `POST /v1/auth/nostr/verify`

- Request JSON:
  - `event: NostrEvent` — signed event with:
    - `kind` = `27241`
    - `tags` includes `["challenge", "<challengeId>"]` where `challengeId` was issued by the challenge endpoint (not yet consumed)
    - `created_at` within ±5 minutes of server time (same window as challenge TTL)
    - valid Schnorr signature for `event.pubkey`
- Response `200`:
  - `ownerId: string` — app owner id (hex prefix, same length convention as seed-derived accounts)
  - `rsvpToken: string` — anonymous RSVP token (pass as `anonymousToken` / `X-Anonymous-Token`)
  - `dataKey: string`
  - `mnemonic: string` — 12 English BIP-39 words (Evolu `restoreAppOwner` secret; treat like a seed until user confirms backup and you clear it from storage)
  - `nostrPubkeyHex: string` — 64-char lowercase hex
  - `npub: string` — bech32 `npub1…` when encoding succeeds, else may be empty
  - Same non-cache headers as the challenge endpoint on success responses
- Error responses: `400` with `{ error: string }` codes such as `invalid_event_signature`, `unknown_or_expired_challenge`, etc.; `503` with `nostr_auth_not_configured` or `challenge_store_unavailable` when applicable.

## WP handoff contract

WP REST endpoint: `GET /wp-json/dvadsatjeden/v1/config`

- Response:
  - `apiBaseUrl: string`
  - `features: { events: boolean, map: boolean, push: boolean, nostrLogin?: boolean }`
  - `sources: { events: string, venues: string }`

WP REST endpoint: `POST /wp-json/dvadsatjeden/v1/import-run`
- Auth: `manage_options` (WP admin)
- Behavior:
  - reads `events_source_url` from WP settings
  - forwards import trigger to `${apiBaseUrl}/v1/import/run` with `{ sourceUrl }`
