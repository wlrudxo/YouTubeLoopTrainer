import { STORAGE_KEY } from "./constants";
import { createEmptyData, type VideoMetadata } from "./data";
import { parseImportPayload } from "./importExport";
import type { Loop, PhraseLoopData, VideoLoops } from "./types";

export async function readData(): Promise<PhraseLoopData> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];

  if (!raw) {
    return createEmptyData();
  }

  try {
    return parseImportPayload(raw);
  } catch {
    return createEmptyData();
  }
}

export async function writeData(data: PhraseLoopData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

export async function getVideo(videoId: string): Promise<VideoLoops | null> {
  const data = await readData();
  return data.videos[videoId] ?? null;
}

export async function upsertVideo(video: VideoLoops): Promise<void> {
  const data = await readData();
  data.videos[video.videoId] = {
    ...video,
    loops: [...video.loops].sort((a, b) => a.start - b.start)
  };
  await writeData(data);
}

export async function addLoop(videoId: string, title: string, url: string, loop: Loop, metadata: VideoMetadata = {}): Promise<VideoLoops> {
  const data = await readData();
  const video = data.videos[videoId] ?? { videoId, title, url, loops: [] };
  video.title = title || video.title;
  video.url = url || video.url;
  video.channelTitle = metadata.channelTitle || video.channelTitle;
  video.channelAvatarUrl = metadata.channelAvatarUrl || video.channelAvatarUrl;
  video.loops = [...video.loops, loop].sort((a, b) => a.start - b.start);
  data.videos[videoId] = video;
  await writeData(data);
  return video;
}

export async function renameLoop(videoId: string, loopId: string, label: string, updatedAt: string): Promise<VideoLoops | null> {
  const data = await readData();
  const video = data.videos[videoId];
  if (!video) return null;

  video.loops = video.loops.map((loop) => (loop.id === loopId ? { ...loop, label, updatedAt } : loop));
  await writeData(data);
  return video;
}

export async function deleteLoop(videoId: string, loopId: string): Promise<VideoLoops | null> {
  const data = await readData();
  const video = data.videos[videoId];
  if (!video) return null;

  video.loops = video.loops.filter((loop) => loop.id !== loopId);
  await writeData(data);
  return video;
}
