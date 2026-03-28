"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { BookOpen, Plus, Trash2, Edit, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/components/ui/toaster";

function statusVariant(s: string): any {
  if (s === "published") return "success";
  if (s === "draft") return "outline";
  return "secondary";
}

export default function GuidesPage() {
  const qc = useQueryClient();
  const { data: guides = [], isLoading } = useQuery({
    queryKey: ["guides"],
    queryFn: () => api.get("/guides").then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/guides/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guides"] });
      toast({ title: "Guide deleted" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Guides</h1>
          <p className="text-muted-foreground">Text-based step-by-step tutorials with screenshots</p>
        </div>
        <Link href="/record">
          <Button className="gap-2"><Plus className="h-4 w-4" />New Recording</Button>
        </Link>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && guides.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium">No guides yet</p>
              <p className="text-sm text-muted-foreground">Record your screen and AI will generate a guide automatically.</p>
            </div>
            <Link href="/record"><Button>Start Recording</Button></Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((g: any) => (
          <Card key={g.id} className="group relative flex flex-col hover:border-primary/50 transition-colors">
            <CardContent className="flex flex-col gap-3 p-5 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-tight line-clamp-2">{g.title}</h3>
                <Badge variant={statusVariant(g.status)} className="shrink-0">{g.status}</Badge>
              </div>
              {g.description && <p className="text-sm text-muted-foreground line-clamp-2">{g.description}</p>}
              <p className="text-xs text-muted-foreground mt-auto">
                {g.step_count} steps · {g.ai_provider ?? "manual"} · {formatDistanceToNow(new Date(g.created_at), { addSuffix: true })}
              </p>
              <div className="flex gap-2 pt-1">
                <Link href={`/guides/${g.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />View
                  </Button>
                </Link>
                <Link href={`/guides/${g.id}/edit`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Edit className="h-3.5 w-3.5" />Edit
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={() => { if (confirm("Delete this guide?")) deleteMutation.mutate(g.id); }}>
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
