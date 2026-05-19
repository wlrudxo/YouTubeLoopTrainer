export function cleanCaptionText(text: string): string {
  return decodeHtmlEntities(text)
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

export function extractSrv3CaptionLines(xml: string, start: number, end: number): string[] {
  const startMs = start * 1000;
  const endMs = end * 1000;
  const lines: string[] = [];
  const textTagPattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;

  while ((match = textTagPattern.exec(xml))) {
    const attrs = match[1] ?? "";
    const text = match[2] ?? "";
    const cueStart = Number(readXmlAttr(attrs, "start")) * 1000;
    const duration = Number(readXmlAttr(attrs, "dur") ?? 0) * 1000;
    const cueEnd = cueStart + duration;

    if (Number.isFinite(cueStart) && cueEnd > startMs && cueStart < endMs) {
      lines.push(text);
    }
  }

  return lines;
}

export function extractVttCaptionLines(vtt: string, start: number, end: number): string[] {
  const blocks = vtt.replace(/\r/g, "").split(/\n{2,}/);
  const lines: string[] = [];

  for (const block of blocks) {
    const blockLines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = blockLines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;

    const [cueStartText, cueEndText] = blockLines[timingIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const cueStart = parseVttTimestamp(cueStartText);
    const cueEnd = parseVttTimestamp(cueEndText);

    if (cueStart === null || cueEnd === null || cueEnd <= start || cueStart >= end) continue;

    lines.push(blockLines.slice(timingIndex + 1).join(" "));
  }

  return lines;
}

function parseVttTimestamp(value: string | undefined): number | null {
  if (!value) return null;

  const parts = value.split(":");
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop() ?? 0);
  const hours = Number(parts.pop() ?? 0);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function readXmlAttr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`${name}="([^"]+)"`));
  return match?.[1] ?? null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)));
}
