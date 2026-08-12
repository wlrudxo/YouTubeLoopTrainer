import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureVideoAssets } from "./assets.mjs";

const tempDirs = [];
afterEach(async () => Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("video assets", () => {
  it("downloads thumbnail and channel avatar only once", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "phraseloop-assets-"));
    tempDirs.push(dataDir);
    const urls = [];
    const capture = { videoId: "video_asset", channelAvatarUrl: "https://yt3.ggpht.com/avatar" };
    const downloadImage = async (url) => {
      urls.push(url);
      return Buffer.from(`image:${url}`);
    };
    await ensureVideoAssets(dataDir, capture, { downloadImage });
    await ensureVideoAssets(dataDir, capture, { downloadImage });

    expect(urls).toHaveLength(2);
    expect(await readFile(join(dataDir, "videos", "video_asset", "thumbnail.jpg"), "utf8")).toContain("i.ytimg.com");
    expect(await readFile(join(dataDir, "videos", "video_asset", "channel.jpg"), "utf8")).toContain("yt3.ggpht.com");
  });
});
