import { getVisibleCaptionText } from "../shared/captions";
import type { DebugLogger } from "./debug";

export function getCurrentVisibleCaptionLabel(debug?: DebugLogger): string | null {
  const segmentCount = document.querySelectorAll(".ytp-caption-segment").length;
  const label = getVisibleCaptionText();

  debug?.log("captions", "visible caption DOM lookup", {
    segmentCount,
    label
  });

  return label || null;
}
