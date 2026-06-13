import React, { useEffect, useState } from "react";
import type { RecordingState } from "../shared/types";
import { DEFAULT_RECORDING_STATE } from "../shared/types";
import { localStore, sessionStore } from "../shared/storage";
import SetupView from "./views/SetupView";
import RecordView from "./views/RecordView";
import RecordingView from "./views/RecordingView";
import DoneView from "./views/DoneView";

export default function App() {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [state, setState] = useState<RecordingState | null>(null);

  useEffect(() => {
    // Check if user has configured the extension
    localStore.getConfig().then((cfg) => {
      setIsSetup(!!(cfg.guidebard_url && cfg.access_token));
    });

    // Load current recording state from session storage
    sessionStore.getState().then(setState);

    // Subscribe to state changes pushed by background service worker
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.recording_state) {
        setState(changes.recording_state.newValue ?? { ...DEFAULT_RECORDING_STATE });
      }
    };
    chrome.storage.session.onChanged.addListener(listener);
    return () => chrome.storage.session.onChanged.removeListener(listener);
  }, []);

  if (isSetup === null || state === null) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isSetup) {
    return <SetupView onComplete={() => setIsSetup(true)} />;
  }

  if (state.phase === "done" || state.phase === "error") {
    return <DoneView state={state} onReset={() => sessionStore.clearState()} />;
  }

  if (state.phase === "recording" || state.phase === "paused") {
    return <RecordingView state={state} />;
  }

  if (state.phase === "uploading") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8">
        <div className="h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        <p className="text-sm text-gray-600 text-center">
          Finalizing recording and triggering AI generation…
        </p>
      </div>
    );
  }

  // idle
  return <RecordView state={state} />;
}
