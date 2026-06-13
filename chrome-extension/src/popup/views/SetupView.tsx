import React, { useState } from "react";
import { apiCheckHealth, apiLogin, apiGetProviders } from "../../shared/api";
import { localStore } from "../../shared/storage";

interface Props {
  onComplete: () => void;
}

type Step = "url" | "login";

export default function SetupView({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const normalized = url.trim().replace(/\/$/, "");
      if (!normalized.startsWith("http")) throw new Error("URL must start with http:// or https://");
      const ok = await apiCheckHealth(normalized);
      if (!ok) throw new Error("Could not reach GuideBard at that URL. Check the address and try again.");
      await localStore.set({ guidebard_url: normalized });
      setStep("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cfg = await localStore.getConfig();
      const baseUrl = cfg.guidebard_url ?? "";
      const { access_token, refresh_token } = await apiLogin(baseUrl, username, password);
      await localStore.set({
        access_token,
        refresh_token,
        token_expires_at: Date.now() + 3600 * 1000,
      });
      // Pre-fetch providers list
      try {
        const providers = await apiGetProviders();
        const configured = providers.filter((p) => p.is_configured);
        const defaultProvider = configured[0]?.provider ?? "openai";
        await localStore.set({ providers: configured, provider: defaultProvider });
      } catch {
        // Non-fatal — user can still record without AI
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-blue-600 flex items-center justify-center">
          <span className="text-white text-xs font-bold">GB</span>
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-none">GuideBard</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {step === "url" ? "Step 1 of 2 — Connect" : "Step 2 of 2 — Sign In"}
          </p>
        </div>
      </div>

      {/* Step: URL */}
      {step === "url" && (
        <form onSubmit={handleUrlSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Your GuideBard URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://guide.yourcompany.com"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              The base URL of your self-hosted GuideBard instance.
            </p>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
          <button
            type="submit"
            disabled={loading || !url}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Checking…" : "Continue"}
          </button>
        </form>
      )}

      {/* Step: Login */}
      {step === "login" && (
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setStep("url"); setError(""); }}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
