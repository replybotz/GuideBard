"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, BookOpen, Video, Radio, Edit2, Trash2,
  Plus, Play, Download, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import api from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

function statusVariant(s: string): any {
  if (s === "ready" || s === "published") return "success";
  if (s === "processing" || s === "running" || s === "composing") return "warning";
  if (s === "failed") return "destructive";
  return "outline";
}

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.get(`/projects/${id}`).then((r) => r.data),
  });

  const { data: allGuides = [] } = useQuery({
    queryKey: ["guides"],
    queryFn: () => api.get("/guides").then((r) => r.data),
  });

  const { data: allVideos = [] } = useQuery({
    queryKey: ["videos"],
    queryFn: () => api.get("/videos").then((r) => r.data),
  });

  const { data: allRecordings = [] } = useQuery({
    queryKey: ["recordings"],
    queryFn: () => api.get("/recordings").then((r) => r.data),
  });

  const guides = allGuides.filter((g: any) => g.project_id === id);
  const videos = allVideos.filter((v: any) => v.project_id === id);
  const recordings = allRecordings.filter((r: any) => r.project_id === id);

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/projects/${id}`, { title: editTitle }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setEditOpen(false);
      toast({ title: "Project updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project deleted" });
      router.push("/projects");
    },
  });

  const openEdit = () => {
    setEditTitle(project?.title ?? "");
    setEditOpen(true);
  };

  if (projectLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!project) return <div>Project not found.</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <Link
            href="/projects"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Link>
          <h1 className="text-2xl font-bold truncate">{project.title}</h1>
          {project.description && (
            <p className="text-muted-foreground text-sm">{project.description}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
            <span>{recordings.length} recording{recordings.length !== 1 ? "s" : ""}</span>
            <span>{guides.length} guide{guides.length !== 1 ? "s" : ""}</span>
            <span>{videos.length} video{videos.length !== 1 ? "s" : ""}</span>
            <span>Created {formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
            <Edit2 className="h-4 w-4" />
            Rename
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => { if (confirm("Delete this project?")) deleteMutation.mutate(); }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link href={`/record?project_id=${id}`}>
          <Button className="gap-2">
            <Radio className="h-4 w-4" />
            New Recording
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Guides */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Guides
            </CardTitle>
            <Link href="/guides" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ExternalLink className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {guides.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No guides in this project yet.
              </p>
            ) : (
              <div className="space-y-2">
                {guides.map((g: any) => (
                  <Link
                    key={g.id}
                    href={`/guides/${g.id}`}
                    className="flex items-center justify-between rounded-md p-2 hover:bg-accent transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{g.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.step_count} steps · {formatDistanceToNow(new Date(g.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant={statusVariant(g.status)} className="shrink-0 ml-2">
                      {g.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Videos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-4 w-4" />
              Videos
            </CardTitle>
            <Link href="/videos" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ExternalLink className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {videos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No videos in this project yet.
              </p>
            ) : (
              <div className="space-y-2">
                {videos.map((v: any) => (
                  <Link
                    key={v.id}
                    href={`/videos/${v.id}`}
                    className="flex items-center justify-between rounded-md p-2 hover:bg-accent transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{v.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(v.duration_ms)} · {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant={statusVariant(v.status)} className="shrink-0 ml-2">
                      {v.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recordings */}
      {recordings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4" />
              Recordings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recordings.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md p-2 border"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.title || "Untitled recording"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDuration(r.duration_ms)} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge variant={statusVariant(r.status)} className="shrink-0 ml-2">
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Title</Label>
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && editTitle.trim()) updateMutation.mutate(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={!editTitle.trim() || updateMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
