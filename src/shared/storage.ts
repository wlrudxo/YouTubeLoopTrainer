import { STORAGE_KEY } from "./constants";
import { createEmptyData, type VideoMetadata } from "./data";
import { mergePhraseLoopData, parseImportPayload, replacePhraseLoopData } from "./importExport";
import type { ImportSummary, Loop, LoopStatus, PhraseLoopData, VideoLoops } from "./types";

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
  if (shouldDelegateMutations()) {
    return sendStorageRequest("writeData", [data]);
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

export async function getVideo(videoId: string): Promise<VideoLoops | null> {
  const data = await readData();
  return data.videos[videoId] ?? null;
}

export async function upsertVideo(video: VideoLoops): Promise<void> {
  if (shouldDelegateMutations()) {
    return sendStorageRequest("upsertVideo", [video]);
  }

  const data = await readData();
  data.videos[video.videoId] = {
    ...video,
    loops: [...video.loops].sort((a, b) => a.start - b.start)
  };
  await writeData(data);
}

export async function addLoop(videoId: string, title: string, url: string, loop: Loop, metadata: VideoMetadata = {}): Promise<VideoLoops> {
  if (shouldDelegateMutations()) {
    return sendStorageRequest("addLoop", [videoId, title, url, loop, metadata]);
  }

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
  if (shouldDelegateMutations()) {
    return sendStorageRequest("renameLoop", [videoId, loopId, label, updatedAt]);
  }

  const data = await readData();
  const video = data.videos[videoId];
  if (!video) return null;

  video.loops = video.loops.map((loop) => (loop.id === loopId ? { ...loop, label, updatedAt } : loop));
  await writeData(data);
  return video;
}

export async function setLoopStatus(videoId: string, loopId: string, status: LoopStatus, updatedAt: string): Promise<VideoLoops | null> {
  if (shouldDelegateMutations()) {
    return sendStorageRequest("setLoopStatus", [videoId, loopId, status, updatedAt]);
  }

  const data = await readData();
  const video = data.videos[videoId];
  if (!video) return null;

  video.loops = video.loops.map((loop) => (loop.id === loopId ? { ...loop, status, updatedAt } : loop));
  await writeData(data);
  return video;
}

export async function deleteVideo(videoId: string): Promise<void> {
  if (shouldDelegateMutations()) {
    return sendStorageRequest("deleteVideo", [videoId]);
  }

  const data = await readData();
  delete data.videos[videoId];
  await writeData(data);
}

export async function saveProgress(
  videoId: string,
  time: number,
  updatedAt: string,
  title = "",
  url = "",
  metadata: VideoMetadata = {}
): Promise<VideoLoops> {
  if (shouldDelegateMutations()) {
    return sendStorageRequest("saveProgress", [videoId, time, updatedAt, title, url, metadata]);
  }

  const data = await readData();
  const video = data.videos[videoId] ?? { videoId, title, url, loops: [] };
  video.title = title || video.title;
  video.url = url || video.url;
  video.channelTitle = metadata.channelTitle || video.channelTitle;
  video.channelAvatarUrl = metadata.channelAvatarUrl || video.channelAvatarUrl;

  video.progress = { time, updatedAt };
  data.videos[videoId] = video;
  await writeData(data);
  return video;
}

export async function deleteLoop(videoId: string, loopId: string): Promise<VideoLoops | null> {
  if (shouldDelegateMutations()) {
    return sendStorageRequest("deleteLoop", [videoId, loopId]);
  }

  const data = await readData();
  const video = data.videos[videoId];
  if (!video) return null;

  video.loops = video.loops.filter((loop) => loop.id !== loopId);
  await writeData(data);
  return video;
}

export async function mergeData(imported: PhraseLoopData): Promise<{ data: PhraseLoopData; summary: ImportSummary }> {
  if (shouldDelegateMutations()) {
    return sendStorageRequest("mergeData", [imported]);
  }

  const existing = await readData();
  const result = mergePhraseLoopData(existing, imported);
  await writeData(result.data);
  return result;
}

export async function replaceData(imported: PhraseLoopData): Promise<PhraseLoopData> {
  if (shouldDelegateMutations()) {
    return sendStorageRequest("replaceData", [imported]);
  }

  const data = replacePhraseLoopData(imported);
  await writeData(data);
  return data;
}

type StorageOperation =
  | "writeData"
  | "upsertVideo"
  | "addLoop"
  | "renameLoop"
  | "setLoopStatus"
  | "deleteVideo"
  | "saveProgress"
  | "deleteLoop"
  | "mergeData"
  | "replaceData";

type StorageResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function shouldDelegateMutations(): boolean {
  return typeof window !== "undefined" && Boolean(chrome.runtime?.sendMessage);
}

async function sendStorageRequest<T>(operation: StorageOperation, args: unknown[]): Promise<T> {
  const response = (await chrome.runtime.sendMessage({
    type: "phraseloop:storage",
    operation,
    args
  })) as StorageResponse<T> | undefined;

  if (!response) {
    throw new PhraseLoopStorageError("PhraseLoop storage service did not respond.");
  }

  if (!response.ok) {
    throw new PhraseLoopStorageError(response.error);
  }

  return response.value;
}
