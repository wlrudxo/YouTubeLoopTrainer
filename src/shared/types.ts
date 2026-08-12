export type SchemaVersion = 1;

export type Loop = {
  id: string;
  start: number;
  end: number;
  label: string;
  status?: LoopStatus;
  lastImportedHash?: string;
  createdAt: string;
  updatedAt: string;
};

export type CompanionConfig = {
  url: string;
  token: string;
};

export type LoopStatus = "new" | "hard" | "done";

export type VideoLoops = {
  videoId: string;
  title: string;
  channelTitle?: string;
  channelAvatarUrl?: string;
  url: string;
  progress?: {
    time: number;
    updatedAt: string;
  };
  loops: Loop[];
};

export type PhraseLoopData = {
  schemaVersion: SchemaVersion;
  videos: Record<string, VideoLoops>;
};

export type DraftLoop = {
  markerA: number | null;
  markerB: number | null;
  trimContextStart: number | null;
  trimContextEnd: number | null;
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

export type AnkiLoopExportItem = {
  id: string;
  videoId: string;
  videoTitle: string;
  channelTitle?: string;
  url: string;
  start: number;
  end: number;
  label: string;
  status?: LoopStatus;
  createdAt: string;
  updatedAt: string;
};

export type AnkiExportPayload = {
  app: "PhraseLoopAnkiExport";
  schemaVersion: SchemaVersion;
  exportedAt: string;
  loops: AnkiLoopExportItem[];
};

export type ImportMode = "merge" | "replace";

export type ImportSummary = {
  videosProcessed: number;
  loopsAdded: number;
  loopsUpdated: number;
  duplicatesSkipped: number;
};
