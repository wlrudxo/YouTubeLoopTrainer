import { MIN_LOOP_SECONDS } from "./constants";
import type { ValidatedLoopDraft } from "./types";

export function validateDraftMarkers(markerA: number | null, markerB: number | null): ValidatedLoopDraft {
  if (markerA === null) {
    return { ok: false, error: "missing-a", message: "Set marker A first." };
  }

  if (markerB === null) {
    return { ok: false, error: "missing-b", message: "Set marker B first." };
  }

  const start = markerA;
  const end = markerB;

  if (start >= end) {
    return { ok: false, error: "invalid-order", message: "Set marker B after marker A." };
  }

  if (end - start < MIN_LOOP_SECONDS) {
    return { ok: false, error: "too-short", message: "Loop must be at least 1.0 second long." };
  }

  return { ok: true, start, end };
}
