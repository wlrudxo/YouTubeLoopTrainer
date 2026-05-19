import { createExportPayload, mergePhraseLoopData, parseImportPayload, replacePhraseLoopData } from "../shared/importExport";
import * as storage from "../shared/storage";
import type { ImportMode } from "../shared/types";
import "./settings.css";

const exportButton = document.querySelector<HTMLButtonElement>("#exportButton");
const importFile = document.querySelector<HTMLInputElement>("#importFile");
const statusEl = document.querySelector<HTMLDivElement>("#status");

exportButton?.addEventListener("click", () => {
  void exportData();
});

importFile?.addEventListener("change", () => {
  void importData();
});

async function exportData(): Promise<void> {
  try {
    const data = await storage.readData();
    const payload = createExportPayload(data);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `phraseloop-${payload.exportedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
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
      await storage.writeData(replacePhraseLoopData(imported));
      setStatus("Import complete. Data replaced.");
      return;
    }

    const existing = await storage.readData();
    const { data, summary } = mergePhraseLoopData(existing, imported);
    await storage.writeData(data);
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

function getImportMode(): ImportMode {
  const checked = document.querySelector<HTMLInputElement>("input[name='importMode']:checked");
  return checked?.value === "replace" ? "replace" : "merge";
}

function setStatus(message: string): void {
  if (statusEl) {
    statusEl.textContent = message;
  }
}
