export function getVideoIdFromUrl(url = window.location.href): string | null {
  const parsed = new URL(url);
  return parsed.searchParams.get("v");
}

export function getWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getVideoTitle(): string {
  const title = document.querySelector<HTMLHeadingElement>("h1.ytd-watch-metadata yt-formatted-string");
  return title?.textContent?.trim() || document.title.replace(/ - YouTube$/, "").trim() || "YouTube video";
}

export function findVideoElement(): HTMLVideoElement | null {
  return document.querySelector("video");
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
