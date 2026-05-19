import { joinCaptionLines } from "../shared/captions";
import type { DebugLogger } from "./debug";

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

type TranscriptParams = {
  source: string;
  params: string;
};

type TranscriptResponse = {
  actions?: unknown[];
};

export async function getTranscriptLabelForRange(start: number, end: number, debug?: DebugLogger): Promise<string | null> {
  const domLabel = getTranscriptDomLabelForRange(start, end, debug);
  if (domLabel) return domLabel;

  const apiKey = findInnertubeApiKey();
  const params = findTranscriptParams(debug);
  const clientContexts = findTranscriptClientContexts();

  debug?.log("transcript", "transcript lookup context", {
    hasApiKey: Boolean(apiKey),
    paramsCount: params.length,
    paramsSources: params.map((item) => item.source),
    clientContexts
  });

  if (!apiKey || params.length === 0) return null;

  for (const item of params) {
    for (const clientContext of clientContexts) {
      const label = await fetchTranscriptLabel(apiKey, clientContext, item, start, end, debug);
      if (label) return label;
    }
  }

  return null;
}

function getTranscriptDomLabelForRange(start: number, end: number, debug?: DebugLogger): string | null {
  const segments = getTranscriptDomSegments();
  const lines = segments.filter((segment) => segment.end > start && segment.start < end).map((segment) => segment.text);
  const label = joinCaptionLines(lines);

  debug?.log("transcript", "transcript DOM lookup", {
    segmentCount: segments.length,
    matchedLines: lines.length,
    label
  });

  return label || null;
}

function getTranscriptDomSegments(): TranscriptSegment[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("ytd-transcript-segment-renderer"));
  const raw = nodes
    .map((node) => {
      const timeText = readTranscriptSegmentTime(node);
      const text = readTranscriptSegmentText(node);
      const start = parseTranscriptTimestamp(timeText);
      return start === null || !text ? null : { start, text };
    })
    .filter((segment): segment is { start: number; text: string } => segment !== null)
    .sort((a, b) => a.start - b.start);

  return raw.map((segment, index) => ({
    start: segment.start,
    end: raw[index + 1]?.start ?? segment.start + 4,
    text: segment.text
  }));
}

function readTranscriptSegmentTime(node: HTMLElement): string {
  return (
    node.querySelector<HTMLElement>(".segment-start-offset")?.textContent?.trim() ??
    node.querySelector<HTMLElement>(".segment-timestamp")?.textContent?.trim() ??
    ""
  );
}

function readTranscriptSegmentText(node: HTMLElement): string {
  return (
    node.querySelector<HTMLElement>(".segment-text")?.textContent?.trim() ??
    node.querySelector<HTMLElement>("yt-formatted-string")?.textContent?.trim() ??
    ""
  );
}

function parseTranscriptTimestamp(value: string): number | null {
  const parts = value.split(":").map((part) => Number(part.trim()));
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return null;

  let seconds = 0;
  for (const part of parts) {
    seconds = seconds * 60 + part;
  }
  return seconds;
}

async function fetchTranscriptLabel(
  apiKey: string,
  clientContext: InnertubeClientContext,
  params: TranscriptParams,
  start: number,
  end: number,
  debug?: DebugLogger
): Promise<string | null> {
  try {
    const response = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-youtube-client-name": clientContext.clientHeaderName,
        "x-youtube-client-version": clientContext.clientVersion
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: clientContext.clientName,
            clientVersion: clientContext.clientVersion,
            hl: clientContext.hl,
            gl: clientContext.gl,
            visitorData: clientContext.visitorData,
            androidSdkVersion: clientContext.androidSdkVersion
          }
        },
        params: params.params
      })
    });

    const text = await response.text();
    debug?.log("transcript", `get_transcript response (${params.source}/${clientContext.source})`, {
      status: response.status,
      ok: response.ok,
      bodyLength: text.length,
      head: text.slice(0, 240)
    });

    if (!response.ok || text.trim().length === 0) return null;

    const payload = JSON.parse(text) as TranscriptResponse;
    const segments = extractTranscriptSegments(payload);
    const lines = segments.filter((segment) => segment.end > start && segment.start < end).map((segment) => segment.text);
    const label = joinCaptionLines(lines);
    debug?.log("transcript", `transcript segment extraction (${params.source}/${clientContext.source})`, {
      segmentCount: segments.length,
      matchedLines: lines.length,
      label
    });

    return label || null;
  } catch (error) {
    debug?.log(
      "transcript",
      `get_transcript failed (${params.source}/${clientContext.source})`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

function extractTranscriptSegments(value: unknown): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  visit(value, (node) => {
    const segment = maybeTranscriptSegment(node);
    if (segment) segments.push(segment);
  });
  return segments;
}

function maybeTranscriptSegment(node: unknown): TranscriptSegment | null {
  if (!isRecord(node)) return null;

  const startMs = readNumber(node, "startMs") ?? readNumber(node, "startTimeMs");
  const durationMs = readNumber(node, "durationMs");
  const text = readRunsText(node);

  if (startMs === null || durationMs === null || !text) return null;

  return {
    start: startMs / 1000,
    end: (startMs + durationMs) / 1000,
    text
  };
}

function readRunsText(node: Record<string, unknown>): string {
  const candidates = [node.snippet, node.text].filter(isRecord);

  for (const candidate of candidates) {
    if (typeof candidate.simpleText === "string") return candidate.simpleText;
    if (Array.isArray(candidate.runs)) {
      return candidate.runs.map((run) => (isRecord(run) && typeof run.text === "string" ? run.text : "")).join("");
    }
  }

  return "";
}

function findTranscriptParams(debug?: DebugLogger): TranscriptParams[] {
  const found: TranscriptParams[] = [];
  let scriptsWithKeyword = 0;

  for (const script of Array.from(document.scripts)) {
    const text = script.textContent;
    if (!text || !text.includes("getTranscriptEndpoint")) continue;

    scriptsWithKeyword += 1;
    for (const params of extractParamsNearTranscriptEndpoints(text)) {
      found.push({ source: "script-regex", params });
    }

    const initialData = parseNamedInitialJson(text, "ytInitialData");
    if (initialData) {
      found.push(...findTranscriptParamsInJson(initialData, "ytInitialData"));
    }

    const playerResponse = parseNamedInitialJson(text, "ytInitialPlayerResponse");
    if (playerResponse) {
      found.push(...findTranscriptParamsInJson(playerResponse, "ytInitialPlayerResponse"));
    }
  }

  const unique = dedupeParams(found);
  const videoId = getVideoId();
  if (videoId) {
    unique.push({ source: "generated-protobuf-en", params: buildGeneratedTranscriptParams(videoId, "en") });
  }

  debug?.log("transcript", "transcript params found", {
    count: unique.length,
    scriptsWithKeyword,
    sources: unique.map((item) => item.source),
    paramLengths: unique.map((item) => item.params.length)
  });
  return unique;
}

function buildGeneratedTranscriptParams(videoId: string, languageCode: string): string {
  const languageMessage = encodeProtoMessage([{ field: 2, value: languageCode }]);
  const outerMessage = encodeProtoMessage([
    { field: 1, value: videoId },
    { field: 2, value: languageMessage }
  ]);
  return bytesToBase64(outerMessage);
}

type ProtoField = {
  field: number;
  value: string | Uint8Array;
};

function encodeProtoMessage(fields: ProtoField[]): Uint8Array {
  const chunks: number[] = [];

  for (const field of fields) {
    const bytes = typeof field.value === "string" ? new TextEncoder().encode(field.value) : field.value;
    chunks.push(...encodeVarint((field.field << 3) | 2));
    chunks.push(...encodeVarint(bytes.length));
    chunks.push(...bytes);
  }

  return new Uint8Array(chunks);
}

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let current = value;

  while (current > 127) {
    bytes.push((current & 0x7f) | 0x80);
    current >>>= 7;
  }

  bytes.push(current);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function extractParamsNearTranscriptEndpoints(text: string): string[] {
  const params: string[] = [];
  const endpointPattern = /"getTranscriptEndpoint"\s*:\s*\{[\s\S]{0,3000}?"params"\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = endpointPattern.exec(text))) {
    if (match[1]) params.push(decodeJsonStringLiteral(match[1]));
  }

  return params;
}

