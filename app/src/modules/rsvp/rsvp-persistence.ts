import { createHash } from "node:crypto";
import { getDatabase } from "../../storage/database.js";
import type { RsvpStatus, RsvpCounts } from "../contracts.js";

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export function getVotes(): Map<string, Map<string, RsvpStatus>> {
  const result = new Map<string, Map<string, RsvpStatus>>();
  for (const row of getDatabase().prepare("SELECT * FROM rsvp").all()) {
    const id = String(row.event_id);
    const votes = result.get(id) ?? new Map<string, RsvpStatus>();
    votes.set(String(row.token_hash), row.status as RsvpStatus);
    result.set(id, votes);
  }
  return result;
}

export function setVote(eventId: string, token: string, status: RsvpStatus): void {
  getDatabase().prepare(`INSERT INTO rsvp VALUES (?, ?, ?)
    ON CONFLICT(event_id, token_hash) DO UPDATE SET status = excluded.status`).run(eventId, hashToken(token), status);
}

export function deleteVote(eventId: string, token: string): void {
  getDatabase().prepare("DELETE FROM rsvp WHERE event_id = ? AND token_hash = ?").run(eventId, hashToken(token));
}

export function getVotesForToken(token: string): Map<string, RsvpStatus> {
  return new Map(getDatabase().prepare("SELECT event_id, status FROM rsvp WHERE token_hash = ?").all(hashToken(token))
    .map(row => [String(row.event_id), row.status as RsvpStatus]));
}

export function _resetCacheForTesting(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Test reset outside test environment");
  getDatabase().exec("DELETE FROM rsvp");
}

export function getVoteCounts(eventId: string): RsvpCounts {
  const counts: RsvpCounts = { going: 0, maybe: 0, not_going: 0 };
  for (const row of getDatabase().prepare("SELECT status, count(*) AS count FROM rsvp WHERE event_id = ? GROUP BY status").all(eventId)) counts[row.status as RsvpStatus] = Number(row.count);
  return counts;
}
