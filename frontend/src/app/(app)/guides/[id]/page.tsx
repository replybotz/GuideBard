"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Edit, Download, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";

export default function GuideViewerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: guide, isLoading } = useQuery({
    queryKey: ["guide", id],
    queryFn: () => api.get(`/guides/${id}`).then((r) => r.data),
  });

  const handleExportPDF = async () => {
    const res = await api.post(`/guides/${id}/export/pdf`, {}, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url; a.download = `guide-${id}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!guide) return <div>Guide not found</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/guides" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-4 w-4" />Back to guides
          </Link>
          <h1 className="text-3xl font-bold">{guide.title}</h1>
          {guide.description && <p className="text-muted-foreground">{guide.description}</p>}
          <div className="flex items-center gap-2 pt-1">
            <Badge variant={guide.status === "published" ? "success" : "outline"}>{guide.status}</Badge>
            <span className="text-sm text-muted-foreground">{guide.steps?.length ?? 0} steps</span>
            {guide.ai_provider && <span className="text-sm text-muted-foreground">· via {guide.ai_provider}</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5">
            <Download className="h-4 w-4" />PDF
          </Button>
          <Link href={`/guides/${id}/edit`}>
            <Button size="sm" className="gap-1.5"><Edit className="h-4 w-4" />Edit</Button>
          </Link>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-8">
        {(guide.steps ?? []).map((step: any, i: number) => (
          <div key={step.id} className="flex gap-6">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
              {i + 1}
            </div>
            <div className="space-y-3 flex-1 pt-1">
              {step.title && <h3 className="font-semibold text-lg">{step.title}</h3>}
              {step.content && (
                <div className="prose prose-sm max-w-none text-foreground">
                  {step.content.split("\n").map((line: string, li: number) => (
                    <p key={li} className="text-sm leading-relaxed">{line}</p>
                  ))}
                </div>
              )}
              {step.screenshot_id && (
                <div className="rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={`/api/v1/storage/files/screenshots/${step.screenshot_id}.png`}
                    alt={`Step ${i + 1}`}
                    className="w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
