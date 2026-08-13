import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const mutationQueues = new Map();

export async function initializeDataRoot(dataDir, requestedPort = 17311) {
  await mkdir(join(dataDir, "videos"), { recursive: true });
  await mkdir(join(dataDir, "tmp"), { recursive: true });
  if (!(await readJsonIfExists(join(dataDir, "discarded.json")))) {
    await atomicWriteJson(join(dataDir, "discarded.json"), { schemaVersion: 1, updatedAt: null, items: {} });
  }

  const configPath = join(dataDir, "config.json");
  let config = await readJsonIfExists(configPath);
  let created = false;

  if (!config) {
    config = {
      schemaVersion: 1,
      port: requestedPort,
      token: randomBytes(32).toString("hex"),
      allowedOrigins: [],
      anki: {
        url: "http://127.0.0.1:8765",
        deckName: "English::PhraseLoop"
      }
    };
    await atomicWriteJson(configPath, config);
    created = true;
  }

  validateConfig(config);
  await rebuildLibrary(dataDir);
  return { config, created, configPath };
}

export async function allowOrigin(dataDir, config, origin) {
  if (typeof origin !== "string" || !origin.startsWith("chrome-extension://")) {
    throw new InputError("Only Chrome extension origins can be paired.");
  }
  if (!config.allowedOrigins.includes(origin)) {
    config.allowedOrigins.push(origin);
    await atomicWriteJson(join(dataDir, "config.json"), config);
  }
  return config;
}

export function validateImportPayload(value) {
  if (!value || typeof value !== "object") throw new InputError("Request body must be an object.");

  const loopId = requiredSafeId(value.loopId, "loopId");
  const videoId = requiredSafeId(value.videoId, "videoId");
  const start = requiredFiniteNumber(value.start, "start");
  const end = requiredFiniteNumber(value.end, "end");
  if (start < 0 || end <= start || end - start < 0.1) {
    throw new InputError("start/end must describe a positive media range.");
  }

  return {
    loopId,
    videoId,
    start,
    end,
    label: optionalString(value.label, "label", 1000),
    sourceTitle: optionalString(value.title, "title", 1000),
    sourceUrl: requiredHttpUrl(value.url, "url"),
    channelTitle: optionalString(value.channelTitle, "channelTitle", 500),
    channelAvatarUrl: optionalAssetUrl(value.channelAvatarUrl, "channelAvatarUrl")
  };
}

export function calculateCaptureHash(capture) {
  const stable = JSON.stringify({
    videoId: capture.videoId,
    start: roundMillis(capture.start),
    end: roundMillis(capture.end),
    label: capture.label.trim()
  });
  return `sha256:${createHash("sha256").update(stable).digest("hex")}`;
}

export async function importCapture(dataDir, rawCapture, now = new Date().toISOString()) {
  const capture = validateImportPayload(rawCapture);
  return enqueueMutation(dataDir, async () => {
    const captureHash = calculateCaptureHash(capture);
    const discarded = await readDiscarded(dataDir);
    if (discarded.items[capture.loopId]) {
      return {
        item: { loopId: capture.loopId, videoId: capture.videoId, captureHash, processing: { status: "discarded" } },
        changed: false,
        created: false,
        discarded: true
      };
    }
    const loopDir = getLoopDir(dataDir, capture.videoId, capture.loopId);
    const itemPath = join(loopDir, "item.json");
    const sourcePath = join(dataDir, "videos", capture.videoId, "source.json");
    const previous = await readJsonIfExists(itemPath);
    const changed = previous?.captureHash !== captureHash;

    await mkdir(loopDir, { recursive: true });
    await atomicWriteJson(sourcePath, {
      videoId: capture.videoId,
      title: capture.sourceTitle,
      channelTitle: capture.channelTitle,
      channelAvatarUrl: capture.channelAvatarUrl,
      url: capture.sourceUrl,
      updatedAt: now
    });

    const item = {
      schemaVersion: 1,
      loopId: capture.loopId,
      videoId: capture.videoId,
      start: capture.start,
      end: capture.end,
      label: capture.label,
      captureHash,
      transcript: previous?.transcript ?? "",
      transcriptDraft: changed ? capture.label : previous?.transcriptDraft ?? capture.label,
      meaning: previous?.meaning ?? "",
      notes: previous?.notes ?? "",
      tags: Array.isArray(previous?.tags) ? previous.tags : [],
      sourceTitle: capture.sourceTitle,
      sourceUrl: capture.sourceUrl,
      channelTitle: capture.channelTitle,
      channelAvatarUrl: capture.channelAvatarUrl,
      processing: changed
        ? { status: "queued", error: null, attempts: previous?.processing?.attempts ?? 0 }
        : previous?.processing ?? { status: "queued", error: null, attempts: 0 },
      review: changed
        ? { status: "needs_review", verifiedAt: null }
        : previous?.review ?? { status: "needs_review", verifiedAt: null },
      anki: normalizeAnkiState(previous?.anki),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };

    await atomicWriteJson(itemPath, item);
    await rebuildLibrary(dataDir);
    return { item, changed, created: !previous, discarded: false };
  });
}

