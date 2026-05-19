import { getVisibleCaptionText, joinCaptionSamples } from "../shared/captions";
import type { DebugLogger } from "./debug";

const COLLECT_INTERVAL_MS = 180;

export class VisibleCaptionCollector {
  private intervalId: number | null = null;
  private samples: string[] = [];
  private debug?: DebugLogger;

  constructor(debug?: DebugLogger) {
    this.debug = debug;
  }

  start(): void {
    this.reset();
    this.collect();
    this.intervalId = window.setInterval(() => this.collect(), COLLECT_INTERVAL_MS);
    this.debug?.log("collector", "started");
  }

  stop(): string {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.collect();
    const label = joinCaptionSamples(this.samples);
    this.debug?.log("collector", "stopped", {
      sampleCount: this.samples.length,
      label
    });
    return label;
  }

  reset(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.samples = [];
  }

  private collect(): void {
    const text = getVisibleCaptionText();
    if (text) {
      this.samples.push(text);
    }
  }
}
