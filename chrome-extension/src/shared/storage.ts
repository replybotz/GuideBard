import type { RecordingState, Provider } from "./types";
import { DEFAULT_RECORDING_STATE } from "./types";

export const localStore = {
  async getConfig() {
    return chrome.storage.local.get([
      "guidebard_url", "access_token", "refresh_token",
      "token_expires_at", "provider", "providers",
    ]) as Promise<{
      guidebard_url?: string;
      access_token?: string;
      refresh_token?: string;
      token_expires_at?: number;
      provider?: string;
      providers?: Provider[];
    }>;
  },
  async set(patch: Record<string, unknown>) {
    return chrome.storage.local.set(patch);
  },
  async clearAuth() {
    return chrome.storage.local.remove(["access_token", "refresh_token", "token_expires_at"]);
  },
};

export const sessionStore = {
  async getState(): Promise<RecordingState> {
    const result = await chrome.storage.session.get("recording_state");
    return (result.recording_state as RecordingState) ?? { ...DEFAULT_RECORDING_STATE };
  },
  async setState(state: RecordingState): Promise<void> {
    await chrome.storage.session.set({ recording_state: state });
  },
  async updateState(patch: Partial<RecordingState>): Promise<void> {
    const current = await sessionStore.getState();
    await sessionStore.setState({ ...current, ...patch });
  },
  async clearState(): Promise<void> {
    await chrome.storage.session.set({ recording_state: { ...DEFAULT_RECORDING_STATE } });
  },
};
