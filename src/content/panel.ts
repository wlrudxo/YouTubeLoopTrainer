import { formatTime } from "../shared/time";
import type { DraftLoop, Loop, VideoLoops } from "../shared/types";
import { validateDraftMarkers } from "../shared/validation";
import type { DebugRecord } from "./debug";

export type PanelState = {
  draft: DraftLoop;
  video: VideoLoops | null;
  activeLoopId: string | null;
  message: string;
  highlightedLoopId: string | null;
  collapsed: boolean;
  debugRecords: DebugRecord[];
  debugExpanded: boolean;
};

export type PanelActions = {
  setA: () => void;
  setB: () => void;
  save: () => void;
  updateDraftLabel: (label: string) => void;
  startLoop: (loop: Loop) => void;
  stopLoop: () => void;
  renameLoop: (loop: Loop, label: string) => void;
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

  update(state: PanelState): void {
    this.state = state;
    this.render();
  }

  isLabelInput(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.classList.contains(LABEL_INPUT_CLASS);
  }

  private render(): void {
    const { draft, video, activeLoopId, message, highlightedLoopId, collapsed, debugRecords, debugExpanded } = this.state;
    const validation = validateDraftMarkers(draft.markerA, draft.markerB);
    const loops = video?.loops ?? [];

    this.root.innerHTML = "";
    this.root.className = `phraseloop-panel${collapsed ? " is-collapsed" : ""}`;

    const header = element("div", "phraseloop-header");
    header.append(element("div", "phraseloop-title", "PhraseLoop"));

    const collapseButton = button(collapsed ? "+" : "-", collapsed ? "Expand" : "Collapse");
    collapseButton.className = "phraseloop-icon-button";
    collapseButton.addEventListener("click", () => this.actions.setCollapsed(!collapsed));
    header.append(collapseButton);
    this.root.append(header);

    if (collapsed) return;

    const markerGrid = element("div", "phraseloop-marker-grid");
    markerGrid.append(this.markerRow("A", draft.markerA, "[", this.actions.setA));
    markerGrid.append(this.markerRow("B", draft.markerB, "]", this.actions.setB));
    this.root.append(markerGrid);

    const labelWrap = element("label", "phraseloop-label-wrap");
    labelWrap.append(element("span", "phraseloop-field-label", "Name"));
    const labelInput = document.createElement("input");
    labelInput.className = LABEL_INPUT_CLASS;
    labelInput.type = "text";
    labelInput.value = draft.label;
    labelInput.placeholder = validation.ok ? "Loop label" : "Set A and B markers";
    labelInput.disabled = !validation.ok;
    labelInput.addEventListener("input", () => this.actions.updateDraftLabel(labelInput.value));
    labelWrap.append(labelInput);
    this.root.append(labelWrap);

    const saveRow = element("div", "phraseloop-save-row");
    const saveButton = button("Save Loop", "Save Loop");
    saveButton.disabled = !validation.ok;
    saveButton.addEventListener("click", this.actions.save);
    saveRow.append(saveButton);
    saveRow.append(element("span", "phraseloop-shortcut", "\\"));
    this.root.append(saveRow);

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

    const debugToggle = button(`Debug (${debugRecords.length})`, "Show caption diagnostics");
    debugToggle.className = "phraseloop-debug-toggle";
    debugToggle.addEventListener("click", () => this.actions.setDebugExpanded(!debugExpanded));
    this.root.append(debugToggle);

    if (debugExpanded) {
      this.root.append(this.renderDebugRecords(debugRecords));
    }
  }

  private markerRow(label: string, value: number | null, shortcut: string, action: () => void): HTMLElement {
    const row = element("div", "phraseloop-marker-row");
    row.append(element("span", "phraseloop-marker-label", label));
    row.append(element("span", "phraseloop-marker-time", value === null ? "--:--.-" : formatTime(value)));
    const setButton = button(`Set ${label}`, `Set ${label}`);
    setButton.addEventListener("click", action);
    row.append(setButton);
    row.append(element("span", "phraseloop-shortcut", shortcut));
    return row;
  }

  private loopRow(loop: Loop, active: boolean, highlighted: boolean): HTMLElement {
    const row = element("div", `phraseloop-loop-row${active ? " is-active" : ""}${highlighted ? " is-highlighted" : ""}`);
    const main = button("", `Play ${loop.label}`);
    main.className = "phraseloop-loop-main";
    main.innerHTML = `<span class="phraseloop-play">&gt;</span><span class="phraseloop-loop-label"></span><span class="phraseloop-loop-time"></span>`;
    main.querySelector(".phraseloop-loop-label")!.textContent = loop.label;
    main.querySelector(".phraseloop-loop-time")!.textContent = `${formatTime(loop.start)} - ${formatTime(loop.end)}`;
    main.addEventListener("click", () => this.actions.startLoop(loop));
    row.append(main);

    const renameButton = button("Rename", `Rename ${loop.label}`);
    renameButton.className = "phraseloop-text-button";
    renameButton.addEventListener("click", () => this.renderRenameRow(row, loop));
    row.append(renameButton);

    const deleteButton = button("x", `Delete ${loop.label}`);
    deleteButton.className = "phraseloop-icon-button";
    deleteButton.addEventListener("click", () => this.actions.deleteLoop(loop));
    row.append(deleteButton);
    return row;
  }

  private renderRenameRow(row: HTMLElement, loop: Loop): void {
    row.innerHTML = "";
    const input = document.createElement("input");
    input.className = "phraseloop-rename-input";
    input.type = "text";
    input.value = loop.label;

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
      if (event.key === "Enter") save();
      if (event.key === "Escape") cancel();
    });
    input.addEventListener("blur", save);
    row.append(input);
    input.focus();
    input.select();
  }

  private renderDebugRecords(records: DebugRecord[]): HTMLElement {
    const wrap = element("div", "phraseloop-debug");

    if (records.length === 0) {
      wrap.append(element("div", "phraseloop-empty", "No debug records yet."));
      return wrap;
    }

    for (const record of records.slice(0, 12)) {
      const item = element("div", "phraseloop-debug-record");
      const summary = element("div", "phraseloop-debug-summary", `${record.time} ${record.area}: ${record.message}`);
      item.append(summary);

      if (record.details !== undefined) {
        const details = element("pre", "phraseloop-debug-details", formatDetails(record.details));
        item.append(details);
      }

      wrap.append(item);
    }

    return wrap;
  }
}

export function getExistingPanel(): HTMLElement | null {
  return document.getElementById(PANEL_ID);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(text: string, title: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = text;
  node.title = title;
  return node;
}

function formatDetails(details: unknown): string {
  if (typeof details === "string") return details;

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}
