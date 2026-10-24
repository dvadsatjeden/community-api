import { createHash } from "node:crypto";
import { getDatabase } from "../../storage/database.js";
import type { IdeaItem, IdeaComment } from "../contracts.js";
export type { IdeaItem, IdeaComment, IdeaCategoryId } from "../contracts.js";

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
export const getIdeas = (): IdeaItem[] => getDatabase().prepare("SELECT data FROM ideas").all().map(row => JSON.parse(String(row.data)));
export const getComments = (): IdeaComment[] => getDatabase().prepare("SELECT data FROM comments").all().map(row => JSON.parse(String(row.data)));

export function addIdea(idea: IdeaItem): void {
  getDatabase().prepare("INSERT INTO ideas VALUES (?, ?)").run(idea.id, JSON.stringify(idea));
}

export function updateIdea(id: string, patch: Partial<Pick<IdeaItem, "title" | "description" | "categoryId" | "categoryOther" | "authorPseudonym" | "websiteUrl" | "signalUrl" | "status">>): IdeaItem | null {
  const existing = getIdeas().find(idea => idea.id === id);
  if (!existing) return null;
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  getDatabase().prepare("UPDATE ideas SET data = ? WHERE id = ?").run(JSON.stringify(next), id);
  return next;
}

export function deleteIdea(id: string): boolean {
  return Number(getDatabase().prepare("DELETE FROM ideas WHERE id = ?").run(id).changes) > 0;
}

export function addComment(comment: IdeaComment): void {
  getDatabase().prepare("INSERT INTO comments VALUES (?, ?, ?)").run(comment.id, comment.ideaId, JSON.stringify(comment));
}

export function updateComment(id: string, patch: Partial<Pick<IdeaComment, "body" | "authorPseudonym">>): IdeaComment | null {
  const existing = getComments().find(comment => comment.id === id);
  if (!existing) return null;
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  getDatabase().prepare("UPDATE comments SET data = ? WHERE id = ?").run(JSON.stringify(next), id);
  return next;
}

export const deleteComment = (id: string): boolean => Number(getDatabase().prepare("DELETE FROM comments WHERE id = ?").run(id).changes) > 0;

// Setting an upvote is idempotent: retries never undo a successful vote.
export function toggleUpvote(ideaId: string, token: string): boolean {
  getDatabase().prepare("INSERT OR IGNORE INTO upvotes VALUES (?, ?)").run(ideaId, hashToken(token));
  return true;
}

export const removeUpvote = (ideaId: string, token: string): void => {
  getDatabase().prepare("DELETE FROM upvotes WHERE idea_id = ? AND token_hash = ?").run(ideaId, hashToken(token));
};
export const getUpvoteCount = (ideaId: string): number => Number(getDatabase().prepare("SELECT count(*) AS count FROM upvotes WHERE idea_id = ?").get(ideaId)!.count);
export const hasUpvoted = (ideaId: string, token: string): boolean => !!getDatabase().prepare("SELECT 1 FROM upvotes WHERE idea_id = ? AND token_hash = ?").get(ideaId, hashToken(token));
export const getMyUpvotes = (token: string): Record<string, boolean> => Object.fromEntries(getDatabase().prepare("SELECT idea_id FROM upvotes WHERE token_hash = ?").all(hashToken(token)).map(row => [String(row.idea_id), true]));

export function _resetCacheForTesting(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Test reset outside test environment");
  getDatabase().exec("DELETE FROM ideas");
}
