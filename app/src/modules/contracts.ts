export type RsvpStatus = "going" | "maybe" | "not_going";

export type EventItem = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  locationName?: string;
  city?: string;
  country?: string;
  region?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;
  lat?: number;
  lng?: number;
};

export type VenueItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  category?: string;
  sourceUrl?: string;
};

export type ImportStatus = {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  recordsImported: number;
};

export type RsvpPayload = {
  eventId: string;
  anonymousToken: string;
  status: RsvpStatus;
};

export type RsvpCounts = Record<RsvpStatus, number>;
