import { extractJson3CaptionLines, joinCaptionLines, type Json3CaptionEvent } from "../shared/captions";

const CUE_LOAD_TIMEOUT_MS = 900;
const CUE_LOAD_POLL_MS = 100;

export async function getCaptionLabelForRange(video: HTMLVideoElement, start: number, end: number): Promise<string | null> {
  const timedTextLabel = await getTimedTextCaptionLabel(start, end);
  if (timedTextLabel) return timedTextLabel;

  const track = chooseCaptionTrack(video.textTracks);
  if (!track) return null;

  const previousMode = track.mode;
  if (track.mode === "disabled") {
    track.mode = "hidden";
  }

  const cues = await waitForCues(track);
  if (!cues) {
    track.mode = previousMode;
    return null;
  }

  const lines = Array.from(cues)
    .filter((cue) => cue.endTime > start && cue.startTime < end)
    .map(cueToText);

  if (previousMode === "disabled") {
    track.mode = previousMode;
  }

  const label = joinCaptionLines(lines);
  return label || null;
}

function chooseCaptionTrack(textTracks: TextTrackList): TextTrack | null {
  const tracks = Array.from(textTracks).filter((track) => track.kind === "captions" || track.kind === "subtitles");
  if (tracks.length === 0) return null;

  const showing = tracks.find((track) => track.mode === "showing" && isEnglishTrack(track));
  if (showing) return showing;

  const english = tracks.find(isEnglishTrack);
  if (english) return english;

  return tracks.find((track) => track.mode === "showing") ?? tracks[0] ?? null;
}

function isEnglishTrack(track: TextTrack): boolean {
  const language = track.language.toLowerCase();
  const label = track.label.toLowerCase();
  return language.startsWith("en") || label.includes("english") || label.includes("auto-generated");
}

async function waitForCues(track: TextTrack): Promise<TextTrackCueList | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CUE_LOAD_TIMEOUT_MS) {
    if (track.cues && track.cues.length > 0) {
      return track.cues;
    }

    await sleep(CUE_LOAD_POLL_MS);
  }

  return track.cues && track.cues.length > 0 ? track.cues : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cueToText(cue: TextTrackCue): string {
  return "text" in cue && typeof cue.text === "string" ? cue.text : "";
}

async function getTimedTextCaptionLabel(start: number, end: number): Promise<string | null> {
  const captionTrack = chooseTimedTextTrack(findCaptionTracks());
  if (!captionTrack) return null;

  try {
    const url = new URL(captionTrack.baseUrl);
    url.searchParams.set("fmt", "json3");

    const response = await fetch(url.toString(), { credentials: "include" });
    if (!response.ok) return null;

    const payload = (await response.json()) as { events?: Json3CaptionEvent[] };
    const label = joinCaptionLines(extractJson3CaptionLines(payload.events ?? [], start, end));
    return label || null;
  } catch {
    return null;
  }
}

type TimedTextTrack = {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
  name?: {
    simpleText?: string;
    runs?: Array<{ text?: string }>;
  };
};

function findCaptionTracks(): TimedTextTrack[] {
  const playerResponse = findInitialPlayerResponse();
  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  return Array.isArray(tracks) ? tracks.filter(isTimedTextTrack) : [];
}

function chooseTimedTextTrack(tracks: TimedTextTrack[]): TimedTextTrack | null {
  if (tracks.length === 0) return null;

  const englishManual = tracks.find((track) => isEnglishTimedTextTrack(track) && track.kind !== "asr");
  if (englishManual) return englishManual;

  const english = tracks.find(isEnglishTimedTextTrack);
  if (english) return english;

  return tracks[0] ?? null;
}

function isEnglishTimedTextTrack(track: TimedTextTrack): boolean {
  const language = track.languageCode?.toLowerCase() ?? "";
  const label = getTrackLabel(track).toLowerCase();
  return language.startsWith("en") || label.includes("english") || label.includes("auto-generated");
}

function getTrackLabel(track: TimedTextTrack): string {
  if (track.name?.simpleText) return track.name.simpleText;
  return track.name?.runs?.map((run) => run.text ?? "").join("") ?? "";
}

function findInitialPlayerResponse(): PlayerResponse | null {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent;
    if (!text || !text.includes("ytInitialPlayerResponse")) continue;

    const response = parsePlayerResponseFromScript(text);
    if (response) return response;
  }

  return null;
}

function parsePlayerResponseFromScript(scriptText: string): PlayerResponse | null {
  const marker = "ytInitialPlayerResponse";
  const markerIndex = scriptText.indexOf(marker);
  if (markerIndex < 0) return null;

  const jsonStart = scriptText.indexOf("{", markerIndex);
  if (jsonStart < 0) return null;

  const jsonText = readBalancedJsonObject(scriptText, jsonStart);
  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText) as PlayerResponse;
  } catch {
    return null;
  }
}

function readBalancedJsonObject(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function isTimedTextTrack(value: unknown): value is TimedTextTrack {
  return typeof value === "object" && value !== null && typeof (value as TimedTextTrack).baseUrl === "string";
}

type PlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: unknown[];
    };
  };
};
