import { SCHEMA_VERSION } from "./constants";
import type { PhraseLoopData } from "./types";

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