type InnertubeClientContext = {
  source: string;
  clientName: string;
  clientHeaderName: string;
  clientVersion: string;
  hl: string;
  gl: string;
  visitorData?: string;
  androidSdkVersion?: number;
};

function findTranscriptClientContexts(): InnertubeClientContext[] {
  const page = findPageInnertubeClientContext();
  return [
    page,
    {
      source: "android",
      clientName: "ANDROID",
      clientHeaderName: "3",
      clientVersion: "19.09.37",
      hl: "en",
      gl: "US",
      visitorData: page.visitorData,
      androidSdkVersion: 30
    },
    {
      source: "web-static",
      clientName: "WEB",
      clientHeaderName: "1",
      clientVersion: "2.20240313",
      hl: "en",
      gl: "US",
      visitorData: page.visitorData
    }
  ];
}

function findPageInnertubeClientContext(): InnertubeClientContext {
  const clientName = readYtConfigString("INNERTUBE_CLIENT_NAME") ?? "WEB";
  return {
    source: "page",
    clientName,
    clientHeaderName: inferClientHeaderName(clientName),
    clientVersion: readYtConfigString("INNERTUBE_CLIENT_VERSION") ?? "2.20240519.01.00",
    hl: readYtConfigString("HL") ?? "en",
    gl: readYtConfigString("GL") ?? "US",
    visitorData: findVisitorData()
  };
}

function inferClientHeaderName(clientName: string): string {
  if (clientName === "MWEB") return "2";
  if (clientName === "ANDROID") return "3";
  if (clientName === "IOS") return "5";
  if (clientName === "TVHTML5") return "7";
  return "1";
}

function decodeJsonStringLiteral(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/"/g, "\\\"")}"`) as string;
  } catch {
    return value;
  }
}

function findTranscriptParamsInJson(root: unknown, source: string): TranscriptParams[] {
  const found: TranscriptParams[] = [];

  visit(root, (node) => {
    if (!isRecord(node)) return;
    const endpoint = node.getTranscriptEndpoint;
    if (isRecord(endpoint) && typeof endpoint.params === "string") {
      found.push({ source, params: endpoint.params });
    }
  });

  return found;
}

function getVideoId(): string | null {
  return new URL(window.location.href).searchParams.get("v");
}

function parseNamedInitialJson(scriptText: string, name: string): unknown | null {
  const markerIndex = scriptText.indexOf(name);
  if (markerIndex < 0) return null;

  const jsonStart = scriptText.indexOf("{", markerIndex);
  if (jsonStart < 0) return null;

  const jsonText = readBalancedJsonObject(scriptText, jsonStart);
  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText);
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
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }

  return null;
}

function dedupeParams(items: TranscriptParams[]): TranscriptParams[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.params)) return false;
    seen.add(item.params);
    return true;
  });
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

function readNumber(node: Record<string, unknown>, key: string): number | null {
  const value = node[key];
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function visit(value: unknown, callback: (node: unknown) => void): void {
  callback(value);

  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
    return;
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) visit(item, callback);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
