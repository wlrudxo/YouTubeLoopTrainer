import { joinCaptionLines } from "../shared/captions";

const CUE_LOAD_TIMEOUT_MS = 900;
const CUE_LOAD_POLL_MS = 100;

export async function getCaptionLabelForRange(video: HTMLVideoElement, start: number, end: number): Promise<string | null> {
  const track = chooseCaptionTrack(video.textTracks);
  if (!track) return null;

  const previousMode = track.mode;
  if (track.mode === "disabled") {
    track.mode = "hidden";
  }

  const cues = await waitForCues(track);
  if (!cues) {
    track.mode = previousMode;
    return null;
  }

  const lines = Array.from(cues)
    .filter((cue) => cue.endTime >= start && cue.startTime <= end)
    .map(cueToText);

  if (previousMode === "disabled") {
    track.mode = previousMode;
  }

  const label = joinCaptionLines(lines);
  return label || null;
}

function chooseCaptionTrack(textTracks: TextTrackList): TextTrack | null {
  const tracks = Array.from(textTracks).filter((track) => track.kind === "captions" || track.kind === "subtitles");
  if (tracks.length === 0) return null;

  const showing = tracks.find((track) => track.mode === "showing" && isEnglishTrack(track));
  if (showing) return showing;

  const english = tracks.find(isEnglishTrack);
  if (english) return english;

  return tracks.find((track) => track.mode === "showing") ?? tracks[0] ?? null;
}

function isEnglishTrack(track: TextTrack): boolean {
  const language = track.language.toLowerCase();
  const label = track.label.toLowerCase();
  return language.startsWith("en") || label.includes("english") || label.includes("auto-generated");
}

async function waitForCues(track: TextTrack): Promise<TextTrackCueList | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CUE_LOAD_TIMEOUT_MS) {
    if (track.cues && track.cues.length > 0) {
      return track.cues;
    }

    await sleep(CUE_LOAD_POLL_MS);
  }

  return track.cues && track.cues.length > 0 ? track.cues : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cueToText(cue: TextTrackCue): string {
  return "text" in cue && typeof cue.text === "string" ? cue.text : "";
}
