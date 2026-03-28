"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Edit, Download, ArrowLeft, AlertCircle, Loader2, Clock, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import api from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

function statusVariant(s: string): any {
  if (s === "ready") return "success";
  if (s === "processing" || s === "composing" || s === "generating_voice") return "warning";
  if (s === "failed") return "destructive";
  return "outline";
}

function formatDuration(ms: number | null) {
  if (!ms) return null;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function VideoViewerPage() {
  const { id } = useParams<{ id: string }>();

  const { data: video, isLoading } = useQuery({
    queryKey: ["video", id],
    queryFn: () => api.get(`/videos/${id}`).then((r) => r.data),
    refetchInterval: (data) =>
      data?.status && ["processing", "composing", "generating_voice"].includes(data.status)
        ? 4000
        : false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!video) {
    return <div className="text-muted-foreground">Video not found.</div>;
  }

  const isReady = video.status === "ready";
  const isProcessing = ["processing", "composing", "generating_voice"].includes(video.status);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <Link
            href="/videos"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to videos
          </Link>
          <h1 className="text-2xl font-bold truncate">{video.title}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusVariant(video.status)}>{video.status}</Badge>
            {video.duration_ms && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(video.duration_ms)}
              </span>
            )}
            {video.ai_provider && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Mic className="h-3.5 w-3.5" />
                {video.ai_provider}
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {isReady && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open(`/api/v1/videos/${id}/download`)}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          )}
          <Link href={`/videos/${id}/edit`}>
            <Button size="sm" className="gap-1.5">
              <Edit className="h-4 w-4" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      {/* Video player */}
      <div className="rounded-xl overflow-hidden border bg-black aspect-video flex items-center justify-center">
        {isReady ? (
          <video
            key={id}
            controls
            className="w-full h-full"
            preload="metadata"
            src={`/api/v1/videos/${id}/download`}
          >
            Your browser does not support the video element.
          </video>
        ) : isProcessing ? (
          <div className="flex flex-col items-center gap-3 text-white/70">
            <Loader2 className="h-12 w-12 animate-spin" />
            <p className="text-sm">
              {video.status === "generating_voice"
                ? "Generating voiceover…"
                : video.status === "composing"
                ? "Composing video…"
                : "Processing…"}
            </p>
            <p className="text-xs text-white/40">This page will update automatically.</p>
          </div>
        ) : video.status === "failed" ? (
          <div className="flex flex-col items-center gap-3 text-red-400">
            <AlertCircle className="h-12 w-12" />
            <p className="text-sm">Video generation failed.</p>
            <Link href={`/videos/${id}/edit`}>
              <Button variant="outline" size="sm">
                Try again in editor
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/50">
            <p className="text-sm">No video generated yet.</p>
            <Link href={`/videos/${id}/edit`}>
              <Button variant="outline" size="sm">
                Generate video
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Script / details */}
      {video.script_text && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Narration Script</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {video.script_text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Captions preview */}
      {video.captions && Array.isArray(video.captions) && video.captions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Captions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {video.captions.map((c: any, i: number) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {formatDuration(c.start_ms) ?? "—"}
                  </span>
                  <span>{c.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
