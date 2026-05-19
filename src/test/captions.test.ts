import { describe, expect, it } from "vitest";
import {
  cleanCaptionText,
  joinCaptionLines,
  joinCaptionSamples
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

  it("removes YouTube caption settings text", () => {
    expect(cleanCaptionText("hello 영어 (자동 생성됨) 설정을 확인하려면 을 클릭하세요. world")).toBe("hello world");
  });

  it("merges rolling visible caption samples by word overlap", () => {
    expect(
      joinCaptionSamples([
        "the possible weaknesses in enemy anatomy",
        "the possible weaknesses in enemy anatomy. I think",
        "enemy anatomy. I think this is Abella.",
        "I think this is Abella. Oh, that's Dan."
      ])
    ).toBe("the possible weaknesses in enemy anatomy. I think this is Abella. Oh, that's Dan.");
  });
});
