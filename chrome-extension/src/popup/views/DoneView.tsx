import React, { useEffect, useState } from "react";
import type { RecordingState } from "../../shared/types";
import { localStore } from "../../shared/storage";

interface Props {
  state: RecordingState;
  onReset: () => void;
}

export default function DoneView({ state, onReset }: Props) {
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    localStore.getConfig().then((cfg) => {
      setBaseUrl(cfg.guidebard_url ?? "");
    });
  }, []);

  const isError = state.phase === "error";

  const openLink = (path: string) => {
    if (baseUrl) chrome.tabs.create({ url: `${baseUrl}${path}` });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded bg-blue-600 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">GB</span>
        </div>
        <span className="text-sm font-semibold">GuideBard</span>
      </div>

      {/* Status */}
      <div className="rounded-lg border p-4 text-center space-y-2">
        {isError ? (
          <>
            <div className="mx-auto h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-red-700">Something went wrong</p>
            {state.error_message && (
              <p className="text-xs text-gray-500">{state.error_message}</p>
            )}
          </>
        ) : (
          <>
            <div className="mx-auto h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-900">Recording complete!</p>
            <p className="text-xs text-gray-500">
              AI is generating your content in the background.
            </p>
          </>
        )}
      </div>

      {/* Links */}
      {!isError && baseUrl && (
        <div className="space-y-2">
          {state.generate_guide && (
            <button
              onClick={() => openLink("/guides")}
              className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:bg-gray-50"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">View Guides</p>
                <p className="text-xs text-gray-400">Guide generation in progress</p>
              </div>
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          {state.generate_video && state.video_id && (
            <button
              onClick={() => openLink(`/videos/${state.video_id}`)}
              className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:bg-gray-50"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">View Video</p>
                <p className="text-xs text-gray-400">Script generation in progress</p>
              </div>
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          <button
            onClick={() => openLink("/dashboard")}
            className="w-full text-center text-xs text-blue-600 hover:text-blue-700 py-1"
          >
            Open GuideBard dashboard →
          </button>
        </div>
      )}

      {/* Record another */}
      <button
        onClick={onReset}
        className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Record another
      </button>
    </div>
  );
}
