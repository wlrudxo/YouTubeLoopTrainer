import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getItem, InputError, patchItem, updateAnkiState } from "./storage.mjs";

const MODEL_NAME = "PhraseLoop Dictation";
const MODEL_FIELDS = ["Transcript", "Audio", "Meaning", "Notes", "Thumbnail", "SourceTitle", "ChannelTitle", "SourceUrl", "Start", "End"];

export async function syncItemToAnki(dataDir, videoId, loopId, config, options = {}) {
  const item = await getItem(dataDir, videoId, loopId);
  if (!item) throw new InputError("Item not found.");
  if (item.processing?.status !== "complete") throw new InputError("MP3 processing must be complete before adding to Anki.");
  if (!item.transcript?.trim()) throw new InputError("Save a non-empty transcript before adding to Anki.");

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
  const thumbnailFilename = await storeThumbnail(invoke, dataDir, videoId);
  const fields = noteFields(item, filename, thumbnailFilename);
  const tags = buildTags(item);
  const note = { deckName, modelName: MODEL_NAME, fields, tags, options: { allowDuplicate: true } };
  const noteId = await invoke("addNote", { note });
  if (!Number.isFinite(noteId)) throw new Error("Anki did not return a note ID.");

  const now = new Date().toISOString();
  const contentHash = calculateContentHash(item, audio);
  if (item.review?.status !== "ready") {
    await patchItem(dataDir, videoId, loopId, { reviewStatus: "ready" }, now);
  }
  const updated = await updateAnkiState(dataDir, videoId, loopId, {
    status: "synced",
    deckName,
    noteId,
    addedAt: item.anki?.addedAt ?? now,
    lastSyncedAt: now,
    contentHash
  }, now);
  return { item: updated, noteId };
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
    throw new Error(`Delete the development note type '${MODEL_NAME}' in Anki, then try again.`);
  }
  await invoke("updateModelTemplates", {
    model: {
      name: MODEL_NAME,
      templates: { Dictation: { Front: frontTemplate(), Back: backTemplate() } }
    }
  });
  await invoke("updateModelStyling", { model: { name: MODEL_NAME, css: modelCss() } });
}

function noteFields(item, filename, thumbnailFilename) {
  return {
    Transcript: item.transcript.trim(),
    Audio: `[sound:${filename}]`,
    Meaning: item.meaning ?? "",
    Notes: item.notes ?? "",
    Thumbnail: thumbnailFilename ? `<img src="${thumbnailFilename}">` : "",
    SourceTitle: item.sourceTitle ?? "",
    ChannelTitle: item.channelTitle ?? "",
    SourceUrl: sourceUrlAtTime(item.sourceUrl, item.start),
    Start: Number(item.start).toFixed(3),
    End: Number(item.end).toFixed(3)
  };
}

function buildTags(item) {
  const tags = new Set(["phraseloop", ...(item.tags ?? []).map(safeTag).filter(Boolean)]);
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
    meaning: item.meaning,
    notes: item.notes,
    tags: item.tags,
    sourceTitle: item.sourceTitle,
    channelTitle: item.channelTitle,
    sourceUrl: item.sourceUrl,
    start: item.start,
    end: item.end
  }));
  return `sha256:${hash.digest("hex")}`;
}

function frontTemplate() {
  return '<a class=thumbnail-link href="{{SourceUrl}}">{{Thumbnail}}</a><div class="audio-container">{{Audio}}</div>';
}

function backTemplate() {
  return "{{FrontSide}}<hr id=answer><div class=transcript>{{Transcript}}</div>{{#Meaning}}<div class=meaning>{{Meaning}}</div>{{/Meaning}}<div class=notes>{{Notes}}</div><div class=source-title>{{SourceTitle}}</div><div class=channel-title>{{ChannelTitle}}</div>";
}

function modelCss() {
  return ".card{font-family:Arial;font-size:18px;text-align:center;color:#000;background:#fff;padding-bottom:72px}.transcript{margin:16px;font-size:21px;line-height:1.5}.meaning{margin:10px;font-size:17px}.notes{margin:8px;color:gray;font-size:15px}.source-title{margin:8px;color:#526078;font-size:13px}.channel-title{margin:6px;color:#526078;font-size:12px}.thumbnail-link{display:inline-block}.card img{display:block;max-width:280px;width:70vw;margin:16px auto;border-radius:8px}.audio-container{position:fixed;z-index:10;bottom:0;left:0;right:0;text-align:center;padding:10px 0;background:#fff;box-shadow:0 -2px 5px rgba(0,0,0,.1)}.audio-container .replaybutton{display:inline-block;margin:0 auto}";
}

async function storeThumbnail(invoke, dataDir, videoId) {
  const path = join(dataDir, "videos", videoId, "thumbnail.jpg");
  try {
    const bytes = await readFile(path);
    const filename = `phraseloop_thumb_${videoId}.jpg`;
    await invoke("storeMediaFile", { filename, data: bytes.toString("base64") });
    return filename;
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function sourceUrlAtTime(value, start) {
  if (!value) return "";
  const url = new URL(value);
  url.searchParams.set("t", `${Math.floor(start)}s`);
  return url.toString();
}
