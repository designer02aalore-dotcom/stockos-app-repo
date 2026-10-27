"use client";

import React from "react";
import { AlertTriangle, X, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RejectConfirmModalProps {
  isOpen: boolean;
  poNumber?: string;
  customerName?: string;
  isRejecting: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function RejectConfirmModal({
  isOpen,
  poNumber,
  customerName,
  isRejecting,
  onConfirm,
  onCancel,
}: RejectConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-0 duration-150">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-dialog-title"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-rose-100 dark:border-rose-950/60 bg-rose-50/70 dark:bg-rose-950/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-xs">
              <AlertTriangle className="size-4" />
            </div>
            <div>
              <h3 id="reject-dialog-title" className="text-sm font-bold text-rose-950 dark:text-rose-100">
                Reject Inbound Non-Order
              </h3>
              <p className="text-[11px] text-rose-700 dark:text-rose-300">
                Mark as inquiry, invoice receipt, or irrelevant correspondence
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isRejecting}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3 text-xs text-slate-600 dark:text-slate-300">
          <p>
            Are you sure you want to reject this order draft
            {poNumber ? <strong> ({poNumber})</strong> : ""}{" "}
            {customerName ? <span>from <strong>{customerName}</strong></span> : ""}?
          </p>
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] space-y-1">
            <span className="font-semibold text-slate-800 dark:text-slate-200 block">
              What happens upon rejection:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
              <li>Status updated to <span className="text-rose-600 font-semibold">Rejected</span></li>
              <li>Removed from pending review queue</li>
              <li>No sales order or inventory commitments are generated</li>
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isRejecting}
            className="h-8 text-xs font-medium cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={isRejecting}
            className="h-8 text-xs font-semibold gap-1.5 cursor-pointer shadow-xs bg-rose-600 hover:bg-rose-700"
          >
            {isRejecting ? (
              <>
                <RotateCcw className="size-3.5 animate-spin" />
                Rejecting...
              </>
            ) : (
              <>
                <Ban className="size-3.5" />
                Yes, Reject Non-Order
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
