/**
 * GuideBard Extension — Offscreen Document
 * Has access to MediaRecorder via tab capture stream ID from background SW.
 * Pixel-diff algorithm ported verbatim from ScreenRecorder.ts.
 */

interface RecorderConfig {
  stream_id: string;
  recording_id: string;
  chunk_interval_ms: number;
  screenshot_interval_ms: number;
}

class OffscreenRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunkIndex = 0;
  private startTime = 0;
  private screenshotTimer: ReturnType<typeof setInterval> | null = null;
  private prevFrameData: ImageData | null = null;
  private width = 1920;
  private height = 1080;
  private recordingId = "";
  private screenshotIntervalMs = 3000;

  async init(config: RecorderConfig): Promise<void> {
    this.recordingId = config.recording_id;
    this.screenshotIntervalMs = config.screenshot_interval_ms;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error Chrome-specific mandatory constraint
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: config.stream_id,
        },
      },
    });

    const videoTrack = this.stream.getVideoTracks()[0];
    if (videoTrack) {
      const settings = videoTrack.getSettings();
      this.width = settings.width ?? 1920;
      this.height = settings.height ?? 1080;
    }

    const mimeType =
      ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      ) ?? "video/webm";

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      videoBitsPerSecond: 4_000_000,
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chrome.runtime.sendMessage({
          type: "CHUNK_READY",
          payload: {
            recording_id: this.recordingId,
            chunk_index: this.chunkIndex++,
            blob: e.data,
            mime_type: mimeType,
          },
        });
      }
    };

    this.mediaRecorder.onstop = () => {
      this._stopScreenshots();
      const durationMs = Date.now() - this.startTime;
      chrome.runtime.sendMessage({
        type: "RECORDING_STOPPED",
        payload: {
          recording_id: this.recordingId,
          total_chunks: this.chunkIndex,
          duration_ms: durationMs,
          width: this.width,
          height: this.height,
        },
      });
      this._cleanup();
    };

    this.mediaRecorder.onerror = () => {
      chrome.runtime.sendMessage({
        type: "RECORDING_ERROR",
        payload: { recording_id: this.recordingId, error: "MediaRecorder error" },
      });
    };

    this.stream.getTracks().forEach((t) => { t.onended = () => this.stop(); });

    this.startTime = Date.now();
    this.chunkIndex = 0;
    this.mediaRecorder.start(config.chunk_interval_ms);
    this._startScreenshots();
  }

  pause(): void {
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.pause();
      this._stopScreenshots();
    }
  }

  resume(): void {
    if (this.mediaRecorder?.state === "paused") {
      this.mediaRecorder.resume();
      this._startScreenshots();
    }
  }

  stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this._stopScreenshots();
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  async captureNow(): Promise<void> {
    await this._captureFrame(true);
  }

  private _startScreenshots(): void {
    this._stopScreenshots();
    this.screenshotTimer = setInterval(() => this._captureFrame(false), this.screenshotIntervalMs);
  }

  private _stopScreenshots(): void {
    if (this.screenshotTimer) { clearInterval(this.screenshotTimer); this.screenshotTimer = null; }
  }

  private async _captureFrame(force: boolean): Promise<void> {
    const videoTrack = this.stream?.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== "live") return;
    try {
      const ic = new (window as any).ImageCapture(videoTrack);
      const bitmap: ImageBitmap = await ic.grabFrame();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);

      // Pixel-diff on 160x90 downscale (ported from ScreenRecorder.ts)
      const compareCanvas = document.createElement("canvas");
      compareCanvas.width = 160;
      compareCanvas.height = 90;
      const compareCtx = compareCanvas.getContext("2d")!;
      compareCtx.drawImage(canvas, 0, 0, 160, 90);
      const current = compareCtx.getImageData(0, 0, 160, 90);

      let significant = force || !this.prevFrameData;
      if (this.prevFrameData && !force) {
        let diff = 0;
        const total = current.data.length / 4;
        for (let i = 0; i < current.data.length; i += 4) {
          const dr = Math.abs(current.data[i] - this.prevFrameData.data[i]);
          const dg = Math.abs(current.data[i + 1] - this.prevFrameData.data[i + 1]);
          const db = Math.abs(current.data[i + 2] - this.prevFrameData.data[i + 2]);
          if (dr + dg + db > 30) diff++;
        }
        significant = diff / total > 0.04;
      }
      this.prevFrameData = current;

      if (significant) {
        const timestampMs = Date.now() - this.startTime;
        canvas.toBlob((blob) => {
          if (blob) {
            chrome.runtime.sendMessage({
              type: "SCREENSHOT_READY",
              payload: { recording_id: this.recordingId, timestamp_ms: timestampMs, blob, auto_captured: !force },
            });
          }
        }, "image/png");
      }
    } catch {
      // ImageCapture not available or frame grab failed
    }
  }

  private _cleanup(): void {
    this.prevFrameData = null;
    this.mediaRecorder = null;
    this.stream = null;
  }
}

let recorder: OffscreenRecorder | null = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "OFFSCREEN_INIT":
        try {
          recorder = new OffscreenRecorder();
          await recorder.init(msg.payload);
          sendResponse({ ok: true });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          chrome.runtime.sendMessage({
            type: "RECORDING_ERROR",
            payload: { recording_id: msg.payload.recording_id, error },
          });
          sendResponse({ ok: false, error });
        }
        break;
      case "OFFSCREEN_PAUSE": recorder?.pause(); sendResponse({ ok: true }); break;
      case "OFFSCREEN_RESUME": recorder?.resume(); sendResponse({ ok: true }); break;
      case "OFFSCREEN_STOP": recorder?.stop(); sendResponse({ ok: true }); break;
      case "OFFSCREEN_MANUAL_SCREENSHOT": await recorder?.captureNow(); sendResponse({ ok: true }); break;
    }
  })();
  return true;
});
