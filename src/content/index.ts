import { ensureVideo } from "../shared/data";
import { createLoopId } from "../shared/ids";
import { resolveLoopLabel } from "../shared/labels";
import * as storage from "../shared/storage";
import { APP_BUILD } from "../shared/constants";
import { formatRangeLabel } from "../shared/time";
import type { DraftLoop, Loop, VideoLoops } from "../shared/types";
import { validateDraftMarkers } from "../shared/validation";
import { getCurrentVisibleCaptionLabel } from "./captionLabels";
import { DebugLogger } from "./debug";
import { LoopEngine } from "./loopEngine";
import { PhraseLoopPanel, type PanelState } from "./panel";
import { registerShortcuts } from "./shortcuts";
import { VisibleCaptionCollector } from "./visibleCaptionCollector";
import {
  ensureCaptionsEnabled,
  getChannelAvatarUrl,
  getChannelTitle,
  findPanelTarget,
  findVideoElement,
  getVideoIdFromUrl,
  getVideoTitle,
  getWatchUrl,
  onYouTubeNavigation
} from "./youtube";

type AppState = {
  videoId: string | null;
  video: VideoLoops | null;
  draft: DraftLoop;
  message: string;
  highlightedLoopId: string | null;
  collapsed: boolean;
  debugExpanded: boolean;
};

const state: AppState = {
  videoId: null,
  video: null,
  draft: createEmptyDraft(),
  message: "",
  highlightedLoopId: null,
  collapsed: true,
  debugExpanded: false
};

const debug = new DebugLogger();

let panel: PhraseLoopPanel | null = null;
let loopEngine: LoopEngine | null = null;
let unregisterShortcuts: (() => void) | null = null;
let clearNavigationListener: (() => void) | null = null;
let highlightTimer: number | null = null;
let messageTimer: number | null = null;
let labelRefreshToken = 0;
let captionCollector: VisibleCaptionCollector | null = null;
let collectedCaptionLabel = "";

void boot();

async function boot(): Promise<void> {
  debug.subscribe(render);
  debug.log("app", "boot", { build: APP_BUILD });

  loopEngine = new LoopEngine((loop) => {
    render({ activeLoopId: loop?.id ?? null });
  });
  captionCollector = new VisibleCaptionCollector(debug);

  await loadCurrentVideo();
  registerGlobalShortcuts();
  clearNavigationListener = onYouTubeNavigation(() => {
    void loadCurrentVideo();
  });
}

