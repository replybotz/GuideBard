"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { ArrowLeft, Plus, GripVertical, Trash2, Save, Eye } from "lucide-react";
import Link from "next/link";
import AnnotationCanvas, { Annotation } from "@/components/guide/AnnotationCanvas";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import api from "@/lib/api";

function SortableStep({ step, isActive, onSelect, onDelete }: { step: any; isActive: boolean; onSelect: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 rounded-md border p-3 cursor-pointer transition-colors ${isActive ? "border-primary bg-primary/5" : "bg-background hover:bg-accent"}`} onClick={onSelect}>
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
        <GripVertical className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{step.title || `Step ${step.sequence_order + 1}`}</p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-muted-foreground hover:text-destructive p-1">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function GuideEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: guide } = useQuery({
    queryKey: ["guide", id],
    queryFn: () => api.get(`/guides/${id}`).then((r) => r.data),
    onSuccess: (data) => {
      setSteps(data.steps ?? []);
      if (data.steps?.length && !activeStepId) setActiveStepId(data.steps[0].id);
    },
  });

  const activeStep = steps.find((s) => s.id === activeStepId);

  const editor = useEditor({
    extensions: [StarterKit],
    content: activeStep?.content ?? "",
    onUpdate: ({ editor }) => {
      if (activeStepId) {
        setSteps((prev) => prev.map((s) => s.id === activeStepId ? { ...s, content: editor.getText() } : s));
      }
    },
  }, [activeStepId]);

  // Re-load editor when switching steps
  const handleSelectStep = useCallback((stepId: string) => {
    setActiveStepId(stepId);
    const s = steps.find((x) => x.id === stepId);
    if (s && editor) editor.commands.setContent(s.content ?? "");
  }, [steps, editor]);

  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setSteps((prev) => {
        const oldIdx = prev.findIndex((s) => s.id === active.id);
        const newIdx = prev.findIndex((s) => s.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  const addStep = async () => {
    const res = await api.post(`/guides/${id}/steps`, { title: `Step ${steps.length + 1}`, content: "" });
    const newStep = res.data;
    setSteps((prev) => [...prev, newStep]);
    setActiveStepId(newStep.id);
    editor?.commands.setContent("");
  };

  const deleteStep = async (stepId: string) => {
    await api.delete(`/guides/${id}/steps/${stepId}`);
    setSteps((prev) => {
      const remaining = prev.filter((s) => s.id !== stepId);
      if (activeStepId === stepId && remaining.length) setActiveStepId(remaining[0].id);
      return remaining;
    });
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Save current step content + annotations
      if (activeStep && editor) {
        await api.put(`/guides/${id}/steps/${activeStep.id}`, {
          title: activeStep.title,
          content: editor.getText(),
          annotations: activeStep.annotations ?? [],
        });
      }
      // Reorder
      await api.patch(`/guides/${id}/steps/reorder`, { order: steps.map((s) => s.id) });
      qc.invalidateQueries({ queryKey: ["guide", id] });
      toast({ title: "Guide saved" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0 -m-6">
      {/* Left panel: step list */}
      <div className="flex w-64 flex-col border-r bg-background">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <Link href={`/guides/${id}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Back
          </Link>
          <button onClick={addStep} className="text-primary hover:text-primary/80">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {steps.map((s) => (
                <SortableStep
                  key={s.id} step={s}
                  isActive={s.id === activeStepId}
                  onSelect={() => handleSelectStep(s.id)}
                  onDelete={() => deleteStep(s.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
          {steps.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No steps yet. Click + to add.</p>
          )}
        </div>
      </div>

      {/* Center: content editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-6 py-3 bg-background">
          <h1 className="font-semibold truncate">{guide?.title ?? "Guide Editor"}</h1>
          <div className="flex gap-2">
            <Link href={`/guides/${id}`}>
              <Button variant="outline" size="sm" className="gap-1.5"><Eye className="h-4 w-4" />Preview</Button>
            </Link>
            <Button size="sm" onClick={saveAll} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />{saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {activeStep ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <Input
              value={activeStep.title ?? ""}
              onChange={(e) => setSteps((prev) => prev.map((s) => s.id === activeStepId ? { ...s, title: e.target.value } : s))}
              placeholder="Step title…"
              className="text-lg font-semibold border-0 border-b rounded-none px-0 focus-visible:ring-0 text-xl"
            />
            <div className="min-h-[300px] border rounded-md p-4 prose prose-sm max-w-none">
              <EditorContent editor={editor} />
            </div>
            {/* Annotation canvas — shown whenever there's a screenshot; also usable without one */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Screenshot &amp; Annotations</p>
              <AnnotationCanvas
                screenshotUrl={
                  activeStep.screenshot_id
                    ? `/api/v1/storage/files/screenshots/${activeStep.screenshot_id}.png`
                    : undefined
                }
                annotations={(activeStep.annotations as Annotation[]) ?? []}
                onChange={(annotations) => {
                  setSteps((prev) =>
                    prev.map((s) =>
                      s.id === activeStepId ? { ...s, annotations } : s
                    )
                  );
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a step to edit, or click + to add one.
          </div>
        )}
      </div>
    </div>
  );
}