export async function discardItem(dataDir, videoId, loopId, now = new Date().toISOString()) {
  requiredSafeId(videoId, "videoId");
  requiredSafeId(loopId, "loopId");
  return enqueueMutation(dataDir, async () => {
    const item = await readJsonIfExists(join(getLoopDir(dataDir, videoId, loopId), "item.json"));
    if (!item) return null;
    const discarded = await readDiscarded(dataDir);
    discarded.items[loopId] = { loopId, videoId, captureHash: item.captureHash, discardedAt: now };
    discarded.updatedAt = now;
    await atomicWriteJson(join(dataDir, "discarded.json"), discarded);
    await rm(getLoopDir(dataDir, videoId, loopId), { recursive: true, force: true });
    await rebuildLibrary(dataDir);
    return discarded.items[loopId];
  });
}

export async function listItems(dataDir) {
  const library = (await readJsonIfExists(join(dataDir, "library.json"))) ?? { items: [] };
  return Array.isArray(library.items) ? library.items : [];
}

export async function getItem(dataDir, videoId, loopId) {
  requiredSafeId(videoId, "videoId");
  requiredSafeId(loopId, "loopId");
  return readJsonIfExists(join(getLoopDir(dataDir, videoId, loopId), "item.json"));
}

export async function patchItem(dataDir, videoId, loopId, rawPatch, now = new Date().toISOString()) {
  requiredSafeId(videoId, "videoId");
  requiredSafeId(loopId, "loopId");
  const patch = validateItemPatch(rawPatch);

  return enqueueMutation(dataDir, async () => {
    const itemPath = join(getLoopDir(dataDir, videoId, loopId), "item.json");
    const previous = await readJsonIfExists(itemPath);
    if (!previous) return null;

    const item = {
      schemaVersion: 1,
      loopId: previous.loopId,
      videoId: previous.videoId,
      start: previous.start,
      end: previous.end,
      label: previous.label,
      captureHash: previous.captureHash,
      transcript: patch.fields.transcript ?? previous.transcript ?? "",
      transcriptDraft: previous.transcriptDraft ?? "",
      meaning: patch.fields.meaning ?? previous.meaning ?? "",
      notes: patch.fields.notes ?? previous.notes ?? "",
      tags: patch.fields.tags ?? previous.tags ?? [],
      sourceTitle: previous.sourceTitle ?? "",
      sourceUrl: previous.sourceUrl ?? "",
      channelTitle: previous.channelTitle ?? "",
      channelAvatarUrl: previous.channelAvatarUrl ?? "",
      processing: previous.processing,
      review: previous.review,
      anki: previous.anki,
      createdAt: previous.createdAt,
      updatedAt: now
    };

    if (patch.reviewStatus === "ready") {
      if (!item.transcript.trim()) throw new InputError("A non-empty transcript is required before review can be completed.");
      item.review = { status: "ready", verifiedAt: now };
    } else if (patch.reviewStatus === "needs_review") {
      item.review = { status: "needs_review", verifiedAt: null };
    }

    await atomicWriteJson(itemPath, item);
    await rebuildLibrary(dataDir);
    return item;
  });
}

export async function updateProcessing(dataDir, videoId, loopId, processing, now = new Date().toISOString()) {
  requiredSafeId(videoId, "videoId");
  requiredSafeId(loopId, "loopId");
  if (!processing || !["queued", "processing", "complete", "error"].includes(processing.status)) {
    throw new InputError("Invalid processing status.");
  }

  return enqueueMutation(dataDir, async () => {
    const itemPath = join(getLoopDir(dataDir, videoId, loopId), "item.json");
    const item = await readJsonIfExists(itemPath);
    if (!item) return null;
    item.processing = {
      status: processing.status,
      error: processing.error ?? null,
      attempts: processing.attempts ?? item.processing?.attempts ?? 0
    };
    item.updatedAt = now;
    await atomicWriteJson(itemPath, item);
    await rebuildLibrary(dataDir);
    return item;
  });
}

export async function setAnkiState(dataDir, videoId, loopId, anki, now = new Date().toISOString()) {
  requiredSafeId(videoId, "videoId");
  requiredSafeId(loopId, "loopId");
  return enqueueMutation(dataDir, async () => {
    const itemPath = join(getLoopDir(dataDir, videoId, loopId), "item.json");
    const item = await readJsonIfExists(itemPath);
    if (!item) return null;
    item.anki = normalizeAnkiState(anki);
    item.updatedAt = now;
    await atomicWriteJson(itemPath, item);
    await rebuildLibrary(dataDir);
    return item;
  });
}

