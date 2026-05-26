import { describe, expect, it } from "vitest";
import { createAnkiExportPayload, createEmptyData, mergePhraseLoopData, parseImportPayload } from "../shared/importExport";
import type { Loop, PhraseLoopData } from "../shared/types";

const videoId = "cSicoPFDeqQ";

describe("import/export merge", () => {
  it("adds new loops and sorts by start", () => {
    const existing = withLoops([]);
    const imported = withLoops([loop("b", 20, 25, "second"), loop("a", 10, 15, "first")]);

    const result = mergePhraseLoopData(existing, imported);

    expect(result.summary.loopsAdded).toBe(2);
    expect(result.data.videos[videoId].loops.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("deduplicates same IDs", () => {
    const existing = withLoops([loop("a", 10, 15, "first", "2026-05-19T10:00:00.000Z")]);
    const imported = withLoops([loop("a", 10, 15, "first", "2026-05-19T09:00:00.000Z")]);

    const result = mergePhraseLoopData(existing, imported);

    expect(result.summary.duplicatesSkipped).toBe(1);
    expect(result.data.videos[videoId].loops).toHaveLength(1);
  });

  it("updates same IDs when imported updatedAt is newer", () => {
    const existing = withLoops([loop("a", 10, 15, "old", "2026-05-19T10:00:00.000Z")]);
    const imported = withLoops([loop("a", 10, 15, "new", "2026-05-19T11:00:00.000Z")]);

    const result = mergePhraseLoopData(existing, imported);

    expect(result.summary.loopsUpdated).toBe(1);
    expect(result.data.videos[videoId].loops[0].label).toBe("new");
  });

  it("deduplicates near-identical time ranges with the same normalized label", () => {
    const existing = withLoops([loop("a", 10, 15, "Could   Have Been Better")]);
    const imported = withLoops([loop("b", 10.1, 15.1, " could have been better ")]);

    const result = mergePhraseLoopData(existing, imported);

    expect(result.summary.duplicatesSkipped).toBe(1);
    expect(result.data.videos[videoId].loops).toHaveLength(1);
  });

  it("preserves same time ranges with different labels", () => {
    const existing = withLoops([loop("a", 10, 15, "could have been better")]);
    const imported = withLoops([loop("b", 10.1, 15.1, "fast pronunciation")]);

    const result = mergePhraseLoopData(existing, imported);

    expect(result.summary.loopsAdded).toBe(1);
    expect(result.data.videos[videoId].loops).toHaveLength(2);
  });

  it("parses wrapped export payloads", () => {
    const data = withLoops([loop("a", 10, 15, "first")]);

    expect(
      parseImportPayload({
        app: "PhraseLoop",
        schemaVersion: 1,
        exportedAt: "2026-05-19T12:00:00.000Z",
        source: { browser: "chrome", storage: "local" },
        data
      })
    ).toEqual(data);
  });

  it("preserves optional video channel metadata", () => {
    const data = withLoops([loop("a", 10, 15, "first")]);
    data.videos[videoId].channelTitle = "Test Channel";
    data.videos[videoId].channelAvatarUrl = "https://example.com/avatar.jpg";

    expect(parseImportPayload(data).videos[videoId]).toMatchObject({
      channelTitle: "Test Channel",
      channelAvatarUrl: "https://example.com/avatar.jpg"
    });
  });

  it("preserves optional video progress", () => {
    const data = withLoops([loop("a", 10, 15, "first")]);
    data.videos[videoId].progress = {
      time: 42.5,
      updatedAt: "2026-05-19T12:30:00.000Z"
    };

    expect(parseImportPayload(data).videos[videoId].progress).toEqual({
      time: 42.5,
      updatedAt: "2026-05-19T12:30:00.000Z"
    });
  });

  it("preserves optional loop status", () => {
    const data = withLoops([{ ...loop("a", 10, 15, "first"), status: "hard" }]);

    expect(parseImportPayload(data).videos[videoId].loops[0].status).toBe("hard");
  });

  it("preserves loop creation dates", () => {
    const data = withLoops([loop("a", 10, 15, "first", "2026-05-19T12:00:00.000Z", "2026-05-19T13:00:00.000Z")]);

    expect(parseImportPayload(data).videos[videoId].loops[0].createdAt).toBe("2026-05-19T12:00:00.000Z");
  });

  it("creates Anki export payloads", () => {
    const data = withLoops([loop("a", 10, 15, "first")]);
    data.videos[videoId].channelTitle = "Test Channel";

    expect(createAnkiExportPayload(data, "2026-05-19T13:00:00.000Z")).toEqual({
      app: "PhraseLoopAnkiExport",
      schemaVersion: 1,
      exportedAt: "2026-05-19T13:00:00.000Z",
      loops: [
        {
          id: "a",
          videoId,
          videoTitle: "Test video",
          channelTitle: "Test Channel",
          url: `https://www.youtube.com/watch?v=${videoId}`,
          start: 10,
          end: 15,
          label: "first",
          createdAt: "2026-05-19T12:00:00.000Z",
          updatedAt: "2026-05-19T12:00:00.000Z"
        }
      ]
    });
  });
});

function withLoops(loops: Loop[]): PhraseLoopData {
  const data = createEmptyData();
  data.videos[videoId] = {
    videoId,
    title: "Test video",
    url: `https://www.youtube.com/watch?v=${videoId}`,
    loops
  };
  return data;
}

function loop(
  id: string,
  start: number,
  end: number,
  label: string,
  createdAt = "2026-05-19T12:00:00.000Z",
  updatedAt = createdAt
): Loop {
  return { id, start, end, label, createdAt, updatedAt };
}
