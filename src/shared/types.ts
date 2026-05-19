export type SchemaVersion = 1;

export type Loop = {
  id: string;
  start: number;
  end: number;
  label: string;
  updatedAt: string;
};

export type VideoLoops = {
  videoId: string;
  title: string;
  channelTitle?: string;
  channelAvatarUrl?: string;
  url: string;
  loops: Loop[];
};

export type PhraseLoopData = {
  schemaVersion: SchemaVersion;
  videos: Record<string, VideoLoops>;
};

export type DraftLoop = {
  markerA: number | null;
  markerB: number | null;
  label: string;
  labelDirty: boolean;
};

export type ValidatedLoopDraft =
  | {
      ok: true;
      start: number;
      end: number;
    }
  | {
      ok: false;
      error: "missing-a" | "missing-b" | "invalid-order" | "too-short";
      message: string;
    };

export type ExportPayload = {
  app: "PhraseLoop";
  schemaVersion: SchemaVersion;
  exportedAt: string;
  source: {
    browser: "chrome";
    storage: "local";
  };
  data: PhraseLoopData;
};

export type ImportMode = "merge" | "replace";

export type ImportSummary = {
  videosProcessed: number;
  loopsAdded: number;
  loopsUpdated: number;
  duplicatesSkipped: number;
};
