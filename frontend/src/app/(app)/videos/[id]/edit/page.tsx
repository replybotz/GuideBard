"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Mic, Film, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/toaster";
import { useJobWebSocket } from "@/hooks/useJobWebSocket";
import api from "@/lib/api";

export default function VideoEditorPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [script, setScript] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);

  const { data: video } = useQuery({
    queryKey: ["video", id],
    queryFn: () => api.get(`/videos/${id}`).then((r) => r.data),
    onSuccess: (data) => { if (!script && data.script_text) setScript(data.script_text); },
  });

  const { data: voices = [] } = useQuery({
    queryKey: ["voice-profiles"],
    queryFn: () => api.get("/voice/profiles").then((r) => r.data),
  });

  // WebSocket: subscribe to job progress events
  useJobWebSocket(jobId, {
    onProgress: (ev) => {
      setJobStatus(ev.status);
      setJobProgress(ev.progress);
    },
    onCompleted: () => {
      setJobStatus("completed");
      setJobProgress(100);
      qc.invalidateQueries({ queryKey: ["video", id] });
      toast({ title: "Done!" });
      // Clear job after a beat so the progress bar disappears
      setTimeout(() => { setJobId(null); setJobStatus(null); setJobProgress(0); }, 2000);
    },
    onFailed: (ev) => {
      setJobStatus("failed");
      toast({ title: "Job failed", description: ev.error ?? undefined, variant: "destructive" });
      setTimeout(() => { setJobId(null); setJobStatus(null); setJobProgress(0); }, 3000);
    },
  });

  const saveScript = async () => {
    await api.put(`/videos/${id}`, { script_text: script });
    toast({ title: "Script saved" });
  };

  const generateVoice = async () => {
    await saveScript();
    const res = await api.post(`/videos/${id}/generate-voice`, {
      voice_profile_id: selectedVoice || undefined,
    });
    setJobId(res.data.job_id);
    setJobStatus("queued");
    setJobProgress(0);
  };

  const composeVideo = async () => {
    const res = await api.post(`/videos/${id}/compose`);
    setJobId(res.data.job_id);
    setJobStatus("queued");
    setJobProgress(0);
  };

  const isProcessing = jobStatus === "queued" || jobStatus === "running";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/videos"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to videos
          </Link>
          <h1 className="text-2xl font-bold">{video?.title ?? "Video Editor"}</h1>
        </div>
        {video?.status === "ready" && (
          <Button
            variant="outline"
            onClick={() => window.open(`/api/v1/videos/${id}/download`)}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
        )}
      </div>

      {/* Job progress */}
      {isProcessing && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium capitalize">{jobStatus}…</span>
              <span className="text-sm text-muted-foreground ml-auto">{jobProgress}%</span>
            </div>
            <Progress value={jobProgress} className="h-2" />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Script editor — 3 cols */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Voiceover Script</CardTitle>
            <Button size="sm" variant="outline" onClick={saveScript} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Write or paste the narration script here. AI can generate this from your guide."
              className="min-h-[400px] resize-none font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {script.length} characters · ~{Math.round(script.split(" ").filter(Boolean).length / 150)} min narration
            </p>
          </CardContent>
        </Card>

        {/* Controls — 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          {/* Voice selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Voice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {voices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No voice profiles.{" "}
                  <Link href="/settings" className="text-primary underline">
                    Add one in Settings.
                  </Link>
                </p>
              ) : (
                <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select voice profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.provider})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                onClick={generateVoice}
                disabled={isProcessing || !script || voices.length === 0}
                className="w-full gap-2"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                Generate Narration
              </Button>
            </CardContent>
          </Card>

          {/* Compose video */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Compose Video</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Combine the recording with narration audio into a final MP4 video.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recording:</span>
                  <Badge variant={video?.recording_id ? "success" : "outline"}>
                    {video?.recording_id ? "Ready" : "None"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Narration:</span>
                  <Badge variant={video?.audio_path ? "success" : "outline"}>
                    {video?.audio_path ? "Ready" : "Not generated"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Final Video:</span>
                  <Badge variant={video?.status === "ready" ? "success" : "outline"}>
                    {video?.status ?? "draft"}
                  </Badge>
                </div>
              </div>
              <Button
                onClick={composeVideo}
                disabled={isProcessing || !video?.audio_path}
                className="w-full gap-2"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                Compose Video
              </Button>
            </CardContent>
          </Card>

          {/* Publish shortcut */}
          <Card>
            <CardContent className="pt-5 space-y-2">
              <p className="text-sm font-medium">Ready to publish?</p>
              <Link href="/publish">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={video?.status !== "ready"}
                >
                  Publish to YouTube / WordPress
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
