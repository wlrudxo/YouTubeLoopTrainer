const state = { items: [], selected: null, filter: "all" };
const list = document.querySelector("#itemList");
const summary = document.querySelector("#summary");
const workspace = document.querySelector("#workspace");
const template = document.querySelector("#workspaceTemplate");

document.querySelector("#refreshButton").addEventListener("click", loadItems);
for (const button of document.querySelectorAll("[data-filter]")) {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelector("[data-filter].is-active")?.classList.remove("is-active");
    button.classList.add("is-active");
    renderList();
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

void loadItems();

async function loadItems() {
  try {
    const data = await api("/api/items");
    state.items = data.items;
    renderList();
    if (state.selected) await selectItem(state.selected.videoId, state.selected.loopId);
  } catch (error) {
    summary.textContent = error.message;
  }
}

function renderList() {
  list.innerHTML = "";
  const filtered = state.items.filter(matchesFilter);
  summary.textContent = `${filtered.length} of ${state.items.length} items`;
  for (const item of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `item-button${state.selected?.loopId === item.loopId ? " is-selected" : ""}`;
    const label = document.createElement("strong");
    label.textContent = item.label || "Untitled loop";
    const meta = document.createElement("span");
    meta.textContent = `${item.processingStatus} · ${item.reviewStatus} · ${formatRange(item.start, item.end)}`;
    button.append(label, meta);
    button.addEventListener("click", () => selectItem(item.videoId, item.loopId));
    list.append(button);
  }
}

function matchesFilter(item) {
  if (state.filter === "all") return true;
  if (state.filter === "synced") return item.ankiStatus === "synced";
  return item.reviewStatus === state.filter;
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
  setText(root, "source", `${item.sourceTitle || item.videoId} · ${formatRange(item.start, item.end)}`);
  setText(root, "title", item.label || item.transcriptDraft || "Untitled loop");
  setText(root, "status", `${item.processing.status} / ${item.review.status}`);
  setText(root, "processing", item.processing.error || `Attempts: ${item.processing.attempts}`);

  const audio = role(root, "audio");
  audio.src = `/media/${item.videoId}/${item.loopId}/audio.mp3`;
  if (item.processing.status === "complete") void audio.play().catch(() => undefined);
  const answer = role(root, "answer");
  const transcript = role(root, "transcript");
  transcript.value = item.transcript || item.transcriptDraft || "";
  role(root, "difficulty").value = item.difficulty || "";
  role(root, "alternatives").value = (item.alternatives || []).join("\n");
  role(root, "notes").value = item.notes || "";
  role(root, "tags").value = (item.tags || []).join(", ");

  action(root, "replay", () => { audio.currentTime = 0; void audio.play(); });
  action(root, "retry", async () => {
    await api(`/api/items/${item.videoId}/${item.loopId}/process`, { method: "POST" });
    showMessage(root, "MP3 processing queued.");
    window.setTimeout(loadItems, 1000);
  });
  action(root, "check", () => showFeedback(root, answer.value, transcript.value, false));
  action(root, "reveal", () => showFeedback(root, answer.value, transcript.value, true));
  action(root, "save", () => saveReview(root, item, false));
  action(root, "ready", () => saveReview(root, item, true));
  answer.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      showFeedback(root, answer.value, transcript.value, false);
    }
  });

  workspace.innerHTML = "";
  workspace.append(fragment);
}

async function saveReview(root, item, ready) {
  try {
    const updated = await api(`/api/items/${item.videoId}/${item.loopId}`, {
      method: "PATCH",
      body: JSON.stringify({
        transcript: role(root, "transcript").value,
        difficulty: role(root, "difficulty").value || null,
        alternatives: lines(role(root, "alternatives").value),
        notes: role(root, "notes").value,
        tags: role(root, "tags").value.split(",").map((value) => value.trim()).filter(Boolean),
        reviewStatus: ready ? "ready" : "needs_review"
      })
    });
    state.selected = updated;
    showMessage(root, ready ? "Transcript reviewed and ready for Anki." : "Draft saved.");
    await loadItems();
  } catch (error) {
    showMessage(root, error.message, true);
  }
}

function showFeedback(root, typed, correct, reveal) {
  const feedback = role(root, "feedback");
  feedback.innerHTML = "";
  if (!correct.trim()) {
    feedback.textContent = "Review and save a transcript first.";
    return;
  }
  const typedWords = normalize(typed).split(" ").filter(Boolean);
  const correctWords = normalize(correct).split(" ").filter(Boolean);
  const exact = typedWords.join(" ") === correctWords.join(" ");
  const heading = document.createElement("strong");
  heading.textContent = exact ? "Correct" : "Try again";
  const line = document.createElement("p");
  line.className = "word-line";
  correctWords.forEach((word, index) => {
    const span = document.createElement("span");
    const matched = typedWords[index] === word;
    span.className = matched ? "word-good" : "word-missed";
    span.textContent = matched || reveal ? word : "*".repeat([...word].length);
    line.append(span, " ");
  });
  feedback.append(heading, line);
}

function normalize(value) {
  return value.toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
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
function lines(value) { return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]; }
function showMessage(root, text, error = false) { const el = role(root, "message"); el.textContent = text; el.classList.toggle("is-error", error); }
function formatRange(start, end) { return `${formatTime(start)}–${formatTime(end)}`; }
function formatTime(value) { const minutes = Math.floor(value / 60); const seconds = value - minutes * 60; return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`; }
