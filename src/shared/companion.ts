import type { CompanionConfig, Loop, VideoLoops } from "./types";

const CONFIG_KEY = "phraseloop_companion_config";
const DEFAULT_URL = "http://127.0.0.1:17311";

export async function readCompanionConfig(): Promise<CompanionConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  const raw = result[CONFIG_KEY] as unknown;
  const value = isRecord(raw) ? raw : {};
  return {
    url: normalizeUrl(typeof value?.url === "string" ? value.url : DEFAULT_URL),
    token: typeof value?.token === "string" ? value.token.trim() : ""
  };
}

export async function writeCompanionConfig(config: CompanionConfig): Promise<CompanionConfig> {
  const normalized = { url: normalizeUrl(config.url), token: config.token.trim() };
  if (!normalized.token) throw new Error("Companion token is required.");
  await chrome.storage.local.set({ [CONFIG_KEY]: normalized });
  return normalized;
}

export async function pairCompanion(config: CompanionConfig): Promise<void> {
  await request(config, "/pair", { method: "POST" });
}

export async function importLoopToCompanion(config: CompanionConfig, video: VideoLoops, loop: Loop): Promise<string> {
  const result = await request(config, "/import", {
    method: "POST",
    body: JSON.stringify({
      loopId: loop.id,
      videoId: video.videoId,
      start: loop.start,
      end: loop.end,
      label: loop.label,
      title: video.title,
      channelTitle: video.channelTitle ?? "",
      url: video.url
    })
  });
  if (typeof result?.captureHash !== "string") throw new Error("Companion returned an invalid capture hash.");
  return result.captureHash;
}

async function request(config: CompanionConfig, path: string, init: RequestInit): Promise<any> {
  if (!config.token.trim()) throw new Error("Configure the companion token in PhraseLoop Settings first.");
  let response: Response;
  try {
    response = await fetch(`${normalizeUrl(config.url)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token.trim()}`,
        "Content-Type": "application/json",
        ...init.headers
      }
    });
  } catch {
    throw new Error("Could not connect to PhraseLoop Companion. Start the local companion and try again.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Companion request failed (${response.status}).`);
  return body;
}

function normalizeUrl(value: string): string {
  const parsed = new URL(value.trim() || DEFAULT_URL);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") {
    throw new Error("Companion URL must use http://127.0.0.1.");
  }
  return parsed.origin;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
