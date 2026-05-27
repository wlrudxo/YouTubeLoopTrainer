import { createExportPayload, parseImportPayload } from "../shared/importExport";
import { createEmptyData } from "../shared/data";
import * as storage from "../shared/storage";
import type { ImportMode } from "../shared/types";
import "./settings.css";

const exportButton = document.querySelector<HTMLButtonElement>("#exportButton");
const importFile = document.querySelector<HTMLInputElement>("#importFile");
const libraryButton = document.querySelector<HTMLButtonElement>("#libraryButton");
const clearDataButton = document.querySelector<HTMLButtonElement>("#clearDataButton");
const statusEl = document.querySelector<HTMLDivElement>("#status");

libraryButton?.addEventListener("click", () => {
  window.location.href = chrome.runtime.getURL("library/index.html");
});

exportButton?.addEventListener("click", () => {
  void exportData();
});

importFile?.addEventListener("change", () => {
  void importData();
});

clearDataButton?.addEventListener("click", () => {
  void clearData();
});

async function exportData(): Promise<void> {
  try {
    const data = await storage.readData();
    const payload = createExportPayload(data);
    downloadJson(payload, `phraseloop-${payload.exportedAt.slice(0, 10)}.json`);
    setStatus("Export ready.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Export failed.");
  }
}

async function importData(): Promise<void> {
  const file = importFile?.files?.[0];
  if (!file) return;

  try {
    const imported = parseImportPayload(JSON.parse(await file.text()));
    const mode = getImportMode();

    if (mode === "replace") {
      await storage.replaceData(imported);
      setStatus("Import complete. Data replaced.");
      return;
    }

    const { summary } = await storage.mergeData(imported);
    setStatus(
      `Import complete. Videos: ${summary.videosProcessed}, added: ${summary.loopsAdded}, updated: ${summary.loopsUpdated}, skipped: ${summary.duplicatesSkipped}.`
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Import failed.");
  } finally {
    if (importFile) {
      importFile.value = "";
    }
  }
}

async function clearData(): Promise<void> {
  const confirmed = window.confirm("Delete all saved PhraseLoop data from this browser?");
  if (!confirmed) return;

  try {
    await storage.replaceData(createEmptyData());
    setStatus("All PhraseLoop data deleted.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Delete failed.");
  }
}

function getImportMode(): ImportMode {
  const checked = document.querySelector<HTMLInputElement>("input[name='importMode']:checked");
  return checked?.value === "replace" ? "replace" : "merge";
}

function setStatus(message: string): void {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function downloadJson(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
