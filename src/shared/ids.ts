export function createLoopId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `lp_${crypto.randomUUID()}`;
  }

  return `lp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
