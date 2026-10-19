import { describe, expect, it } from "vitest";
import { dayIndex, isoDate, nowParts } from "@/lib/studio/logic";

describe("Europe/Sofia calendar time", () => {
  it("maps date-only values to Monday-first weekdays", () => {
    expect(dayIndex("2026-10-19")).toBe(0);
    expect(dayIndex("2026-10-25")).toBe(6);
  });

  it("skips the missing local hour at the spring daylight-saving change", () => {
    const before = new Date("2026-03-29T00:30:00.000Z");
    const after = new Date("2026-03-29T01:30:00.000Z");
    expect(nowParts(before)).toEqual({ date: "2026-03-29", min: 150 });
    expect(nowParts(after)).toEqual({ date: "2026-03-29", min: 270 });
  });

  it("keeps the repeated autumn hour on the same business date", () => {
    const first = new Date("2026-10-25T00:30:00.000Z");
    const second = new Date("2026-10-25T01:30:00.000Z");
    expect(nowParts(first)).toEqual({ date: "2026-10-25", min: 210 });
    expect(nowParts(second)).toEqual({ date: "2026-10-25", min: 210 });
    expect(isoDate(second)).toBe("2026-10-25");
  });
});
