import * as storage from "../shared/storage";
import type { PhraseLoopData } from "../shared/types";

type StorageMessage = {
  type: "phraseloop:storage";
  operation: string;
  args: unknown[];
};

let storageQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isStorageMessage(message)) return false;

  storageQueue = storageQueue
    .then(() => handleStorageMessage(message))
    .then(
      (value) => {
        sendResponse({ ok: true, value });
      },
      (error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "PhraseLoop storage failed."
        });
      }
    );

  return true;
});

async function handleStorageMessage(message: StorageMessage): Promise<unknown> {
  const args = message.args;

  switch (message.operation) {
    case "writeData":
      return storage.writeData(args[0] as PhraseLoopData);
    case "upsertVideo":
      return storage.upsertVideo(args[0] as Parameters<typeof storage.upsertVideo>[0]);
    case "addLoop":
      return storage.addLoop(...(args as Parameters<typeof storage.addLoop>));
    case "renameLoop":
      return storage.renameLoop(...(args as Parameters<typeof storage.renameLoop>));
    case "setLoopStatus":
      return storage.setLoopStatus(...(args as Parameters<typeof storage.setLoopStatus>));
    case "deleteVideo":
      return storage.deleteVideo(...(args as Parameters<typeof storage.deleteVideo>));
    case "saveProgress":
      return storage.saveProgress(...(args as Parameters<typeof storage.saveProgress>));
    case "deleteLoop":
      return storage.deleteLoop(...(args as Parameters<typeof storage.deleteLoop>));
    case "mergeData":
      return storage.mergeData(args[0] as PhraseLoopData);
    case "replaceData":
      return storage.replaceData(args[0] as PhraseLoopData);
    default:
      throw new Error(`Unknown storage operation: ${message.operation}`);
  }
}

function isStorageMessage(message: unknown): message is StorageMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as StorageMessage).type === "phraseloop:storage" &&
    typeof (message as StorageMessage).operation === "string" &&
    Array.isArray((message as StorageMessage).args)
  );
}
