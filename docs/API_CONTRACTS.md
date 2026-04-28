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

## WP handoff contract

WP REST endpoint: `GET /wp-json/dvadsatjeden/v1/config`

- Response:
  - `apiBaseUrl: string`
  - `features: { events: boolean, map: boolean, push: boolean }`
  - `sources: { events: string, venues: string }`

WP REST endpoint: `POST /wp-json/dvadsatjeden/v1/import-run`
- Auth: `manage_options` (WP admin)
- Behavior:
  - reads `events_source_url` from WP settings
  - forwards import trigger to `${apiBaseUrl}/v1/import/run` with `{ sourceUrl }`
