import type { RsvpCounts, RsvpPayload, RsvpStatus } from "../contracts";
import { deleteVote, getVotes, getVotesForToken, setVote } from "./rsvp-persistence";

const emptyCounts = (): RsvpCounts => ({
  going: 0,
  maybe: 0,
  not_going: 0,
});

export const submitRsvp = (payload: RsvpPayload): RsvpCounts => {
  setVote(payload.eventId, payload.anonymousToken, payload.status);
  return getRsvpCounts(payload.eventId);
};

export const getRsvpCounts = (eventId: string): RsvpCounts => {
  const eventVotes = getVotes().get(eventId);
  if (!eventVotes) {
    return emptyCounts();
  }

  const counts = emptyCounts();
  for (const status of eventVotes.values()) {
    counts[status] += 1;
  }
  return counts;
};

export const removeRsvp = (payload: Pick<RsvpPayload, "eventId" | "anonymousToken">): RsvpCounts => {
  deleteVote(payload.eventId, payload.anonymousToken);
  return getRsvpCounts(payload.eventId);
};

export const getMyRsvp = (anonymousToken: string): Record<string, RsvpStatus> => {
  return Object.fromEntries(getVotesForToken(anonymousToken));
};
