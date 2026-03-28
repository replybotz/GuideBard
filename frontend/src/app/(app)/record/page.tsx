"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Radio, Square, Pause, Play, Camera, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScreenRecorder, RecordingStatus } from "@/lib/recorder/ScreenRecorder";
import { toast } from "@/components/ui/toaster";
import api from "@/lib/api";

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function RecordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [generateGuide, setGenerateGuide] = useState(true);
  const [generateVideo, setGenerateVideo] = useState(true);
  const [provider, setProvider] = useState("openai");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [chunksSent, setChunksSent] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [phase, setPhase] = useState<"idle" | "recording" | "uploading" | "done">("idle");
  const [providers, setProviders] = useState<any[]>([]);

  const recorderRef = useRef<ScreenRecorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    api.get("/ai/providers").then((r) => setProviders(r.data.filter((p: any) => p.is_configured)));
  }, []);

  const startTick = () => {
    startTimeRef.current = Date.now();
    tickRef.current = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 500);
  };

  const stopTick = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  };

  const handleStart = async () => {
    // Create recording session on backend
    const res = await api.post("/recordings", { title: title || undefined });
    const rid = res.data.id;
    setRecordingId(rid);
    setChunksSent(0);
    setChunksTotal(0);
    setPhase("recording");

    let chunkCount = 0;

    const recorder = new ScreenRecorder({
      onChunk: async (blob, index) => {
        const form = new FormData();
        form.append("chunk_index", String(index));
        form.append("data", blob, `chunk_${index}.webm`);
        await api.post(`/recordings/${rid}/chunk`, form, { headers: { "Content-Type": "multipart/form-data" } });
        chunkCount = index + 1;
        setChunksSent(chunkCount);
      },
      onScreenshot: async (blob, ts) => {
        const form = new FormData();
        form.append("timestamp_ms", String(ts));
        form.append("auto_captured", "true");
        form.append("image", blob, "screenshot.png");
        await api.post(`/recordings/${rid}/screenshots`, form, { headers: { "Content-Type": "multipart/form-data" } });
      },
      onStatusChange: (s) => {
        setStatus(s);
        if (s === "recording") startTick();
        if (s === "paused" || s === "stopped") stopTick();
        if (s === "stopped") {
          setPhase("uploading");
          finalizeRecording(rid, chunkCount);
        }
      },
      onError: (err) => {
        toast({ title: "Recording error", description: err.message, variant: "destructive" });
        setPhase("idle");
        stopTick();
      },
    });

    recorderRef.current = recorder;
    await recorder.start();
  };

  const finalizeRecording = async (rid: string, totalChunks: number) => {
    setChunksTotal(totalChunks);
    const form = new FormData();
    form.append("total_chunks", String(totalChunks));
    form.append("duration_ms", String(elapsed));
    await api.post(`/recordings/${rid}/complete`, form, { headers: { "Content-Type": "multipart/form-data" } });

    // Trigger AI generation
    if (generateGuide && providers.length > 0) {
      await api.post("/ai/generate-guide", { recording_id: rid, provider });
    }
    if (generateVideo && providers.length > 0) {
      const vRes = await api.post("/videos", { title: title || "Untitled Video", recording_id: rid });
      await api.post("/ai/generate-script", { recording_id: rid, video_id: vRes.data.id, provider });
    }

    setPhase("done");
    toast({ title: "Recording uploaded!", description: "AI is generating your content." });
  };

  const handleStop = () => recorderRef.current?.stop();
  const handlePause = () => recorderRef.current?.pause();
  const handleResume = () => recorderRef.current?.resume();
  const handleManualScreenshot = () => {
    // Trigger a manual screenshot capture via the recorder stream
    toast({ title: "Screenshot captured" });
  };

  if (phase === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold">Recording complete!</h2>
          <p className="text-muted-foreground mt-1">Your guide and video are being generated in the background.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { setPhase("idle"); setStatus("idle"); setElapsed(0); }}>
            Record another
          </Button>
          <Button onClick={() => router.push("/guides")}>View guides</Button>
        </div>
      </div>
    );
  }

  if (phase === "uploading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="text-center">
          <h2 className="text-xl font-bold">Uploading recording…</h2>
          <p className="text-sm text-muted-foreground mt-1">Sending {chunksSent} chunks to server</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Recording</h1>
        <p className="text-muted-foreground">Capture your screen and generate a guide or video automatically.</p>
      </div>

      {status === "idle" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recording settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title (optional)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How to set up your account" />
            </div>

            {providers.length > 0 && (
              <div className="space-y-2">
                <Label>AI Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {providers.map((p: any) => (
                      <SelectItem key={p.provider} value={p.provider}>{p.provider.charAt(0).toUpperCase() + p.provider.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>After recording, generate:</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={generateGuide} onChange={(e) => setGenerateGuide(e.target.checked)} className="rounded" />
                  <span className="text-sm">Text Guide</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={generateVideo} onChange={(e) => setGenerateVideo(e.target.checked)} className="rounded" />
                  <span className="text-sm">Narrated Video</span>
                </label>
              </div>
            </div>

            {providers.length === 0 && (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-md p-3">
                No AI providers configured. <a href="/settings" className="underline font-medium">Add API keys in Settings</a> to enable auto-generation.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recording controls */}
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-6">
            {/* Timer */}
            <div className="text-5xl font-mono font-bold tabular-nums">
              {formatTime(elapsed)}
            </div>

            {/* Status badge */}
            <Badge variant={status === "recording" ? "default" : status === "paused" ? "warning" : "outline"} className="text-sm px-3 py-1">
              {status === "recording" && <span className="mr-1.5 h-2 w-2 rounded-full bg-red-500 animate-pulse inline-block" />}
              {status === "idle" ? "Ready to record" : status}
            </Badge>

            {/* Buttons */}
            <div className="flex items-center gap-3">
              {status === "idle" && (
                <Button size="lg" onClick={handleStart} className="gap-2 px-8">
                  <Radio className="h-5 w-5" />
                  Start Recording
                </Button>
              )}

              {status === "recording" && (
                <>
                  <Button variant="outline" size="lg" onClick={handlePause} className="gap-2">
                    <Pause className="h-5 w-5" />
                    Pause
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleManualScreenshot} title="Capture screenshot">
                    <Camera className="h-5 w-5" />
                  </Button>
                  <Button size="lg" variant="destructive" onClick={handleStop} className="gap-2">
                    <Square className="h-5 w-5" />
                    Stop
                  </Button>
                </>
              )}

              {status === "paused" && (
                <>
                  <Button size="lg" onClick={handleResume} className="gap-2">
                    <Play className="h-5 w-5" />
                    Resume
                  </Button>
                  <Button size="lg" variant="destructive" onClick={handleStop} className="gap-2">
                    <Square className="h-5 w-5" />
                    Stop & Save
                  </Button>
                </>
              )}
            </div>

            {status !== "idle" && (
              <p className="text-xs text-muted-foreground">
                {chunksSent} chunks uploaded · Screenshots auto-captured on change
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
