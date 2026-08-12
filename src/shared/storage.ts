import { SCHEMA_VERSION, STORAGE_KEY } from "./constants";
import { createEmptyData, type VideoMetadata } from "./data";
import type { Loop, PhraseLoopData, VideoLoops } from "./types";

export class PhraseLoopStorageError extends Error {
  constructor(message = "Stored PhraseLoop data is invalid.") {
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

  const parsed = parseStoredData(raw);
  if (!parsed) {
    console.warn("[PhraseLoop] Failed to parse stored data");
    throw new PhraseLoopStorageError();
  }
  return parsed;
}

export async function writeData(data: PhraseLoopData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
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

/**
 * Removes a pending loop. Deletes the whole video entry when it has no loops left,
 * so storage only ever holds loops that have not been sent to the companion yet.
 */
export async function deleteLoop(videoId: string, loopId: string): Promise<void> {
  const data = await readData();
  const video = data.videos[videoId];
  if (!video) return;

  video.loops = video.loops.filter((loop) => loop.id !== loopId);
  if (video.loops.length === 0) {
    delete data.videos[videoId];
  }
  await writeData(data);
}

function parseStoredData(input: unknown): PhraseLoopData | null {
  if (!isRecord(input) || input.schemaVersion !== SCHEMA_VERSION || !isRecord(input.videos)) return null;

  const videos: Record<string, VideoLoops> = {};
  for (const value of Object.values(input.videos)) {
    if (!isVideoLoops(value)) return null;
    videos[value.videoId] = {
      videoId: value.videoId,
      title: value.title,
      ...(typeof value.channelTitle === "string" ? { channelTitle: value.channelTitle } : {}),
      ...(typeof value.channelAvatarUrl === "string" ? { channelAvatarUrl: value.channelAvatarUrl } : {}),
      url: value.url,
      loops: value.loops
        .map((loop) => ({
          id: loop.id,
          start: loop.start,
          end: loop.end,
          label: loop.label,
          createdAt: loop.createdAt,
          updatedAt: loop.updatedAt
        }))
        .sort((a, b) => a.start - b.start)
    };
  }

  return { schemaVersion: SCHEMA_VERSION, videos };
}

function isVideoLoops(value: unknown): value is VideoLoops {
  if (!isRecord(value)) return false;
  if (typeof value.videoId !== "string") return false;
  if (typeof value.title !== "string") return false;
  if (typeof value.url !== "string") return false;
  if (!Array.isArray(value.loops)) return false;

  return value.loops.every(isLoop);
}

function isLoop(value: unknown): value is Loop {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.start === "number" &&
    typeof value.end === "number" &&
    typeof value.label === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