export async function rebuildLibrary(dataDir) {
  const items = [];
  const videosDir = join(dataDir, "videos");
  for (const videoEntry of await safeReadDir(videosDir)) {
    if (!videoEntry.isDirectory() || !SAFE_ID.test(videoEntry.name)) continue;
    const loopsDir = join(videosDir, videoEntry.name, "loops");
    for (const loopEntry of await safeReadDir(loopsDir)) {
      if (!loopEntry.isDirectory() || !SAFE_ID.test(loopEntry.name)) continue;
      const item = await readJsonIfExists(join(loopsDir, loopEntry.name, "item.json"));
      if (item) items.push(toLibraryItem(item));
    }
  }
  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const library = { schemaVersion: 1, rebuiltAt: new Date().toISOString(), items };
  await atomicWriteJson(join(dataDir, "library.json"), library);
  return library;
}

export async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, path);
}

export class InputError extends Error {}

function normalizeAnkiState(previous) {
  if (!previous || typeof previous !== "object" || !Number.isFinite(previous.noteId)) {
    return { status: "not_added", deckName: "", noteId: null, addedAt: null };
  }
  return {
    status: "added",
    deckName: typeof previous.deckName === "string" ? previous.deckName : "",
    noteId: previous.noteId,
    addedAt: typeof previous.addedAt === "string" ? previous.addedAt : null
  };
}

function toLibraryItem(item) {
  return {
    loopId: item.loopId,
    videoId: item.videoId,
    label: item.label,
    sourceTitle: item.sourceTitle,
    channelTitle: item.channelTitle ?? "",
    start: item.start,
    end: item.end,
    captureHash: item.captureHash,
    processingStatus: item.processing?.status ?? "queued",
    reviewStatus: item.review?.status ?? "needs_review",
    ankiStatus: Number.isFinite(item.anki?.noteId) ? "added" : "not_added",
    updatedAt: item.updatedAt
  };
}

function getLoopDir(dataDir, videoId, loopId) {
  return join(dataDir, "videos", videoId, "loops", loopId);
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function safeReadDir(path) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function enqueueMutation(key, operation) {
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  mutationQueues.set(key, next);
  const cleanup = () => {
    if (mutationQueues.get(key) === next) mutationQueues.delete(key);
  };
  void next.then(cleanup, cleanup);
  return next;
}

function validateItemPatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Patch body must be an object.");
  const allowed = new Set(["transcript", "meaning", "notes", "tags", "reviewStatus"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new InputError(`${key} cannot be updated.`);
  }

  const fields = {};
  if ("transcript" in value) fields.transcript = optionalString(value.transcript, "transcript", 10_000);
  if ("meaning" in value) fields.meaning = optionalString(value.meaning, "meaning", 20_000);
  if ("notes" in value) fields.notes = optionalString(value.notes, "notes", 20_000);
  if ("tags" in value) fields.tags = stringArray(value.tags, "tags", 50, 200);
  if ("reviewStatus" in value && !["needs_review", "ready"].includes(value.reviewStatus)) {
    throw new InputError("reviewStatus must be needs_review or ready.");
  }
  return { fields, reviewStatus: value.reviewStatus };
}

function stringArray(value, field, maxItems, maxItemLength) {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || item.length > maxItemLength)) {
    throw new InputError(`${field} is invalid.`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

async function readDiscarded(dataDir) {
  return (await readJsonIfExists(join(dataDir, "discarded.json"))) ?? { schemaVersion: 1, updatedAt: null, items: {} };
}

function validateConfig(config) {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error("Invalid companion port.");
  if (typeof config.token !== "string" || config.token.length < 32) throw new Error("Invalid companion token.");
  if (!Array.isArray(config.allowedOrigins)) throw new Error("allowedOrigins must be an array.");
}

function requiredSafeId(value, field) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new InputError(`${field} is invalid.`);
  return value;
}

function requiredFiniteNumber(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new InputError(`${field} must be a finite number.`);
  return value;
}

function optionalString(value, field, maxLength) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > maxLength) throw new InputError(`${field} is invalid.`);
  return value.trim();
}

function requiredHttpUrl(value, field) {
  if (typeof value !== "string") throw new InputError(`${field} is invalid.`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new InputError(`${field} is invalid.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new InputError(`${field} must use http or https.`);
  return parsed.toString();
}

function optionalAssetUrl(value, field) {
  if (value == null || value === "") return "";
  const parsed = new URL(requiredHttpUrl(value, field));
  if (parsed.protocol !== "https:") throw new InputError(`${field} must use https.`);
  return parsed.toString();
}

function roundMillis(value) {
  return Math.round(value * 1000) / 1000;
}
