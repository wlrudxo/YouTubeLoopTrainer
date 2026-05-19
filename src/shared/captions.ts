export function cleanCaptionText(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function joinCaptionLines(lines: string[]): string {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const line of lines) {
    const text = cleanCaptionText(line);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;

    seen.add(key);
    cleaned.push(text);
  }

  return cleaned.join(" ");
}

export type Json3CaptionEvent = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
};

export function extractJson3CaptionLines(events: Json3CaptionEvent[], start: number, end: number): string[] {
  const startMs = start * 1000;
  const endMs = end * 1000;

  return events
    .filter((event) => {
      if (typeof event.tStartMs !== "number") return false;
      const duration = typeof event.dDurationMs === "number" ? event.dDurationMs : 0;
      const eventEnd = event.tStartMs + duration;
      return eventEnd > startMs && event.tStartMs < endMs;
    })
    .map((event) => event.segs?.map((segment) => segment.utf8 ?? "").join("") ?? "");
}
