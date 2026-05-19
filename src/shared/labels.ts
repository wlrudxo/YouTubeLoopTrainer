import { formatRangeLabel } from "./time";

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveLoopLabel(input: string, start: number, end: number): string {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : formatRangeLabel(start, end);
}
