import * as storage from "../shared/storage";
import { LOOP_URL_PARAM } from "../shared/constants";
import { formatTime } from "../shared/time";
import type { Loop, LoopStatus, VideoLoops } from "../shared/types";
import "./library.css";

const summaryEl = document.querySelector<HTMLParagraphElement>("#summary");
const searchInput = document.querySelector<HTMLInputElement>("#searchInput");
const settingsButton = document.querySelector<HTMLButtonElement>("#settingsButton");
const videoList = document.querySelector<HTMLElement>("#videoList");
const detailPanel = document.querySelector<HTMLElement>("#detailPanel");

let videos: VideoLoops[] = [];
let selectedVideoId: string | null = null;
let statusFilter: "all" | LoopStatus = "all";

settingsButton?.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

searchInput?.addEventListener("input", () => {
  ensureSelectedVideo();
  render();
});

void load();

async function load(): Promise<void> {
  const data = await storage.readData();
  videos = Object.values(data.videos).sort(compareVideos);
  ensureSelectedVideo();
  render();
}

function render(): void {
  if (!summaryEl || !videoList || !detailPanel) return;

  const totalLoops = videos.reduce((sum, video) => sum + video.loops.length, 0);
  const filteredVideos = getFilteredVideos();
  const selectedVideo = videos.find((video) => video.videoId === selectedVideoId) ?? filteredVideos[0] ?? null;

  if (selectedVideo) {
    selectedVideoId = selectedVideo.videoId;
  }

  summaryEl.textContent = `${videos.length} videos · ${totalLoops} loops`;
  renderVideoList(videoList, filteredVideos);
  renderDetail(detailPanel, selectedVideo);
}

function renderVideoList(target: HTMLElement, filteredVideos: VideoLoops[]): void {
  target.innerHTML = "";

  if (filteredVideos.length === 0) {
    target.append(createEmpty(videos.length === 0 ? "No saved videos yet." : "No matching videos."));
    return;
  }

  for (const video of filteredVideos) {
    target.append(createVideoButton(video, video.videoId === selectedVideoId));
  }
}

function renderDetail(target: HTMLElement, video: VideoLoops | null): void {
  target.innerHTML = "";

  if (!video) {
    target.append(createEmpty("Select a video to manage loops."));
    return;
  }

  const header = document.createElement("section");
  header.className = "detail-header";
  header.append(createAvatar(video, "large"), createVideoInfo(video), createVideoActions(video));
  target.append(header);

  const loopsHeader = document.createElement("div");
  loopsHeader.className = "loops-header";
  const loopsTitle = document.createElement("div");
  loopsTitle.className = "loops-title";
  loopsTitle.append(element("h2", "", "Loops"), element("span", "loop-count", `${video.loops.length} saved`));
  loopsHeader.append(loopsTitle, createStatusFilters());
  target.append(loopsHeader);

  const list = document.createElement("section");
  list.className = "loop-list";

  const query = normalize(searchInput?.value ?? "");
  const loops = video.loops.filter((loop) => {
    const matchesQuery = query ? normalize(loop.label).includes(query) : true;
    const matchesStatus = statusFilter === "all" || getLoopStatus(loop) === statusFilter;
    return matchesQuery && matchesStatus;
  });

  if (loops.length === 0) {
    list.append(createEmpty(video.loops.length === 0 ? "No loops saved for this video." : "No matching loops."));
  } else {
    for (const loop of loops) {
      list.append(createLoopRow(video, loop));
    }
  }

  target.append(list);
}

function createVideoButton(video: VideoLoops, selected: boolean): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `video-button${selected ? " is-selected" : ""}`;
  button.addEventListener("click", () => {
    selectedVideoId = video.videoId;
    render();
  });

  const text = document.createElement("span");
  text.className = "video-button-text";

  const title = element("span", "video-title", getVideoTitle(video));
  const channel = element("span", "video-channel", video.channelTitle || "Unknown channel");
  const progress = video.progress ? ` · progress ${formatTime(video.progress.time)}` : "";
  const meta = element("span", "video-meta", `${video.loops.length} loops · ${formatMinuteFromMs(getLatestUpdatedAt(video))}${progress}`);
  text.append(title, channel, meta);

  button.append(createAvatar(video, "small"), text);
  return button;
}

function createVideoInfo(video: VideoLoops): HTMLElement {
  const info = document.createElement("div");
  info.className = "video-info";

  info.append(element("h2", "detail-title", getVideoTitle(video)));
  info.append(element("div", "video-meta", `${video.channelTitle || "Unknown channel"} · ${video.videoId}`));
  info.append(element("div", "video-meta", `${video.loops.length} loops · updated ${formatMinuteFromMs(getLatestUpdatedAt(video))}`));
  info.append(element("div", "video-meta", `Progress: ${formatProgress(video)}`));
  return info;
}

