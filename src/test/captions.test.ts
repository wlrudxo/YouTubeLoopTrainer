import { describe, expect, it } from "vitest";
import {
  cleanCaptionText,
  joinCaptionLines
} from "../shared/captions";

describe("caption labels", () => {
  it("cleans caption markup and whitespace", () => {
    expect(cleanCaptionText("<c> Could   have </c>\nbeen better")).toBe("Could have been better");
  });

  it("removes bracketed non-speech annotations", () => {
    expect(cleanCaptionText("[Music] could have been better")).toBe("could have been better");
  });

  it("joins unique cleaned lines", () => {
    expect(joinCaptionLines([" could have been better ", "Could have been better", "fast pronunciation"])).toBe(
      "could have been better fast pronunciation"
    );
  });
});
