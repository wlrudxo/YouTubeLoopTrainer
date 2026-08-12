import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildYtDlpAudioArgs, processItemMedia } from "./media.mjs";
import { getItem, importCapture, initializeDataRoot } from "./storage.mjs";

const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), "phraseloop-media-"));
  tempDirs.push(dataDir);
  await initializeDataRoot(dataDir);
  await importCapture(dataDir, {
    loopId: "lp_media",
    videoId: "video_media",
    start: 2.25,
    end: 4.75,
    label: "Test audio",
    title: "Test",
    url: "https://www.youtube.com/watch?v=video_media"
  });
  return dataDir;
}

describe("companion media processing", () => {
  it("builds a bounded yt-dlp audio request", () => {
    const args = buildYtDlpAudioArgs({
      url: "https://www.youtube.com/watch?v=test",
      start: 2.25,
      end: 4.75,
      outputTemplate: "audio.%(ext)s"
    });
    expect(args).toContain("*00:00:02.250-00:00:04.750");
    expect(args).toContain("--no-playlist");
    expect(args.at(-1)).toBe("https://www.youtube.com/watch?v=test");
  });

  it("moves generated audio into the item and completes processing", async () => {
    const dataDir = await fixture();
    const item = await processItemMedia(dataDir, "video_media", "lp_media", {
      downloadSection: async ({ outputDir }) => {
        const path = join(outputDir, "generated.mp3");
        await writeFile(path, "fake mp3");
        return path;
      }
    });
    expect(item.processing.status).toBe("complete");
    const audioPath = join(dataDir, "videos", "video_media", "loops", "lp_media", "audio.mp3");
    await expect(access(audioPath)).resolves.toBeUndefined();
    expect(await readFile(audioPath, "utf8")).toBe("fake mp3");
  });

  it("records a retryable error when download fails", async () => {
    const dataDir = await fixture();
    await expect(processItemMedia(dataDir, "video_media", "lp_media", {
      downloadSection: async () => {
        throw new Error("download unavailable");
      }
    })).rejects.toThrow("download unavailable");
    const item = await getItem(dataDir, "video_media", "lp_media");
    expect(item.processing.status).toBe("error");
    expect(item.processing.attempts).toBe(1);
    expect(item.processing.error).toBe("download unavailable");
  });
});
