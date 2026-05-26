import type { Loop } from "../shared/types";

const LOOP_TICK_MS = 100;

export class LoopEngine {
  private activeLoop: Loop | null = null;
  private previewLoop: Loop | null = null;
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

  updateActiveLoop(loop: Loop): void {
    if (!this.activeLoop || this.activeLoop.id !== loop.id) return;

    this.activeLoop = loop;
  }

  start(loop: Loop): void {
    if (!this.video) return;

    this.previewLoop = null;
    this.activeLoop = loop;
    this.video.currentTime = loop.start;
    void this.video.play();
    this.ensureInterval();
    this.onActiveLoopChange(loop);
  }

  stop(): void {
    this.activeLoop = null;
    this.previewLoop = null;
    this.onActiveLoopChange(null);
  }

  playOnce(loop: Loop): void {
    if (!this.video) return;

    this.activeLoop = null;
    this.previewLoop = loop;
    this.video.currentTime = loop.start;
    void this.video.play();
    this.ensureInterval();
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
      const loop = this.activeLoop ?? this.previewLoop;
      if (!loop || !this.video) return;

      if (this.video.currentTime >= loop.end) {
        if (this.previewLoop) {
          this.video.pause();
          this.video.currentTime = loop.end;
          this.previewLoop = null;
          this.onActiveLoopChange(null);
          return;
        }

        this.video.currentTime = loop.start;
        void this.video.play();
      }
    }, LOOP_TICK_MS);
  }
}
