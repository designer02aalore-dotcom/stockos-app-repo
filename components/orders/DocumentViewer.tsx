"use client";

import React, { useState, useRef } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
  Maximize2,
  Minimize2,
  FileImage,
  RefreshCw,
  Eye,
  EyeOff,
  Move,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DocumentViewerProps {
  imageUrl: string;
  sourceReference?: string | null;
  onClose?: () => void;
}

export function DocumentViewer({
  imageUrl,
  sourceReference,
  onClose,
}: DocumentViewerProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3.5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1 && rotation === 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-2xl border border-slate-700/80 shadow-lg overflow-hidden select-none">
      {/* Viewer Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/90 border-b border-slate-800 text-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
            <FileImage className="size-4" />
          </div>
          <div className="truncate">
            <span className="text-xs font-semibold text-white tracking-wide block truncate">
              Original Document
            </span>
            <span className="text-[10px] text-slate-400 block truncate font-mono">
              {sourceReference || "uploaded_image.jpeg"}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <Badge
            variant="outline"
            className="text-[10px] h-5 px-1.5 border-slate-700 text-slate-300 font-mono hidden sm:inline-flex"
          >
            {Math.round(zoom * 100)}%
          </Badge>

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleZoomOut}
            title="Zoom Out"
            className="text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <ZoomOut className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleZoomIn}
            title="Zoom In"
            className="text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <ZoomIn className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleRotate}
            title="Rotate 90° Clockwise"
            className="text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <RotateCw className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleReset}
            title="Reset View"
            className="text-slate-300 hover:text-white hover:bg-slate-800 text-[10px] px-1 font-mono"
          >
            100%
          </Button>

          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open Original Image in New Tab"
            className="inline-flex items-center justify-center size-6 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ExternalLink className="size-3.5" />
          </a>

          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              title="Hide Document"
              className="text-slate-400 hover:text-rose-400 hover:bg-slate-800 ml-1"
            >
              <EyeOff className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Image Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`relative flex-1 overflow-auto min-h-[420px] max-h-[calc(100vh-210px)] p-4 flex items-center justify-center bg-slate-950/60 ${
          isDragging ? "cursor-grabbing" : zoom > 1 ? "cursor-grab" : "cursor-default"
        }`}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.15s ease-out",
          }}
          className="relative max-w-full inline-block shadow-2xl rounded-lg overflow-hidden border border-slate-800"
        >
          <img
            src={imageUrl}
            alt="Original Document"
            className="max-w-full max-h-[720px] object-contain select-none"
            draggable={false}
          />
        </div>

        {/* Drag Hint when zoomed in */}
        {zoom > 1 && (
          <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/70 backdrop-blur rounded text-[10px] text-slate-300 flex items-center gap-1.5 pointer-events-none">
            <Move className="size-3" />
            <span>Click & drag to pan</span>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-3.5 py-1.5 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Original image preserved from extraction
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          Scroll / Drag to inspect handwriting
        </span>
      </div>
    </div>
  );
}
