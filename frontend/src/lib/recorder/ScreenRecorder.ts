export type RecordingStatus = "idle" | "countdown" | "recording" | "paused" | "stopped";

export interface RecorderOptions {
  onChunk: (chunk: Blob, index: number) => Promise<void>;
  onScreenshot: (blob: Blob, timestampMs: number) => Promise<void>;
  onStatusChange: (status: RecordingStatus) => void;
  onError: (err: Error) => void;
  screenshotIntervalMs?: number;
  chunkIntervalMs?: number;
}

export class ScreenRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunkIndex = 0;
  private startTime = 0;
  private screenshotTimer: ReturnType<typeof setInterval> | null = null;
  private prevFrameData: ImageData | null = null;
  private status: RecordingStatus = "idle";
  private opts: RecorderOptions;

  constructor(opts: RecorderOptions) {
    this.opts = opts;
  }

  async start(sourceType: "screen" | "window" | "tab" = "screen"): Promise<void> {
    try {
      // Request display media
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true, // capture system audio if available
      });

      // Choose best supported MIME type
      const mimeType = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: 4_000_000,
      });

      this.mediaRecorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          await this.opts.onChunk(e.data, this.chunkIndex++);
        }
      };

      this.mediaRecorder.onstop = () => {
        this._cleanup();
        this._setStatus("stopped");
      };

      this.mediaRecorder.onerror = (e) => {
        this.opts.onError(new Error("MediaRecorder error"));
      };

      this.startTime = Date.now();
      this.chunkIndex = 0;
      this.mediaRecorder.start(this.opts.chunkIntervalMs ?? 5000);
      this._setStatus("recording");
      this._startScreenshots();

      // Auto-stop if user ends screen share from OS picker
      this.stream.getTracks().forEach((t) => {
        t.onended = () => this.stop();
      });
    } catch (err) {
      this.opts.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  pause(): void {
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.pause();
      this._stopScreenshots();
      this._setStatus("paused");
    }
  }

  resume(): void {
    if (this.mediaRecorder?.state === "paused") {
      this.mediaRecorder.resume();
      this._startScreenshots();
      this._setStatus("recording");
    }
  }

  stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this._stopScreenshots();
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  /** Immediately capture a screenshot regardless of pixel-diff threshold. */
  async captureNow(): Promise<void> {
    const videoTrack = this.stream?.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== "live") return;
    try {
      const ic = new (window as any).ImageCapture(videoTrack);
      const bitmap = await ic.grabFrame();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      canvas.toBlob(async (blob) => {
        if (blob) await this.opts.onScreenshot(blob, Date.now() - this.startTime);
      }, "image/png");
    } catch {
      // ImageCapture not available in this browser
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  getElapsedMs(): number {
    return this.status === "recording" ? Date.now() - this.startTime : 0;
  }

  private _setStatus(s: RecordingStatus) {
    this.status = s;
    this.opts.onStatusChange(s);
  }

  private _startScreenshots() {
    const interval = this.opts.screenshotIntervalMs ?? 3000;
    this._stopScreenshots();

    const videoTrack = this.stream?.getVideoTracks()[0];
    if (!videoTrack) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const compareCanvas = document.createElement("canvas");
    const compareCtx = compareCanvas.getContext("2d")!;
    compareCanvas.width = 160;
    compareCanvas.height = 90;

    const captureFrame = async () => {
      if (!videoTrack || videoTrack.readyState !== "live") return;
      try {
        // Use ImageCapture if available
        const ic = new (window as any).ImageCapture(videoTrack);
        const bitmap = await ic.grabFrame();
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);

        // Pixel diff against previous frame (downscaled)
        compareCtx.drawImage(canvas, 0, 0, 160, 90);
        const current = compareCtx.getImageData(0, 0, 160, 90);

        let significant = !this.prevFrameData;
        if (this.prevFrameData) {
          let diff = 0;
          const total = current.data.length / 4;
          for (let i = 0; i < current.data.length; i += 4) {
            const dr = Math.abs(current.data[i] - this.prevFrameData.data[i]);
            const dg = Math.abs(current.data[i + 1] - this.prevFrameData.data[i + 1]);
            const db = Math.abs(current.data[i + 2] - this.prevFrameData.data[i + 2]);
            if (dr + dg + db > 30) diff++;
          }
          significant = diff / total > 0.04; // >4% pixels changed
        }
        this.prevFrameData = current;

        if (significant) {
          canvas.toBlob(async (blob) => {
            if (blob) await this.opts.onScreenshot(blob, Date.now() - this.startTime);
          }, "image/png");
        }
      } catch {
        // ImageCapture not available or frame grab failed — skip
      }
    };

    this.screenshotTimer = setInterval(captureFrame, interval);
  }

  private _stopScreenshots() {
    if (this.screenshotTimer) {
      clearInterval(this.screenshotTimer);
      this.screenshotTimer = null;
    }
  }

  private _cleanup() {
    this._stopScreenshots();
    this.prevFrameData = null;
    this.mediaRecorder = null;
  }
}
