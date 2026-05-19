import {
  extractJson3CaptionLines,
  extractSrv3CaptionLines,
  extractVttCaptionLines,
  joinCaptionLines,
  type Json3CaptionEvent
} from "../shared/captions";
import type { DebugLogger } from "./debug";
import { getTranscriptLabelForRange } from "./transcriptLabels";

const CUE_LOAD_TIMEOUT_MS = 900;
const CUE_LOAD_POLL_MS = 100;

export async function getCaptionLabelForRange(
  video: HTMLVideoElement,
  start: number,
  end: number,
  debug?: DebugLogger
): Promise<string | null> {
  debug?.log("captions", "start label lookup", { start, end, textTracks: video.textTracks.length });

  const transcriptLabel = await getTranscriptLabelForRange(start, end, debug);
  if (transcriptLabel) {
    debug?.log("captions", "using transcript label", { label: transcriptLabel });
    return transcriptLabel;
  }

  const timedTextLabel = await getTimedTextCaptionLabel(start, end, debug);
  if (timedTextLabel) {
    debug?.log("captions", "using timedtext label", { label: timedTextLabel });
    return timedTextLabel;
  }

  const visibleCaptionLabel = getVisibleCaptionLabel(debug);
  if (visibleCaptionLabel) {
    debug?.log("captions", "using visible caption label", { label: visibleCaptionLabel });
    return visibleCaptionLabel;
  }

  const track = chooseCaptionTrack(video.textTracks);
  if (!track) {
    debug?.log("captions", "no browser TextTrack fallback available");
    return null;
  }

  debug?.log("captions", "trying browser TextTrack fallback", describeTextTrack(track));

  const previousMode = track.mode;
  if (track.mode === "disabled") {
    track.mode = "hidden";
  }

  const cues = await waitForCues(track);
  if (!cues) {
    track.mode = previousMode;
    debug?.log("captions", "TextTrack cues did not load", describeTextTrack(track));
    return null;
  }

  const lines = Array.from(cues)
    .filter((cue) => cue.endTime > start && cue.startTime < end)
    .map(cueToText);

  if (previousMode === "disabled") {
    track.mode = previousMode;
  }

  const label = joinCaptionLines(lines);
  debug?.log("captions", "TextTrack cue extraction complete", { cueCount: cues.length, matchedLines: lines.length, label });
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

function getVisibleCaptionLabel(debug?: DebugLogger): string | null {
  const segments = Array.from(document.querySelectorAll<HTMLElement>(".ytp-caption-segment"));
  const label = joinCaptionLines(segments.map((segment) => segment.textContent ?? ""));

  debug?.log("captions", "visible caption DOM lookup", {
    segmentCount: segments.length,
    label
  });

  return label || null;
}

async function getTimedTextCaptionLabel(start: number, end: number, debug?: DebugLogger): Promise<string | null> {
  const captionTracks = await findCaptionTracks(debug);

  for (const group of captionTracks) {
    debug?.log("captions", `timedtext tracks found (${group.source})`, {
      count: group.tracks.length,
      tracks: group.tracks.map(describeTimedTextTrack)
    });

    const captionTrack = chooseTimedTextTrack(group.tracks);
    if (!captionTrack) {
      debug?.log("captions", `no timedtext caption track selected (${group.source})`);
      continue;
    }

    debug?.log("captions", `selected timedtext track (${group.source})`, describeTimedTextTrack(captionTrack));

    for (const format of ["json3", "srv3", "vtt"] as const) {
      const label = await fetchTimedTextFormat(captionTrack, format, start, end, debug);
      if (label) return label;
    }
  }

  debug?.log("captions", "all timedtext caption sources failed");
  return null;
}

async function fetchTimedTextFormat(
  captionTrack: TimedTextTrack,
  format: "json3" | "srv3" | "vtt",
  start: number,
  end: number,
  debug?: DebugLogger
): Promise<string | null> {
  try {
    const url = new URL(captionTrack.baseUrl);
    url.searchParams.set("fmt", format);

    debug?.log("captions", `fetching timedtext ${format}`, {
      host: url.host,
      path: url.pathname,
      lang: url.searchParams.get("lang"),
      kind: url.searchParams.get("kind")
    });

    const response = await fetch(url.toString(), { credentials: "include" });
    const body = await response.text();
    debug?.log("captions", `timedtext ${format} fetch response`, {
      status: response.status,
      ok: response.ok,
      bodyLength: body.length,
      contentType: response.headers.get("content-type"),
      head: body.slice(0, 80)
    });

    if (!response.ok || body.trim().length === 0) return null;

    const lines = extractTimedTextLines(format, body, start, end);
    const label = joinCaptionLines(lines);
    debug?.log("captions", `timedtext ${format} extraction complete`, {
      matchedLines: lines.length,
      label
    });

    return label || null;
  } catch (error) {
    debug?.log("captions", `timedtext ${format} lookup failed`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

function extractTimedTextLines(format: "json3" | "srv3" | "vtt", body: string, start: number, end: number): string[] {
  if (format === "json3") {
    const payload = JSON.parse(body) as { events?: Json3CaptionEvent[] };
    return extractJson3CaptionLines(payload.events ?? [], start, end);
  }

  if (format === "srv3") {
    return extractSrv3CaptionLines(body, start, end);
  }

  return extractVttCaptionLines(body, start, end);
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

type TimedTextTrackGroup = {
  source: string;
  tracks: TimedTextTrack[];
};

async function findCaptionTracks(debug?: DebugLogger): Promise<TimedTextTrackGroup[]> {
  const groups: TimedTextTrackGroup[] = [];
  const playerResponse = findInitialPlayerResponse(debug);
  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (Array.isArray(tracks)) {
    groups.push({
      source: "watch-page",
      tracks: tracks.filter(isTimedTextTrack)
    });
  }

  const innertubeGroups = await fetchInnertubeCaptionTrackGroups(debug);
  groups.push(...innertubeGroups);

  return groups;
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

function findInitialPlayerResponse(debug?: DebugLogger): PlayerResponse | null {
  let candidateScripts = 0;

  for (const script of Array.from(document.scripts)) {
    const text = script.textContent;
    if (!text || !text.includes("ytInitialPlayerResponse")) continue;

    candidateScripts += 1;
    const response = parsePlayerResponseFromScript(text);
    if (response) {
      debug?.log("captions", "parsed ytInitialPlayerResponse from script", { candidateScripts });
      return response;
    }
  }

  const windowResponse = readWindowPlayerResponse();
  if (windowResponse) {
    debug?.log("captions", "read ytInitialPlayerResponse from window");
    return windowResponse;
  }

  debug?.log("captions", "could not find ytInitialPlayerResponse", { candidateScripts });
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

function readWindowPlayerResponse(): PlayerResponse | null {
  const value = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
  return typeof value === "object" && value !== null ? (value as PlayerResponse) : null;
}

function describeTimedTextTrack(track: TimedTextTrack): Record<string, string | undefined> {
  return {
    languageCode: track.languageCode,
    kind: track.kind,
    label: getTrackLabel(track),
    baseUrlHost: safeUrlHost(track.baseUrl)
  };
}

function describeTextTrack(track: TextTrack): Record<string, string> {
  return {
    kind: track.kind,
    language: track.language,
    label: track.label,
    mode: track.mode
  };
}

function safeUrlHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

type PlayerResponse = {
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: unknown[];
    };
  };
};

type InnertubeClient = {
  source: string;
  clientName: string;
  clientHeaderName: string;
  clientVersion: string;
};

const INNERTUBE_CLIENTS: InnertubeClient[] = [
  { source: "innertube-web", clientName: "WEB", clientHeaderName: "1", clientVersion: "2.20240519.01.00" },
  { source: "innertube-mweb", clientName: "MWEB", clientHeaderName: "2", clientVersion: "2.20240519.01.00" },
  { source: "innertube-tv", clientName: "TVHTML5", clientHeaderName: "7", clientVersion: "7.20240519.01.00" },
  { source: "innertube-android", clientName: "ANDROID", clientHeaderName: "3", clientVersion: "19.09.37" },
  { source: "innertube-ios", clientName: "IOS", clientHeaderName: "5", clientVersion: "19.09.3" }
];

async function fetchInnertubeCaptionTrackGroups(debug?: DebugLogger): Promise<TimedTextTrackGroup[]> {
  const videoId = new URL(window.location.href).searchParams.get("v");
  if (!videoId) {
    debug?.log("captions", "skip Innertube captions because videoId is missing");
    return [];
  }

  const apiKey = findInnertubeApiKey();
  const visitorData = findVisitorData();
  debug?.log("captions", "Innertube context", {
    videoId,
    hasApiKey: Boolean(apiKey),
    hasVisitorData: Boolean(visitorData)
  });

  if (!apiKey) return [];

  const groups: TimedTextTrackGroup[] = [];

  for (const client of INNERTUBE_CLIENTS) {
    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-youtube-client-name": client.clientHeaderName,
          "x-youtube-client-version": client.clientVersion
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: client.clientName,
              clientVersion: client.clientVersion,
              hl: "en",
              gl: "US",
              visitorData
            }
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true
        })
      });

      const text = await response.text();
      debug?.log("captions", `Innertube player response (${client.source})`, {
        status: response.status,
        ok: response.ok,
        bodyLength: text.length,
        head: text.slice(0, 80)
      });

      if (!response.ok || text.trim().length === 0) continue;

      const playerResponse = JSON.parse(text) as PlayerResponse;
      const tracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      debug?.log("captions", `Innertube player summary (${client.source})`, {
        playabilityStatus: playerResponse.playabilityStatus?.status,
        playabilityReason: playerResponse.playabilityStatus?.reason,
        hasCaptions: Boolean(playerResponse.captions),
        captionTrackCount: Array.isArray(tracks) ? tracks.length : 0,
        topLevelKeys: Object.keys(playerResponse).slice(0, 12)
      });

      groups.push({
        source: client.source,
        tracks: Array.isArray(tracks) ? tracks.filter(isTimedTextTrack) : []
      });
    } catch (error) {
      debug?.log("captions", `Innertube player failed (${client.source})`, error instanceof Error ? error.message : String(error));
    }
  }

  return groups;
}

function findInnertubeApiKey(): string | null {
  const configKey = readYtConfigString("INNERTUBE_API_KEY");
  if (configKey) return configKey;

  for (const script of Array.from(document.scripts)) {
    const text = script.textContent;
    if (!text) continue;

    const match = text.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
  }

  return null;
}

function findVisitorData(): string | undefined {
  const configVisitorData = readYtConfigString("VISITOR_DATA");
  if (configVisitorData) return configVisitorData;

  for (const script of Array.from(document.scripts)) {
    const text = script.textContent;
    if (!text) continue;

    const match = text.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function readYtConfigString(key: string): string | null {
  const config = (window as Window & { ytcfg?: { get?: (key: string) => unknown } }).ytcfg;
  const value = config?.get?.(key);
  return typeof value === "string" ? value : null;
}