function createVideoActions(video: VideoLoops): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "actions";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Open Video";
  openButton.addEventListener("click", () => {
    void chrome.tabs.create({ url: getVideoUrl(video) });
  });

  const progressButton = document.createElement("button");
  progressButton.type = "button";
  progressButton.textContent = "Open Progress";
  progressButton.disabled = !video.progress;
  progressButton.addEventListener("click", () => {
    void chrome.tabs.create({ url: getProgressUrl(video) });
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Delete Video";
  deleteButton.className = "danger";
  deleteButton.addEventListener("click", () => {
    void deleteVideo(video);
  });

  actions.append(openButton, progressButton, deleteButton);
  return actions;
}

function createLoopRow(video: VideoLoops, loop: Loop): HTMLElement {
  const row = document.createElement("article");
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

  const status = getLoopStatus(loop);
  const statusButton = document.createElement("button");
  statusButton.type = "button";
  statusButton.textContent = formatLoopStatus(status);
  statusButton.className = `status-button is-${status}`;
  statusButton.addEventListener("click", () => {
    void setLoopStatus(video, loop, nextLoopStatus(status));
  });

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => {
    void chrome.tabs.create({ url: getLoopUrl(video, loop) });
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.className = "danger";
  deleteButton.addEventListener("click", () => {
    void deleteLoop(video, loop);
  });

  tools.append(statusButton, openButton, deleteButton);
  row.append(label, meta, tools);
  return row;
}

function createStatusFilters(): HTMLElement {
  const filters = document.createElement("div");
  filters.className = "status-filters";

  for (const status of ["all", "new", "hard", "done"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = status === "all" ? "All" : formatLoopStatus(status);
    button.className = `status-filter-button${statusFilter === status ? " is-selected" : ""}`;
    button.addEventListener("click", () => {
      statusFilter = status;
      render();
    });
    filters.append(button);
  }

  return filters;
}

function createAvatar(video: VideoLoops, size: "small" | "large"): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `video-avatar is-${size}`;

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

async function deleteVideo(video: VideoLoops): Promise<void> {
  if (!window.confirm(`Delete "${getVideoTitle(video)}" and all ${video.loops.length} loops?`)) return;

  await storage.deleteVideo(video.videoId);
  selectedVideoId = null;
  await load();
}

async function renameLoop(video: VideoLoops, loop: Loop, label: string): Promise<void> {
  await storage.renameLoop(video.videoId, loop.id, label.trim() || loop.label, new Date().toISOString());
  await load();
}

async function setLoopStatus(video: VideoLoops, loop: Loop, status: LoopStatus): Promise<void> {
  await storage.setLoopStatus(video.videoId, loop.id, status, new Date().toISOString());
  await load();
}

async function deleteLoop(video: VideoLoops, loop: Loop): Promise<void> {
  if (!window.confirm(`Delete "${loop.label}"?`)) return;

  await storage.deleteLoop(video.videoId, loop.id);
  await load();
}

function getFilteredVideos(): VideoLoops[] {
  const query = normalize(searchInput?.value ?? "");
  return query ? videos.filter((video) => matchesVideo(video, query)) : videos;
}

function ensureSelectedVideo(): void {
  const filtered = getFilteredVideos();

  if (selectedVideoId && filtered.some((video) => video.videoId === selectedVideoId)) {
    return;
  }

  selectedVideoId = filtered[0]?.videoId ?? null;
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

function getLoopUrl(video: VideoLoops, loop: Loop): string {
  const url = new URL(getVideoUrl(video));
  url.searchParams.set("t", `${Math.floor(loop.start)}s`);
  url.searchParams.set(LOOP_URL_PARAM, loop.id);
  return url.toString();
}

function getProgressUrl(video: VideoLoops): string {
  const url = new URL(getVideoUrl(video));
  if (video.progress) {
    url.searchParams.set("t", `${Math.floor(video.progress.time)}s`);
  }
  url.searchParams.delete(LOOP_URL_PARAM);
  return url.toString();
}

function getVideoUrl(video: VideoLoops): string {
  return video.url || `https://www.youtube.com/watch?v=${video.videoId}`;
}

function formatProgress(video: VideoLoops): string {
  if (!video.progress) return "not saved";

  return `${formatTime(video.progress.time)} · ${formatMinute(video.progress.updatedAt)}`;
}

function formatMinute(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "--/-- --:--" : formatMinuteFromMs(time);
}

function formatMinuteFromMs(value: number): string {
  if (!value) return "--/-- --:--";

  const date = new Date(value);
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

function getLoopStatus(loop: Loop): LoopStatus {
  return loop.status ?? "new";
}

function nextLoopStatus(status: LoopStatus): LoopStatus {
  if (status === "new") return "hard";
  if (status === "hard") return "done";
  return "new";
}

function formatLoopStatus(status: LoopStatus): string {
  if (status === "hard") return "Hard";
  if (status === "done") return "Done";
  return "New";
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
