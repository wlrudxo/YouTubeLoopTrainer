export type DebugRecord = {
  time: string;
  area: string;
  message: string;
  details?: unknown;
};

const MAX_RECORDS = 120;

export class DebugLogger {
  private records: DebugRecord[] = [];
  private listeners = new Set<() => void>();
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  log(area: string, message: string, details?: unknown): void {
    if (!this.enabled) return;

    const record: DebugRecord = {
      time: new Date().toLocaleTimeString(),
      area,
      message,
      details
    };

    this.records = [record, ...this.records].slice(0, MAX_RECORDS);
    console.info("[PhraseLoop]", area, message, details ?? "");
    this.emit();
  }

  getRecords(): DebugRecord[] {
    return this.records;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
