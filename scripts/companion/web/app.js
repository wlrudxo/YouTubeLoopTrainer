const state = { items: [], selected: null, filter: "not_added" };
const list = document.querySelector("#itemList");
const summary = document.querySelector("#summary");
const workspace = document.querySelector("#workspace");
const template = document.querySelector("#workspaceTemplate");

document.querySelector("#refreshButton").addEventListener("click", () => void loadItems({ selectFirst: true }));
for (const button of document.querySelectorAll("[data-filter]")) {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelector("[data-filter].is-active")?.classList.remove("is-active");
    button.classList.add("is-active");
    void selectFirstVisibleItem();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Control" && !event.repeat) {
    const audio = workspace.querySelector("audio");
    if (audio) {
      event.preventDefault();
      audio.currentTime = 0;
      void audio.play();
    }
  }
});

const ankiStatus = document.querySelector("#ankiStatus");
async function checkAnkiStatus() {
  let connected = false;
  try {
    connected = (await api("/api/anki/status")).connected === true;
  } catch {
    connected = false;
  }
  ankiStatus.classList.toggle("is-online", connected);
  ankiStatus.classList.toggle("is-offline", !connected);
  ankiStatus.title = connected ? "Anki connected" : "Anki not reachable. Start Anki with AnkiConnect installed.";
}
window.setInterval(checkAnkiStatus, 30_000);

void loadItems({ selectFirst: true });

async function loadItems({ selectFirst = false } = {}) {
  void checkAnkiStatus();
  try {
    const data = await api("/api/items");
    state.items = data.items;
    const selectedStillExists = state.selected && state.items.some((item) => sameItem(item, state.selected));
    if (selectedStillExists) {
      await selectItem(state.selected.videoId, state.selected.loopId);
    } else if (selectFirst) {
      await selectFirstVisibleItem();
    } else {
      renderList();
    }
  } catch (error) {
    summary.textContent = error.message;
  }
}

function renderList() {
  list.innerHTML = "";
  const filtered = state.items.filter(matchesFilter);
  summary.textContent = `${filtered.length} of ${state.items.length} items`;
  const groups = new Map();
  for (const item of filtered) {
    const group = groups.get(item.videoId) || [];
    group.push(item);
    groups.set(item.videoId, group);
  }
  for (const [videoId, items] of groups) {
    const group = document.createElement("section");
    group.className = "video-group";
    const header = document.createElement("div");
    header.className = "video-group-header";
    const thumbnail = localImage(`/media/${videoId}/thumbnail.jpg`, "video-thumbnail");
    const avatar = localImage(`/media/${videoId}/channel.jpg`, "channel-avatar");
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = items[0].sourceTitle || videoId;
    const channel = document.createElement("span");
    channel.textContent = items[0].channelTitle || "Unknown channel";
    info.append(title, channel);
    header.append(thumbnail, avatar, info);
    group.append(header);
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `item-button${state.selected?.loopId === item.loopId ? " is-selected" : ""}`;
      const label = document.createElement("strong");
      label.textContent = item.label || "Untitled loop";
      const meta = document.createElement("span");
      meta.textContent = `${item.processingStatus} · ${formatRange(item.start, item.end)}`;
      button.append(label, meta);
      button.addEventListener("click", () => selectItem(item.videoId, item.loopId));
      group.append(button);
    }
    list.append(group);
  }
}

function matchesFilter(item) {
  if (state.filter === "all") return true;
  return item.ankiStatus === state.filter;
}

async function selectFirstVisibleItem() {
  state.selected = null;
  const first = state.items.find(matchesFilter);
  if (first) {
    await selectItem(first.videoId, first.loopId);
    return;
  }
  renderList();
  workspace.innerHTML = `<div class="empty-state">${state.filter === "not_added" ? "All caught up." : "No items in this view."}</div>`;
}

async function selectItem(videoId, loopId) {
  const item = await api(`/api/items/${videoId}/${loopId}`);
  state.selected = item;
  renderList();
  renderWorkspace(item);
}

