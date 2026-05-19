import { describe, expect, it } from "vitest";
import {
  cleanCaptionText,
  extractJson3CaptionLines,
  extractSrv3CaptionLines,
  extractVttCaptionLines,
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

  it("extracts srv3 text nodes that overlap a time range", () => {
    expect(
      extractSrv3CaptionLines(
        `<transcript>
          <text start="1" dur="0.5">before</text>
          <text start="2" dur="1.2">could &amp; should</text>
          <text start="4" dur="1">after</text>
        </transcript>`,
        2,
        3
      )
    ).toEqual(["could &amp; should"]);
  });

  it("extracts vtt cue text that overlaps a time range", () => {
    expect(
      extractVttCaptionLines(
        `WEBVTT

00:00:01.000 --> 00:00:01.500
before

00:00:02.000 --> 00:00:03.200
could have been
better

00:00:04.000 --> 00:00:05.000
after`,
        2,
        3
      )
    ).toEqual(["could have been better"]);
  });
});
