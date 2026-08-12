import { describe, expect, it } from "vitest";
import { getVideoIdFromUrl, getWatchUrl } from "../content/youtube";

describe("YouTube URL helpers", () => {
  it("extracts watch video IDs", () => {
    expect(getVideoIdFromUrl("https://www.youtube.com/watch?v=cSicoPFDeqQ")).toBe("cSicoPFDeqQ");
  });

  it("returns null away from watch URLs", () => {
    expect(getVideoIdFromUrl("https://www.youtube.com/")).toBeNull();
  });

  it("builds canonical watch URLs", () => {
    expect(getWatchUrl("cSicoPFDeqQ")).toBe("https://www.youtube.com/watch?v=cSicoPFDeqQ");
  });
});
