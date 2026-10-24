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
  free_entry?: boolean;
  ticket_link?: string;
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

export type IdeaCategoryId = "infra" | "events" | "education" | "tools" | "community" | "other";

export type IdeaItem = {
  id: string;
  title: string;
  description: string;
  categoryId: IdeaCategoryId;
  categoryOther?: string;
  websiteUrl?: string;
  signalUrl?: string;
  authorOwnerId: string;
  authorTokenHash: string;
  authorPseudonym?: string;
  status: "published" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type IdeaCommentKind = "comment" | "suggestion" | "remark";

export type IdeaComment = {
  id: string;
  ideaId: string;
  kind: IdeaCommentKind;
  body: string;
  authorOwnerId: string;
  authorTokenHash: string;
  authorPseudonym?: string;
  createdAt: string;
  updatedAt: string;
};
