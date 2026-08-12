import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  atomicWriteJson,
  calculateCaptureHash,
  getItem,
  importCapture,
  initializeDataRoot,
  patchItem,
  validateImportPayload
} from "./storage.mjs";

const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function makeDataDir() {
  const path = await mkdtemp(join(tmpdir(), "phraseloop-companion-"));
  tempDirs.push(path);
  return path;
}

function capture(overrides = {}) {
  return {
    loopId: "lp_test",
    videoId: "video_123",
    start: 12.3,
    end: 17.8,
    label: "Where is Jane?",
    title: "At home",
    url: "https://www.youtube.com/watch?v=video_123",
    ...overrides
  };
}

describe("companion storage", () => {
  it("initializes a persistent random-token config", async () => {
    const dataDir = await makeDataDir();
    const first = await initializeDataRoot(dataDir);
    const second = await initializeDataRoot(dataDir);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.config.token).toBe(first.config.token);
    expect(first.config.token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("only marks a non-empty reviewed transcript ready", async () => {
    const dataDir = await makeDataDir();
    await initializeDataRoot(dataDir);
    await importCapture(dataDir, capture());

    await expect(patchItem(dataDir, "video_123", "lp_test", { reviewStatus: "ready" })).rejects.toThrow(/transcript/);
    const ready = await patchItem(
      dataDir,
      "video_123",
      "lp_test",
      { transcript: "Where is Jane?", difficulty: "normal", tags: ["conversation"], reviewStatus: "ready" },
      "2026-08-12T01:00:00.000Z"
    );
    expect(ready.review).toEqual({ status: "ready", verifiedAt: "2026-08-12T01:00:00.000Z" });
    expect(ready.difficulty).toBe("normal");
  });

  it("rejects patch fields outside the allowlist", async () => {
    const dataDir = await makeDataDir();
    await initializeDataRoot(dataDir);
    await importCapture(dataDir, capture());
    await expect(patchItem(dataDir, "video_123", "lp_test", { anki: { noteId: 1 } })).rejects.toThrow(/cannot be updated/);
  });

  it("imports a capture idempotently", async () => {
    const dataDir = await makeDataDir();
    await initializeDataRoot(dataDir);
    const first = await importCapture(dataDir, capture(), "2026-08-12T00:00:00.000Z");
    const second = await importCapture(dataDir, capture(), "2026-08-12T00:01:00.000Z");

    expect(first.created).toBe(true);
    expect(first.item.transcriptDraft).toBe("Where is Jane?");
    expect(second.created).toBe(false);
    expect(second.changed).toBe(false);
    expect(second.item.captureHash).toBe(first.item.captureHash);
  });

  it("invalidates review and Anki sync when capture boundaries change", async () => {
    const dataDir = await makeDataDir();
    await initializeDataRoot(dataDir);
    await importCapture(dataDir, capture());
    const itemPath = join(dataDir, "videos", "video_123", "loops", "lp_test", "item.json");
    const stored = JSON.parse(await readFile(itemPath, "utf8"));
    stored.transcript = "Where is Jane?";
    stored.review = { status: "ready", verifiedAt: "2026-08-12T00:00:00.000Z" };
    stored.anki = { status: "synced", noteId: 123, contentHash: "old" };
    await atomicWriteJson(itemPath, stored);

    const changed = await importCapture(dataDir, capture({ end: 18.2 }));
    expect(changed.item.transcript).toBe("Where is Jane?");
    expect(changed.item.transcriptDraft).toBe("Where is Jane?");
    expect(changed.item.review).toEqual({ status: "needs_review", verifiedAt: null });
    expect(changed.item.processing.status).toBe("queued");
    expect(changed.item.anki.status).toBe("out_of_sync");
    expect((await getItem(dataDir, "video_123", "lp_test")).end).toBe(18.2);
  });

  it("rejects unsafe IDs and non-http URLs", () => {
    expect(() => validateImportPayload(capture({ loopId: "../escape" }))).toThrow(/loopId/);
    expect(() => validateImportPayload(capture({ url: "file:///secret" }))).toThrow(/http/);
  });

  it("uses normalized millisecond boundaries in capture hashes", () => {
    const first = validateImportPayload(capture({ start: 12.3001 }));
    const second = validateImportPayload(capture({ start: 12.3002 }));
    expect(calculateCaptureHash(first)).toBe(calculateCaptureHash(second));
  });
});
