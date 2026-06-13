/**
 * GuideBard Extension — Background Service Worker (Manifest V3)
 */
import { sessionStore, localStore } from "../shared/storage";
import {
  apiCreateRecording, apiUploadChunk, apiUploadScreenshot,
  apiCompleteRecording, apiGenerateGuide, apiCreateVideo, apiGenerateScript,
} from "../shared/api";
import type { AnyMessage } from "../shared/messages";

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");
const CHUNK_INTERVAL_MS = 5000;
const SCREENSHOT_INTERVAL_MS = 3000;

async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: "Recording tab audio/video via MediaRecorder",
    });
  }
}

async function closeOffscreenDocument(): Promise<void> {
  try {
    if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
  } catch { /* Already closed */ }
}

async function sendToOffscreen(msg: object): Promise<void> {
  try { await chrome.runtime.sendMessage(msg); } catch { /* Offscreen not ready */ }
}

async function handleStart(
  payload: { title: string; provider: string; generate_guide: boolean; generate_video: boolean },
  sendResponse: (r: object) => void,
) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found");

    const recording = await apiCreateRecording(payload.title || tab.title || "Screen Recording");

    await sessionStore.setState({
      phase: "recording",
      recording_id: recording.id,
      tab_id: tab.id,
      tab_title: tab.title ?? null,
      title: payload.title || tab.title || "Screen Recording",
      provider: payload.provider,
      generate_guide: payload.generate_guide,
      generate_video: payload.generate_video,
      started_at: Date.now(),
      paused_duration_ms: 0,
      paused_at: null,
      elapsed_ms: 0,
      chunks_sent: 0,
      screenshots_sent: 0,
      error_message: null,
      guide_job_id: null,
      video_id: null,
      script_job_id: null,
    });

    const streamId = await new Promise<string>((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id! }, (id) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(id);
      });
    });

    await ensureOffscreenDocument();
    await sendToOffscreen({
      type: "OFFSCREEN_INIT",
      payload: {
        stream_id: streamId,
        recording_id: recording.id,
        chunk_interval_ms: CHUNK_INTERVAL_MS,
        screenshot_interval_ms: SCREENSHOT_INTERVAL_MS,
      },
    });

    chrome.alarms.create("recording-heartbeat", { periodInMinutes: 0.4 });
    sendResponse({ type: "ACK", ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sessionStore.updateState({ phase: "error", error_message: msg });
    sendResponse({ type: "ACK", ok: false, error: msg });
  }
}

async function handleStop(sendResponse: (r: object) => void) {
  await sendToOffscreen({ type: "OFFSCREEN_STOP" });
  sendResponse({ type: "ACK", ok: true });
}

async function handlePause(sendResponse: (r: object) => void) {
  const state = await sessionStore.getState();
  if (state.phase !== "recording") { sendResponse({ type: "ACK", ok: false, error: "Not recording" }); return; }
  await sessionStore.updateState({
    phase: "paused",
    paused_at: Date.now(),
    elapsed_ms: Date.now() - (state.started_at ?? Date.now()) - state.paused_duration_ms,
  });
  await sendToOffscreen({ type: "OFFSCREEN_PAUSE" });
  sendResponse({ type: "ACK", ok: true });
}

async function handleResume(sendResponse: (r: object) => void) {
  const state = await sessionStore.getState();
  if (state.phase !== "paused") { sendResponse({ type: "ACK", ok: false, error: "Not paused" }); return; }
  const additionalPause = state.paused_at ? Date.now() - state.paused_at : 0;
  await sessionStore.updateState({
    phase: "recording",
    paused_at: null,
    paused_duration_ms: state.paused_duration_ms + additionalPause,
  });
  await sendToOffscreen({ type: "OFFSCREEN_RESUME" });
  sendResponse({ type: "ACK", ok: true });
}

