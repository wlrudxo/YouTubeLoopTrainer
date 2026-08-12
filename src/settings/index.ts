import { pairCompanion, readCompanionConfig, writeCompanionConfig } from "../shared/companion";
import "./settings.css";

const statusEl = document.querySelector<HTMLDivElement>("#status");
const companionUrl = document.querySelector<HTMLInputElement>("#companionUrl");
const companionToken = document.querySelector<HTMLInputElement>("#companionToken");
const saveCompanionButton = document.querySelector<HTMLButtonElement>("#saveCompanionButton");
const openCompanionButton = document.querySelector<HTMLButtonElement>("#openCompanionButton");

void loadCompanionConfig();

saveCompanionButton?.addEventListener("click", () => void saveAndPairCompanion());
openCompanionButton?.addEventListener("click", () => void openCompanion());

async function loadCompanionConfig(): Promise<void> {
  try {
    const config = await readCompanionConfig();
    if (companionUrl) companionUrl.value = config.url;
    if (companionToken) companionToken.value = config.token;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not load companion settings.");
  }
}

async function saveAndPairCompanion(): Promise<void> {
  try {
    const config = await writeCompanionConfig({ url: companionUrl?.value ?? "", token: companionToken?.value ?? "" });
    await pairCompanion(config);
    setStatus("Companion connected. You can now send loops from YouTube.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Companion connection failed.");
  }
}

async function openCompanion(): Promise<void> {
  try {
    const config = await readCompanionConfig();
    await chrome.tabs.create({ url: config.url });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not open companion.");
  }
}

function setStatus(message: string): void {
  if (statusEl) {
    statusEl.textContent = message;
  }
}
