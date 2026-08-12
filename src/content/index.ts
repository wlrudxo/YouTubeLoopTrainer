import { createLoopId } from "../shared/ids";
import { resolveLoopLabel } from "../shared/labels";
import * as storage from "../shared/storage";
import { APP_BUILD } from "../shared/constants";
import { getVisibleCaptionText } from "../shared/captions";
import { formatRangeLabel } from "../shared/time";
import type { DraftLoop, Loop, VideoLoops } from "../shared/types";
import { validateDraftMarkers } from "../shared/validation";
import { getCurrentVisibleCaptionLabel } from "./captionLabels";
import { DebugLogger } from "./debug";
import { LoopEngine } from "./loopEngine";
import { PhraseLoopPanel, type PanelState } from "./panel";
import { registerShortcuts } from "./shortcuts";
import { VisibleCaptionCollector } from "./visibleCaptionCollector";
import { importLoopToCompanion, readCompanionConfig } from "../shared/companion";
import {
  ensureCaptionsEnabled,
  getChannelAvatarUrl,
  getChannelTitle,
  findPanelTarget,
  findVideoElement,
  getLiveState,
  getVideoIdFromUrl,
  getVideoTitle,
  getWatchUrl,
  onYouTubeNavigation
} from "./youtube";

type AppState = {
  videoId: string | null;
  draft: DraftLoop;
  message: string;
  collapsed: boolean;
  debugExpanded: boolean;
};

const DRAFT_LOOP_ID = "__phraseloop_draft__";

const state: AppState = {
  videoId: null,
  draft: createEmptyDraft(),
  message: "",
  collapsed: true,
  debugExpanded: false
};

const debug = new DebugLogger(new URL(window.location.href).searchParams.get("pl_debug") === "1");

let panel: PhraseLoopPanel | null = null;
let loopEngine: LoopEngine | null = null;
let unregisterShortcuts: (() => void) | null = null;
let clearNavigationListener: (() => void) | null = null;
let messageTimer: number | null = null;
let labelRefreshToken = 0;
let captionCollector: VisibleCaptionCollector | null = null;
let collectedCaptionLabel = "";

void boot();

async function boot(): Promise<void> {
  debug.subscribe(render);
  debug.log("app", "boot", { build: APP_BUILD });

  loopEngine = new LoopEngine(() => {
    render();
  });
  captionCollector = new VisibleCaptionCollector(debug);

  loadCurrentVideo();
  registerGlobalShortcuts();
  clearNavigationListener = onYouTubeNavigation(() => {
    loadCurrentVideo();
  });
}

function loadCurrentVideo(): void {
  const videoId = getVideoIdFromUrl();
  if (!videoId) {
    resetCurrentVideoState();
    return;
  }

  debug.log("app", "loading video", { videoId, url: window.location.href });
  state.videoId = videoId;
  state.draft = createEmptyDraft();
  collectedCaptionLabel = "";
  captionCollector?.reset();
  state.message = "";
  loopEngine?.stop();
  loopEngine?.setVideo(findVideoElement());

  mountOrRenderPanel();
}

function resetCurrentVideoState(): void {
  state.videoId = null;
  state.draft = createEmptyDraft();
  state.message = "";
  state.debugExpanded = false;
  collectedCaptionLabel = "";
  captionCollector?.reset();
  loopEngine?.stop();
  loopEngine?.setVideo(null);
  panel?.unmount();
}

