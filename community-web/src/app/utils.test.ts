import { describe, expect, it } from "vitest";
import { dateParts, TZ } from "./utils";

describe("TZ", () => {
  it("is UTC", () => {
    expect(TZ).toBe("UTC");
  });
});

describe("dateParts", () => {
  // 2026-05-21T18:00:00Z = Thursday 21 May 2026 at 18:00 UTC
  const ISO_THURSDAY_EVENING = "2026-05-21T18:00:00Z";

  it("extracts day number (sk-SK locale appends a period)", () => {
    // sk-SK formats ordinal days as "21." — strip it for a portable check
    expect(dateParts(ISO_THURSDAY_EVENING).day.replace(/\.$/, "")).toBe("21");
  });

  it("extracts time in HH:MM format", () => {
    expect(dateParts(ISO_THURSDAY_EVENING).time).toBe("18:00");
  });

  it("does NOT shift time by local timezone offset (UTC fix)", () => {
    // If the code used local time instead of UTC, a +02:00 system would
    // show 20:00. We assert it stays at 18:00 regardless of where tests run.
    expect(dateParts(ISO_THURSDAY_EVENING).time).toBe("18:00");
  });

  it("returns consistent results for midnight UTC", () => {
    // 2026-01-01T00:00:00Z — must stay on Jan 1st, not shift to Dec 31st
    const parts = dateParts("2026-01-01T00:00:00Z");
    expect(parts.day.replace(/\.$/, "")).toBe("01");
    expect(parts.time).toBe("00:00");
  });

  it("returns sk-SK month abbreviation for may", () => {
    const { month } = dateParts(ISO_THURSDAY_EVENING);
    // Slovak abbreviation for máj is "máj" (or locale-specific short form)
    expect(month.toLowerCase()).toMatch(/^máj|^may|^05/i);
  });
});
