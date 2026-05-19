import * as storage from "../shared/storage";
import type { VideoLoops } from "../shared/types";
import "./popup.css";

const searchInput = document.querySelector<HTMLInputElement>("#searchInput");
const videoList = document.querySelector<HTMLDivElement>("#videoList");
const summaryEl = document.querySelector<HTMLDivElement>("#summary");
const settingsButton = document.querySelector<HTMLButtonElement>("#settingsButton");

let videos: VideoLoops[] = [];

settingsButton?.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

searchInput?.addEventListener("input", () => {
  renderVideos();
});

void loadLibrary();

async function loadLibrary(): Promise<void> {
  const data = await storage.readData();
  videos = Object.values(data.videos).sort(compareVideos);
  renderVideos();
}

function renderVideos(): void {
  if (!videoList || !summaryEl) return;

  const query = normalize(searchInput?.value ?? "");
  const filtered = query ? videos.filter((video) => matchesVideo(video, query)) : videos;
  const totalLoops = videos.reduce((sum, video) => sum + video.loops.length, 0);

  summaryEl.textContent = `${videos.length} videos · ${totalLoops} loops`;
  videoList.innerHTML = "";

  if (filtered.length === 0) {
    videoList.append(createEmptyState(videos.length === 0 ? "No saved videos yet." : "No matching videos."));
    return;
  }

  for (const video of filtered) {
    videoList.append(createVideoRow(video));
  }
}

function createVideoRow(video: VideoLoops): HTMLElement {
  const row = document.createElement("article");
  row.className = "video-row";

  row.append(createAvatar(video));

  const body = document.createElement("button");
  body.type = "button";
  body.className = "video-main";
  body.title = `Open ${getVideoTitle(video)}`;
  body.addEventListener("click", () => openVideo(video));

  const title = document.createElement("span");
  title.className = "video-title";
  title.textContent = getVideoTitle(video);

  const meta = document.createElement("span");
  meta.className = "video-meta";
  meta.textContent = `${video.loops.length} loops${formatUpdatedAt(video)}`;

  const channel = document.createElement("span");
  channel.className = "video-channel";
  channel.textContent = video.channelTitle || "Unknown channel";

  body.append(title, channel, meta);

  row.append(body);
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

function createEmptyState(message: string): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  return empty;
}

function openVideo(video: VideoLoops): void {
  void chrome.tabs.create({ url: video.url || `https://www.youtube.com/watch?v=${video.videoId}` });
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

function formatUpdatedAt(video: VideoLoops): string {
  const latest = getLatestUpdatedAt(video);
  if (!latest) return "";

  return ` · updated ${new Date(latest).toLocaleDateString()}`;
}

function getVideoTitle(video: VideoLoops): string {
  return video.title || video.videoId;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
