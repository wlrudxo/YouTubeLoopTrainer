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
