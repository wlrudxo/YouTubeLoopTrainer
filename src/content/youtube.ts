import { LOOP_URL_PARAM } from "../shared/constants";

export function getVideoIdFromUrl(url = window.location.href): string | null {
  const parsed = new URL(url);
  return parsed.searchParams.get("v");
}

export function getLoopIdFromUrl(url = window.location.href): string | null {
  const parsed = new URL(url);
  return parsed.searchParams.get(LOOP_URL_PARAM);
}

export function getWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getVideoTitle(): string {
  const title = document.querySelector<HTMLHeadingElement>("h1.ytd-watch-metadata yt-formatted-string");
  return title?.textContent?.trim() || document.title.replace(/ - YouTube$/, "").trim() || "YouTube video";
}

export function getChannelTitle(): string {
  const selectors = [
    "#owner #channel-name a",
    "ytd-video-owner-renderer #channel-name a",
    "#upload-info #channel-name a",
    "ytd-watch-metadata ytd-channel-name a"
  ];

  for (const selector of selectors) {
    const text = document.querySelector<HTMLElement>(selector)?.textContent?.trim();
    if (text) return text;
  }

  return "";
}

export function getChannelAvatarUrl(): string {
  const selectors = [
    "#owner #avatar img",
    "ytd-video-owner-renderer #avatar img",
    "ytd-watch-metadata #avatar img"
  ];

  for (const selector of selectors) {
    const src = document.querySelector<HTMLImageElement>(selector)?.src;
    if (src) return src;
  }

  return "";
}

export function findVideoElement(): HTMLVideoElement | null {
  return document.querySelector("video");
}

export function ensureCaptionsEnabled(): boolean {
  const button = document.querySelector<HTMLButtonElement>(".ytp-subtitles-button");
  if (!button) return false;

  const pressed = button.getAttribute("aria-pressed");
  const enabled = pressed === "true" || button.classList.contains("ytp-button-active");
  if (enabled) return true;

  button.click();
  return true;
}

export function findPanelTarget(): Element | null {
  return document.querySelector("#secondary") ?? document.querySelector("#below");
}

export function onYouTubeNavigation(callback: () => void): () => void {
  let lastVideoId = getVideoIdFromUrl();
  let timeoutId: number | null = null;

  const schedule = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      const nextVideoId = getVideoIdFromUrl();
      if (nextVideoId !== lastVideoId) {
        lastVideoId = nextVideoId;
        callback();
      }
    }, 250);
  };

  document.addEventListener("yt-navigate-finish", schedule);
  const intervalId = window.setInterval(schedule, 1000);

  return () => {
    document.removeEventListener("yt-navigate-finish", schedule);
    window.clearInterval(intervalId);
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
}
