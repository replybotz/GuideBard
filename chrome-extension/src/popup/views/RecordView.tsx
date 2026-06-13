import React, { useEffect, useState } from "react";
import type { RecordingState, Provider } from "../../shared/types";
import { localStore } from "../../shared/storage";

interface Props {
  state: RecordingState;
}

export default function RecordView({ state }: Props) {
  const [title, setTitle] = useState(state.title || "");
  const [provider, setProvider] = useState(state.provider || "openai");
  const [generateGuide, setGenerateGuide] = useState(state.generate_guide);
  const [generateVideo, setGenerateVideo] = useState(state.generate_video);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    localStore.getConfig().then((cfg) => {
      if (cfg.providers) setProviders(cfg.providers);
      if (cfg.provider) setProvider(cfg.provider);
    });
  }, []);

  const handleStart = async () => {
    setError("");
    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "START_RECORDING",
        payload: { title, provider, generate_guide: generateGuide, generate_video: generateVideo },
      });
      if (!response?.ok) throw new Error(response?.error ?? "Failed to start recording");
      // Persist provider preference
      await localStore.set({ provider });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start recording");
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await localStore.clearAuth();
    // Reload popup — App will detect no token and show SetupView
    window.location.reload();
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">GB</span>
          </div>
          <span className="text-sm font-semibold">GuideBard</span>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-gray-400 hover:text-gray-600 p-1 rounded"
          title="Settings"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Settings dropdown */}
      {showSettings && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <button
            onClick={handleLogout}
            className="text-xs text-red-600 hover:text-red-700 font-medium"
          >
            Sign out
          </button>
        </div>
      )}

      {/* Form */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Recording title <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. How to reset your password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {providers.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">AI Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {providers.map((p) => (
                <option key={p.provider} value={p.provider}>
                  {p.provider.charAt(0).toUpperCase() + p.provider.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">After recording, generate:</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={generateGuide}
                onChange={(e) => setGenerateGuide(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Guide</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={generateVideo}
                onChange={(e) => setGenerateVideo(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Video script</span>
            </label>
          </div>
        </div>

        {providers.length === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded p-2.5">
            No AI providers configured in GuideBard. Add API keys in Settings to enable auto-generation.
          </p>
        )}
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}

      <button
        onClick={handleStart}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-md bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            Starting…
          </>
        ) : (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-white" />
            Start Recording
          </>
        )}
      </button>

      <p className="text-center text-xs text-gray-400">
        Will capture the current tab only
      </p>
    </div>
  );
}
