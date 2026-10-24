import crypto from "node:crypto";
import type { IdeaCategoryId, IdeaCommentKind } from "../contracts.js";
import {
  addComment, addIdea, deleteComment, deleteIdea,
  getComments, getIdeas, getMyUpvotes, getUpvoteCount, hasUpvoted,
  hashToken, removeUpvote, toggleUpvote, updateComment, updateIdea,
} from "./ideas-persistence.js";
import { CATEGORIES } from "./categories.js";

const TITLE_MIN = 5, TITLE_MAX = 120;
const DESC_MIN = 20, DESC_MAX = 5000;
const COMMENT_MIN = 1, COMMENT_MAX = 2000;

const VALID_CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
const VALID_COMMENT_KINDS = new Set<IdeaCommentKind>(["comment", "suggestion", "remark"]);

type IdeaItem = import("../contracts.js").IdeaItem;
type IdeaComment = import("../contracts.js").IdeaComment;

export type IdeaWithCounts = IdeaItem & { upvoteCount: number; commentCount: number };
export type IdeaDetail = IdeaWithCounts & { myUpvote?: boolean; isOwner?: boolean };

function genId(): string { return crypto.randomUUID(); }
function now(): string { return new Date().toISOString(); }
function toOwnerId(tokenHash: string): string { return tokenHash.slice(0, 32); }

export const listCategories = () => CATEGORIES;