async function handleChunk(payload: { recording_id: string; chunk_index: number; blob: Blob }) {
  try {
    await apiUploadChunk(payload.recording_id, payload.blob, payload.chunk_index);
    const state = await sessionStore.getState();
    await sessionStore.updateState({ chunks_sent: state.chunks_sent + 1 });
  } catch (err) {
    console.error("[GuideBard] Chunk upload failed:", err);
  }
}

async function handleScreenshot(payload: {
  recording_id: string; timestamp_ms: number; blob: Blob; auto_captured: boolean;
}) {
  try {
    await apiUploadScreenshot(payload.recording_id, payload.blob, payload.timestamp_ms, payload.auto_captured);
    const state = await sessionStore.getState();
    await sessionStore.updateState({ screenshots_sent: state.screenshots_sent + 1 });
  } catch (err) {
    console.error("[GuideBard] Screenshot upload failed:", err);
  }
}

async function handleRecordingStopped(payload: {
  recording_id: string; total_chunks: number; duration_ms: number; width: number; height: number;
}) {
  await sessionStore.updateState({ phase: "uploading" });
  chrome.alarms.clear("recording-heartbeat");

  try {
    const state = await sessionStore.getState();
    await apiCompleteRecording(
      payload.recording_id, payload.total_chunks, payload.duration_ms, payload.width, payload.height,
    );

    let guideJobId: string | null = null;
    let videoId: string | null = null;
    let scriptJobId: string | null = null;

    if (state.generate_guide) {
      try {
        const job = await apiGenerateGuide(payload.recording_id, state.provider);
        guideJobId = job.job_id;
      } catch (err) { console.error("[GuideBard] Guide trigger failed:", err); }
    }

    if (state.generate_video) {
      try {
        const video = await apiCreateVideo(state.title, payload.recording_id);
        videoId = video.id;
        const job = await apiGenerateScript(payload.recording_id, video.id, state.provider);
        scriptJobId = job.job_id;
      } catch (err) { console.error("[GuideBard] Script trigger failed:", err); }
    }

    await sessionStore.updateState({ phase: "done", guide_job_id: guideJobId, video_id: videoId, script_job_id: scriptJobId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sessionStore.updateState({ phase: "error", error_message: msg });
  } finally {
    await closeOffscreenDocument();
  }
}

async function handleRecordingError(payload: { recording_id: string; error: string }) {
  console.error("[GuideBard] Recording error:", payload.error);
  await sessionStore.updateState({ phase: "error", error_message: payload.error });
  chrome.alarms.clear("recording-heartbeat");
  await closeOffscreenDocument();
}

chrome.runtime.onMessage.addListener((msg: AnyMessage, _sender, sendResponse) => {
  switch (msg.type) {
    case "START_RECORDING": handleStart(msg.payload, sendResponse); return true;
    case "STOP_RECORDING": handleStop(sendResponse); return true;
    case "PAUSE_RECORDING": handlePause(sendResponse); return true;
    case "RESUME_RECORDING": handleResume(sendResponse); return true;
    case "MANUAL_SCREENSHOT": sendToOffscreen({ type: "OFFSCREEN_MANUAL_SCREENSHOT" }).then(() => sendResponse({ type: "ACK", ok: true })); return true;
    case "GET_STATE": sessionStore.getState().then((state) => sendResponse({ type: "STATE", state })); return true;
    case "CHUNK_READY": handleChunk(msg.payload); return false;
    case "SCREENSHOT_READY": handleScreenshot(msg.payload); return false;
    case "RECORDING_STOPPED": handleRecordingStopped(msg.payload); return false;
    case "RECORDING_ERROR": handleRecordingError(msg.payload); return false;
    default: return false;
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "recording-heartbeat") {
    const state = await sessionStore.getState();
    if (state.phase !== "recording" && state.phase !== "paused") {
      chrome.alarms.clear("recording-heartbeat");
    }
  }
});

chrome.runtime.onInstalled.addListener(async () => { await sessionStore.clearState(); });
chrome.runtime.onStartup.addListener(async () => { await closeOffscreenDocument(); });
