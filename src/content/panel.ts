import { APP_BUILD } from "../shared/constants";
import { formatTime } from "../shared/time";
import type { DraftLoop, Loop, LoopStatus, VideoLoops } from "../shared/types";
import { validateDraftMarkers } from "../shared/validation";
import type { DebugRecord } from "./debug";

export type PanelState = {
  draft: DraftLoop;
  video: VideoLoops | null;
  activeLoopId: string | null;
  message: string;
  highlightedLoopId: string | null;
  collapsed: boolean;
  draftLoopActive: boolean;
  debugRecords: DebugRecord[];
  debugExpanded: boolean;
  debugEnabled: boolean;
};

export type PanelActions = {
  setA: () => void;
  setB: () => void;
  copyCaption: () => void;
  save: () => void;
  saveProgress: () => void;
  goProgress: () => void;
  updateDraftRange: (start: number, end: number) => void;
  updateDraftLabel: (label: string) => void;
  previewDraft: () => void;
  toggleDraftLoop: () => void;
  startLoop: (loop: Loop) => void;
  stopLoop: () => void;
  renameLoop: (loop: Loop, label: string) => void;
  setLoopStatus: (loop: Loop, status: LoopStatus) => void;
  deleteLoop: (loop: Loop) => void;
  setCollapsed: (collapsed: boolean) => void;
  setDebugExpanded: (expanded: boolean) => void;
};

const PANEL_ID = "phraseloop-panel";
const LABEL_INPUT_CLASS = "phraseloop-label-input";

export class PhraseLoopPanel {
  private root: HTMLDivElement;
  private state: PanelState;
  private actions: PanelActions;
  private trimDrag:
    | {
        kind: "start" | "end";
        start: number;
        end: number;
        contextStart: number;
        contextEnd: number;
        rect: DOMRect;
        track: HTMLElement;
        selected: HTMLElement;
        startHandle: HTMLElement;
        endHandle: HTMLElement;
      }
    | null = null;

  constructor(state: PanelState, actions: PanelActions) {
    this.root = document.createElement("div");
    this.root.id = PANEL_ID;
    this.root.className = "phraseloop-panel";
    this.state = state;
    this.actions = actions;
  }

  mount(target: Element): void {
    if (!this.root.isConnected) {
      target.prepend(this.root);
    }
    this.render();
  }

  unmount(): void {
    this.root.remove();
  }

  update(state: PanelState): void {
    this.state = state;
    this.render();
  }

  isLabelInput(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.classList.contains(LABEL_INPUT_CLASS);
  }

