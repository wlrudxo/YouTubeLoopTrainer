import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncItemToAnki } from "./anki.mjs";
import { getItem, importCapture, initializeDataRoot, patchItem, updateProcessing } from "./storage.mjs";

const tempDirs = [];
afterEach(async () => Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function readyItem() {
  const dataDir = await mkdtemp(join(tmpdir(), "phraseloop-anki-"));
  tempDirs.push(dataDir);
  const { config } = await initializeDataRoot(dataDir);
  await importCapture(dataDir, {
    loopId: "lp_anki",
    videoId: "video_anki",
    start: 1,
    end: 3,
    label: "Where is Jane?",
    title: "At home",
    url: "https://www.youtube.com/watch?v=video_anki"
  });
  await writeFile(join(dataDir, "videos", "video_anki", "loops", "lp_anki", "audio.mp3"), "audio");
  await updateProcessing(dataDir, "video_anki", "lp_anki", { status: "complete", attempts: 1 });
  await patchItem(dataDir, "video_anki", "lp_anki", {
    transcript: "Where is Jane?",
    difficulty: "hard",
    tags: ["conversation"],
    reviewStatus: "ready"
  });
  return { dataDir, config };
}

function fakeAnki(existingNoteId = null) {
  const calls = [];
  const invoke = async (action, params = {}) => {
    calls.push({ action, params });
    if (action === "version") return 6;
    if (action === "deckNames") return ["Default"];
    if (action === "createDeck") return 123;
    if (action === "modelNames") return ["Basic"];
    if (action === "createModel") return { id: 456 };
    if (action === "storeMediaFile") return params.filename;
    if (action === "findNotes") return existingNoteId ? [existingNoteId] : [];
    if (action === "canAddNotes") return [true];
    if (action === "addNote") return 789;
    if (action === "updateNote") return null;
    if (action === "notesInfo") return existingNoteId ? [{ noteId: existingNoteId }] : [];
    throw new Error(`Unexpected action: ${action}`);
  };
  return { calls, invoke };
}

describe("Anki sync", () => {
  it("creates missing deck/model and adds a reviewed item", async () => {
    const { dataDir, config } = await readyItem();
    const anki = fakeAnki();
    const result = await syncItemToAnki(dataDir, "video_anki", "lp_anki", config, { invoke: anki.invoke });
    expect(result).toMatchObject({ noteId: 789, created: true });
    expect(anki.calls.map((call) => call.action)).toContain("createModel");
    const add = anki.calls.find((call) => call.action === "addNote");
    expect(add.params.note.fields.Transcript).toBe("Where is Jane?");
    expect(add.params.note.tags).toContain("phraseloop::hard");
    expect((await getItem(dataDir, "video_anki", "lp_anki")).anki.status).toBe("synced");
  });

  it("updates an existing LoopId note instead of adding a duplicate", async () => {
    const { dataDir, config } = await readyItem();
    const anki = fakeAnki(555);
    const result = await syncItemToAnki(dataDir, "video_anki", "lp_anki", config, { invoke: anki.invoke });
    expect(result).toMatchObject({ noteId: 555, created: false });
    expect(anki.calls.some((call) => call.action === "updateNote")).toBe(true);
    expect(anki.calls.some((call) => call.action === "addNote")).toBe(false);
  });

  it("rejects items that have not completed review", async () => {
    const { dataDir, config } = await readyItem();
    await patchItem(dataDir, "video_anki", "lp_anki", { reviewStatus: "needs_review" });
    await expect(syncItemToAnki(dataDir, "video_anki", "lp_anki", config, { invoke: fakeAnki().invoke })).rejects.toThrow(/reviewed/);
  });
});
