import { SCHEMA_VERSION } from "./constants";
import type { PhraseLoopData, VideoLoops } from "./types";

export type VideoMetadata = {
  channelTitle?: string;
  channelAvatarUrl?: string;
};

export function createEmptyData(): PhraseLoopData {
  return {
    schemaVersion: SCHEMA_VERSION,
    videos: {}
  };
}

export function ensureVideo(data: PhraseLoopData, videoId: string, title: string, url: string, metadata: VideoMetadata = {}): VideoLoops {
  const existing = data.videos[videoId];

  if (existing) {
    existing.title = title || existing.title;
    existing.url = url || existing.url;
    existing.channelTitle = metadata.channelTitle || existing.channelTitle;
    existing.channelAvatarUrl = metadata.channelAvatarUrl || existing.channelAvatarUrl;
    existing.loops.sort((a, b) => a.start - b.start);
    return existing;
  }

  const video: VideoLoops = {
    videoId,
    title,
    channelTitle: metadata.channelTitle,
    channelAvatarUrl: metadata.channelAvatarUrl,
    url,
    loops: []
  };

  data.videos[videoId] = video;
  return video;
}
