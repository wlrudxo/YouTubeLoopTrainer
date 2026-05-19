export function cleanCaptionText(text: string): string {
  return decodeHtmlEntities(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/(?:영어|한국어|일본어|중국어)?\s*\([^)]*자동 생성됨\)\s*설정을 확인하려면\s*.*?클릭하세요\.?/g, " ")
    .replace(/[A-Za-z]+\s+\([^)]*auto-generated[^)]*\)\s+.*?click.*?settings\.?/gi, " ")
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

export function joinCaptionSamples(samples: string[]): string {
  let merged = "";

  for (const sample of samples) {
    const text = cleanCaptionText(sample);
    if (!text) continue;

    merged = appendWithWordOverlap(merged, text);
  }

  return merged;
}

export function getVisibleCaptionText(root: ParentNode = document): string {
  const segments = Array.from(root.querySelectorAll<HTMLElement>(".ytp-caption-segment"));
  return joinCaptionLines(segments.map((segment) => segment.textContent ?? ""));
}

function appendWithWordOverlap(base: string, next: string): string {
  if (!base) return next;
  if (base === next || base.endsWith(next)) return base;
  if (next.startsWith(base)) return next;

  const baseWords = base.split(" ");
  const nextWords = next.split(" ");
  const maxOverlap = Math.min(baseWords.length, nextWords.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const baseTail = baseWords.slice(-overlap).join(" ").toLowerCase();
    const nextHead = nextWords.slice(0, overlap).join(" ").toLowerCase();

    if (baseTail === nextHead) {
      return [...baseWords, ...nextWords.slice(overlap)].join(" ");
    }
  }

  return `${base} ${next}`;
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