  private render(): void {
    const { draft, video, activeLoopId, message, highlightedLoopId, collapsed, draftLoopActive, debugRecords, debugExpanded, debugEnabled } = this.state;
    const validation = validateDraftMarkers(draft.markerA, draft.markerB);
    const loops = video?.loops ?? [];

    this.root.innerHTML = "";
    this.root.className = `phraseloop-panel${collapsed ? " is-collapsed" : ""}`;

    const header = element("div", "phraseloop-header");
    header.append(element("div", "phraseloop-title", `PhraseLoop ${APP_BUILD}`));

    const headerActions = element("div", "phraseloop-header-actions");
    const copyCaptionButton = button("CC", "Copy visible caption");
    copyCaptionButton.className = "phraseloop-icon-button";
    copyCaptionButton.setAttribute("aria-label", "Copy visible caption");
    copyCaptionButton.addEventListener("click", this.actions.copyCaption);
    headerActions.append(copyCaptionButton);

    if (video?.progress) {
      const progressTime = element("span", "phraseloop-progress-time", formatTime(video.progress.time));
      progressTime.title = `Saved at ${formatMinute(video.progress.updatedAt)}`;
      headerActions.append(progressTime);
    }

    const saveProgressButton = button("💾", "Save progress");
    saveProgressButton.className = "phraseloop-icon-button";
    saveProgressButton.setAttribute("aria-label", "Save progress");
    saveProgressButton.addEventListener("click", this.actions.saveProgress);
    headerActions.append(saveProgressButton);

    const goProgressButton = button("↪", "Go to saved progress");
    goProgressButton.className = "phraseloop-icon-button";
    goProgressButton.disabled = !video?.progress;
    goProgressButton.setAttribute("aria-label", "Go to saved progress");
    goProgressButton.addEventListener("click", this.actions.goProgress);
    headerActions.append(goProgressButton);

    const collapseButton = button(collapsed ? "+" : "-", collapsed ? "Expand" : "Collapse");
    collapseButton.className = "phraseloop-icon-button";
    collapseButton.addEventListener("click", () => this.actions.setCollapsed(!collapsed));
    headerActions.append(collapseButton);
    header.append(headerActions);
    this.root.append(header);

    if (collapsed) return;

    const markerRow = element("div", "phraseloop-marker-row");
    markerRow.append(this.markerButton("A", draft.markerA, this.actions.setA));
    markerRow.append(this.markerButton("B", draft.markerB, this.actions.setB));
    this.root.append(markerRow);

    if (validation.ok) {
      this.root.append(this.renderTrimEditor(validation.start, validation.end, draft.trimContextStart, draft.trimContextEnd, draftLoopActive));
    }

    const labelWrap = element("label", "phraseloop-label-wrap");
    const labelRow = element("div", "phraseloop-label-row");
    const labelInput = document.createElement("textarea");
    labelInput.className = LABEL_INPUT_CLASS;
    labelInput.value = draft.label;
    labelInput.rows = 3;
    labelInput.placeholder = validation.ok ? "Loop label" : "Set A and B markers";
    labelInput.disabled = !validation.ok;
    labelInput.addEventListener("input", () => this.actions.updateDraftLabel(labelInput.value));
    labelRow.append(labelInput);

    const saveButton = button("✓", "Save Loop");
    saveButton.className = "phraseloop-icon-button";
    saveButton.disabled = !validation.ok;
    saveButton.setAttribute("aria-label", "Save Loop");
    saveButton.addEventListener("click", this.actions.save);
    labelRow.append(saveButton);

    labelWrap.append(labelRow);
    this.root.append(labelWrap);

    const messageText = message || (!validation.ok && (draft.markerA !== null || draft.markerB !== null) ? validation.message : "");
    if (messageText) {
      this.root.append(element("div", "phraseloop-message", messageText));
    }

    const listHeader = element("div", "phraseloop-list-header");
    listHeader.append(element("span", "", "Saved Loops"));
    if (activeLoopId) {
      const stopButton = button("Stop", "Stop Loop");
      stopButton.className = "phraseloop-stop-button";
      stopButton.addEventListener("click", this.actions.stopLoop);
      listHeader.append(stopButton);
    }
    this.root.append(listHeader);

    const list = element("div", "phraseloop-list");
    if (loops.length === 0) {
      list.append(element("div", "phraseloop-empty", "No saved loops yet."));
    } else {
      for (const loop of loops) {
        list.append(this.loopRow(loop, activeLoopId === loop.id, highlightedLoopId === loop.id));
      }
    }
    this.root.append(list);

    if (debugEnabled) {
      const debugToggle = button(`Debug (${debugRecords.length})`, "Show caption diagnostics");
      debugToggle.className = "phraseloop-debug-toggle";
      debugToggle.addEventListener("click", () => this.actions.setDebugExpanded(!debugExpanded));
      this.root.append(debugToggle);

      if (debugExpanded) {
        this.root.append(this.renderDebugRecords(debugRecords));
      }
    }
  }

  private markerButton(label: string, value: number | null, action: () => void): HTMLElement {
    const setButton = button(`${label} ${value === null ? "--:--.-" : formatTime(value)}`, `Set ${label}`);
    setButton.className = "phraseloop-marker-button";
    setButton.addEventListener("click", action);
    return setButton;
  }

  private renderTrimEditor(
    start: number,
    end: number,
    trimContextStart: number | null,
    trimContextEnd: number | null,
    draftLoopActive: boolean
  ): HTMLElement {
    const contextStart = trimContextStart ?? Math.max(0, start - 3);
    const contextEnd = trimContextEnd ?? end + 3;
    const total = Math.max(1, contextEnd - contextStart);
    const startPercent = ((start - contextStart) / total) * 100;
    const endPercent = ((end - contextStart) / total) * 100;
    const duration = Math.max(0, end - start);

    const wrap = element("div", "phraseloop-trim");
    const meta = element("div", "phraseloop-trim-meta");
    meta.append(
      element("span", "", `A ${formatTime(start)}`),
      element("span", "", `${duration.toFixed(1)}s`),
      element("span", "", `B ${formatTime(end)}`)
    );

    const track = element("div", "phraseloop-trim-track");
    const selected = element("div", "phraseloop-trim-selected");
    selected.style.left = `${startPercent}%`;
    selected.style.width = `${endPercent - startPercent}%`;
    track.append(selected);

    const startHandle = this.trimHandle("start", startPercent, start, end, contextStart, contextEnd);
    const endHandle = this.trimHandle("end", endPercent, start, end, contextStart, contextEnd);
    track.append(startHandle, endHandle);
    track.addEventListener("pointerdown", (event) => {
      if (event.target === startHandle || event.target === endHandle) return;

      const rect = track.getBoundingClientRect();
      const next = valueFromClientX(event.clientX, rect, contextStart, contextEnd);
      const kind = Math.abs(next - start) <= Math.abs(next - end) ? "start" : "end";
      this.beginTrimDrag(kind, event, start, end, contextStart, contextEnd, track, selected, startHandle, endHandle);
    });

    const context = element("div", "phraseloop-trim-context");
    context.append(element("span", "", formatSignedSeconds(contextStart - start)), element("span", "", formatSignedSeconds(contextEnd - end)));

    const actions = element("div", "phraseloop-trim-actions");
    const previewButton = button("Preview", "Preview adjusted loop once");
    previewButton.className = "phraseloop-text-button";
    previewButton.addEventListener("click", this.actions.previewDraft);

    const loopButton = button(draftLoopActive ? "Stop" : "Loop", draftLoopActive ? "Stop draft loop" : "Repeat adjusted loop");
    loopButton.className = `phraseloop-text-button${draftLoopActive ? " is-active" : ""}`;
    loopButton.addEventListener("click", this.actions.toggleDraftLoop);
    actions.append(previewButton, loopButton);

    wrap.append(meta, track, context, actions);
    return wrap;
  }

