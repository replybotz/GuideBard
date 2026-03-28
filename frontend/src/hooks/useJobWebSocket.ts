/**
 * useJobWebSocket — subscribe to real-time job progress via WebSocket.
 *
 * The backend publishes progress events to a Redis channel; the FastAPI
 * WS endpoint relays them. This hook falls back to no-op if the WS
 * connection fails (the caller can still poll the REST API as backup).
 *
 * Message shape from server:
 *   { type: "progress", job_id: string, status: string, progress: number, error?: string }
 *   { type: "ping" }
 */
"use client";
import { useEffect, useRef, useCallback } from "react";

export interface JobProgressEvent {
  type: "progress";
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  error?: string | null;
}

interface Options {
  onProgress?: (event: JobProgressEvent) => void;
  onCompleted?: (event: JobProgressEvent) => void;
  onFailed?: (event: JobProgressEvent) => void;
  /** Whether to connect. Pass false to skip (e.g. when job_id is null). */
  enabled?: boolean;
}

export function useJobWebSocket(jobId: string | null, opts: Options = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const connect = useCallback(() => {
    if (!jobId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/jobs/${jobId}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type !== "progress") return;

      const progressEvent = data as JobProgressEvent;
      optsRef.current.onProgress?.(progressEvent);

      if (progressEvent.status === "completed") {
        optsRef.current.onCompleted?.(progressEvent);
      } else if (progressEvent.status === "failed") {
        optsRef.current.onFailed?.(progressEvent);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  }, [jobId]);

  useEffect(() => {
    if (opts.enabled === false || !jobId) return;

    connect();

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [jobId, opts.enabled, connect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
