"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Youtube, Globe, ExternalLink, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import api from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

function JobStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  return <div className="h-4 w-4 rounded-full bg-muted-foreground/30" />;
}

export default function PublishPage() {
  const qc = useQueryClient();
  const [ytVideoId, setYtVideoId] = useState("");
  const [ytTargetId, setYtTargetId] = useState("");
  const [ytTitle, setYtTitle] = useState("");
  const [ytVisibility, setYtVisibility] = useState("private");
  const [wpGuideId, setWpGuideId] = useState("");
  const [wpVideoId, setWpVideoId] = useState("");
  const [wpTargetId, setWpTargetId] = useState("");
  const [wpTitle, setWpTitle] = useState("");
  const [wpStatus, setWpStatus] = useState("draft");

  const { data: targets = [] } = useQuery({ queryKey: ["publish-targets"], queryFn: () => api.get("/publish/targets").then((r) => r.data) });
  const { data: videos = [] } = useQuery({ queryKey: ["videos"], queryFn: () => api.get("/videos").then((r) => r.data) });
  const { data: guides = [] } = useQuery({ queryKey: ["guides"], queryFn: () => api.get("/guides").then((r) => r.data) });
  const { data: jobs = [], refetch: refetchJobs } = useQuery({ queryKey: ["publish-jobs"], queryFn: () => api.get("/publish/jobs").then((r) => r.data), refetchInterval: 5000 });

  const ytTargets = targets.filter((t: any) => t.platform === "youtube");
  const wpTargets = targets.filter((t: any) => t.platform === "wordpress");
  const readyVideos = videos.filter((v: any) => v.status === "ready");

  const ytMutation = useMutation({
    mutationFn: () => api.post("/publish/youtube", { video_id: ytVideoId, target_id: ytTargetId, title: ytTitle, visibility: ytVisibility }),
    onSuccess: () => { refetchJobs(); toast({ title: "YouTube upload started" }); },
    onError: () => toast({ title: "Failed to start YouTube upload", variant: "destructive" }),
  });

  const wpMutation = useMutation({
    mutationFn: () => api.post("/publish/wordpress", { guide_id: wpGuideId || undefined, video_id: wpVideoId || undefined, target_id: wpTargetId, title: wpTitle, post_status: wpStatus }),
    onSuccess: () => { refetchJobs(); toast({ title: "WordPress publish started" }); },
    onError: () => toast({ title: "WordPress publish failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Publish</h1>
        <p className="text-muted-foreground">Push your guides and videos to YouTube and WordPress</p>
      </div>

      {targets.length === 0 && (
        <Card className="border-dashed border-amber-200 bg-amber-50">
          <CardContent className="py-4">
            <p className="text-sm text-amber-700">No publishing destinations configured. <a href="/settings" className="underline font-medium">Go to Settings → Publishing</a> to add WordPress or YouTube.</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="youtube">
        <TabsList>
          <TabsTrigger value="youtube" className="gap-2"><Youtube className="h-4 w-4" />YouTube</TabsTrigger>
          <TabsTrigger value="wordpress" className="gap-2"><Globe className="h-4 w-4" />WordPress</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="youtube" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Publish to YouTube</CardTitle><CardDescription>Upload a composed video directly to your YouTube channel.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {ytTargets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No YouTube channels connected. <a href="/settings" className="text-primary underline">Connect one in Settings.</a></p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Channel</Label>
                      <Select value={ytTargetId} onValueChange={setYtTargetId}>
                        <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                        <SelectContent>{ytTargets.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Video</Label>
                      <Select value={ytVideoId} onValueChange={setYtVideoId}>
                        <SelectTrigger><SelectValue placeholder="Select video" /></SelectTrigger>
                        <SelectContent>{readyVideos.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Video Title</Label>
                    <Input value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} placeholder="My Tutorial Video" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Visibility</Label>
                    <Select value={ytVisibility} onValueChange={setYtVisibility}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="unlisted">Unlisted</SelectItem>
                        <SelectItem value="public">Public</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => ytMutation.mutate()} disabled={!ytVideoId || !ytTargetId || !ytTitle || ytMutation.isPending} className="gap-2">
                    {ytMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Youtube className="h-4 w-4" />Upload to YouTube
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wordpress" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Publish to WordPress</CardTitle><CardDescription>Create a blog post with your guide steps and/or video embed.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {wpTargets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No WordPress sites connected. <a href="/settings" className="text-primary underline">Connect one in Settings.</a></p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>WordPress Site</Label>
                      <Select value={wpTargetId} onValueChange={setWpTargetId}>
                        <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                        <SelectContent>{wpTargets.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Post Status</Label>
                      <Select value={wpStatus} onValueChange={setWpStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="publish">Publish immediately</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Post Title</Label>
                    <Input value={wpTitle} onChange={(e) => setWpTitle(e.target.value)} placeholder="How to…" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Guide (optional)</Label>
                      <Select value={wpGuideId} onValueChange={setWpGuideId}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {guides.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Video (optional)</Label>
                      <Select value={wpVideoId} onValueChange={setWpVideoId}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {readyVideos.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={() => wpMutation.mutate()} disabled={!wpTargetId || !wpTitle || (!wpGuideId && !wpVideoId) || wpMutation.isPending} className="gap-2">
                    {wpMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Globe className="h-4 w-4" />Publish to WordPress
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Publish History</CardTitle></CardHeader>
            <CardContent>
              {jobs.length === 0 && <p className="text-sm text-muted-foreground">No publish jobs yet.</p>}
              <div className="space-y-3">
                {jobs.map((j: any) => (
                  <div key={j.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <JobStatusIcon status={j.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">{j.entity_type} → {targets.find((t: any) => t.id === j.target_id)?.platform ?? "unknown"}</p>
                      <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}</p>
                      {j.error_message && <p className="text-xs text-destructive">{j.error_message}</p>}
                    </div>
                    {j.platform_url && (
                      <a href={j.platform_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /></Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
