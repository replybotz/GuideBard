"use client";
/**
 * AnnotationCanvas — draws arrows, rectangles, and text labels on top of
 * a screenshot image. Annotations are stored as a JSON array and can be
 * persisted to the guide step via the `onChange` callback.
 *
 * Supported tools:
 *   arrow   — click-drag to draw a directional arrow
 *   rect    — click-drag to draw a highlight rectangle
 *   text    — click to place an editable text label
 *   select  — click to select and delete an existing annotation
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Square, Type, MousePointer, Trash2, RotateCcw } from "lucide-react";

export type AnnotationTool = "select" | "arrow" | "rect" | "text";

export interface Annotation {
  id: string;
  type: "arrow" | "rect" | "text";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text?: string;
  color: string;
}

interface Props {
  screenshotUrl?: string;
  annotations: Annotation[];
  onChange: (annotations: Annotation[]) => void;
}

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];
const DEFAULT_COLOR = "#ef4444";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  const headLen = 14;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawRect(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);
  const rx = Math.min(x1, x2);
  const ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1);
  const rh = Math.abs(y2 - y1);
  ctx.strokeRect(rx, ry, rw, rh);

  ctx.fillStyle = color + "22";
  ctx.fillRect(rx, ry, rw, rh);
}

function drawText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.font = "bold 14px sans-serif";
  const metrics = ctx.measureText(text);
  const pad = 4;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 16, metrics.width + pad * 2, 20);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x + pad, y - 2);
}

function renderAll(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  selectedId?: string | null,
  draft?: Annotation | null,
) {
  annotations.forEach((a) => {
    if (a.type === "arrow") drawArrow(ctx, a.x1, a.y1, a.x2, a.y2, a.color);
    else if (a.type === "rect") drawRect(ctx, a.x1, a.y1, a.x2, a.y2, a.color);
    else if (a.type === "text" && a.text) drawText(ctx, a.x1, a.y1, a.text, a.color);

    // Selection highlight
    if (a.id === selectedId) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const rx = Math.min(a.x1, a.x2) - 4;
      const ry = Math.min(a.y1, a.y2) - 4;
      ctx.strokeRect(rx, ry, Math.abs(a.x2 - a.x1) + 8, Math.abs(a.y2 - a.y1) + 8);
      ctx.setLineDash([]);
    }
  });

  if (draft) {
    ctx.globalAlpha = 0.7;
    if (draft.type === "arrow") drawArrow(ctx, draft.x1, draft.y1, draft.x2, draft.y2, draft.color);
    else if (draft.type === "rect") drawRect(ctx, draft.x1, draft.y1, draft.x2, draft.y2, draft.color);
    ctx.globalAlpha = 1;
  }
}

export default function AnnotationCanvas({ screenshotUrl, annotations, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("arrow");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load + draw image
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (imgRef.current) {
      ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#1e1e2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    renderAll(ctx, annotations, selectedId, draft);
  }, [annotations, selectedId, draft]);

  useEffect(() => {
    if (!screenshotUrl) {
      redraw();
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = screenshotUrl;
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      redraw();
    };
  }, [screenshotUrl, redraw]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);

    if (tool === "select") {
      // Find the topmost annotation that contains the click
      const hit = [...annotations].reverse().find((a) => {
        const rx = Math.min(a.x1, a.x2) - 8;
        const ry = Math.min(a.y1, a.y2) - 8;
        const rw = Math.abs(a.x2 - a.x1) + 16;
        const rh = Math.abs(a.y2 - a.y1) + 16;
        return pos.x >= rx && pos.x <= rx + rw && pos.y >= ry && pos.y <= ry + rh;
      });
      setSelectedId(hit?.id ?? null);
      return;
    }

    if (tool === "text") {
      const label = window.prompt("Enter annotation text:");
      if (!label) return;
      const a: Annotation = {
        id: uid(),
        type: "text",
        x1: pos.x,
        y1: pos.y,
        x2: pos.x,
        y2: pos.y,
        text: label,
        color,
      };
      onChange([...annotations, a]);
      return;
    }

    setDragging(true);
    setDragStart(pos);
    setDraft({
      id: uid(),
      type: tool as "arrow" | "rect",
      x1: pos.x,
      y1: pos.y,
      x2: pos.x,
      y2: pos.y,
      color,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || !dragStart || !draft) return;
    const pos = getPos(e);
    setDraft((d) => d ? { ...d, x2: pos.x, y2: pos.y } : null);
  };

  const handleMouseUp = () => {
    if (!dragging || !draft) return;
    setDragging(false);
    setDragStart(null);
    const minSize = 5;
    if (Math.abs(draft.x2 - draft.x1) > minSize || Math.abs(draft.y2 - draft.y1) > minSize) {
      onChange([...annotations, draft]);
    }
    setDraft(null);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    onChange(annotations.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  };

  const clearAll = () => {
    if (annotations.length === 0) return;
    if (confirm("Clear all annotations?")) onChange([]);
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-md border overflow-hidden">
          {(["select", "arrow", "rect", "text"] as AnnotationTool[]).map((t) => {
            const Icon = t === "select" ? MousePointer : t === "arrow" ? ArrowRight : t === "rect" ? Square : Type;
            return (
              <button
                key={t}
                onClick={() => setTool(t)}
                className={`p-1.5 text-sm transition-colors ${tool === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                title={t.charAt(0).toUpperCase() + t.slice(1)}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        {/* Color picker */}
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full border-2 transition-transform ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="ml-auto flex gap-1">
          {selectedId && (
            <Button variant="ghost" size="sm" onClick={deleteSelected} className="gap-1 text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1">
            <RotateCcw className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative overflow-hidden rounded-lg border bg-muted" style={{ cursor: tool === "text" ? "text" : tool === "select" ? "default" : "crosshair" }}>
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full block"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        {!screenshotUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm pointer-events-none">
            No screenshot for this step
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{annotations.length} annotation{annotations.length !== 1 ? "s" : ""}</p>
    </div>
  );
}
