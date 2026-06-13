import React, { useEffect, useRef, useState } from "react";
import type { RecordingState } from "../../shared/types";

interface Props {
  state: RecordingState;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function RecordingView({ state }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute elapsed time locally (not from background) to handle SW restarts
  useEffect(() => {
    const tick = () => {
      if (!state.started_at) return;
      if (state.phase === "paused") {
        setElapsed(state.elapsed_ms);
        return;
      }
      setElapsed(Date.now() - state.started_at - state.paused_duration_ms);
    };
    tick();
    tickRef.current = setInterval(tick, 500);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [state.phase, state.started_at, state.paused_duration_ms, state.elapsed_ms]);

  const handleStop = () => chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
  const handlePause = () => chrome.runtime.sendMessage({ type: "PAUSE_RECORDING" });
  const handleResume = () => chrome.runtime.sendMessage({ type: "RESUME_RECORDING" });
  const handleScreenshot = () => chrome.runtime.sendMessage({ type: "MANUAL_SCREENSHOT" });

  const isPaused = state.phase === "paused";

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded bg-blue-600 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">GB</span>
        </div>
        <span className="text-sm font-semibold">GuideBard</span>
        <span className={`ml-auto flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
          isPaused
            ? "bg-yellow-100 text-yellow-700"
            : "bg-red-100 text-red-700"
        }`}>
          {!isPaused && (
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
          {isPaused ? "Paused" : "Recording"}
        </span>
      </div>

      {/* Tab info */}
      {state.tab_title && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500 truncate" title={state.tab_title}>
            {state.tab_title}
          </p>
          {state.title && state.title !== state.tab_title && (
            <p className="text-xs font-medium text-gray-700 truncate mt-0.5">{state.title}</p>
          )}
        </div>
      )}

      {/* Timer */}
      <div className="text-center">
        <div className="text-4xl font-mono font-bold tabular-nums text-gray-900">
          {formatTime(elapsed)}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {isPaused ? (
          <button
            onClick={handleResume}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Resume
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
            Pause
          </button>
        )}

        <button
          onClick={handleScreenshot}
          disabled={isPaused}
          className="rounded-md border border-gray-300 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Capture screenshot now"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <button
          onClick={handleStop}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-900"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h12v12H6z" />
          </svg>
          Stop
        </button>
      </div>

      {/* Stats */}
      <div className="flex justify-between text-xs text-gray-400">
        <span>{state.chunks_sent} chunks uploaded</span>
        <span>{state.screenshots_sent} screenshots</span>
      </div>
    </div>
  );
}
