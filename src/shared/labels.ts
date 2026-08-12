import { formatRangeLabel } from "./time";

export function resolveLoopLabel(input: string, start: number, end: number): string {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : formatRangeLabel(start, end);
}
