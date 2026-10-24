import { describe, expect, it } from "vitest";
import { dateParts, monthKey } from "./utils";
describe("venue-local event times", () => {
  it("shows summer and winter time in Slovakia/Czechia regardless of device timezone", () => {
    expect(dateParts("2026-05-21T16:00:00Z").time).toBe("18:00");
    expect(dateParts("2026-01-21T17:00:00Z").time).toBe("18:00");
  });
  it("assigns events near UTC midnight to the correct local day and month", () => {
    expect(dateParts("2026-05-31T23:30:00Z").day.replace(/\.$/, "")).toBe("01");
    expect(monthKey("2026-05-31T23:30:00Z")).toBe("2026-06");
    expect(monthKey("2026-12-31T23:30:00Z")).toBe("2027-01");
  });
});
