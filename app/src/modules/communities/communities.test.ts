import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCommunitySyncStatus, getCommunities, getCommunityUrl, normalizeCommunities, refreshCommunities } from "./communities.js";
import { getDatabase, readSnapshot } from "../../storage/database.js";

const community = (name: string) => ({ name, url: "https://signal.group/#example", lat: 48.1, lng: 17.1 });
beforeEach(() => { getDatabase().exec("DELETE FROM snapshots"); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("community source synchronization", () => {
  it("keeps IDs stable when source order changes", () => {
    const first = normalizeCommunities({ items: [community("A"), community("B")] });
    const second = normalizeCommunities({ items: [community("B"), community("A")] });
    expect(first[0].id).toBe(second[1].id);
    expect(first[1].id).toBe(second[0].id);
  });
  it("adds and removes communities and invalidates removed join links", async () => {
    const mock = vi.fn().mockResolvedValueOnce(Response.json({ items: [community("A"), community("B")] }))
      .mockResolvedValueOnce(Response.json({ items: [community("B"), community("C")] }));
    vi.stubGlobal("fetch", mock);
    const before = await refreshCommunities();
    const after = await refreshCommunities();
    expect(after.map(item => item.name)).toEqual(["B", "C"]);
    expect(after[0].id).toBe(before[1].id);
    expect(await getCommunityUrl(before[0].id)).toBeNull();
    expect(getCommunitySyncStatus().recordsImported).toBe(2);
  });
  it("retains the last successful list on network failure and after reopening storage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ items: [community("A")] })).mockRejectedValue(new Error("offline")));
    await refreshCommunities();
    await expect(refreshCommunities()).rejects.toThrow();
    expect((await getCommunities())[0].name).toBe("A");
    expect(getCommunitySyncStatus().lastError).toBe("community_source_unavailable");
    expect(getCommunitySyncStatus().lastSuccessAt).toBeTruthy();
  });
  it("never erases data on malformed or partially invalid source data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ items: [community("A")] }))
      .mockResolvedValueOnce(Response.json({ nope: [] }))
      .mockResolvedValueOnce(Response.json({ items: [community("B"), { ...community("C"), lat: 999 }] })));
    await refreshCommunities();
    await expect(refreshCommunities()).rejects.toThrow();
    await expect(refreshCommunities()).rejects.toThrow();
    expect((readSnapshot<Array<{ name: string }>>("communities"))![0].name).toBe("A");
  });
  it("accepts an explicitly empty successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ items: [community("A")] })).mockResolvedValueOnce(Response.json({ items: [] })));
    await refreshCommunities();
    expect(await refreshCommunities()).toEqual([]);
    expect(await getCommunities()).toEqual([]);
    expect(getCommunitySyncStatus().lastError).toBeNull();
  });
  it("coalesces overlapping refreshes into one source request", async () => {
    const mock = vi.fn().mockResolvedValue(Response.json({ items: [community("A")] }));
    vi.stubGlobal("fetch", mock);
    await Promise.all([refreshCommunities(), refreshCommunities(), refreshCommunities()]);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("rejects unsafe redirects and duplicate source IDs", () => {
    expect(() => normalizeCommunities([community("A"), community("A")])).toThrow();
    expect(() => normalizeCommunities([{ ...community("A"), url: "javascript:alert(1)" }])).toThrow();
  });
});
