import { describe, expect, it } from "vitest";
import { getLoopIdFromUrl, getVideoIdFromUrl, getWatchUrl } from "../content/youtube";

describe("YouTube URL helpers", () => {
  it("extracts watch video IDs", () => {
    expect(getVideoIdFromUrl("https://www.youtube.com/watch?v=cSicoPFDeqQ")).toBe("cSicoPFDeqQ");
  });

  it("returns null away from watch URLs", () => {
    expect(getVideoIdFromUrl("https://www.youtube.com/")).toBeNull();
  });

  it("extracts PhraseLoop loop IDs", () => {
    expect(getLoopIdFromUrl("https://www.youtube.com/watch?v=cSicoPFDeqQ&pl_loop=lp_123")).toBe("lp_123");
  });

  it("builds canonical watch URLs", () => {
    expect(getWatchUrl("cSicoPFDeqQ")).toBe("https://www.youtube.com/watch?v=cSicoPFDeqQ");
  });
});