async function loadCurrentVideo(): Promise<void> {
  const videoId = getVideoIdFromUrl();
  if (!videoId) return;

  debug.log("app", "loading video", { videoId, url: window.location.href });
  state.videoId = videoId;
  state.draft = createEmptyDraft();
  collectedCaptionLabel = "";
  captionCollector?.reset();
  state.message = "";
  state.highlightedLoopId = null;
  loopEngine?.stop();
  loopEngine?.setVideo(findVideoElement());

  const existing = await storage.getVideo(videoId);
  if (existing) {
    const metadata = getCurrentVideoMetadata();
    state.video = {
      ...existing,
      title: getVideoTitle() || existing.title,
      url: getWatchUrl(videoId) || existing.url,
      channelTitle: metadata.channelTitle || existing.channelTitle,
      channelAvatarUrl: metadata.channelAvatarUrl || existing.channelAvatarUrl
    };
    await storage.upsertVideo(state.video);
    debug.log("storage", "loaded existing video loops", { videoId, loops: existing.loops.length });
  } else {
    const data = await storage.readData();
    state.video = ensureVideo(data, videoId, getVideoTitle(), getWatchUrl(videoId), getCurrentVideoMetadata());
    debug.log("storage", "created in-memory video entry", { videoId });
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
      setCollapsed,
      setDebugExpanded
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
  const video = findVideoElement();
  if (!video) {
    setMessage("Could not find the YouTube video.");
    return;
  }

  loopEngine?.setVideo(video);
  state.draft.markerA = video.currentTime;
  state.draft.markerB = null;
  state.draft.label = "";
  state.draft.labelDirty = false;
  collectedCaptionLabel = "";
  captionCollector?.start();
  debug.log("draft", "set markerA", { currentTime: video.currentTime, resetDraft: true });
  void refreshDefaultLabel();
  setMessage("");
  render();
}

function setB(): void {
  const video = findVideoElement();
  if (!video) {
    setMessage("Could not find the YouTube video.");
    return;
  }

  if (state.draft.markerA === null) {
    setMessage("Set marker A first.");
    debug.log("draft", "ignored markerB without markerA", { currentTime: video.currentTime });
    render();
    return;
  }

  loopEngine?.setVideo(video);
  state.draft.markerB = video.currentTime;
  debug.log("draft", "set markerB", { currentTime: video.currentTime });
  const validation = validateDraftMarkers(state.draft.markerA, state.draft.markerB);
  if (validation.ok) {
    collectedCaptionLabel = captionCollector?.stop() ?? "";
  } else {
    collectedCaptionLabel = "";
    debug.log("collector", "kept running after invalid markerB", validation);
  }
  void refreshDefaultLabel();
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

  if (!state.draft.labelDirty) {
    const saveLabel = getFreshCaptionLabel();
    if (saveLabel) {
      state.draft.label = saveLabel;
      debug.log("label", "applied fresh caption label before save", { captionLabel: saveLabel });
      render();
    }
  }

  const loop: Loop = {
    id: createLoopId(),
    start: validation.start,
    end: validation.end,
    label: resolveLoopLabel(state.draft.label, validation.start, validation.end),
    updatedAt: new Date().toISOString()
  };

  state.video = await storage.addLoop(state.videoId, getVideoTitle(), getWatchUrl(state.videoId), loop, getCurrentVideoMetadata());
  debug.log("storage", "saved loop", loop);
  state.draft = createEmptyDraft();
  collectedCaptionLabel = "";
  captionCollector?.reset();
  state.highlightedLoopId = loop.id;
  setMessage("Loop saved.", 1800);
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
  if (!collapsed) {
    window.setTimeout(() => {
      const ok = ensureCaptionsEnabled();
      debug.log("captions", ok ? "enabled captions on panel expand" : "caption button not found on panel expand");
    }, 0);
  }
  render();
}

function setDebugExpanded(expanded: boolean): void {
  state.debugExpanded = expanded;
  render();
}

async function refreshDefaultLabel(): Promise<void> {
  if (state.draft.labelDirty) {
    debug.log("label", "skip auto label because draft label is dirty");
    return;
  }

  const validation = validateDraftMarkers(state.draft.markerA, state.draft.markerB);
  const token = ++labelRefreshToken;

  if (!validation.ok) {
    state.draft.label = "";
    debug.log("label", "draft markers not valid yet", validation);
    return;
  }

  const fallbackLabel = formatRangeLabel(validation.start, validation.end);
  state.draft.label = fallbackLabel;
  debug.log("label", "set time fallback label", { fallbackLabel, start: validation.start, end: validation.end });
  render();

  const captionLabel = getPreferredCaptionLabel();
  const markersStillMatch =
    state.draft.markerA !== null &&
    state.draft.markerB !== null &&
    state.draft.markerA === validation.start &&
    state.draft.markerB === validation.end;

  if (captionLabel && token === labelRefreshToken && !state.draft.labelDirty && markersStillMatch) {
    state.draft.label = captionLabel;
    debug.log("label", "applied caption label", { captionLabel });
    render();
  } else {
    debug.log("label", "kept fallback label", {
      hasCaptionLabel: Boolean(captionLabel),
      tokenCurrent: token === labelRefreshToken,
      labelDirty: state.draft.labelDirty,
      markersStillMatch
    });
  }
}

function getPreferredCaptionLabel(): string | null {
  if (collectedCaptionLabel) {
    debug.log("label", "using collected caption label", { captionLabel: collectedCaptionLabel });
    return collectedCaptionLabel;
  }

  return getCurrentVisibleCaptionLabel(debug);
}

function getFreshCaptionLabel(): string | null {
  const currentCollected = captionCollector?.stop() ?? "";
  if (currentCollected) {
    collectedCaptionLabel = currentCollected;
  }
  return getPreferredCaptionLabel();
}

function setMessage(message: string, clearAfterMs?: number): void {
  if (messageTimer !== null) {
    window.clearTimeout(messageTimer);
    messageTimer = null;
  }

  state.message = message;

  if (message && clearAfterMs !== undefined) {
    messageTimer = window.setTimeout(() => {
      if (state.message === message) {
        state.message = "";
        render();
      }
      messageTimer = null;
    }, clearAfterMs);
  }
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
    collapsed: state.collapsed,
    debugRecords: debug.getRecords(),
    debugExpanded: state.debugExpanded
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

function getCurrentVideoMetadata(): { channelTitle?: string; channelAvatarUrl?: string } {
  return {
    channelTitle: getChannelTitle() || undefined,
    channelAvatarUrl: getChannelAvatarUrl() || undefined
  };
}

window.addEventListener("pagehide", () => {
  unregisterShortcuts?.();
  clearNavigationListener?.();
  loopEngine?.destroy();
  captionCollector?.reset();
});
