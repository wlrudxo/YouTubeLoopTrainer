import { DUPLICATE_TIME_EPSILON_SECONDS, SCHEMA_VERSION } from "./constants";
import { createEmptyData, ensureVideo } from "./data";
import { normalizeLabel } from "./labels";
import type { ExportPayload, ImportSummary, Loop, PhraseLoopData, VideoLoops } from "./types";

export function createExportPayload(data: PhraseLoopData, exportedAt = new Date().toISOString()): ExportPayload {
  return {
    app: "PhraseLoop",
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    source: {
      browser: "chrome",
      storage: "local"
    },
    data
  };
}

export function parseImportPayload(input: unknown): PhraseLoopData {
  if (isPhraseLoopData(input)) {
    return cloneData(input);
  }

  if (isRecord(input) && input.app === "PhraseLoop" && isPhraseLoopData(input.data)) {
    return cloneData(input.data);
  }

  throw new Error("Invalid PhraseLoop import file.");
}

export function mergePhraseLoopData(existing: PhraseLoopData, imported: PhraseLoopData): { data: PhraseLoopData; summary: ImportSummary } {
  const data = cloneData(existing);
  const summary: ImportSummary = {
    videosProcessed: 0,
    loopsAdded: 0,
    loopsUpdated: 0,
    duplicatesSkipped: 0
  };

  for (const importedVideo of Object.values(imported.videos)) {
    summary.videosProcessed += 1;
    const localVideo = ensureVideo(data, importedVideo.videoId, importedVideo.title, importedVideo.url);

    for (const importedLoop of importedVideo.loops) {
      const sameIdIndex = localVideo.loops.findIndex((loop) => loop.id === importedLoop.id);

      if (sameIdIndex >= 0) {
        if (isImportedNewer(importedLoop, localVideo.loops[sameIdIndex])) {
          localVideo.loops[sameIdIndex] = cloneLoop(importedLoop);
          summary.loopsUpdated += 1;
        } else {
          summary.duplicatesSkipped += 1;
        }
        continue;
      }

      if (hasSameTimeAndLabel(localVideo, importedLoop)) {
        summary.duplicatesSkipped += 1;
        continue;
      }

      localVideo.loops.push(cloneLoop(importedLoop));
      summary.loopsAdded += 1;
    }

    localVideo.loops.sort((a, b) => a.start - b.start);
  }

  return { data, summary };
}

export function replacePhraseLoopData(imported: PhraseLoopData): PhraseLoopData {
  return cloneData(imported);
}

function hasSameTimeAndLabel(video: VideoLoops, importedLoop: Loop): boolean {
  return video.loops.some((loop) => {
    return (
      Math.abs(loop.start - importedLoop.start) < DUPLICATE_TIME_EPSILON_SECONDS &&
      Math.abs(loop.end - importedLoop.end) < DUPLICATE_TIME_EPSILON_SECONDS &&
      normalizeLabel(loop.label) === normalizeLabel(importedLoop.label)
    );
  });
}

function isImportedNewer(importedLoop: Loop, existingLoop: Loop): boolean {
  if (!importedLoop.updatedAt) return false;
  if (!existingLoop.updatedAt) return true;

  const importedTime = Date.parse(importedLoop.updatedAt);
  const existingTime = Date.parse(existingLoop.updatedAt);

  if (Number.isNaN(importedTime)) return false;
  if (Number.isNaN(existingTime)) return true;

  return importedTime > existingTime;
}

function cloneData(data: PhraseLoopData): PhraseLoopData {
  return {
    schemaVersion: SCHEMA_VERSION,
    videos: Object.fromEntries(
      Object.entries(data.videos).map(([videoId, video]) => [
        videoId,
        {
          videoId: video.videoId,
          title: video.title,
          ...(video.channelTitle ? { channelTitle: video.channelTitle } : {}),
          ...(video.channelAvatarUrl ? { channelAvatarUrl: video.channelAvatarUrl } : {}),
          url: video.url,
          loops: video.loops.map(cloneLoop).sort((a, b) => a.start - b.start)
        }
      ])
    )
  };
}

function cloneLoop(loop: Loop): Loop {
  return {
    id: loop.id,
    start: loop.start,
    end: loop.end,
    label: loop.label,
    updatedAt: loop.updatedAt
  };
}

function isPhraseLoopData(value: unknown): value is PhraseLoopData {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== SCHEMA_VERSION) return false;
  if (!isRecord(value.videos)) return false;

  return Object.values(value.videos).every(isVideoLoops);
}

function isVideoLoops(value: unknown): value is VideoLoops {
  if (!isRecord(value)) return false;
  if (typeof value.videoId !== "string") return false;
  if (typeof value.title !== "string") return false;
  if ("channelTitle" in value && typeof value.channelTitle !== "string" && value.channelTitle !== undefined) return false;
  if ("channelAvatarUrl" in value && typeof value.channelAvatarUrl !== "string" && value.channelAvatarUrl !== undefined) return false;
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
    typeof value.updatedAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export { createEmptyData };
