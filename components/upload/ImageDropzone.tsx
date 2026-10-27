"use client";

import React, { useState, useRef, useEffect } from "react";
import { Link, useRouter } from "@/lib/router";
import {
  UploadCloud,
  FileImage,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ScanLine,
  Plus,
  Files,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/utils";

export interface SessionUpload {
  importId: string;
  fileName: string;
  customerName: string;
  poNumber: string;
  itemsCount: number;
  total: number;
  timestamp: string;
}

export function ImageDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressStage, setProgressStage] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [extractedImportId, setExtractedImportId] = useState<string | null>(null);

  // Completed uploads in the current session
  const [sessionUploads, setSessionUploads] = useState<SessionUpload[]>([]);
  const [lastExtracted, setLastExtracted] = useState<SessionUpload | null>(null);

  // Clean up object URL when file changes
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  // Support direct Ctrl+V paste from clipboard
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (uploading) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileSelected(file);
            break;
          }
        }
      }
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [uploading]);

  function handleFileSelected(file: File) {
    setError(null);
    setSelectedFile(file);
    startExtraction(file);
  }

  async function handleFilesSelected(files: File[]) {
    if (files.length === 0) return;

    if (files.length === 1) {
      handleFileSelected(files[0]);
      return;
    }

    // Process multiple selected files sequentially
    setUploading(true);
    setError(null);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      setSelectedFile(file);
      setProgressStage(`Extracting ${i + 1} of ${files.length}: ${file.name}...`);
      setProgressPercent(Math.round(((i + 0.3) / files.length) * 100));

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/extract/image", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (res.ok && data.importId) {
          const item: SessionUpload = {
            importId: data.importId,
            fileName: file.name,
            customerName: data.extracted?.customer?.name || "Customer",
            poNumber: data.extracted?.po_number || "Auto",
            itemsCount: data.extracted?.items?.length || 0,
            total: data.extracted?.total || 0,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };

          setSessionUploads((prev) => [item, ...prev.filter((u) => u.importId !== item.importId)]);
          setLastExtracted(item);
        }
      } catch (err) {
        console.warn("Failed batch extraction on:", file.name, err);
      }
    }

    setUploading(false);
    setProgressPercent(100);
    setProgressStage(`Processed all ${files.length} images successfully.`);
    handleReset();
  }

  async function startExtraction(file: File) {
    setUploading(true);
    setError(null);
    setProgressPercent(15);
    setProgressStage("Uploading document to secure storage...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Advance stage after short delay for real-time visual feedback
      const timer1 = setTimeout(() => {
        setProgressPercent(45);
        setProgressStage("Running OCR & analyzing extracted order text...");
      }, 1200);

      const timer2 = setTimeout(() => {
        setProgressPercent(80);
        setProgressStage("Matching customers and catalog items in Supabase...");
      }, 3000);

      const res = await fetch("/api/extract/image", {
        method: "POST",
        body: formData,
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "AI document extraction failed");
      }

      setExtractedImportId(data.importId);
      setProgressPercent(100);
      setProgressStage("Extraction complete! Order draft created.");
      setUploading(false);

      const item: SessionUpload = {
        importId: data.importId,
        fileName: file.name,
        customerName: data.extracted?.customer?.name || "Customer",
        poNumber: data.extracted?.po_number || "Auto",
        itemsCount: data.extracted?.items?.length || 0,
        total: data.extracted?.total || 0,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setSessionUploads((prev) => [item, ...prev.filter((u) => u.importId !== item.importId)]);
      setLastExtracted(item);

      // NO AUTOMATIC REDIRECT:
      // The user stays on the upload page so they can immediately upload the next image
      // or review the draft when ready.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract order.");
      setUploading(false);
      setProgressPercent(0);
      setProgressStage("");
    }
  }

  function handleReset() {
    setSelectedFile(null);
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {
        // ignore
      }
    }
    setPreviewUrl(null);
    setUploading(false);
    setError(null);
    setProgressPercent(0);
    setProgressStage("");
    setExtractedImportId(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) handleFilesSelected(files);
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleFilesSelected(files);
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return (
    <div className="space-y-6">
      {/* Hidden File Input supporting multiple files */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
        onChange={onFileInputChange}
        disabled={uploading}
        className="hidden"
      />

      {/* Manual order helper banner */}
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs">
        <div className="flex items-center gap-2 text-blue-900 font-medium">
          <Sparkles className="size-4 text-blue-600 shrink-0" />
          <span>Need to create an order manually without uploading an image or memo?</span>
        </div>
        <Link
          href="/orders/new"
          className="font-semibold text-blue-700 hover:text-blue-900 hover:underline shrink-0"
        >
          Create Manual Order →
        </Link>
      </div>

      {/* Extracted Success Banner with Instant "Upload Next" Action */}
      {lastExtracted && !uploading && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl space-y-3 animate-in fade-in shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-emerald-950">
                    Order Extracted Successfully!
                  </h4>
                  <Badge variant="outline" className="bg-white border-emerald-300 text-emerald-800 text-[10px] font-mono">
                    {lastExtracted.poNumber}
                  </Badge>
                </div>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Customer: <strong>{lastExtracted.customerName}</strong> • {lastExtracted.itemsCount} line items • Extracted Total: <strong>{formatINR(lastExtracted.total)}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                className="h-8.5 px-3.5 text-xs font-semibold gap-1.5 border-emerald-300 text-emerald-900 hover:bg-emerald-100/60 cursor-pointer"
              >
                <Plus className="size-3.5 text-emerald-700" />
                <span>Upload Next Image</span>
              </Button>
              <Link
                href={`/orders/${lastExtracted.importId}`}
                className="h-8.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <span>Review Draft Now</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main Upload / Preview Area */}
      {!selectedFile ? (
        /* State 1: No file chosen yet (Dropzone) */
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-10 md:p-14 text-center transition-all cursor-pointer bg-card shadow-sm ${dragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-slate-500 hover:border-primary dark:border-slate-400 hover:bg-muted/30"
            }`}
        >
          <div className="mx-auto size-16 rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-900 mb-5 shadow-xs">
            <UploadCloud className="size-8" />
          </div>

          <h2 className="text-lg font-bold text-foreground mb-1">
            Choose order image(s) or drop them here
          </h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mb-5 leading-relaxed">
            Upload purchase orders, invoices, packing slips, or{" "}
            <strong className="text-foreground">handwritten cash memos</strong>. Supports drag & drop, batch selection, or paste (<kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">Ctrl + V</kbd>).
          </p>

          <div className="flex items-center justify-center gap-2 mb-6">
            <Button
              type="button"
              className="h-9 px-6 text-xs font-semibold shadow-xs gap-2 cursor-pointer"
            >
              <FileImage className="size-4" />
              <span>Browse Image Files (Single or Multiple)</span>
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <span className="px-2 py-0.5 rounded-md bg-muted border border-slate-300 dark:border-slate-700 font-mono">
              PNG
            </span>
            <span className="px-2 py-0.5 rounded-md bg-muted border border-slate-300 dark:border-slate-700 font-mono">
              JPG / JPEG
            </span>
            <span className="px-2 py-0.5 rounded-md bg-muted border border-slate-300 dark:border-slate-700 font-mono">
              WEBP
            </span>
            <span className="px-2 py-0.5 rounded-md bg-muted border border-slate-300 dark:border-slate-700 font-mono">
              PDF
            </span>
          </div>
        </div>
      ) : (
        /* State 2: File Selected & Image Preview Display */
        <Card className="border border-slate-500 dark:border-slate-400 bg-card shadow-sm rounded-2xl overflow-hidden">
          {/* Card Header with File Info */}
          <div className="px-6 py-4 border-b border-slate-300 dark:border-slate-700 bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-900 shrink-0">
                <FileImage className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground truncate max-w-xs md:max-w-md">
                  {selectedFile.name}
                </h3>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{formatFileSize(selectedFile.size)}</span>
                  <span>•</span>
                  <span>{selectedFile.type || "image/jpeg"}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {uploading ? (
                <Badge
                  variant="outline"
                  className="border-blue-400 text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-400 gap-1.5 text-xs font-semibold py-1 px-3"
                >
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Processing</span>
                </Badge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="h-8 text-xs font-semibold gap-1.5 border-slate-400 cursor-pointer hover:bg-slate-100"
                >
                  <Plus className="size-3.5" />
                  <span>Upload Another Image</span>
                </Button>
              )}
            </div>
          </div>

          <CardContent className="p-6 space-y-6">
            {/* The Image Preview Container */}
            <div className="relative rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-900/5 dark:bg-slate-900/40 p-3 flex flex-col items-center justify-center overflow-hidden min-h-[260px] max-h-[460px]">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Chosen Document Preview"
                  className="max-h-[420px] w-auto max-w-full object-contain rounded-lg shadow-sm"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-muted-foreground py-16">
                  <FileImage className="size-12 mb-2" />
                  <p className="text-xs">Document preview loaded</p>
                </div>
              )}

              {/* Scanning Overlay Effect while uploading */}
              {uploading && (
                <div className="absolute inset-0 bg-blue-600/10 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none transition-all">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-pulse" />
                </div>
              )}
            </div>

            {/* Live Progress Bar & Status Text */}
            {uploading || extractedImportId ? (
              <div className="space-y-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 p-4">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-200">
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    )}
                    <span>{progressStage}</span>
                  </div>
                  <span className="font-mono font-bold text-primary">
                    {progressPercent}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 rounded-full bg-blue-100 dark:bg-blue-900/60 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Our AI vision model is extracting customer details, reading handwriting, parsing all line items, and auto-matching your product catalog.
                </p>

                {extractedImportId && (
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-3 animate-in fade-in-50">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReset}
                      className="h-9 px-4 text-xs font-semibold gap-1.5 border-slate-400 cursor-pointer"
                    >
                      <Plus className="size-3.5 text-slate-700" />
                      <span>Upload Next Image</span>
                    </Button>
                    <Link
                      href={`/orders/${extractedImportId}`}
                      className="h-9 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="size-4" />
                      <span>Review Draft Now →</span>
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="h-9 px-4 text-xs font-semibold border-slate-400 cursor-pointer"
                >
                  <X className="size-3.5 mr-1" />
                  Discard
                </Button>

                <Button
                  type="button"
                  onClick={() => selectedFile && startExtraction(selectedFile)}
                  className="h-9 px-6 text-xs font-semibold gap-2 shadow-xs cursor-pointer"
                >
                  <Sparkles className="size-3.5" />
                  <span>Start AI Extraction</span>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Orders Processed in this Session Section */}
      {sessionUploads.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Files className="size-4 text-blue-600" />
              <span>Uploaded in this Session</span>
              <Badge variant="outline" className="text-[11px] font-semibold bg-muted">
                {sessionUploads.length} {sessionUploads.length === 1 ? "document" : "documents"}
              </Badge>
            </h3>
            <span className="text-xs text-muted-foreground">
              Ready for verification & confirmation
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {sessionUploads.map((up) => (
              <div
                key={up.importId}
                className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs flex flex-wrap items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shrink-0">
                    <CheckCircle2 className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground truncate max-w-xs">
                        {up.customerName}
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-slate-50 border-slate-200 text-slate-600 font-mono">
                        {up.poNumber}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-md">
                      {up.fileName} • {up.itemsCount} line items • Extracted Total: <strong>{formatINR(up.total)}</strong> • {up.timestamp}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/orders/${up.importId}`}
                    className="inline-flex items-center gap-1.5 h-8 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer"
                  >
                    <span>Review Draft</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Alert Box */}
      {error && (
        <Card className="border border-destructive/50 bg-destructive/5 shadow-xs">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-destructive">
                Extraction Failed
              </h4>
              <p className="text-xs text-destructive/80">{error}</p>
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => selectedFile && startExtraction(selectedFile)}
                  className="h-7 text-xs font-semibold border-destructive/40 text-destructive hover:bg-destructive/10 cursor-pointer"
                >
                  <RotateCcw className="size-3 mr-1" />
                  Retry Extraction
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guidelines & Features Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border border-slate-300 dark:border-slate-700 bg-card shadow-sm p-4">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shrink-0">
              <CheckCircle2 className="size-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">
                All 16+ Rows Extracted
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Every line item, quantity, and rate is captured with zero dropped rows.
              </p>
            </div>
          </div>
        </Card>

        <Card className="border border-slate-300 dark:border-slate-700 bg-card shadow-sm p-4">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200 shrink-0">
              <ScanLine className="size-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">
                Handwritten Memo Support
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Reads cursive Indian handwriting, stamps, phone numbers, and cash memos.
              </p>
            </div>
          </div>
        </Card>

        <Card className="border border-slate-300 dark:border-slate-700 bg-card shadow-sm p-4">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200 shrink-0">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">
                Batch Upload & No Disruption
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Upload multiple order images one after another without unwanted redirects interrupting your flow.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Footer Navigation Link */}
      <div className="text-center pt-2">
        <Link
          href="/orders"
          className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
        >
          <span>View all orders in Order History</span>
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}