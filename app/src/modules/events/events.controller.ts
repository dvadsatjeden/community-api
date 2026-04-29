import type { EventItem } from "../contracts";
import { scheduleGeocoding } from "../geocoding/geocoding";
import { notifyNewEvents } from "../push/push";

const fallbackEvents: EventItem[] = [
  {
    id: "ba-meetup-2026-05",
    title: "BA - 21 meetup",
    startsAt: "2026-05-21T18:00:00+02:00",
    locationName: "Bratislava TBD",
    city: "Bratislava",
    category: "MeetUpy",
    sourceUrl: "https://prevadzky.dvadsatjeden.org/wp-json/dvadsatjeden-events/v1/list?country=sk",
  },
];

// `null` = not yet imported/initialized.
let cachedEvents: EventItem[] | null = null;
let importAttempted = false;

const SOURCE_URL_DEFAULT = "https://prevadzky.dvadsatjeden.org/wp-json/dvadsatjeden-events/v1/list?country=sk";

export const toIso = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  // Supports ISO strings and common WP formats like "2024-10-12 08:00:00" (treated as local time).
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const pickString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const pickImageUrl = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim().length > 0) {
          return item.trim();
        }
      }
    }
  }
  return undefined;
};

export const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export const shortText = (value: string | undefined, max = 180): string | undefined => {
  if (!value) return undefined;
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
};

export const normalizeCategoryTerm = (rawCategory: string | undefined, title: string): string => {
  const c = (rawCategory ?? "").trim().toLowerCase();
  const t = title.trim().toLowerCase();

  if (c.includes("pivo") || t.includes("pivo")) {
    return "Bitcoin Pivo";
  }
  if (c.includes("konfer") || t.includes("konfer") || t.includes("conference")) {
    return "Konferencie";
  }
  if (c.includes("meet") || c.includes("meetup") || t.includes("meetup") || t.includes("meet up")) {
    return "MeetUpy";
  }
  return "Ostatné";
};

export const normalizeEvent = (event: Record<string, unknown>, index: number): EventItem | null => {
  const ext =
    event.extendedProps && typeof event.extendedProps === "object"
      ? (event.extendedProps as Record<string, unknown>)
      : undefined;
  const startsAt =
    toIso(event.startsAt) ??
    toIso(event.start_at) ??
    toIso(event.startDate) ??
    toIso(event.start) ??
    toIso(event.date) ??
    (ext ? toIso(ext.start) ?? toIso(ext.date) : undefined);

  if (!startsAt) {
    return null;
  }

  const id =
    pickString(event.id, event.eventId, event.slug, event.uuid) ??
    `source-event-${index}-${startsAt}`;

  const title = pickString(event.title, event.name) ?? "Untitled event";
  const endsAt =
    toIso(event.endsAt) ??
    toIso(event.end_at) ??
    toIso(event.endDate) ??
    toIso(event.end) ??
    (ext ? toIso(ext.end) : undefined);

  const customLink = pickString(event.custom_link, event.url, event.link);
  const rawCategory = pickString(
    event.category,
    event.categoryName,
    typeof ext?.category === "string" ? ext.category : undefined,
    typeof ext?.event_type === "string" ? ext.event_type : undefined
  );
  const address =
    pickString(event.locationName, event.location, event.venue, ext?.address) ?? pickString(event.address);
  const descriptionRaw = pickString(
    event.description,
    event.excerpt,
    event.summary,
    typeof ext?.description === "string" ? ext.description : undefined,
    typeof ext?.excerpt === "string" ? ext.excerpt : undefined
  );
  const imageUrl = pickImageUrl(
    event.image,
    event.imageUrl,
    event.poster,
    event.thumbnail,
    event.featured_image,
    typeof ext?.image === "string" ? ext.image : undefined,
    typeof ext?.poster === "string" ? ext.poster : undefined,
    ext?.featured_image
  );

  return {
    id,
    title,
    startsAt,
    endsAt,
    locationName: address,
    city: pickString(
      event.city,
      event.town,
      typeof ext?.region === "string" ? ext.region : undefined
    ),
    country: pickString(
      event.country,
      event.countryCode,
      event.country_code,
      typeof ext?.country === "string" ? ext.country : undefined,
      typeof ext?.country_code === "string" ? ext.country_code : undefined
    ),
    region: pickString(
      event.region,
      event.state,
      typeof ext?.region === "string" ? ext.region : undefined
    ),
    category: normalizeCategoryTerm(rawCategory, title),
    description: shortText(descriptionRaw ? stripHtml(descriptionRaw) : undefined),
    imageUrl,
    sourceUrl: customLink ?? SOURCE_URL_DEFAULT,
  };
};

export const isEventsCacheEmpty = (): boolean => cachedEvents === null;

export const isEventsImportAttempted = (): boolean => importAttempted;

export const getRawEvents = (): EventItem[] => {
  if (cachedEvents && cachedEvents.length > 0) {
    return cachedEvents;
  }
  if (importAttempted && (!cachedEvents || cachedEvents.length === 0)) {
    return [];
  }
  // Before first import attempt, keep a tiny local fallback to avoid a totally empty dev shell.
  return fallbackEvents;
};

const parseDate = (value: string): number => {
  return new Date(value).getTime();
};

export const selectEvents = (
  items: EventItem[],
  params: {
    futureOnly: boolean;
    sort: "asc" | "desc";
    country?: string;
    region?: string;
    category?: string;
  }
): EventItem[] => {
  const now = Date.now();
  let out = items;

  if (params.futureOnly) {
    out = out.filter((item) => parseDate(item.startsAt) >= now);
  }
  if (params.country) {
    out = out.filter((item) => (item.country ?? "").toLowerCase() === params.country!.toLowerCase());
  }
  if (params.region) {
    out = out.filter((item) => (item.region ?? "").toLowerCase() === params.region!.toLowerCase());
  }
  if (params.category) {
    out = out.filter((item) => (item.category ?? "").toLowerCase() === params.category!.toLowerCase());
  }

  out = [...out].sort((a, b) => {
    const diff = parseDate(a.startsAt) - parseDate(b.startsAt);
    return params.sort === "asc" ? diff : -diff;
  });

  return out;
};

export const importEventsFromSource = async (sourceUrl = SOURCE_URL_DEFAULT): Promise<number> => {
  const targetUrl = sourceUrl ?? SOURCE_URL_DEFAULT;
  importAttempted = true;
  const response = await fetch(targetUrl, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Source request failed with ${response.status}`);
  }
  const payload = (await response.json()) as unknown;

  let rawItems: unknown[] = [];
  if (Array.isArray(payload)) {
    rawItems = payload;
  } else if (
    payload &&
    typeof payload === "object" &&
    "items" in payload &&
    Array.isArray((payload as { items: unknown[] }).items)
  ) {
    rawItems = (payload as { items: unknown[] }).items;
  } else if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Array.isArray((payload as { data: unknown[] }).data)
  ) {
    rawItems = (payload as { data: unknown[] }).data;
  }

  const normalized = rawItems
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      return normalizeEvent(item as Record<string, unknown>, index);
    })
    .filter((item): item is EventItem => item !== null);

  // Always set cache to an array after a successful import attempt, even if empty.
  cachedEvents = normalized;
  const addresses = normalized.map((e) => e.locationName).filter((a): a is string => !!a);
  scheduleGeocoding(addresses);
  void notifyNewEvents(normalized);
  return normalized.length;
};
