export function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const totalTenths = Math.floor(safeSeconds * 10);
  const tenths = totalTenths % 10;
  const totalWholeSeconds = Math.floor(totalTenths / 10);
  const wholeSeconds = totalWholeSeconds % 60;
  const totalMinutes = Math.floor(totalWholeSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(wholeSeconds)}.${tenths}`;
  }

  return `${pad2(minutes)}:${pad2(wholeSeconds)}.${tenths}`;
}

export function formatRangeLabel(start: number, end: number): string {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
