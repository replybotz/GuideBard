"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { FolderOpen, Plus, Trash2, BookOpen, Video, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import api from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/projects", { title: newTitle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setOpen(false); setNewTitle(""); toast({ title: "Project created" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); toast({ title: "Project deleted" }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">Organize your recordings, guides, and videos</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" />New Project</Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && projects.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/40" />
            <div><p className="font-medium">No projects yet</p><p className="text-sm text-muted-foreground">Projects keep your work organized.</p></div>
            <Button onClick={() => setOpen(true)}>Create Project</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p: any) => (
          <Card key={p.id} className="hover:border-primary/50 transition-colors">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <Link href={`/projects/${p.id}`} className="font-semibold hover:text-primary transition-colors leading-tight">{p.title}</Link>
                <button onClick={() => { if (confirm("Delete project and all its content?")) deleteMutation.mutate(p.id); }} className="text-muted-foreground hover:text-destructive ml-2">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Radio className="h-3.5 w-3.5" />{p.recording_count}</span>
                <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{p.guide_count}</span>
                <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" />{p.video_count}</span>
              </div>
              <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Project</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Project Title</Label>
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Onboarding Tutorials" autoFocus onKeyDown={(e) => { if (e.key === "Enter" && newTitle) createMutation.mutate(); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!newTitle || createMutation.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