  private trimHandle(
    kind: "start" | "end",
    percent: number,
    start: number,
    end: number,
    contextStart: number,
    contextEnd: number
  ): HTMLButtonElement {
    const handle = button("", kind === "start" ? "Adjust start" : "Adjust end");
    handle.className = `phraseloop-trim-handle is-${kind}`;
    handle.style.left = `${percent}%`;
    handle.setAttribute("aria-label", kind === "start" ? "Adjust start time" : "Adjust end time");

    handle.addEventListener("pointerdown", (event) => {
      const track = handle.parentElement;
      const selected = track?.querySelector<HTMLElement>(".phraseloop-trim-selected");
      const startHandle = track?.querySelector<HTMLElement>(".phraseloop-trim-handle.is-start");
      const endHandle = track?.querySelector<HTMLElement>(".phraseloop-trim-handle.is-end");
      if (!track || !selected || !startHandle || !endHandle) return;

      this.beginTrimDrag(kind, event, start, end, contextStart, contextEnd, track, selected, startHandle, endHandle);
    });
    handle.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 1 : 0.1;
      const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (!direction) return;

      event.preventDefault();
      if (kind === "start") {
        this.actions.updateDraftRange(clamp(start + direction * step, contextStart, end - 1), end);
      } else {
        this.actions.updateDraftRange(start, clamp(end + direction * step, start + 1, contextEnd));
      }
    });

    return handle;
  }

  private beginTrimDrag(
    kind: "start" | "end",
    event: PointerEvent,
    start: number,
    end: number,
    contextStart: number,
    contextEnd: number,
    track: HTMLElement,
    selected: HTMLElement,
    startHandle: HTMLElement,
    endHandle: HTMLElement
  ): void {
    event.preventDefault();
    track.setPointerCapture(event.pointerId);
    this.trimDrag = {
      kind,
      start,
      end,
      contextStart,
      contextEnd,
      rect: track.getBoundingClientRect(),
      track,
      selected,
      startHandle,
      endHandle
    };

    const move = (moveEvent: PointerEvent) => {
      if (!this.trimDrag || moveEvent.pointerId !== event.pointerId) return;
      this.updateTrimDrag(moveEvent.clientX);
    };
    const endDrag = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== event.pointerId) return;

      track.removeEventListener("pointermove", move);
      track.removeEventListener("pointerup", endDrag);
      track.removeEventListener("pointercancel", endDrag);
      if (track.hasPointerCapture(event.pointerId)) {
        track.releasePointerCapture(event.pointerId);
      }

      const drag = this.trimDrag;
      this.trimDrag = null;
      if (drag) {
        this.actions.updateDraftRange(drag.start, drag.end);
      }
    };

    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
    this.updateTrimDrag(event.clientX);
  }

  private updateTrimDrag(clientX: number): void {
    if (!this.trimDrag) return;

    const drag = this.trimDrag;
    const next = valueFromClientX(clientX, drag.rect, drag.contextStart, drag.contextEnd);
    if (drag.kind === "start") {
      drag.start = roundToTenth(clamp(next, drag.contextStart, drag.end - 1));
    } else {
      drag.end = roundToTenth(clamp(next, drag.start + 1, drag.contextEnd));
    }

    const total = Math.max(1, drag.contextEnd - drag.contextStart);
    const startPercent = ((drag.start - drag.contextStart) / total) * 100;
    const endPercent = ((drag.end - drag.contextStart) / total) * 100;
    drag.selected.style.left = `${startPercent}%`;
    drag.selected.style.width = `${endPercent - startPercent}%`;
    drag.startHandle.style.left = `${startPercent}%`;
    drag.endHandle.style.left = `${endPercent}%`;
  }

  private loopRow(loop: Loop, active: boolean, highlighted: boolean): HTMLElement {
    const row = element("div", `phraseloop-loop-row${active ? " is-active" : ""}${highlighted ? " is-highlighted" : ""}`);
    const main = button("", `Play ${loop.label}`);
    main.className = "phraseloop-loop-main";
    main.innerHTML = `<span class="phraseloop-loop-label"></span><span class="phraseloop-loop-time"></span>`;
    main.querySelector(".phraseloop-loop-label")!.textContent = loop.label;
    main.querySelector(".phraseloop-loop-time")!.textContent =
      `${formatTime(loop.start)} - ${formatTime(loop.end)} · ${formatMinute(loop.createdAt)}`;
    main.addEventListener("click", () => this.actions.startLoop(loop));
    row.append(main);

    const actions = element("div", "phraseloop-loop-actions");
    const iconRow = element("div", "phraseloop-loop-icon-row");

    const renameButton = button("✎", `Rename ${loop.label}`);
    renameButton.className = "phraseloop-icon-button";
    renameButton.setAttribute("aria-label", `Rename ${loop.label}`);
    renameButton.addEventListener("click", () => this.renderRenameRow(row, loop));
    iconRow.append(renameButton);

    const deleteButton = button("x", `Delete ${loop.label}`);
    deleteButton.className = "phraseloop-icon-button";
    deleteButton.addEventListener("click", () => this.actions.deleteLoop(loop));
    iconRow.append(deleteButton);

    const status = getLoopStatus(loop);
    const statusButton = button(formatLoopStatus(status), `Mark ${loop.label} as ${formatLoopStatus(nextLoopStatus(status))}`);
    statusButton.className = `phraseloop-status-button is-${status}`;
    statusButton.setAttribute("aria-label", `Loop status: ${formatLoopStatus(status)}`);
    statusButton.addEventListener("click", () => this.actions.setLoopStatus(loop, nextLoopStatus(status)));
    actions.append(iconRow, statusButton);
    row.append(actions);
    return row;
  }

  private renderRenameRow(row: HTMLElement, loop: Loop): void {
    row.innerHTML = "";
    const input = document.createElement("textarea");
    input.className = "phraseloop-rename-input";
    input.value = loop.label;
    input.rows = 3;

    let done = false;
    const save = () => {
      if (done) return;
      done = true;
      this.actions.renameLoop(loop, input.value);
    };
    const cancel = () => {
      if (done) return;
      done = true;
      this.render();
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        save();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", save);
    row.append(input);
    input.focus();
    input.select();
  }

  private renderDebugRecords(records: DebugRecord[]): HTMLElement {
    const outer = element("div", "phraseloop-debug-wrap");

    const tools = element("div", "phraseloop-debug-tools");
    const count = element("span", "phraseloop-debug-count", `Showing ${records.length} records`);
    const copyButton = button("Copy Debug", "Copy all debug records");
    copyButton.className = "phraseloop-text-button";
    copyButton.addEventListener("click", () => {
      void copyDebugRecords(records);
    });
    tools.append(count, copyButton);
    outer.append(tools);

    const wrap = element("div", "phraseloop-debug");

    if (records.length === 0) {
      wrap.append(element("div", "phraseloop-empty", "No debug records yet."));
      outer.append(wrap);
      return outer;
    }

    for (const record of records) {
      const item = element("div", "phraseloop-debug-record");
      const summary = element("div", "phraseloop-debug-summary", `${record.time} ${record.area}: ${record.message}`);
      item.append(summary);

      if (record.details !== undefined) {
        const details = element("pre", "phraseloop-debug-details", formatDetails(record.details));
        item.append(details);
      }

      wrap.append(item);
    }

    outer.append(wrap);
    return outer;
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
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

function button(text: string, title: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = text;
  node.title = title;
  return node;
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

function formatDetails(details: unknown): string {
  if (typeof details === "string") return details;

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function valueFromClientX(clientX: number, rect: DOMRect, contextStart: number, contextEnd: number): number {
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
  return contextStart + ratio * (contextEnd - contextStart);
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSignedSeconds(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}s`;
}

async function copyDebugRecords(records: DebugRecord[]): Promise<void> {
  const text = records
    .map((record) => {
      const details = record.details === undefined ? "" : `\n${formatDetails(record.details)}`;
      return `${record.time} ${record.area}: ${record.message}${details}`;
    })
    .join("\n\n");

  await navigator.clipboard.writeText(text);
}
