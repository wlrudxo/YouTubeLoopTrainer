import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function ensureVideoAssets(dataDir, capture, options = {}) {
  const videoDir = join(dataDir, "videos", capture.videoId);
  await mkdir(videoDir, { recursive: true });
  const download = options.downloadImage ?? downloadImage;
  const results = {};

  results.thumbnail = await ensureAsset(
    join(videoDir, "thumbnail.jpg"),
    `https://i.ytimg.com/vi/${capture.videoId}/mqdefault.jpg`,
    download
  );
  if (capture.channelAvatarUrl) {
    results.channel = await ensureAsset(join(videoDir, "channel.jpg"), capture.channelAvatarUrl, download);
  }
  return results;
}

async function ensureAsset(path, url, download) {
  try {
    await access(path);
    return "existing";
  } catch {
    const bytes = await download(url);
    const tempPath = `${path}.${Date.now()}.tmp`;
    await writeFile(tempPath, bytes);
    await rename(tempPath, path);
    return "downloaded";
  }
}

async function downloadImage(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Image URL must use HTTPS.");
  const response = await fetch(parsed, { redirect: "follow" });
  if (!response.ok) throw new Error(`Image download failed (${response.status}).`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error("Downloaded asset is not an image.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error("Downloaded image size is invalid.");
  return bytes;
}
