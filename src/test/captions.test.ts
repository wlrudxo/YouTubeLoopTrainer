import { describe, expect, it } from "vitest";
import { cleanCaptionText, extractJson3CaptionLines, joinCaptionLines } from "../shared/captions";

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

  it("extracts json3 caption events that overlap a time range", () => {
    expect(
      extractJson3CaptionLines(
        [
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: "before" }] },
          { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: "could " }, { utf8: "have" }] },
          { tStartMs: 3200, dDurationMs: 500, segs: [{ utf8: "after" }] }
        ],
        2,
        3
      )
    ).toEqual(["could have"]);
  });
});
