import { describe, expect, it } from "vitest";
import { resolveLoopLabel } from "../shared/labels";

describe("labels", () => {
  it("uses custom labels when present", () => {
    expect(resolveLoopLabel(" could have been better ", 72.4, 78.9)).toBe("could have been better");
  });

  it("falls back to time labels when empty", () => {
    expect(resolveLoopLabel("   ", 72.4, 78.9)).toBe("01:12.4 - 01:18.9");
  });
});
