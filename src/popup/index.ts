import { importLoopToCompanion, readCompanionConfig } from "../shared/companion";
import * as storage from "../shared/storage";
import { formatTime } from "../shared/time";
import type { Loop, VideoLoops } from "../shared/types";
import "./popup.css";

type PendingRow = {
  video: VideoLoops;
  loop: Loop;
};

const loopList = document.querySelector<HTMLDivElement>("#loopList");
const summaryEl = document.querySelector<HTMLDivElement>("#summary");
const statusEl = document.querySelector<HTMLDivElement>("#status");
const sendAllButton = document.querySelector<HTMLButtonElement>("#sendAllButton");
const openDictationButton = document.querySelector<HTMLButtonElement>("#openDictationButton");
const settingsButton = document.querySelector<HTMLButtonElement>("#settingsButton");

let rows: PendingRow[] = [];
let sending = false;

settingsButton?.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

openDictationButton?.addEventListener("click", () => {
  void openDictation();
});

sendAllButton?.addEventListener("click", () => {
  void sendAll();
});

void loadPending();

async function loadPending(): Promise<void> {
  try {
    const data = await storage.readData();
    rows = Object.values(data.videos)
      .flatMap((video) => video.loops.map((loop) => ({ video, loop })))
      .sort((a, b) => Date.parse(b.loop.createdAt) - Date.parse(a.loop.createdAt) || a.loop.start - b.loop.start);
    renderRows();
  } catch (error) {
    rows = [];
    renderRows();
    setStatus(error instanceof Error ? error.message : "Failed to load PhraseLoop data.");
  }
}

function renderRows(): void {
  if (!loopList || !summaryEl) return;

  summaryEl.textContent = rows.length === 0 ? "No pending loops" : `${rows.length} pending loop${rows.length === 1 ? "" : "s"}`;
  if (sendAllButton) sendAllButton.disabled = sending || rows.length === 0;

  loopList.innerHTML = "";
  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "All captured loops were sent to the companion.";
    loopList.append(empty);
    return;
  }

  for (const row of rows) {
    loopList.append(createLoopRow(row));
  }
}

function createLoopRow(row: PendingRow): HTMLElement {
  const item = document.createElement("article");
  item.className = "loop-row";

  const main = document.createElement("div");
  main.className = "loop-main";

  const title = document.createElement("span");
  title.className = "loop-video-title";
  title.textContent = row.video.title || row.video.videoId;

  const label = document.createElement("span");
  label.className = "loop-label";
  label.textContent = row.loop.label;

  const range = document.createElement("span");
  range.className = "loop-range";
  range.textContent = `${formatTime(row.loop.start)} - ${formatTime(row.loop.end)}`;

  main.append(title, label, range);
  item.append(main);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "icon-button";
  deleteButton.title = `Delete ${row.loop.label}`;
  deleteButton.setAttribute("aria-label", `Delete ${row.loop.label}`);
  deleteButton.textContent = "x";
  deleteButton.addEventListener("click", () => void deletePending(row));
  item.append(deleteButton);

  return item;
}

async function deletePending(row: PendingRow): Promise<void> {
  try {
    await storage.deleteLoop(row.video.videoId, row.loop.id);
    setStatus("");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Delete failed.");
  }
  await loadPending();
}

async function sendAll(): Promise<void> {
  if (sending || rows.length === 0) return;

  sending = true;
  renderRows();
  setStatus("Sending pending loops...");

  let sent = 0;
  let failed = 0;
  let lastError = "";

  try {
    const config = await readCompanionConfig();
    for (const row of [...rows]) {
      try {
        await importLoopToCompanion(config, row.video, row.loop);
        await storage.deleteLoop(row.video.videoId, row.loop.id);
        sent += 1;
      } catch (error) {
        failed += 1;
        lastError = error instanceof Error ? error.message : "Send failed.";
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Send failed.";
    failed = rows.length;
  }

  sending = false;
  await loadPending();
  setStatus(failed === 0 ? `Sent ${sent} loop${sent === 1 ? "" : "s"}.` : `Sent ${sent}, failed ${failed}. ${lastError}`);
}

async function openDictation(): Promise<void> {
  try {
    const config = await readCompanionConfig();
    await chrome.tabs.create({ url: config.url });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not open the dictation app.");
  }
}

function setStatus(message: string): void {
  if (statusEl) {
    statusEl.textContent = message;
  }
}
