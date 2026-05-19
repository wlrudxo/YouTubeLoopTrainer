import { describe, expect, it } from "vitest";
import { formatRangeLabel, formatTime } from "../shared/time";

describe("time formatting", () => {
  it("formats seconds as minutes, seconds, and tenths", () => {
    expect(formatTime(72.4)).toBe("01:12.4");
  });

  it("formats long videos with hours", () => {
    expect(formatTime(3723.8)).toBe("1:02:03.8");
  });

  it("generates default range labels", () => {
    expect(formatRangeLabel(72.4, 78.9)).toBe("01:12.4 - 01:18.9");
  });
});
