import { localStore } from "./storage";

async function refreshAccessToken(baseUrl: string, refreshToken: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error("Token refresh failed — please log in again");
  const data = await res.json();
  await localStore.set({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_expires_at: Date.now() + 3600 * 1000,
  });
  return data.access_token as string;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cfg = await localStore.getConfig();
  const baseUrl = cfg.guidebard_url ?? "";
  let token = cfg.access_token ?? "";
  if (cfg.token_expires_at && Date.now() > cfg.token_expires_at - 5 * 60 * 1000) {
    token = await refreshAccessToken(baseUrl, cfg.refresh_token ?? "");
  }
  const headers = new Headers(init.headers as HeadersInit);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${baseUrl}/api/v1${path}`, { ...init, headers });
  if (res.status === 401 && cfg.refresh_token) {
    const newToken = await refreshAccessToken(baseUrl, cfg.refresh_token);
    headers.set("Authorization", `Bearer ${newToken}`);
    return fetch(`${baseUrl}/api/v1${path}`, { ...init, headers });
  }
  return res;
}

export async function apiLogin(baseUrl: string, username: string, password: string) {
  const form = new FormData();
  form.append("username", username);
  form.append("password", password);
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? `Login failed (${res.status})`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}

export async function apiGetProviders() {
  const res = await apiFetch("/ai/providers");
  if (!res.ok) throw new Error("Failed to load providers");
  return res.json() as Promise<Array<{ provider: string; is_configured: boolean }>>;
}

export async function apiCreateRecording(title: string) {
  const res = await apiFetch("/recordings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title || undefined }),
  });
  if (!res.ok) throw new Error(`Create recording failed (${res.status})`);
  return res.json() as Promise<{ id: string }>;
}

export async function apiUploadChunk(recordingId: string, blob: Blob, index: number) {
  const form = new FormData();
  form.append("chunk_index", String(index));
  form.append("data", blob, `chunk_${index}.webm`);
  const res = await apiFetch(`/recordings/${recordingId}/chunk`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Chunk ${index} upload failed (${res.status})`);
}

export async function apiUploadScreenshot(
  recordingId: string, blob: Blob, timestampMs: number, autoCaptured: boolean,
) {
  const form = new FormData();
  form.append("timestamp_ms", String(timestampMs));
  form.append("auto_captured", String(autoCaptured));
  form.append("image", blob, "screenshot.png");
  const res = await apiFetch(`/recordings/${recordingId}/screenshots`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Screenshot upload failed (${res.status})`);
}

export async function apiCompleteRecording(
  recordingId: string, totalChunks: number, durationMs: number, width: number, height: number,
) {
  const form = new FormData();
  form.append("total_chunks", String(totalChunks));
  form.append("duration_ms", String(durationMs));
  form.append("width", String(width));
  form.append("height", String(height));
  const res = await apiFetch(`/recordings/${recordingId}/complete`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Complete recording failed (${res.status})`);
}

export async function apiGenerateGuide(recordingId: string, provider: string) {
  const res = await apiFetch("/ai/generate-guide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recording_id: recordingId, provider }),
  });
  if (!res.ok) throw new Error(`Generate guide failed (${res.status})`);
  return res.json() as Promise<{ job_id: string }>;
}

export async function apiCreateVideo(title: string, recordingId: string) {
  const res = await apiFetch("/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, recording_id: recordingId }),
  });
  if (!res.ok) throw new Error(`Create video failed (${res.status})`);
  return res.json() as Promise<{ id: string }>;
}

export async function apiGenerateScript(recordingId: string, videoId: string, provider: string) {
  const res = await apiFetch("/ai/generate-script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recording_id: recordingId, video_id: videoId, provider }),
  });
  if (!res.ok) throw new Error(`Generate script failed (${res.status})`);
  return res.json() as Promise<{ job_id: string }>;
}

export async function apiCheckHealth(baseUrl: string) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
