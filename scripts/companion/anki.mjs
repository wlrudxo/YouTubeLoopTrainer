import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getItem, InputError, updateAnkiState } from "./storage.mjs";

const MODEL_NAME = "PhraseLoop Dictation";
const MODEL_FIELDS = ["LoopId", "Audio", "Transcript", "Notes", "SourceTitle", "SourceUrl", "Start", "End"];

export async function syncItemToAnki(dataDir, videoId, loopId, config, options = {}) {
  const item = await getItem(dataDir, videoId, loopId);
  if (!item) throw new InputError("Item not found.");
  if (item.processing?.status !== "complete") throw new InputError("MP3 processing must be complete before adding to Anki.");
  if (item.review?.status !== "ready" || !item.review.verifiedAt || !item.transcript?.trim()) {
    throw new InputError("The transcript must be reviewed before adding to Anki.");
  }

  const audioPath = join(dataDir, "videos", videoId, "loops", loopId, "audio.mp3");
  let audio;
  try {
    audio = await readFile(audioPath);
  } catch (error) {
    if (error?.code === "ENOENT") throw new InputError("The item MP3 file is missing.");
    throw error;
  }

  const invoke = options.invoke ?? createAnkiInvoker(config.anki.url);
  await invoke("version");
  const deckName = config.anki.deckName;
  const decks = await invoke("deckNames");
  if (!decks.includes(deckName)) await invoke("createDeck", { deck: deckName });
  await ensureModel(invoke);

  const filename = `phraseloop_${loopId}.mp3`;
  await invoke("storeMediaFile", { filename, data: audio.toString("base64") });
  const fields = noteFields(item, filename);
  const tags = buildTags(item);
  let noteId = await findExistingNote(invoke, item);
  let created = false;

  if (noteId) {
    await invoke("updateNote", { note: { id: noteId, fields, tags } });
  } else {
    const note = { deckName, modelName: MODEL_NAME, fields, tags, options: { allowDuplicate: false } };
    const canAdd = await invoke("canAddNotes", { notes: [note] });
    if (!canAdd?.[0]) throw new Error("Anki rejected the note as empty or duplicate.");
    noteId = await invoke("addNote", { note });
    if (!Number.isFinite(noteId)) throw new Error("Anki did not return a note ID.");
    created = true;
  }

  const now = new Date().toISOString();
  const contentHash = calculateContentHash(item, audio);
  const updated = await updateAnkiState(dataDir, videoId, loopId, {
    status: "synced",
    deckName,
    noteId,
    addedAt: item.anki?.addedAt ?? now,
    lastSyncedAt: now,
    contentHash
  }, now);
  return { item: updated, noteId, created };
}

export function createAnkiInvoker(url = "http://127.0.0.1:8765") {
  return async (action, params = {}) => {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, version: 6, params })
      });
    } catch {
      throw new Error("Could not connect to AnkiConnect. Start Anki and verify that AnkiConnect is installed.");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.error) throw new Error(body?.error || `AnkiConnect request failed (${response.status}).`);
    return body.result;
  };
}

async function ensureModel(invoke) {
  const models = await invoke("modelNames");
  if (!models.includes(MODEL_NAME)) {
    await invoke("createModel", {
      modelName: MODEL_NAME,
      inOrderFields: MODEL_FIELDS,
      css: modelCss(),
      cardTemplates: [{ Name: "Dictation", Front: frontTemplate(), Back: backTemplate() }]
    });
    return;
  }
  const fields = await invoke("modelFieldNames", { modelName: MODEL_NAME });
  if (JSON.stringify(fields) !== JSON.stringify(MODEL_FIELDS)) {
    throw new Error(`Anki note type '${MODEL_NAME}' has incompatible fields.`);
  }
}

async function findExistingNote(invoke, item) {
  if (Number.isFinite(item.anki?.noteId)) {
    const notes = await invoke("notesInfo", { notes: [item.anki.noteId] });
    if (notes?.length) return item.anki.noteId;
  }
  const matches = await invoke("findNotes", { query: `note:\"${MODEL_NAME}\" LoopId:${item.loopId}` });
  return Number.isFinite(matches?.[0]) ? matches[0] : null;
}

function noteFields(item, filename) {
  return {
    LoopId: item.loopId,
    Audio: `[sound:${filename}]`,
    Transcript: item.transcript.trim(),
    Notes: item.notes ?? "",
    SourceTitle: item.sourceTitle ?? "",
    SourceUrl: item.sourceUrl ?? "",
    Start: Number(item.start).toFixed(3),
    End: Number(item.end).toFixed(3)
  };
}

function buildTags(item) {
  const tags = new Set(["phraseloop", ...(item.tags ?? []).map(safeTag).filter(Boolean)]);
  if (item.difficulty) tags.add(`phraseloop::${item.difficulty}`);
  return [...tags];
}

function safeTag(value) {
  return String(value).trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_:-]/gu, "");
}

function calculateContentHash(item, audio) {
  const hash = createHash("sha256");
  hash.update(audio);
  hash.update(JSON.stringify({
    transcript: item.transcript,
    notes: item.notes,
    tags: item.tags,
    difficulty: item.difficulty,
    sourceUrl: item.sourceUrl,
    start: item.start,
    end: item.end
  }));
  return `sha256:${hash.digest("hex")}`;
}

function frontTemplate() {
  return "{{Audio}}<div class=prompt>Type what you hear</div><div class=dictation-input>{{type:Transcript}}</div>";
}

function backTemplate() {
  return "{{FrontSide}}<hr id=answer><div class=transcript>{{Transcript}}</div><div class=notes>{{Notes}}</div><a href=\"{{SourceUrl}}\">YouTube source</a>";
}

function modelCss() {
  return ".card{font-family:Arial;font-size:20px;text-align:center;color:#172033;background:#fff}.prompt{margin:16px;color:#69758a}.transcript{margin:18px;font-size:24px}.notes{margin:12px;color:#526078}#typeans{font-size:22px!important}";
}