function renderWorkspace(item) {
  const fragment = template.content.cloneNode(true);
  const root = fragment.querySelector("article");
  const listItem = state.items.find((entry) => entry.loopId === item.loopId);
  const channelTitle = item.channelTitle || listItem?.channelTitle;
  const sourceParts = [channelTitle, item.sourceTitle || item.videoId, formatRange(item.start, item.end)].filter(Boolean);
  setText(root, "source", sourceParts.join(" · "));
  const thumb = role(root, "thumb");
  thumb.src = `/media/${item.videoId}/thumbnail.jpg`;
  thumb.addEventListener("error", () => thumb.remove());
  const avatar = role(root, "avatar");
  avatar.src = `/media/${item.videoId}/channel.jpg`;
  avatar.addEventListener("error", () => avatar.remove());
  setText(root, "title", item.label || item.transcriptDraft || "Untitled loop");
  setText(root, "status", item.processing.status);
  setText(root, "processing", item.processing.error || "");

  const audio = role(root, "audio");
  audio.src = `/media/${item.videoId}/${item.loopId}/audio.mp3`;
  const transcript = role(root, "transcript");
  transcript.value = item.transcript || item.transcriptDraft || "";
  role(root, "meaning").value = item.meaning || "";
  role(root, "notes").value = item.notes || "";
  role(root, "tags").value = (item.tags || []).join(", ");

  action(root, "replay", () => { audio.currentTime = 0; void audio.play(); });
  action(root, "retry", async () => {
    await api(`/api/items/${item.videoId}/${item.loopId}/process`, { method: "POST" });
    showMessage(root, "MP3 processing queued.");
    window.setTimeout(loadItems, 1000);
  });
  action(root, "save", async () => {
    try {
      await saveFields(root, item);
      showMessage(root, "Draft saved.");
      window.setTimeout(loadItems, 1200);
    } catch (error) {
      showMessage(root, error.message, true);
    }
  });
  const discardButton = root.querySelector('[data-action="discard"]');
  discardButton.addEventListener("click", async () => {
    const prompt = item.anki?.noteId
      ? "Remove this item from the local app? The Anki card is kept. It will not be imported again."
      : "Discard this easy item? It will not be imported again.";
    if (!window.confirm(prompt)) return;
    try {
      await api(`/api/items/${item.videoId}/${item.loopId}`, { method: "DELETE" });
      state.selected = null;
      await loadItems({ selectFirst: true });
    } catch (error) {
      showMessage(root, error.message, true);
    }
  });
  const ankiButton = root.querySelector('[data-action="anki"]');
  ankiButton.disabled = item.processing.status !== "complete";
  ankiButton.textContent = item.anki?.noteId ? "Added ✓" : "Add to Anki";
  ankiButton.title = item.anki?.noteId ? "Already added. Click to add again as a new note." : "";
  ankiButton.addEventListener("click", async () => {
    try {
      ankiButton.disabled = true;
      await saveFields(root, item);
      await api(`/api/items/${item.videoId}/${item.loopId}/anki`, { method: "POST" });
      state.selected = null;
      await loadItems({ selectFirst: true });
    } catch (error) {
      showMessage(root, error.message, true);
      ankiButton.disabled = false;
    }
  });
  workspace.innerHTML = "";
  workspace.append(fragment);
}

async function saveFields(root, item) {
  const updated = await api(`/api/items/${item.videoId}/${item.loopId}`, {
    method: "PATCH",
    body: JSON.stringify({
      transcript: role(root, "transcript").value,
      meaning: role(root, "meaning").value,
      notes: role(root, "notes").value,
      tags: role(root, "tags").value.split(",").map((value) => value.trim()).filter(Boolean)
    })
  });
  state.selected = updated;
  return updated;
}

async function api(path, init = {}) {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status}).`);
  return body;
}

function role(root, name) { return root.querySelector(`[data-role="${name}"]`); }
function action(root, name, handler) { root.querySelector(`[data-action="${name}"]`).addEventListener("click", handler); }
function setText(root, name, value) { role(root, name).textContent = value; }
function showMessage(root, text, error = false) { const el = role(root, "message"); el.textContent = text; el.classList.toggle("is-error", error); }
function sameItem(left, right) { return left.videoId === right.videoId && left.loopId === right.loopId; }
function formatRange(start, end) { return `${formatTime(start)}–${formatTime(end)}`; }
function formatTime(value) { const minutes = Math.floor(value / 60); const seconds = value - minutes * 60; return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`; }
function localImage(src, className) { const img = document.createElement("img"); img.src = src; img.alt = ""; img.className = className; img.addEventListener("error", () => img.remove()); return img; }
