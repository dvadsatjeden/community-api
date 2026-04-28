import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

process.env.GEOCODE_CACHE_PATH = join(tmpdir(), `geocode-test-${randomUUID()}.json`);

import { _resetForTesting, getCachedCoords, normalizeAddress, scheduleGeocoding } from "./geocoding";

beforeEach(() => {
  _resetForTesting();
  vi.restoreAllMocks();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("normalizeAddress", () => {
  it("lowercases and trims", () => {
    expect(normalizeAddress("  Bratislava  ")).toBe("bratislava");
    expect(normalizeAddress("Námestie SNP 1, BA")).toBe("námestie snp 1, ba");
  });
});

describe("getCachedCoords", () => {
  it("returns undefined for unknown address", () => {
    expect(getCachedCoords("unknown place")).toBeUndefined();
  });
});

describe("scheduleGeocoding", () => {
  it("fetches Nominatim and caches a successful result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ lat: "48.1486", lon: "17.1077" }]))
    ));

    scheduleGeocoding(["Bratislava, Slovakia"]);

    await vi.waitFor(
      () => { if (getCachedCoords("Bratislava, Slovakia") === undefined) throw new Error("not yet"); },
      { timeout: 3000, interval: 50 }
    );

    const coords = getCachedCoords("Bratislava, Slovakia");
    expect(coords).toBeDefined();
    expect(coords![0]).toBeCloseTo(48.1486, 3);
    expect(coords![1]).toBeCloseTo(17.1077, 3);
  });

  it("does not re-fetch already-cached addresses", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ lat: "48.1", lon: "17.1" }]))
    );
    vi.stubGlobal("fetch", mockFetch);

    scheduleGeocoding(["Prague, CZ"]);
    await vi.waitFor(
      () => { if (getCachedCoords("Prague, CZ") === undefined) throw new Error("not yet"); },
      { timeout: 3000, interval: 50 }
    );

    const callsBefore = mockFetch.mock.calls.length;
    scheduleGeocoding(["Prague, CZ"]);
    await new Promise((r) => setTimeout(r, 150));
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });

  it("does not cache addresses that return no results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]))
    ));

    scheduleGeocoding(["Nowhere Land XYZ"]);
    await new Promise((r) => setTimeout(r, 300));

    expect(getCachedCoords("Nowhere Land XYZ")).toBeUndefined();
  });

  it("handles network errors gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    expect(() => scheduleGeocoding(["Some Place"])).not.toThrow();
    await new Promise((r) => setTimeout(r, 300));
    expect(getCachedCoords("Some Place")).toBeUndefined();
  });
});
