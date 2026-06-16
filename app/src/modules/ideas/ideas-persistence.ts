import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { IdeaItem, IdeaComment, IdeaCategoryId } from "../contracts";

const ideasPath = (): string =>
  process.env.IDEAS_PERSIST_PATH
    ? resolve(process.env.IDEAS_PERSIST_PATH)
    : resolve(process.cwd(), "data", "ideas-data.json");

type PersistedData = {
  ideas: IdeaItem[];
  comments: IdeaComment[];
  upvotes: Record<string, Record<string, true>>;
};

type InMemory = {
  ideas: IdeaItem[];
  comments: IdeaComment[];
  upvotes: Map<string, Set<string>>;
};

let cache: InMemory | null = null;

export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

const load = (): void => {
  if (cache !== null) return;
  const p = ideasPath();
  if (!existsSync(p)) {
    cache = { ideas: [], comments: [], upvotes: new Map() };
    return;
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as PersistedData;
    const upvotes = new Map<string, Set<string>>();
    for (const [ideaId, byHash] of Object.entries(raw.upvotes ?? {})) {
      upvotes.set(ideaId, new Set(Object.keys(byHash)));
    }
    cache = {
      ideas: (raw.ideas ?? []) as IdeaItem[],
      comments: (raw.comments ?? []) as IdeaComment[],
      upvotes,
    };
  } catch {
    cache = { ideas: [], comments: [], upvotes: new Map() };
  }
};

const persist = (): void => {
  if (cache === null) return;
  const p = ideasPath();
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const upvotesObj: Record<string, Record<string, true>> = {};
  for (const [ideaId, hashes] of cache.upvotes) {
    upvotesObj[ideaId] = Object.fromEntries([...hashes].map((h) => [h, true as const]));
  }
  const data: PersistedData = { ideas: cache.ideas, comments: cache.comments, upvotes: upvotesObj };
  writeFileSync(p, JSON.stringify(data, null, 0) + "\n", "utf8");
};

export const getIdeas = (): IdeaItem[] => { load(); return cache!.ideas; };
export const getComments = (): IdeaComment[] => { load(); return cache!.comments; };

export const addIdea = (idea: IdeaItem): void => {
  load();
  cache!.ideas.push(idea);
  persist();
};

export const updateIdea = (
  id: string,
  patch: Partial<Pick<IdeaItem, "title" | "description" | "categoryId" | "categoryOther" | "authorPseudonym">>
): IdeaItem | null => {
  load();
  const idx = cache!.ideas.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  cache!.ideas[idx] = { ...cache!.ideas[idx]!, ...patch, updatedAt: new Date().toISOString() };
  persist();
  return cache!.ideas[idx]!;
};

export const deleteIdea = (id: string): boolean => {
  load();
  const before = cache!.ideas.length;
  cache!.ideas = cache!.ideas.filter((i) => i.id !== id);
  cache!.comments = cache!.comments.filter((c) => c.ideaId !== id);
  cache!.upvotes.delete(id);
  if (cache!.ideas.length < before) { persist(); return true; }
  return false;
};

export const addComment = (comment: IdeaComment): void => {
  load();
  cache!.comments.push(comment);
  persist();
};

export const updateComment = (
  cid: string,
  patch: Partial<Pick<IdeaComment, "body" | "authorPseudonym">>
): IdeaComment | null => {
  load();
  const idx = cache!.comments.findIndex((c) => c.id === cid);
  if (idx === -1) return null;
  cache!.comments[idx] = { ...cache!.comments[idx]!, ...patch, updatedAt: new Date().toISOString() };
  persist();
  return cache!.comments[idx]!;
};

export const deleteComment = (cid: string): boolean => {
  load();
  const before = cache!.comments.length;
  cache!.comments = cache!.comments.filter((c) => c.id !== cid);
  if (cache!.comments.length < before) { persist(); return true; }
  return false;
};

export const toggleUpvote = (ideaId: string, voterToken: string): boolean => {
  load();
  const h = hashToken(voterToken);
  const set = cache!.upvotes.get(ideaId) ?? new Set<string>();
  if (set.has(h)) {
    set.delete(h);
    if (set.size === 0) cache!.upvotes.delete(ideaId); else cache!.upvotes.set(ideaId, set);
    persist();
    return false;
  }
  set.add(h);
  cache!.upvotes.set(ideaId, set);
  persist();
  return true;
};

export const removeUpvote = (ideaId: string, voterToken: string): void => {
  load();
  const h = hashToken(voterToken);
  const set = cache!.upvotes.get(ideaId);
  if (!set) return;
  set.delete(h);
  if (set.size === 0) cache!.upvotes.delete(ideaId);
  persist();
};

export const getUpvoteCount = (ideaId: string): number => {
  load();
  return cache!.upvotes.get(ideaId)?.size ?? 0;
};

export const hasUpvoted = (ideaId: string, voterToken: string): boolean => {
  load();
  return cache!.upvotes.get(ideaId)?.has(hashToken(voterToken)) ?? false;
};

export const getMyUpvotes = (voterToken: string): Record<string, boolean> => {
  load();
  const h = hashToken(voterToken);
  const result: Record<string, boolean> = {};
  for (const [ideaId, set] of cache!.upvotes) {
    if (set.has(h)) result[ideaId] = true;
  }
  return result;
};

export const _resetCacheForTesting = (): void => {
  cache = null;
  const p = ideasPath();
  if (existsSync(p)) unlinkSync(p);
};

// re-export for controller
export type { IdeaItem, IdeaComment, IdeaCategoryId };
