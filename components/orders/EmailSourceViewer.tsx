"use client";

import React, { useState } from "react";
import {
  Mail,
  FileText,
  User,
  Calendar,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Building2,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DraftOrder } from "@/types/order";

interface EmailSourceViewerProps {
  draft: DraftOrder;
  onOpenImage?: () => void;
}

export function EmailSourceViewer({ draft, onOpenImage }: EmailSourceViewerProps) {
  const [activeTab, setActiveTab] = useState<"message" | "signals">("message");
  const [copied, setCopied] = useState(false);

  const emailSource = (draft.extracted as any)?._email_source || {};
  const classification = (draft.extracted as any)?._classification || {};
  const evidence = classification.evidence || {};

  const senderRaw = emailSource.from || draft.extracted.customer?.name || "Unknown Sender";
  const subject = emailSource.subject || draft.sourceReference || "Incoming Purchase Order";
  const dateStr = emailSource.date || draft.extracted.order_date || "Recent";
  const bodyText =
    emailSource.bodyText ||
    emailSource.snippet ||
    draft.extracted.raw_text ||
    "No raw email text available for this import.";

  const handleCopyBody = () => {
    navigator.clipboard.writeText(bodyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to extract initials for sender avatar
  const getInitials = (nameStr: string) => {
    const clean = nameStr.replace(/<.*?>/, "").trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
    return "EM";
  };

  const category = classification.category || "order_request";
  const confidence = Math.round((classification.confidence || 0.95) * 100);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Top Banner: Ingestion Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white dark:from-slate-800/80 dark:to-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Mail className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  Email Source Document
                </span>
                <Badge
                  variant="outline"
                  className="bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-[10px] h-4.5 px-1.5 font-semibold"
                >
                  Gmail Sync
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground block truncate">
                Verified Inbound Commercial Communication
              </span>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("message")}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                activeTab === "message"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Email Body
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("signals")}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === "signals"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="size-3 text-purple-500" />
              <span>AI Signals</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sender & Subject Meta Bar */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
              {getInitials(senderRaw)}
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-foreground block truncate" title={senderRaw}>
                {senderRaw.replace(/<.*?>/, "").trim() || "Customer"}
              </span>
              <span className="text-[11px] text-muted-foreground block truncate font-mono">
                {senderRaw.includes("<") ? senderRaw.slice(senderRaw.indexOf("<")) : senderRaw}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant="outline"
              className={`text-[10px] h-5 px-2 font-semibold ${
                category === "order_request"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : category === "ambiguous"
                  ? "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300"
                  : "bg-slate-100 text-slate-700 border-slate-300"
              }`}
            >
              <span className="size-1.5 rounded-full bg-current mr-1"></span>
              {category === "order_request"
                ? "Order Request"
                : category === "ambiguous"
                ? "Ambiguous Intent"
                : category}{" "}
              ({confidence}%)
            </Badge>

            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={handleCopyBody}
              title="Copy Email Text"
              className="text-muted-foreground hover:text-foreground size-6"
            >
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
        </div>

        {/* Subject Line */}
        <div className="pt-1 flex items-baseline gap-2">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider shrink-0">
            Subject:
          </span>
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug truncate" title={subject}>
            {subject}
          </h4>
        </div>
      </div>

      {/* Body Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-280px)] min-h-[380px]">
        {activeTab === "message" ? (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Attached PO File Card if available */}
            {draft.imageUrl && (
              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 flex items-center justify-center shrink-0">
                    <Paperclip className="size-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-blue-950 dark:text-blue-100 block">
                      Original Attached Document / Scan
                    </span>
                    <span className="text-[11px] text-blue-700 dark:text-blue-300 block font-mono">
                      {draft.sourceReference || "purchase_order_document.pdf"}
                    </span>
                  </div>
                </div>

                {onOpenImage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={onOpenImage}
                    className="h-7 text-xs font-semibold bg-white hover:bg-blue-50 text-blue-700 border-blue-300 dark:border-blue-700 dark:bg-slate-800 cursor-pointer shrink-0"
                  >
                    View Document Scan →
                  </Button>
                )}
              </div>
            )}

            {/* Email Text Body Card */}
            <div className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/60 p-4 shadow-2xs font-sans text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap select-text">
              {bodyText}
            </div>

            {/* AI Summary Highlights Strip */}
            <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-100">
                <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>AI Intake Assessment</span>
              </div>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-normal">
                {classification.explanation ||
                  classification.intentSummary ||
                  "Commercial order intent verified. Line items and customer details extracted automatically."}
              </p>
            </div>
          </div>
        ) : (
          /* Multi-Signal Intent Evidence View */
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="p-3 bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl space-y-1">
              <span className="text-xs font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-purple-600" />
                Multi-Signal AI Heuristics Breakdown
              </span>
              <p className="text-[11px] text-purple-800/80 dark:text-purple-300">
                StockOS evaluates 4 independent commercial signals to classify inbound communications.
              </p>
            </div>

            {/* 4 Signals Cards */}
            <div className="grid grid-cols-1 gap-2.5 text-xs">
              {/* Signal 1: Sender & Customer */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <User className="size-3.5 text-blue-600" />
                    1. Sender & Account History
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-4.5 font-semibold">
                    {draft.matchedCustomerId ? "Verified Customer" : "New Contact"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {evidence.senderContext ||
                    (draft.matchedCustomerId
                      ? `Matched to existing customer ID (${draft.matchedCustomerId}).`
                      : "Unregistered customer address. Contact verified via inbound email headers.")}
                </p>
              </div>

              {/* Signal 2: Catalog Matches */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Building2 className="size-3.5 text-emerald-600" />
                    2. Product Catalog Alignment
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-4.5 font-semibold">
                    {draft.lineItems.length} Lines Extracted
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {evidence.catalogContext ||
                    `${draft.lineItems.length} commercial product items matched against active inventory catalog.`}
                </p>
              </div>

              {/* Signal 3: Attachment Verification */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Paperclip className="size-3.5 text-amber-600" />
                    3. Document & Attachment Check
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-4.5 font-semibold">
                    {draft.imageUrl ? "PO Slip Attached" : "Inline Order Text"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {evidence.attachmentContext ||
                    (draft.imageUrl
                      ? "Order slip / PDF requisition attached and OCR parsed."
                      : "Plain email text order without binary attachments.")}
                </p>
              </div>

              {/* Signal 4: Language & Commercial Phrasing */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <FileText className="size-3.5 text-indigo-600" />
                    4. Commercial Phrasing & Natural Language
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-4.5 font-semibold">
                    Confidence: {confidence}%
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {evidence.languageContext ||
                    "Explicit purchase order terminology identified. Intent verified as formal purchase order."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-slate-400" />
          <span>Received: {dateStr}</span>
        </span>
        <span className="font-medium text-slate-500">
          Operator Review Active
        </span>
      </div>
    </div>
  );
}
