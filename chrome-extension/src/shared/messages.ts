import type { RecordingState } from "./types";

export interface StartRecordingMsg {
  type: "START_RECORDING";
  payload: {
    title: string;
    provider: string;
    generate_guide: boolean;
    generate_video: boolean;
  };
}

export interface StopRecordingMsg { type: "STOP_RECORDING" }
export interface PauseRecordingMsg { type: "PAUSE_RECORDING" }
export interface ResumeRecordingMsg { type: "RESUME_RECORDING" }
export interface ManualScreenshotMsg { type: "MANUAL_SCREENSHOT" }
export interface GetStateMsg { type: "GET_STATE" }

export type PopupToBackground =
  | StartRecordingMsg | StopRecordingMsg | PauseRecordingMsg
  | ResumeRecordingMsg | ManualScreenshotMsg | GetStateMsg;

export interface StateResponse { type: "STATE"; state: RecordingState }
export interface AckResponse { type: "ACK"; ok: boolean; error?: string }
export type BackgroundResponse = StateResponse | AckResponse;

export interface InitOffscreenMsg {
  type: "OFFSCREEN_INIT";
  payload: {
    stream_id: string;
    recording_id: string;
    chunk_interval_ms: number;
    screenshot_interval_ms: number;
  };
}
export interface OffscreenPauseMsg { type: "OFFSCREEN_PAUSE" }
export interface OffscreenResumeMsg { type: "OFFSCREEN_RESUME" }
export interface OffscreenStopMsg { type: "OFFSCREEN_STOP" }
export interface OffscreenManualScreenshotMsg { type: "OFFSCREEN_MANUAL_SCREENSHOT" }

export type BackgroundToOffscreen =
  | InitOffscreenMsg | OffscreenPauseMsg | OffscreenResumeMsg
  | OffscreenStopMsg | OffscreenManualScreenshotMsg;

export interface ChunkReadyMsg {
  type: "CHUNK_READY";
  payload: { recording_id: string; chunk_index: number; blob: Blob; mime_type: string };
}
export interface ScreenshotReadyMsg {
  type: "SCREENSHOT_READY";
  payload: { recording_id: string; timestamp_ms: number; blob: Blob; auto_captured: boolean };
}
export interface RecordingStoppedMsg {
  type: "RECORDING_STOPPED";
  payload: { recording_id: string; total_chunks: number; duration_ms: number; width: number; height: number };
}
export interface RecordingErrorMsg {
  type: "RECORDING_ERROR";
  payload: { recording_id: string; error: string };
}

export type OffscreenToBackground =
  | ChunkReadyMsg | ScreenshotReadyMsg | RecordingStoppedMsg | RecordingErrorMsg;

export type AnyMessage = PopupToBackground | BackgroundToOffscreen | OffscreenToBackground;
