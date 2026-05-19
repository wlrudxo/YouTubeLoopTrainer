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

export function getVisibleCaptionText(root: ParentNode = document): string {
  const segments = Array.from(root.querySelectorAll<HTMLElement>(".ytp-caption-segment"));
  return joinCaptionLines(segments.map((segment) => segment.textContent ?? ""));
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
