"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Video, Trash2, Edit, Download, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/components/ui/toaster";

function statusVariant(s: string): any {
  if (s === "ready") return "success";
  if (s === "processing") return "warning";
  if (s === "failed") return "destructive";
  return "outline";
}

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function VideosPage() {
  const qc = useQueryClient();
  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => api.get("/videos").then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/videos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["videos"] }); toast({ title: "Video deleted" }); },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Videos</h1>
        <p className="text-muted-foreground">Narrated tutorial videos generated from your recordings</p>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && videos.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <Video className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium">No videos yet</p>
              <p className="text-sm text-muted-foreground">Generate a video from a guide by adding a voiceover script.</p>
            </div>
            <Link href="/guides"><Button>View Guides</Button></Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v: any) => (
          <Card key={v.id} className="hover:border-primary/50 transition-colors">
            <CardContent className="flex flex-col gap-3 p-5">
              {/* Thumbnail placeholder */}
              <div className="relative aspect-video rounded-md bg-muted flex items-center justify-center overflow-hidden">
                <Play className="h-10 w-10 text-muted-foreground/40" />
                <Badge className="absolute top-2 right-2" variant={statusVariant(v.status)}>{v.status}</Badge>
              </div>
              <h3 className="font-semibold leading-tight line-clamp-2">{v.title}</h3>
              <p className="text-xs text-muted-foreground">
                {formatDuration(v.duration_ms)} · {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
              </p>
              <div className="flex gap-2">
                <Link href={`/videos/${v.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-1.5"><Play className="h-3.5 w-3.5" />Play</Button>
                </Link>
                <Link href={`/videos/${v.id}/edit`}>
                  <Button variant="outline" size="sm"><Edit className="h-3.5 w-3.5" /></Button>
                </Link>
                {v.status === "ready" && (
                  <Button variant="outline" size="sm" onClick={() => window.open(`/api/v1/videos/${v.id}/download`)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(v.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
