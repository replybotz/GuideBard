export type Phase = "idle" | "recording" | "paused" | "uploading" | "done" | "error";

export interface Config {
  guidebard_url: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  provider: string;
}

export interface RecordingState {
  phase: Phase;
  recording_id: string | null;
  tab_id: number | null;
  tab_title: string | null;
  title: string;
  provider: string;
  generate_guide: boolean;
  generate_video: boolean;
  started_at: number | null;
  paused_duration_ms: number;
  paused_at: number | null;
  elapsed_ms: number;
  chunks_sent: number;
  screenshots_sent: number;
  error_message: string | null;
  guide_job_id: string | null;
  video_id: string | null;
  script_job_id: string | null;
}

export const DEFAULT_RECORDING_STATE: RecordingState = {
  phase: "idle",
  recording_id: null,
  tab_id: null,
  tab_title: null,
  title: "",
  provider: "openai",
  generate_guide: true,
  generate_video: true,
  started_at: null,
  paused_duration_ms: 0,
  paused_at: null,
  elapsed_ms: 0,
  chunks_sent: 0,
  screenshots_sent: 0,
  error_message: null,
  guide_job_id: null,
  video_id: null,
  script_job_id: null,
};

export interface Provider {
  provider: string;
  is_configured: boolean;
}