function mountOrRenderPanel(): void {
  const liveState = getLiveState();
  if (liveState === "unknown") {
    window.setTimeout(mountOrRenderPanel, 500);
    return;
  }
  if (liveState === "live") {
    debug.log("app", "live stream detected, panel disabled");
    panel?.unmount();
    return;
  }

  const target = findPanelTarget();
  if (!target) {
    window.setTimeout(mountOrRenderPanel, 500);
    return;
  }

  if (!panel) {
    panel = new PhraseLoopPanel(toPanelState(), {
      setA,
      setB,
      copyCaption: () => void copyCaption(),
      save: () => void saveDraftLoop(),
      updateDraftRange,
      updateDraftLabel,
      previewDraft: previewDraftLoop,
      toggleDraftLoop,
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
  collectedCaptionLabel = captionCollector?.stop() ?? "";
  const validation = validateDraftMarkers(state.draft.markerA, state.draft.markerB);
  if (!validation.ok) {
    debug.log("collector", "stopped after invalid markerB", validation);
    state.draft.trimContextStart = null;
    state.draft.trimContextEnd = null;
  } else {
    state.draft.trimContextStart = Math.max(0, validation.start - 3);
    state.draft.trimContextEnd = validation.end + 3;
  }
  void refreshDefaultLabel();
  setMessage("");
  render();
}

async function copyCaption(): Promise<void> {
  const caption = getVisibleCaptionText();
  if (!caption) {
    setMessage("No visible caption.");
    render();
    return;
  }

  try {
    await navigator.clipboard.writeText(caption);
    setMessage("Caption copied.", 1400);
  } catch {
    setMessage("Could not copy caption.");
  }
  render();
}

function updateDraftLabel(label: string): void {
  state.draft.label = label;
  state.draft.labelDirty = true;
}

function updateDraftRange(start: number, end: number): void {
  state.draft.markerA = roundToTenth(start);
  state.draft.markerB = roundToTenth(end);
  void refreshDefaultLabel();
  syncActiveDraftLoop();
  render();
}

async function saveDraftLoop(): Promise<void> {
  const videoId = state.videoId;
  if (!videoId) return;

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

  const now = new Date().toISOString();
  const loop: Loop = {
    id: createLoopId(),
    start: validation.start,
    end: validation.end,
    label: resolveLoopLabel(state.draft.label, validation.start, validation.end),
    createdAt: now,
    updatedAt: now
  };

  let video: VideoLoops;
  try {
    video = await storage.addLoop(videoId, getVideoTitle(), getWatchUrl(videoId), loop, getCurrentVideoMetadata());
  } catch (error) {
    setMessage(formatStorageError(error));
    render();
    return;
  }
  debug.log("storage", "saved pending loop", loop);
  state.draft = createEmptyDraft();
  collectedCaptionLabel = "";
  captionCollector?.reset();
  setMessage("Sending to local dictation...");
  render();

  try {
    await importLoopToCompanion(await readCompanionConfig(), video, loop);
    await storage.deleteLoop(videoId, loop.id);
    debug.log("companion", "loop sent and removed from pending queue", { id: loop.id });
    setMessage("Sent. Local MP3 processing started.", 2400);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Could not reach the companion.";
    debug.log("companion", "send failed, loop kept as pending", { id: loop.id, reason });
    setMessage(`Kept as pending. ${reason}`, 4000);
  }
  render();
}

function previewDraftLoop(): void {
  const video = findVideoElement();
  const loop = createDraftPlaybackLoop();
  if (!video || !loop) {
    setMessage("Set a valid loop first.");
    render();
    return;
  }

  loopEngine?.setVideo(video);
  loopEngine?.playOnce(loop);
  setMessage("");
  render();
}

function toggleDraftLoop(): void {
  if (loopEngine?.getActiveLoop()?.id === DRAFT_LOOP_ID) {
    loopEngine.stop();
    render();
    return;
  }

  const video = findVideoElement();
  const loop = createDraftPlaybackLoop();
  if (!video || !loop) {
    setMessage("Set a valid loop first.");
    render();
    return;
  }

  loopEngine?.setVideo(video);
  loopEngine?.start(loop);
  setMessage("");
  render();
}

function syncActiveDraftLoop(): void {
  if (loopEngine?.getActiveLoop()?.id !== DRAFT_LOOP_ID) return;

  const video = findVideoElement();
  const loop = createDraftPlaybackLoop();
  if (!video || !loop) {
    loopEngine.stop();
    return;
  }

  loopEngine.setVideo(video);
  loopEngine.updateActiveLoop(loop);
}

function stopLoop(): void {
  loopEngine?.stop();
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

function render(): void {
  panel?.update(toPanelState());
}

function toPanelState(): PanelState {
  return {
    draft: state.draft,
    message: state.message,
    collapsed: state.collapsed,
    draftLoopActive: loopEngine?.getActiveLoop()?.id === DRAFT_LOOP_ID,
    debugRecords: debug.getRecords(),
    debugExpanded: state.debugExpanded,
    debugEnabled: debug.isEnabled()
  };
}

function createEmptyDraft(): DraftLoop {
  return {
    markerA: null,
    markerB: null,
    trimContextStart: null,
    trimContextEnd: null,
    label: "",
    labelDirty: false
  };
}

function createDraftPlaybackLoop(): Loop | null {
  const validation = validateDraftMarkers(state.draft.markerA, state.draft.markerB);
  if (!validation.ok) return null;

  const now = new Date().toISOString();
  return {
    id: DRAFT_LOOP_ID,
    start: validation.start,
    end: validation.end,
    label: "Draft loop",
    createdAt: now,
    updatedAt: now
  };
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function getCurrentVideoMetadata(): { channelTitle?: string; channelAvatarUrl?: string } {
  return {
    channelTitle: getChannelTitle() || undefined,
    channelAvatarUrl: getChannelAvatarUrl() || undefined
  };
}

function formatStorageError(error: unknown): string {
  return error instanceof Error ? error.message : "PhraseLoop storage failed.";
}

window.addEventListener("pagehide", () => {
  unregisterShortcuts?.();
  clearNavigationListener?.();
  loopEngine?.destroy();
  captionCollector?.reset();
});
