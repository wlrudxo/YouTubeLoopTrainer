import { STORAGE_KEY } from "./constants";
import { createEmptyData, type VideoMetadata } from "./data";
import { parseImportPayload } from "./importExport";
import type { Loop, LoopStatus, PhraseLoopData, VideoLoops } from "./types";

export class PhraseLoopStorageError extends Error {
  constructor(message = "Stored PhraseLoop data is invalid. Export a backup or import valid data from settings before saving new changes.") {
    super(message);
    this.name = "PhraseLoopStorageError";
  }
}

export async function readData(): Promise<PhraseLoopData> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];

  if (!raw) {
    return createEmptyData();
  }

  try {
    return parseImportPayload(raw);
  } catch (error) {
    console.warn("[PhraseLoop] Failed to parse stored data", error);
    throw new PhraseLoopStorageError();
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

  video.loops = video.loops.map((loop) => (loop.id === loopId ? { ...loop, label, updatedAt, lastImportedHash: undefined } : loop));
  await writeData(data);
  return video;
}

export async function markLoopImported(videoId: string, loopId: string, captureHash: string): Promise<VideoLoops | null> {
  const data = await readData();
  const video = data.videos[videoId];
  if (!video) return null;
  video.loops = video.loops.map((loop) => (loop.id === loopId ? { ...loop, lastImportedHash: captureHash } : loop));
  await writeData(data);
  return video;
}

export async function setLoopStatus(videoId: string, loopId: string, status: LoopStatus, updatedAt: string): Promise<VideoLoops | null> {
  const data = await readData();
  const video = data.videos[videoId];
  if (!video) return null;

  video.loops = video.loops.map((loop) => (loop.id === loopId ? { ...loop, status, updatedAt } : loop));
  await writeData(data);
  return video;
}

export async function deleteVideo(videoId: string): Promise<void> {
  const data = await readData();
  delete data.videos[videoId];
  await writeData(data);
}

export async function saveProgress(videoId: string, time: number, updatedAt: string): Promise<VideoLoops | null> {
  const data = await readData();
  const video = data.videos[videoId];
  if (!video) return null;

  video.progress = { time, updatedAt };
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
