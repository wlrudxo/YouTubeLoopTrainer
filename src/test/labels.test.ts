import { describe, expect, it } from "vitest";
import { normalizeLabel, resolveLoopLabel } from "../shared/labels";

describe("labels", () => {
  it("normalizes labels for duplicate detection", () => {
    expect(normalizeLabel("  Could   Have BEEN Better  ")).toBe("could have been better");
  });

  it("uses custom labels when present", () => {
    expect(resolveLoopLabel(" could have been better ", 72.4, 78.9)).toBe("could have been better");
  });

  it("falls back to time labels when empty", () => {
    expect(resolveLoopLabel("   ", 72.4, 78.9)).toBe("01:12.4 - 01:18.9");
  });
});
