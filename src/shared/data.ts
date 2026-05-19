import { SCHEMA_VERSION } from "./constants";
import type { PhraseLoopData, VideoLoops } from "./types";

export function createEmptyData(): PhraseLoopData {
  return {
    schemaVersion: SCHEMA_VERSION,
    videos: {}
  };
}

export function ensureVideo(data: PhraseLoopData, videoId: string, title: string, url: string): VideoLoops {
  const existing = data.videos[videoId];

  if (existing) {
    existing.title = title || existing.title;
    existing.url = url || existing.url;
    existing.loops.sort((a, b) => a.start - b.start);
    return existing;
  }

  const video: VideoLoops = {
    videoId,
    title,
    url,
    loops: []
  };

  data.videos[videoId] = video;
  return video;
}
