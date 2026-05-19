import { ensureVideo } from "../shared/data";
import { createLoopId } from "../shared/ids";
import { resolveLoopLabel } from "../shared/labels";
import * as storage from "../shared/storage";
import { formatRangeLabel } from "../shared/time";
import type { DraftLoop, Loop, VideoLoops } from "../shared/types";
import { validateDraftMarkers } from "../shared/validation";
import { LoopEngine } from "./loopEngine";
import { PhraseLoopPanel, type PanelState } from "./panel";
import { registerShortcuts } from "./shortcuts";
import { findPanelTarget, findVideoElement, getVideoIdFromUrl, getVideoTitle, getWatchUrl, onYouTubeNavigation } from "./youtube";

type AppState = {
  videoId: string | null;
  video: VideoLoops | null;
  draft: DraftLoop;
  message: string;
  highlightedLoopId: string | null;
  collapsed: boolean;
};

const state: AppState = {
  videoId: null,
  video: null,
  draft: createEmptyDraft(),
  message: "",
  highlightedLoopId: null,
  collapsed: false
};

let panel: PhraseLoopPanel | null = null;
let loopEngine: LoopEngine | null = null;
let unregisterShortcuts: (() => void) | null = null;
let clearNavigationListener: (() => void) | null = null;
let highlightTimer: number | null = null;

void boot();

async function boot(): Promise<void> {
  loopEngine = new LoopEngine((loop) => {
    render({ activeLoopId: loop?.id ?? null });
  });

  await loadCurrentVideo();
  registerGlobalShortcuts();
  clearNavigationListener = onYouTubeNavigation(() => {
    void loadCurrentVideo();
  });
}

async function loadCurrentVideo(): Promise<void> {
  const videoId = getVideoIdFromUrl();
  if (!videoId) return;

  state.videoId = videoId;
  state.draft = createEmptyDraft();
  state.message = "";
  state.highlightedLoopId = null;
  loopEngine?.stop();
  loopEngine?.setVideo(findVideoElement());

  const existing = await storage.getVideo(videoId);
  if (existing) {
    state.video = existing;
  } else {
    const data = await storage.readData();
    state.video = ensureVideo(data, videoId, getVideoTitle(), getWatchUrl(videoId));
  }

  mountOrRenderPanel();
}

function mountOrRenderPanel(): void {
  const target = findPanelTarget();
  if (!target) {
    window.setTimeout(mountOrRenderPanel, 500);
    return;
  }

  if (!panel) {
    panel = new PhraseLoopPanel(toPanelState(), {
      setA,
      setB,
      save: () => void saveDraftLoop(),
      updateDraftLabel,
      startLoop,
      stopLoop,
      renameLoop: (loop, label) => void renameLoop(loop, label),
      deleteLoop: (loop) => void deleteLoop(loop),
      setCollapsed
    });
  }

  panel.mount(target);
  render();
}

function registerGlobalShortcuts(): void {
  unregisterShortcuts?.();
  unregisterShortcuts = registerShortcuts({
    setA,
    setB,
    save: () => void saveDraftLoop(),
    stop: stopLoop,
    isPhraseLoopLabelInput: (target) => panel?.isLabelInput(target) ?? false
  });
}

function setA(): void {
  setMarker("markerA");
}

function setB(): void {
  setMarker("markerB");
}

function setMarker(key: "markerA" | "markerB"): void {
  const video = findVideoElement();
  if (!video) {
    setMessage("Could not find the YouTube video.");
    return;
  }

  loopEngine?.setVideo(video);
  state.draft[key] = video.currentTime;
  refreshDefaultLabel();
  setMessage("");
  render();
}

function updateDraftLabel(label: string): void {
  state.draft.label = label;
  state.draft.labelDirty = true;
}

async function saveDraftLoop(): Promise<void> {
  if (!state.videoId) return;

  const validation = validateDraftMarkers(state.draft.markerA, state.draft.markerB);
  if (!validation.ok) {
    setMessage(validation.message);
    render();
    return;
  }

  const loop: Loop = {
    id: createLoopId(),
    start: validation.start,
    end: validation.end,
    label: resolveLoopLabel(state.draft.label, validation.start, validation.end),
    updatedAt: new Date().toISOString()
  };

  state.video = await storage.addLoop(state.videoId, getVideoTitle(), getWatchUrl(state.videoId), loop);
  state.draft = createEmptyDraft();
  state.highlightedLoopId = loop.id;
  setMessage("Loop saved.");
  scheduleHighlightClear();
  render();
}

function startLoop(loop: Loop): void {
  const video = findVideoElement();
  if (!video) {
    setMessage("Could not find the YouTube video.");
    render();
    return;
  }

  loopEngine?.setVideo(video);
  loopEngine?.start(loop);
  setMessage("");
}

function stopLoop(): void {
  loopEngine?.stop();
}

async function renameLoop(loop: Loop, nextLabel: string): Promise<void> {
  if (!state.videoId) return;

  const label = nextLabel.trim() || loop.label;
  state.video = await storage.renameLoop(state.videoId, loop.id, label, new Date().toISOString());
  render();
}

async function deleteLoop(loop: Loop): Promise<void> {
  if (!state.videoId) return;

  if (!window.confirm(`Delete "${loop.label}"?`)) return;

  if (loopEngine?.getActiveLoop()?.id === loop.id) {
    loopEngine.stop();
  }

  state.video = await storage.deleteLoop(state.videoId, loop.id);
  render();
}

function setCollapsed(collapsed: boolean): void {
  state.collapsed = collapsed;
  render();
}

function refreshDefaultLabel(): void {
  if (state.draft.labelDirty) return;

  const validation = validateDraftMarkers(state.draft.markerA, state.draft.markerB);
  state.draft.label = validation.ok ? formatRangeLabel(validation.start, validation.end) : "";
}

function setMessage(message: string): void {
  state.message = message;
}

function scheduleHighlightClear(): void {
  if (highlightTimer !== null) {
    window.clearTimeout(highlightTimer);
  }

  highlightTimer = window.setTimeout(() => {
    state.highlightedLoopId = null;
    render();
  }, 1800);
}

function render(overrides: Partial<Pick<PanelState, "activeLoopId">> = {}): void {
  panel?.update({ ...toPanelState(), ...overrides });
}

function toPanelState(): PanelState {
  return {
    draft: state.draft,
    video: state.video,
    activeLoopId: loopEngine?.getActiveLoop()?.id ?? null,
    message: state.message,
    highlightedLoopId: state.highlightedLoopId,
    collapsed: state.collapsed
  };
}

function createEmptyDraft(): DraftLoop {
  return {
    markerA: null,
    markerB: null,
    label: "",
    labelDirty: false
  };
}

window.addEventListener("pagehide", () => {
  unregisterShortcuts?.();
  clearNavigationListener?.();
  loopEngine?.destroy();
});