export const listIdeas = (params: {
  category?: string;
  q?: string;
  sort?: "newest" | "upvotes";
  showArchived?: boolean;
  ownerToken?: string;
}): (IdeaWithCounts & { isOwner?: boolean })[] => {
  const targetStatus = params.showArchived ? "archived" : "published";
  let items = getIdeas().filter((i) => i.status === targetStatus);
  if (params.category) items = items.filter((i) => i.categoryId === params.category);
  if (params.q) {
    const q = params.q.toLowerCase().trim();
    items = items.filter((i) =>
      i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    );
  }
  const all = getComments();
  const ownerHash = params.ownerToken ? hashToken(params.ownerToken) : undefined;
  const withCounts = items.map((i) => ({
    ...i,
    upvoteCount: getUpvoteCount(i.id),
    commentCount: all.filter((c) => c.ideaId === i.id).length,
    isOwner: ownerHash !== undefined ? ownerHash === i.authorTokenHash : undefined,
  }));
  if (params.sort === "upvotes") {
    withCounts.sort((a, b) => b.upvoteCount - a.upvoteCount ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else {
    withCounts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return withCounts;
};

export const getIdeaById = (id: string, voterToken?: string): IdeaDetail | null => {
  const idea = getIdeas().find((i) => i.id === id);
  if (!idea) return null;
  return {
    ...idea,
    upvoteCount: getUpvoteCount(id),
    commentCount: getComments().filter((c) => c.ideaId === id).length,
    myUpvote: voterToken !== undefined ? hasUpvoted(id, voterToken) : undefined,
    isOwner: voterToken !== undefined ? hashToken(voterToken) === idea.authorTokenHash : undefined,
  };
};

export type CreateIdeaResult = { ok: true; idea: IdeaItem } | { ok: false; error: string };

export const createIdea = (input: {
  title: string;
  description: string;
  categoryId: string;
  categoryOther?: string;
  websiteUrl?: string;
  signalUrl?: string;
  authorPseudonym?: string;
  ownerToken: string;
}): CreateIdeaResult => {
  const title = (input.title ?? "").trim();
  const description = (input.description ?? "").trim();
  const categoryId = (input.categoryId ?? "").trim();

  if (title.length < TITLE_MIN || title.length > TITLE_MAX)
    return { ok: false, error: `title must be ${TITLE_MIN}–${TITLE_MAX} characters` };
  if (description.length < DESC_MIN || description.length > DESC_MAX)
    return { ok: false, error: `description must be ${DESC_MIN}–${DESC_MAX} characters` };
  if (!VALID_CATEGORY_IDS.has(categoryId as IdeaCategoryId))
    return { ok: false, error: "invalid categoryId" };
  if (categoryId === "other" && !input.categoryOther?.trim())
    return { ok: false, error: "categoryOther is required when categoryId is 'other'" };

  const websiteUrl = input.websiteUrl?.trim() || undefined;
  const signalUrl = input.signalUrl?.trim() || undefined;
  if (websiteUrl) { try { new URL(websiteUrl); } catch { return { ok: false, error: "invalid websiteUrl" }; } }
  if (signalUrl) { try { new URL(signalUrl); } catch { return { ok: false, error: "invalid signalUrl" }; } }

  const tokenHash = hashToken(input.ownerToken);
  const idea: IdeaItem = {
    id: genId(),
    title,
    description,
    categoryId: categoryId as IdeaCategoryId,
    categoryOther: categoryId === "other" ? input.categoryOther?.trim() : undefined,
    websiteUrl,
    signalUrl,
    authorOwnerId: toOwnerId(tokenHash),
    authorTokenHash: tokenHash,
    authorPseudonym: input.authorPseudonym?.trim() || undefined,
    status: "published",
    createdAt: now(),
    updatedAt: now(),
  };
  addIdea(idea);
  return { ok: true, idea };
};

export type UpdateIdeaResult = { ok: true; idea: IdeaItem } | { ok: false; error: string; status?: number };

export const updateIdeaById = (id: string, input: {
  title?: string;
  description?: string;
  categoryId?: string;
  categoryOther?: string;
  websiteUrl?: string;
  signalUrl?: string;
  authorPseudonym?: string;
  status?: string;
  ownerToken: string;
}): UpdateIdeaResult => {
  const existing = getIdeas().find((i) => i.id === id);
  if (!existing) return { ok: false, error: "not found", status: 404 };
  if (hashToken(input.ownerToken) !== existing.authorTokenHash)
    return { ok: false, error: "forbidden", status: 403 };

  const patch: Partial<Pick<IdeaItem, "title" | "description" | "categoryId" | "categoryOther" | "authorPseudonym" | "websiteUrl" | "signalUrl" | "status">> = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (t.length < TITLE_MIN || t.length > TITLE_MAX)
      return { ok: false, error: `title must be ${TITLE_MIN}–${TITLE_MAX} characters` };
    patch.title = t;
  }
  if (input.description !== undefined) {
    const d = input.description.trim();
    if (d.length < DESC_MIN || d.length > DESC_MAX)
      return { ok: false, error: `description must be ${DESC_MIN}–${DESC_MAX} characters` };
    patch.description = d;
  }
  if (input.categoryId !== undefined) {
    if (!VALID_CATEGORY_IDS.has(input.categoryId as IdeaCategoryId))
      return { ok: false, error: "invalid categoryId" };
    patch.categoryId = input.categoryId as IdeaCategoryId;
  }
  if (input.categoryOther !== undefined) patch.categoryOther = input.categoryOther.trim() || undefined;
  if (input.authorPseudonym !== undefined) patch.authorPseudonym = input.authorPseudonym.trim() || undefined;
  if (input.websiteUrl !== undefined) {
    const u = input.websiteUrl.trim();
    if (u) { try { new URL(u); } catch { return { ok: false, error: "invalid websiteUrl" }; } }
    patch.websiteUrl = u || undefined;
  }
  if (input.signalUrl !== undefined) {
    const u = input.signalUrl.trim();
    if (u) { try { new URL(u); } catch { return { ok: false, error: "invalid signalUrl" }; } }
    patch.signalUrl = u || undefined;
  }
  if (input.status === "published" || input.status === "archived") patch.status = input.status;

  const resultingCategory = patch.categoryId ?? existing.categoryId;
  if (resultingCategory === "other" && !(patch.categoryOther ?? existing.categoryOther)?.trim())
    return { ok: false, error: "categoryOther is required when categoryId is 'other'" };
  if (resultingCategory !== "other") patch.categoryOther = undefined;

  const idea = updateIdea(id, patch);
  if (!idea) return { ok: false, error: "not found", status: 404 };
  return { ok: true, idea };
};

export type DeleteResult = { ok: true } | { ok: false; error: string; status?: number };

export const deleteIdeaById = (id: string, ownerToken: string): DeleteResult => {
  const existing = getIdeas().find((i) => i.id === id);
  if (!existing) return { ok: false, error: "not found", status: 404 };
  if (hashToken(ownerToken) !== existing.authorTokenHash) return { ok: false, error: "forbidden", status: 403 };
  deleteIdea(id);
  return { ok: true };
};

export const listCommentsForIdea = (ideaId: string, ownerToken?: string): (IdeaComment & { isOwner?: boolean })[] =>
  getComments()
    .filter((c) => c.ideaId === ideaId)
    .map(comment => ({ ...comment, isOwner: ownerToken ? hashToken(ownerToken) === comment.authorTokenHash : undefined }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

export type CreateCommentResult = { ok: true; comment: IdeaComment } | { ok: false; error: string; status?: number };

export const createComment = (input: {
  ideaId: string;
  kind: string;
  body: string;
  authorPseudonym?: string;
  ownerToken: string;
}): CreateCommentResult => {
  const idea = getIdeas().find((i) => i.id === input.ideaId && i.status === "published");
  if (!idea) return { ok: false, error: "idea not found", status: 404 };

  const kind = (input.kind ?? "").trim();
  const body = (input.body ?? "").trim();

  if (!VALID_COMMENT_KINDS.has(kind as IdeaCommentKind))
    return { ok: false, error: "kind must be comment, suggestion, or remark" };
  if (body.length < COMMENT_MIN || body.length > COMMENT_MAX)
    return { ok: false, error: `body must be ${COMMENT_MIN}–${COMMENT_MAX} characters` };

  const tokenHash = hashToken(input.ownerToken);
  const comment: IdeaComment = {
    id: genId(),
    ideaId: input.ideaId,
    kind: kind as IdeaCommentKind,
    body,
    authorOwnerId: toOwnerId(tokenHash),
    authorTokenHash: tokenHash,
    authorPseudonym: input.authorPseudonym?.trim() || undefined,
    createdAt: now(),
    updatedAt: now(),
  };
  addComment(comment);
  return { ok: true, comment };
};

export type UpdateCommentResult = { ok: true; comment: IdeaComment } | { ok: false; error: string; status?: number };

export const updateCommentById = (cid: string, input: {
  body?: string;
  authorPseudonym?: string;
  ownerToken: string;
}): UpdateCommentResult => {
  const existing = getComments().find((c) => c.id === cid);
  if (!existing) return { ok: false, error: "not found", status: 404 };
  if (hashToken(input.ownerToken) !== existing.authorTokenHash)
    return { ok: false, error: "forbidden", status: 403 };

  const patch: Partial<Pick<IdeaComment, "body" | "authorPseudonym">> = {};
  if (input.body !== undefined) {
    const b = input.body.trim();
    if (b.length < COMMENT_MIN || b.length > COMMENT_MAX)
      return { ok: false, error: `body must be ${COMMENT_MIN}–${COMMENT_MAX} characters` };
    patch.body = b;
  }
  if (input.authorPseudonym !== undefined) patch.authorPseudonym = input.authorPseudonym.trim() || undefined;

  const comment = updateComment(cid, patch);
  if (!comment) return { ok: false, error: "not found", status: 404 };
  return { ok: true, comment };
};

export const deleteCommentById = (cid: string, ownerToken: string): DeleteResult => {
  const existing = getComments().find((c) => c.id === cid);
  if (!existing) return { ok: false, error: "not found", status: 404 };
  if (hashToken(ownerToken) !== existing.authorTokenHash) return { ok: false, error: "forbidden", status: 403 };
  deleteComment(cid);
  return { ok: true };
};

export const upvoteIdea = (ideaId: string, voterToken: string): { upvoted: boolean; upvoteCount: number } => {
  const idea = getIdeas().find((i) => i.id === ideaId && i.status === "published");
  if (!idea) return { upvoted: false, upvoteCount: 0 };
  const upvoted = toggleUpvote(ideaId, voterToken);
  return { upvoted, upvoteCount: getUpvoteCount(ideaId) };
};

export const removeIdeaUpvote = (ideaId: string, voterToken: string): { upvoteCount: number } => {
  removeUpvote(ideaId, voterToken);
  return { upvoteCount: getUpvoteCount(ideaId) };
};

export const getMyIdeaUpvotes = (voterToken: string): Record<string, boolean> =>
  getMyUpvotes(voterToken);
