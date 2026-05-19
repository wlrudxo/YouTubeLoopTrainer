import type { Loop } from "../shared/types";

const LOOP_TICK_MS = 100;

export class LoopEngine {
  private activeLoop: Loop | null = null;
  private video: HTMLVideoElement | null = null;
  private intervalId: number | null = null;
  private onActiveLoopChange: (loop: Loop | null) => void;

  constructor(onActiveLoopChange: (loop: Loop | null) => void) {
    this.onActiveLoopChange = onActiveLoopChange;
  }

  setVideo(video: HTMLVideoElement | null): void {
    this.video = video;
  }

  getActiveLoop(): Loop | null {
    return this.activeLoop;
  }

  start(loop: Loop): void {
    if (!this.video) return;

    this.activeLoop = loop;
    this.video.currentTime = loop.start;
    void this.video.play();
    this.ensureInterval();
    this.onActiveLoopChange(loop);
  }

  stop(): void {
    this.activeLoop = null;
    this.onActiveLoopChange(null);
  }

  destroy(): void {
    this.stop();
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private ensureInterval(): void {
    if (this.intervalId !== null) return;

    this.intervalId = window.setInterval(() => {
      if (!this.activeLoop || !this.video) return;

      if (this.video.currentTime >= this.activeLoop.end) {
        this.video.currentTime = this.activeLoop.start;
        void this.video.play();
      }
    }, LOOP_TICK_MS);
  }
}
