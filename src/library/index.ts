import * as storage from "../shared/storage";
import { formatTime } from "../shared/time";
import type { Loop, VideoLoops } from "../shared/types";
import "./library.css";

const summaryEl = document.querySelector<HTMLParagraphElement>("#summary");
const searchInput = document.querySelector<HTMLInputElement>("#searchInput");
const settingsButton = document.querySelector<HTMLButtonElement>("#settingsButton");
const videoList = document.querySelector<HTMLElement>("#videoList");

let videos: VideoLoops[] = [];

settingsButton?.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

searchInput?.addEventListener("input", () => {
  render();
});

void load();

async function load(): Promise<void> {
  const data = await storage.readData();
  videos = Object.values(data.videos).sort(compareVideos);
  render();
}

function render(): void {
  if (!summaryEl || !videoList) return;

  const query = normalize(searchInput?.value ?? "");
  const filtered = query ? videos.filter((video) => matchesVideo(video, query)) : videos;
  const totalLoops = videos.reduce((sum, video) => sum + video.loops.length, 0);

  summaryEl.textContent = `${videos.length} videos · ${totalLoops} loops`;
  videoList.innerHTML = "";

  if (filtered.length === 0) {
    videoList.append(createEmpty(videos.length === 0 ? "No saved videos yet." : "No matching videos."));
    return;
  }

  for (const video of filtered) {
    videoList.append(createVideoCard(video));
  }
}

function createVideoCard(video: VideoLoops): HTMLElement {
  const card = document.createElement("article");
  card.className = "video-card";

  const header = document.createElement("div");
  header.className = "video-header";
  header.append(createAvatar(video), createVideoInfo(video), createVideoActions(video));
  card.append(header);

  const loops = document.createElement("div");
  loops.className = "loop-list";

  if (video.loops.length === 0) {
    loops.append(createEmpty("No loops saved for this video."));
  } else {
    for (const loop of video.loops) {
      loops.append(createLoopRow(video, loop));
    }
  }

  card.append(loops);
  return card;
}

function createVideoInfo(video: VideoLoops): HTMLElement {
  const info = document.createElement("div");
  info.className = "video-info";

  const title = document.createElement("textarea");
  title.className = "video-title-input";
  title.rows = 2;
  title.value = getVideoTitle(video);
  title.addEventListener("blur", () => {
    void renameVideo(video, title.value);
  });
  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      title.blur();
    }
  });

  const meta = document.createElement("div");
  meta.className = "video-meta";
  meta.textContent = `${video.channelTitle || "Unknown channel"} · ${video.loops.length} loops`;

  info.append(title, meta);
  return info;
}

function createVideoActions(video: VideoLoops): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "actions";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => {
    void chrome.tabs.create({ url: video.url || `https://www.youtube.com/watch?v=${video.videoId}` });
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.className = "danger";
  deleteButton.addEventListener("click", () => {
    void deleteVideo(video);
  });

  actions.append(openButton, deleteButton);
  return actions;
}

function createLoopRow(video: VideoLoops, loop: Loop): HTMLElement {
  const row = document.createElement("div");
  row.className = "loop-row";

  const label = document.createElement("textarea");
  label.className = "loop-label-input";
  label.rows = 3;
  label.value = loop.label;
  label.addEventListener("blur", () => {
    void renameLoop(video, loop, label.value);
  });
  label.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      label.blur();
    }
  });

  const meta = document.createElement("div");
  meta.className = "loop-meta";
  meta.textContent = `${formatTime(loop.start)} - ${formatTime(loop.end)} · ${formatMinute(loop.updatedAt)}`;

  const tools = document.createElement("div");
  tools.className = "loop-tools";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.textContent = "Open";
  playButton.addEventListener("click", () => {
    void chrome.tabs.create({ url: `${video.url || `https://www.youtube.com/watch?v=${video.videoId}`}&t=${Math.floor(loop.start)}s` });
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.className = "danger";
  deleteButton.addEventListener("click", () => {
    void deleteLoop(video, loop);
  });

  tools.append(playButton, deleteButton);
  row.append(label, meta, tools);
  return row;
}

function createAvatar(video: VideoLoops): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "video-avatar";

  if (video.channelAvatarUrl) {
    const image = document.createElement("img");
    image.src = video.channelAvatarUrl;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    wrap.append(image);
  } else {
    wrap.textContent = getVideoTitle(video).slice(0, 1).toUpperCase();
  }

  return wrap;
}

function createEmpty(message: string): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  return empty;
}

async function renameVideo(video: VideoLoops, title: string): Promise<void> {
  await storage.renameVideo(video.videoId, title);
  await load();
}

async function deleteVideo(video: VideoLoops): Promise<void> {
  if (!window.confirm(`Delete "${getVideoTitle(video)}" and all ${video.loops.length} loops?`)) return;

  await storage.deleteVideo(video.videoId);
  await load();
}

async function renameLoop(video: VideoLoops, loop: Loop, label: string): Promise<void> {
  await storage.renameLoop(video.videoId, loop.id, label.trim() || loop.label, new Date().toISOString());
  await load();
}

async function deleteLoop(video: VideoLoops, loop: Loop): Promise<void> {
  if (!window.confirm(`Delete "${loop.label}"?`)) return;

  await storage.deleteLoop(video.videoId, loop.id);
  await load();
}

function matchesVideo(video: VideoLoops, query: string): boolean {
  return (
    normalize(video.title).includes(query) ||
    normalize(video.channelTitle ?? "").includes(query) ||
    normalize(video.videoId).includes(query) ||
    video.loops.some((loop) => normalize(loop.label).includes(query))
  );
}

function compareVideos(a: VideoLoops, b: VideoLoops): number {
  return getLatestUpdatedAt(b) - getLatestUpdatedAt(a) || getVideoTitle(a).localeCompare(getVideoTitle(b));
}

function getLatestUpdatedAt(video: VideoLoops): number {
  return Math.max(0, ...video.loops.map((loop) => Date.parse(loop.updatedAt) || 0));
}

function formatMinute(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--/-- --:--";

  return [
    String(date.getMonth() + 1).padStart(2, "0"),
    "/",
    String(date.getDate()).padStart(2, "0"),
    " ",
    String(date.getHours()).padStart(2, "0"),
    ":",
    String(date.getMinutes()).padStart(2, "0")
  ].join("");
}

function getVideoTitle(video: VideoLoops): string {
  return video.title || video.videoId;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
