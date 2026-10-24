import type { RsvpCounts, RsvpPayload, RsvpStatus } from "../contracts.js";
import { deleteVote, getVoteCounts, getVotesForToken, setVote } from "./rsvp-persistence.js";

export const submitRsvp = (payload: RsvpPayload): RsvpCounts => {
  setVote(payload.eventId, payload.anonymousToken, payload.status);
  return getRsvpCounts(payload.eventId);
};

export const getRsvpCounts = (eventId: string): RsvpCounts => getVoteCounts(eventId);

export const removeRsvp = (payload: Pick<RsvpPayload, "eventId" | "anonymousToken">): RsvpCounts => {
  deleteVote(payload.eventId, payload.anonymousToken);
  return getRsvpCounts(payload.eventId);
};

export const getMyRsvp = (anonymousToken: string): Record<string, RsvpStatus> => {
  return Object.fromEntries(getVotesForToken(anonymousToken));
};
