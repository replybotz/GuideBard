"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Radio, BookOpen, Video, FolderOpen, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

function StatCard({ label, value, icon: Icon, href }: { label: string; value: number; icon: any; href: string }) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function statusVariant(status: string): "default" | "success" | "warning" | "destructive" | "outline" {
  if (status === "ready" || status === "published") return "success";
  if (status === "processing" || status === "running") return "warning";
  if (status === "failed") return "destructive";
  return "outline";
}

export default function DashboardPage() {
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api.get("/projects").then((r) => r.data) });
  const { data: guides = [] } = useQuery({ queryKey: ["guides"], queryFn: () => api.get("/guides").then((r) => r.data) });
  const { data: videos = [] } = useQuery({ queryKey: ["videos"], queryFn: () => api.get("/videos").then((r) => r.data) });
  const { data: jobs = [] } = useQuery({ queryKey: ["ai-jobs"], queryFn: () => api.get("/ai/jobs").then((r) => r.data) });

  const recentGuides = guides.slice(0, 5);
  const recentVideos = videos.slice(0, 5);
  const activeJobs = jobs.filter((j: any) => j.status === "running" || j.status === "queued");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back — ready to create?</p>
        </div>
        <Link href="/record">
          <Button size="lg" className="gap-2">
            <Radio className="h-4 w-4" />
            New Recording
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Projects" value={projects.length} icon={FolderOpen} href="/projects" />
        <StatCard label="Guides" value={guides.length} icon={BookOpen} href="/guides" />
        <StatCard label="Videos" value={videos.length} icon={Video} href="/videos" />
        <StatCard label="Active Jobs" value={activeJobs.length} icon={Radio} href="/guides" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Guides */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Guides</CardTitle>
            <Link href="/guides" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentGuides.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No guides yet.{" "}
                <Link href="/record" className="text-primary hover:underline">Start a recording</Link>
              </div>
            ) : (
              recentGuides.map((g: any) => (
                <Link key={g.id} href={`/guides/${g.id}`} className="flex items-center justify-between rounded-md p-2 hover:bg-accent transition-colors">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{g.title}</p>
                    <p className="text-xs text-muted-foreground">{g.step_count} steps · {formatDistanceToNow(new Date(g.created_at), { addSuffix: true })}</p>
                  </div>
                  <Badge variant={statusVariant(g.status)}>{g.status}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Videos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Videos</CardTitle>
            <Link href="/videos" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentVideos.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No videos yet. Generate one from a guide.
              </div>
            ) : (
              recentVideos.map((v: any) => (
                <Link key={v.id} href={`/videos/${v.id}`} className="flex items-center justify-between rounded-md p-2 hover:bg-accent transition-colors">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{v.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.duration_ms ? `${Math.round(v.duration_ms / 1000)}s` : "—"} · {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge variant={statusVariant(v.status)}>{v.status}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick start */}
      {guides.length === 0 && videos.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Radio className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Record your first tutorial</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Capture your screen and GuideBard will automatically generate a step-by-step guide and narrated video.
              </p>
            </div>
            <Link href="/record">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Start Recording
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
