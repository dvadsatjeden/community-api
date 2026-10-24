import { beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

process.env.IDEAS_PERSIST_PATH = join(tmpdir(), `ideas-test-${randomUUID()}.json`);

import { _resetCacheForTesting } from "./ideas-persistence.js";
import {
  createComment,
  createIdea,
  deleteCommentById,
  deleteIdeaById,
  getIdeaById,
  getMyIdeaUpvotes,
  listCategories,
  listCommentsForIdea,
  listIdeas,
  updateCommentById,
  updateIdeaById,
  upvoteIdea,
} from "./ideas.controller.js";

beforeEach(() => {
  _resetCacheForTesting();
});

describe("listCategories", () => {
  it("returns a non-empty list", () => {
    expect(listCategories().length).toBeGreaterThan(0);
  });
  it("includes 'other'", () => {
    expect(listCategories().some((c) => c.id === "other")).toBe(true);
  });
});

describe("createIdea", () => {
  it("creates a valid idea", () => {
    const r = createIdea({ title: "My idea", description: "A detailed description that is long enough.", categoryId: "infra", ownerToken: "tok1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.idea.title).toBe("My idea");
      expect(r.idea.status).toBe("published");
      expect(r.idea.authorOwnerId.length).toBe(32);
    }
  });

  it("rejects title too short", () => {
    const r = createIdea({ title: "Hi", description: "A detailed description that is long enough.", categoryId: "infra", ownerToken: "tok1" });
    expect(r.ok).toBe(false);
  });

  it("rejects description too short", () => {
    const r = createIdea({ title: "My idea title", description: "Short", categoryId: "infra", ownerToken: "tok1" });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid categoryId", () => {
    const r = createIdea({ title: "My idea title", description: "A detailed description that is long enough.", categoryId: "invalid", ownerToken: "tok1" });
    expect(r.ok).toBe(false);
  });

  it("rejects 'other' category without categoryOther", () => {
    const r = createIdea({ title: "My idea title", description: "A detailed description that is long enough.", categoryId: "other", ownerToken: "tok1" });
    expect(r.ok).toBe(false);
  });

  it("accepts 'other' category with categoryOther", () => {
    const r = createIdea({ title: "My idea title", description: "A detailed description that is long enough.", categoryId: "other", categoryOther: "My custom", ownerToken: "tok1" });
    expect(r.ok).toBe(true);
  });
});

describe("listIdeas", () => {
  beforeEach(() => {
    createIdea({ title: "Bitcoin tooling idea", description: "A detailed description that is long enough.", categoryId: "tools", ownerToken: "tok1" });
    createIdea({ title: "Community event planning", description: "A detailed description that is long enough.", categoryId: "community", ownerToken: "tok2" });
  });

  it("returns all published ideas", () => {
    expect(listIdeas({}).length).toBe(2);
  });

  it("filters by category", () => {
    const r = listIdeas({ category: "tools" });
    expect(r.length).toBe(1);
    expect(r[0]!.categoryId).toBe("tools");
  });

  it("filters by search query", () => {
    const r = listIdeas({ q: "bitcoin" });
    expect(r.length).toBe(1);
    expect(r[0]!.title.toLowerCase()).toContain("bitcoin");
  });

  it("sorts by newest by default", () => {
    const r = listIdeas({});
    expect(new Date(r[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(r[1]!.createdAt).getTime());
  });
});

describe("updateIdeaById", () => {
  it("updates title for owner", () => {
    const c = createIdea({ title: "Original title", description: "A detailed description that is long enough.", categoryId: "infra", ownerToken: "owner-tok" });
    if (!c.ok) throw new Error("create failed");
    const r = updateIdeaById(c.idea.id, { title: "Updated title!!", ownerToken: "owner-tok" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.idea.title).toBe("Updated title!!");
  });

  it("forbids update from non-owner", () => {
    const c = createIdea({ title: "Original title", description: "A detailed description that is long enough.", categoryId: "infra", ownerToken: "owner-tok" });
    if (!c.ok) throw new Error("create failed");
    const r = updateIdeaById(c.idea.id, { title: "Hacked title!!", ownerToken: "other-tok" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});

describe("deleteIdeaById", () => {
  it("deletes own idea", () => {
    const c = createIdea({ title: "To be deleted", description: "A detailed description that is long enough.", categoryId: "events", ownerToken: "del-tok" });
    if (!c.ok) throw new Error();
    const r = deleteIdeaById(c.idea.id, "del-tok");
    expect(r.ok).toBe(true);
    expect(listIdeas({}).length).toBe(0);
  });

  it("forbids deleting another's idea", () => {
    const c = createIdea({ title: "To be deleted", description: "A detailed description that is long enough.", categoryId: "events", ownerToken: "del-tok" });
    if (!c.ok) throw new Error();
    const r = deleteIdeaById(c.idea.id, "other-tok");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});

describe("upvoteIdea + getMyIdeaUpvotes", () => {
  it("sets an upvote idempotently", () => {
    const c = createIdea({ title: "Upvoteable idea", description: "A detailed description that is long enough.", categoryId: "tools", ownerToken: "author" });
    if (!c.ok) throw new Error();
    const r1 = upvoteIdea(c.idea.id, "voter1");
    expect(r1.upvoted).toBe(true);
    expect(r1.upvoteCount).toBe(1);
    const r2 = upvoteIdea(c.idea.id, "voter1");
    expect(r2.upvoted).toBe(true);
    expect(r2.upvoteCount).toBe(1);
  });

  it("multiple different voters stack", () => {
    const c = createIdea({ title: "Popular idea here!", description: "A detailed description that is long enough.", categoryId: "community", ownerToken: "author" });
    if (!c.ok) throw new Error();
    upvoteIdea(c.idea.id, "voter1");
    upvoteIdea(c.idea.id, "voter2");
    const detail = getIdeaById(c.idea.id);
    expect(detail?.upvoteCount).toBe(2);
  });

  it("getMyIdeaUpvotes returns upvoted idea ids", () => {
    const c = createIdea({ title: "My fav idea here!", description: "A detailed description that is long enough.", categoryId: "education", ownerToken: "auth" });
    if (!c.ok) throw new Error();
    upvoteIdea(c.idea.id, "my-voter-token");
    const mine = getMyIdeaUpvotes("my-voter-token");
    expect(mine[c.idea.id]).toBe(true);
  });
});

describe("comments", () => {
  let ideaId: string;

  beforeEach(() => {
    const c = createIdea({ title: "Commentable idea here", description: "A detailed description that is long enough.", categoryId: "infra", ownerToken: "auth" });
    if (!c.ok) throw new Error();
    ideaId = c.idea.id;
  });

  it("creates a comment", () => {
    const r = createComment({ ideaId, kind: "comment", body: "Nice idea!", ownerToken: "commenter1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.comment.body).toBe("Nice idea!");
  });

  it("rejects invalid kind", () => {
    const r = createComment({ ideaId, kind: "spam", body: "Hacked!", ownerToken: "c1" });
    expect(r.ok).toBe(false);
  });

  it("rejects empty body", () => {
    const r = createComment({ ideaId, kind: "comment", body: "", ownerToken: "c1" });
    expect(r.ok).toBe(false);
  });

  it("updates own comment", () => {
    const c = createComment({ ideaId, kind: "suggestion", body: "Original", ownerToken: "c1" });
    if (!c.ok) throw new Error();
    const r = updateCommentById(c.comment.id, { body: "Updated comment body", ownerToken: "c1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.comment.body).toBe("Updated comment body");
  });

  it("forbids updating another's comment", () => {
    const c = createComment({ ideaId, kind: "remark", body: "My remark here", ownerToken: "c1" });
    if (!c.ok) throw new Error();
    const r = updateCommentById(c.comment.id, { body: "New body text here", ownerToken: "c2" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("deletes own comment", () => {
    const c = createComment({ ideaId, kind: "comment", body: "Delete me!", ownerToken: "c1" });
    if (!c.ok) throw new Error();
    const r = deleteCommentById(c.comment.id, "c1");
    expect(r.ok).toBe(true);
    expect(listCommentsForIdea(ideaId).length).toBe(0);
  });

  it("lists comments in chronological order", () => {
    createComment({ ideaId, kind: "comment", body: "First comment here", ownerToken: "c1" });
    createComment({ ideaId, kind: "suggestion", body: "Second comment right", ownerToken: "c2" });
    const list = listCommentsForIdea(ideaId);
    expect(list.length).toBe(2);
    expect(new Date(list[0]!.createdAt).getTime()).toBeLessThanOrEqual(new Date(list[1]!.createdAt).getTime());
  });
});
