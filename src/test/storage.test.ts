import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../shared/constants";
import { createEmptyData } from "../shared/data";
import { readData, saveProgress } from "../shared/storage";
import type { PhraseLoopData } from "../shared/types";

let storedData: PhraseLoopData | undefined;

beforeEach(() => {
  storedData = undefined;
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storedData })),
        set: vi.fn(async (value: Record<string, PhraseLoopData>) => {
          storedData = value[STORAGE_KEY];
        })
      }
    }
  });
});

describe("storage", () => {
  it("creates a video entry when saving progress before any loops exist", async () => {
    const video = await saveProgress(
      "abc123",
      42.5,
      "2026-05-19T12:30:00.000Z",
      "Test video",
      "https://www.youtube.com/watch?v=abc123",
      { channelTitle: "Test Channel" }
    );

    expect(video).toMatchObject({
      videoId: "abc123",
      title: "Test video",
      channelTitle: "Test Channel",
      progress: {
        time: 42.5,
        updatedAt: "2026-05-19T12:30:00.000Z"
      },
      loops: []
    });
    expect((await readData()).videos.abc123).toEqual(video);
  });

  it("updates progress on existing videos without removing loops", async () => {
    storedData = createEmptyData();
    storedData.videos.abc123 = {
      videoId: "abc123",
      title: "Original",
      url: "https://www.youtube.com/watch?v=abc123",
      loops: [
        {
          id: "loop-a",
          start: 10,
          end: 15,
          label: "first",
          createdAt: "2026-05-19T10:00:00.000Z",
          updatedAt: "2026-05-19T10:00:00.000Z"
        }
      ]
    };

    const video = await saveProgress("abc123", 30, "2026-05-19T12:30:00.000Z");

    expect(video.loops).toHaveLength(1);
    expect(video.progress).toEqual({
      time: 30,
      updatedAt: "2026-05-19T12:30:00.000Z"
    });
  });
});
