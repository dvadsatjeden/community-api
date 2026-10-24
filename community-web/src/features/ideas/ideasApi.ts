export type IdeaCategoryId = "infra" | "events" | "education" | "tools" | "community" | "other";
export type IdeaCommentKind = "comment" | "suggestion" | "remark";

export type IdeaItem = {
  id: string;
  title: string;
  description: string;
  categoryId: IdeaCategoryId;
  categoryOther?: string;
  websiteUrl?: string;
  signalUrl?: string;
  authorOwnerId: string;
  authorPseudonym?: string;
  status: "published" | "archived";
  createdAt: string;
  updatedAt: string;
  upvoteCount: number;
  commentCount: number;
  myUpvote?: boolean;
  isOwner?: boolean;
};

export type IdeaComment = {
  isOwner?: boolean;
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
  showArchived?: boolean;
  ownerToken?: string;
}): Promise<IdeaItem[]> => {
  const sp = new URLSearchParams();
  if (params.category) sp.set("category", params.category);
  if (params.q) sp.set("q", params.q);
  if (params.sort) sp.set("sort", params.sort);
  if (params.showArchived) sp.set("showArchived", "1");
  const r = await fetch(`${apiBase}/v1/ideas?${sp.toString()}`, {
    headers: params.ownerToken ? { "X-Anonymous-Token": params.ownerToken } : {},
  });
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

export type IdeaFormPayload = {
  title: string;
  description: string;
  categoryId: IdeaCategoryId;
  categoryOther?: string;
  websiteUrl?: string;
  signalUrl?: string;
  authorPseudonym?: string;
};

export const createIdea = async (apiBase: string, ownerToken: string, payload: IdeaFormPayload): Promise<IdeaItem> => {
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

export const updateIdea = async (apiBase: string, ownerToken: string, id: string, payload: Partial<IdeaFormPayload> & { status?: "published" | "archived" }): Promise<IdeaItem> => {
  const r = await fetch(`${apiBase}/v1/ideas/${encodeURIComponent(id)}`, {
    method: "PATCH",
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

export const fetchComments = async (apiBase: string, ideaId: string, ownerToken?: string): Promise<IdeaComment[]> => {
  const r = await fetch(`${apiBase}/v1/ideas/${encodeURIComponent(ideaId)}/comments`, { headers: headers(ownerToken) });
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

export const toggleUpvote = async (apiBase: string, voterToken: string, ideaId: string, currentlyUpvoted = false): Promise<{ upvoted: boolean; upvoteCount: number }> => {
  const r = await fetch(`${apiBase}/v1/ideas/${encodeURIComponent(ideaId)}/upvote`, {
    method: currentlyUpvoted ? "DELETE" : "POST",
    headers: headers(voterToken),
    body: JSON.stringify({ voterToken }),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  const result = await r.json() as { upvoteCount: number };
  return { ...result, upvoted: !currentlyUpvoted };
};

export const fetchMyUpvotes = async (apiBase: string, voterToken: string): Promise<Record<string, boolean>> => {
  const r = await fetch(`${apiBase}/v1/ideas/upvotes/mine`, {
    headers: { "X-Anonymous-Token": voterToken },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  const data = (await r.json()) as { items: Record<string, boolean> };
  return data.items;
};
