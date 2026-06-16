export type IdeaCategoryId = "infra" | "events" | "education" | "tools" | "community" | "other";
export type IdeaCommentKind = "comment" | "suggestion" | "remark";

export type IdeaItem = {
  id: string;
  title: string;
  description: string;
  categoryId: IdeaCategoryId;
  categoryOther?: string;
  authorOwnerId: string;
  authorPseudonym?: string;
  status: "published";
  createdAt: string;
  updatedAt: string;
  upvoteCount: number;
  commentCount: number;
  myUpvote?: boolean;
};

export type IdeaComment = {
  id: string;
  ideaId: string;
  kind: IdeaCommentKind;
  body: string;
  authorOwnerId: string;
  authorPseudonym?: string;
  createdAt: string;
  updatedAt: string;
};

export type IdeaCategory = { id: IdeaCategoryId; label: string };

const headers = (token?: string): HeadersInit => ({
  "Content-Type": "application/json",
  ...(token ? { "X-Anonymous-Token": token } : {}),
});

export const fetchCategories = async (apiBase: string): Promise<IdeaCategory[]> => {
  const r = await fetch(`${apiBase}/v1/ideas/categories`);
  if (!r.ok) throw new Error(`${r.status}`);
  const data = (await r.json()) as { items: IdeaCategory[] };
  return data.items;
};

export const fetchIdeas = async (apiBase: string, params: {
  category?: string;
  q?: string;
  sort?: "newest" | "upvotes";
}): Promise<IdeaItem[]> => {
  const sp = new URLSearchParams();
  if (params.category) sp.set("category", params.category);
  if (params.q) sp.set("q", params.q);
  if (params.sort) sp.set("sort", params.sort);
  const r = await fetch(`${apiBase}/v1/ideas?${sp.toString()}`);
  if (!r.ok) throw new Error(`${r.status}`);
  const data = (await r.json()) as { items: IdeaItem[] };
  return data.items;
};

export const fetchIdea = async (apiBase: string, id: string, voterToken?: string): Promise<IdeaItem> => {
  const r = await fetch(`${apiBase}/v1/ideas/${encodeURIComponent(id)}`, {
    headers: voterToken ? { "X-Anonymous-Token": voterToken } : {},
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<IdeaItem>;
};

export const createIdea = async (apiBase: string, ownerToken: string, payload: {
  title: string;
  description: string;
  categoryId: IdeaCategoryId;
  categoryOther?: string;
  authorPseudonym?: string;
}): Promise<IdeaItem> => {
  const r = await fetch(`${apiBase}/v1/ideas`, {
    method: "POST",
    headers: headers(ownerToken),
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `${r.status}`);
  }
  return r.json() as Promise<IdeaItem>;
};

export const deleteIdea = async (apiBase: string, ownerToken: string, id: string): Promise<void> => {
  const r = await fetch(`${apiBase}/v1/ideas/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(ownerToken),
  });
  if (!r.ok && r.status !== 204) throw new Error(`${r.status}`);
};

export const fetchComments = async (apiBase: string, ideaId: string): Promise<IdeaComment[]> => {
  const r = await fetch(`${apiBase}/v1/ideas/${encodeURIComponent(ideaId)}/comments`);
  if (!r.ok) throw new Error(`${r.status}`);
  const data = (await r.json()) as { items: IdeaComment[] };
  return data.items;
};

export const postComment = async (apiBase: string, ownerToken: string, ideaId: string, payload: {
  kind: IdeaCommentKind;
  body: string;
  authorPseudonym?: string;
}): Promise<IdeaComment> => {
  const r = await fetch(`${apiBase}/v1/ideas/${encodeURIComponent(ideaId)}/comments`, {
    method: "POST",
    headers: headers(ownerToken),
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `${r.status}`);
  }
  return r.json() as Promise<IdeaComment>;
};

export const deleteComment = async (apiBase: string, ownerToken: string, ideaId: string, cid: string): Promise<void> => {
  const r = await fetch(`${apiBase}/v1/ideas/${encodeURIComponent(ideaId)}/comments/${encodeURIComponent(cid)}`, {
    method: "DELETE",
    headers: headers(ownerToken),
  });
  if (!r.ok && r.status !== 204) throw new Error(`${r.status}`);
};

export const toggleUpvote = async (apiBase: string, voterToken: string, ideaId: string): Promise<{ upvoted: boolean; upvoteCount: number }> => {
  const r = await fetch(`${apiBase}/v1/ideas/${encodeURIComponent(ideaId)}/upvote`, {
    method: "POST",
    headers: headers(voterToken),
    body: JSON.stringify({ voterToken }),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<{ upvoted: boolean; upvoteCount: number }>;
};

export const fetchMyUpvotes = async (apiBase: string, voterToken: string): Promise<Record<string, boolean>> => {
  const r = await fetch(`${apiBase}/v1/ideas/upvotes/mine`, {
    headers: { "X-Anonymous-Token": voterToken },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  const data = (await r.json()) as { items: Record<string, boolean> };
  return data.items;
};
