import { describe, expect, it } from "vitest";
import {
  normalizeEvent,
  normalizeCategoryTerm,
  selectEvents,
  stripHtml,
  shortText,
  toIso,
} from "./events.controller";
import type { EventItem } from "../contracts";

// ── toIso ────────────────────────────────────────────────────────────────────

describe("toIso", () => {
  it("converts ISO string", () => {
    expect(toIso("2026-05-21T18:00:00Z")).toBe("2026-05-21T18:00:00.000Z");
  });

  it("converts WP-style space-separated datetime", () => {
    const result = toIso("2026-05-21 18:00:00");
    expect(result).toMatch(/^2026-05-21T/);
  });

  it("returns undefined for empty string", () => {
    expect(toIso("")).toBeUndefined();
    expect(toIso("   ")).toBeUndefined();
  });

  it("returns undefined for invalid date", () => {
    expect(toIso("not-a-date")).toBeUndefined();
  });

  it("returns undefined for non-string", () => {
    expect(toIso(null)).toBeUndefined();
    expect(toIso(undefined)).toBeUndefined();
    expect(toIso(12345)).toBeUndefined();
  });
});

// ── stripHtml ────────────────────────────────────────────────────────────────

describe("stripHtml", () => {
  it("removes tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("collapses whitespace", () => {
    expect(stripHtml("a  <br/>  b")).toBe("a b");
  });

  it("passes plain text through", () => {
    expect(stripHtml("plain")).toBe("plain");
  });
});

// ── shortText ────────────────────────────────────────────────────────────────

describe("shortText", () => {
  it("returns undefined for undefined input", () => {
    expect(shortText(undefined)).toBeUndefined();
  });

  it("returns the string unchanged when within limit", () => {
    expect(shortText("hello", 10)).toBe("hello");
  });

  it("truncates and appends ellipsis when over limit", () => {
    const result = shortText("abcdefghij", 5);
    expect(result).toHaveLength(5);
    expect(result).toMatch(/…$/);
  });
});

// ── normalizeCategoryTerm ────────────────────────────────────────────────────

describe("normalizeCategoryTerm", () => {
  it.each([
    ["Bitcoin Pivo", "pivo", "Bratislava Pivo Night"],
    ["Bitcoin Pivo", "Pivo Bitcoin", "BA meetup"],
    ["MeetUpy", "meetup", "BA 21 meetup"],
    ["MeetUpy", "Meet Up", "Event"],
    ["Konferencie", "konferencia", "Global conference"],
    ["Konferencie", "conference", "Big conference 2026"],
    ["Ostatné", "workshop", "Workshop"],
    ["Ostatné", undefined, "Random event"],
  ])("returns %s for category=%s title=%s", (expected, category, title) => {
    expect(normalizeCategoryTerm(category, title)).toBe(expected);
  });
});

// ── normalizeEvent ───────────────────────────────────────────────────────────

describe("normalizeEvent", () => {
  it("returns null when startsAt is missing", () => {
    expect(normalizeEvent({ title: "No date" }, 0)).toBeNull();
  });

  it("maps a minimal valid event", () => {
    const result = normalizeEvent({ id: "e1", title: "Test", startsAt: "2026-06-01T10:00:00Z" }, 0);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("e1");
    expect(result!.title).toBe("Test");
    expect(result!.startsAt).toBe("2026-06-01T10:00:00.000Z");
  });

  it("falls back to generated id when missing", () => {
    const result = normalizeEvent({ title: "No id", startsAt: "2026-06-01T10:00:00Z" }, 3);
    expect(result!.id).toMatch(/^source-event-3-/);
  });

  it("strips HTML from description", () => {
    const result = normalizeEvent({
      id: "e2",
      title: "T",
      startsAt: "2026-06-01T10:00:00Z",
      description: "<p>Hello <b>world</b></p>",
    }, 0);
    expect(result!.description).toBe("Hello world");
  });

  it("reads location from locationName or location field", () => {
    const r1 = normalizeEvent({ id: "a", title: "T", startsAt: "2026-06-01T10:00:00Z", locationName: "Hall A" }, 0);
    expect(r1!.locationName).toBe("Hall A");
    const r2 = normalizeEvent({ id: "b", title: "T", startsAt: "2026-06-01T10:00:00Z", location: "Hall B" }, 0);
    expect(r2!.locationName).toBe("Hall B");
  });

  it("reads fields from extendedProps", () => {
    const result = normalizeEvent({
      title: "T",
      extendedProps: {
        start: "2026-06-01T10:00:00Z",
        region: "Bratislava",
        category: "Meetup",
      },
    }, 0);
    expect(result).not.toBeNull();
    expect(result!.region).toBe("Bratislava");
  });
});

// ── selectEvents ─────────────────────────────────────────────────────────────

const makeEvent = (overrides: Partial<EventItem> & { startsAt: string }): EventItem => ({
  id: overrides.id ?? "e",
  title: overrides.title ?? "Event",
  ...overrides,
});

describe("selectEvents", () => {
  const past  = makeEvent({ id: "past",   startsAt: "2020-01-01T10:00:00Z" });
  const near  = makeEvent({ id: "near",   startsAt: "2030-01-01T10:00:00Z" });
  const far   = makeEvent({ id: "far",    startsAt: "2035-01-01T10:00:00Z" });
  const skEv  = makeEvent({ id: "sk",     startsAt: "2030-06-01T10:00:00Z", country: "sk" });
  const czEv  = makeEvent({ id: "cz",     startsAt: "2030-06-01T10:00:00Z", country: "cz" });
  const baEv  = makeEvent({ id: "ba",     startsAt: "2030-06-01T10:00:00Z", region: "Bratislava" });
  const pivoEv = makeEvent({ id: "pivo",  startsAt: "2030-06-01T10:00:00Z", category: "Bitcoin Pivo" });

  it("filters out past events when futureOnly=true", () => {
    const result = selectEvents([past, near], { futureOnly: true, sort: "asc" });
    expect(result.map((e) => e.id)).toEqual(["near"]);
  });

  it("includes past events when futureOnly=false", () => {
    const result = selectEvents([past, near], { futureOnly: false, sort: "asc" });
    expect(result).toHaveLength(2);
  });

  it("sorts ascending", () => {
    const result = selectEvents([far, near], { futureOnly: false, sort: "asc" });
    expect(result.map((e) => e.id)).toEqual(["near", "far"]);
  });

  it("sorts descending", () => {
    const result = selectEvents([near, far], { futureOnly: false, sort: "desc" });
    expect(result.map((e) => e.id)).toEqual(["far", "near"]);
  });

  it("filters by country (case-insensitive)", () => {
    const result = selectEvents([skEv, czEv], { futureOnly: false, sort: "asc", country: "SK" });
    expect(result.map((e) => e.id)).toEqual(["sk"]);
  });

  it("filters by region (case-insensitive)", () => {
    const result = selectEvents([baEv, czEv], { futureOnly: false, sort: "asc", region: "bratislava" });
    expect(result.map((e) => e.id)).toEqual(["ba"]);
  });

  it("filters by category", () => {
    const result = selectEvents([pivoEv, near], { futureOnly: false, sort: "asc", category: "bitcoin pivo" });
    expect(result.map((e) => e.id)).toEqual(["pivo"]);
  });

  it("returns empty array when nothing matches", () => {
    expect(selectEvents([near], { futureOnly: false, sort: "asc", country: "de" })).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [far, near];
    selectEvents(input, { futureOnly: false, sort: "asc" });
    expect(input[0].id).toBe("far");
  });
});
