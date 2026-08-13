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
  listItems,
  patchItem,
  setAnkiState,
  discardItem,
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

  it("updates only editable review fields", async () => {
    const dataDir = await makeDataDir();
    await initializeDataRoot(dataDir);
    await importCapture(dataDir, capture());

    const updated = await patchItem(
      dataDir,
      "video_123",
      "lp_test",
      { transcript: "Where is Jane?", meaning: "제인은 어디 있나요?", tags: ["conversation"] },
      "2026-08-12T01:00:00.000Z"
    );
    expect(updated.transcript).toBe("Where is Jane?");
    expect(updated.meaning).toBe("제인은 어디 있나요?");
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
    expect((await listItems(dataDir)).map((item) => item.loopId)).toEqual(["lp_test"]);
  });

  it("lists current item state directly from its source file", async () => {
    const dataDir = await makeDataDir();
    await initializeDataRoot(dataDir);
    await importCapture(dataDir, capture());
    await setAnkiState(dataDir, "video_123", "lp_test", {
      status: "added",
      deckName: "English::PhraseLoop",
      noteId: 123,
      addedAt: "2026-08-12T00:00:00.000Z"
    });

    expect(await listItems(dataDir)).toEqual([
      expect.objectContaining({ loopId: "lp_test", ankiStatus: "added" })
    ]);
  });

  it("keeps the add-only Anki record when capture boundaries change", async () => {
    const dataDir = await makeDataDir();
    await initializeDataRoot(dataDir);
    await importCapture(dataDir, capture());
    const itemPath = join(dataDir, "videos", "video_123", "loops", "lp_test", "item.json");
    const stored = JSON.parse(await readFile(itemPath, "utf8"));
    stored.transcript = "Where is Jane?";
    stored.anki = { status: "synced", deckName: "English::PhraseLoop", noteId: 123, addedAt: "2026-08-12T00:00:00.000Z", contentHash: "old" };
    await atomicWriteJson(itemPath, stored);

    const changed = await importCapture(dataDir, capture({ end: 18.2 }));
    expect(changed.item.transcript).toBe("Where is Jane?");
    expect(changed.item.transcriptDraft).toBe("Where is Jane?");
    expect(changed.item.processing.status).toBe("queued");
    expect(changed.item.anki).toEqual({
      status: "added",
      deckName: "English::PhraseLoop",
      noteId: 123,
      addedAt: "2026-08-12T00:00:00.000Z"
    });
    expect((await getItem(dataDir, "video_123", "lp_test")).end).toBe(18.2);
  });

  it("rejects unsafe IDs and non-http URLs", () => {
    expect(() => validateImportPayload(capture({ loopId: "../escape" }))).toThrow(/loopId/);
    expect(() => validateImportPayload(capture({ url: "file:///secret" }))).toThrow(/http/);
  });

  it("requires the current title and url import fields", () => {
    const { title, url, ...withoutCurrentFields } = capture();
    expect(() => validateImportPayload({ ...withoutCurrentFields, sourceTitle: title, sourceUrl: url })).toThrow(/url/);
  });

  it("uses normalized millisecond boundaries in capture hashes", () => {
    const first = validateImportPayload(capture({ start: 12.3001 }));
    const second = validateImportPayload(capture({ start: 12.3002 }));
    expect(calculateCaptureHash(first)).toBe(calculateCaptureHash(second));
  });

  it("keeps a discarded loop tombstoned when it is imported again", async () => {
    const dataDir = await makeDataDir();
    await initializeDataRoot(dataDir);
    const first = await importCapture(dataDir, capture());
    const discarded = await discardItem(dataDir, "video_123", "lp_test", "2026-08-12T02:00:00.000Z");
    const repeated = await importCapture(dataDir, capture());

    expect(discarded.captureHash).toBe(first.item.captureHash);
    expect(repeated.discarded).toBe(true);
    expect(repeated.item.captureHash).toBe(first.item.captureHash);
    expect(await getItem(dataDir, "video_123", "lp_test")).toBeNull();
  });
});
