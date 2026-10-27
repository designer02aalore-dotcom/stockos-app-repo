"use client";

import React from "react";
import {
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  Package,
  Truck,
  FileText,
  Mail,
  X,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import type { DraftOrder } from "@/types/order";

export interface ConfirmDialogProps {
  isOpen: boolean;
  draft: DraftOrder;
  isSaving: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  draft,
  isSaving,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const customer = draft.extracted.customer || {};
  const totalUnits = draft.lineItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
  const emailSource = (draft.extracted as any)?._email_source;
  const isAlreadyConfirmed = !!draft.isAlreadyConfirmed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-0 duration-150">
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <CheckCircle2 className="size-4" />
            </div>
            <div>
              <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900">
                {isAlreadyConfirmed ? "Confirm Order Update" : "Confirm Sales Order Creation"}
              </h3>
              <p className="text-xs text-slate-500">
                Please verify all extracted order details before official confirmation.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-6 py-4 overflow-y-auto space-y-4 text-xs">
          {/* Order Details & Customer Banner */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-slate-600" />
                <span className="font-bold text-sm text-slate-900">
                  {customer.name || "Customer / School"}
                </span>
                {draft.customerConfidence && (
                  <Badge variant="outline" className="text-[10px] bg-white border-slate-200 text-slate-700">
                    {draft.customerConfidence}% Match
                  </Badge>
                )}
              </div>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 font-mono text-[11px]">
                {draft.extracted.po_number || "PO-Auto"}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 text-[11px]">
              <div>
                <span className="font-medium text-slate-400 block">Contact Info:</span>
                <span>{customer.phone || customer.email || "No phone/email provided"}</span>
              </div>
              <div>
                <span className="font-medium text-slate-400 block">Order Date:</span>
                <span>{draft.extracted.order_date || new Date().toISOString().split("T")[0]}</span>
              </div>
              {customer.address && (
                <div className="sm:col-span-2">
                  <span className="font-medium text-slate-400 block">Address / Transport Location:</span>
                  <span>{customer.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Email / Document Reference Notice */}
          {emailSource && (
            <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-lg flex items-center gap-2 text-[11px] text-blue-900">
              <Mail className="size-3.5 text-blue-600 shrink-0" />
              <span className="truncate">
                Source: <strong>{emailSource.subject}</strong> ({emailSource.from})
              </span>
            </div>
          )}

          {/* Line Items Table Summary */}
          <div>
            <div className="flex items-center justify-between mb-1.5 font-semibold text-slate-700">
              <span>Items to Record ({draft.lineItems.length} lines, {totalUnits} units)</span>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500">
                      <th className="py-2 px-3">Item Description</th>
                      <th className="py-2 px-3 text-center">Qty</th>
                      <th className="py-2 px-3 text-right">Rate</th>
                      <th className="py-2 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draft.lineItems.map((item, idx) => (
                      <tr key={item.tempId || idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-slate-900">{item.description || "Item"}</span>
                            {item.confidence != null && item.confidence < 80 && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                                Uncertain ({item.confidence}%)
                              </span>
                            )}
                          </div>
                          {item.sku && <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{item.sku}</span>}
                        </td>
                        <td className="py-2 px-3 text-center font-medium text-slate-800">
                          {item.quantity ?? "—"}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600">
                          {formatINR(item.unit_price || 0)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          {formatINR(item.line_total || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Transport / Notes if present */}
          {draft.extracted.terms && (
            <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
              <Truck className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Dispatch / Notes: </span>
                <span>{draft.extracted.terms}</span>
              </div>
            </div>
          )}

          {/* Financial Breakdown: Subtotal, Discount, Tax, and Grand Total */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-slate-600 text-xs">
              <span>Subtotal ({draft.lineItems.length} lines, {totalUnits} pcs)</span>
              <span className="font-semibold text-slate-900">
                {formatINR(draft.totals.subtotal)}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-600 text-xs">
              <span>Discount</span>
              <span className={draft.totals.discount > 0 ? "font-semibold text-emerald-600" : "font-semibold text-slate-500"}>
                {draft.totals.discount > 0 ? `-${formatINR(draft.totals.discount)}` : "₹0.00"}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-600 text-xs">
              <span>Tax / GST</span>
              <span className="font-semibold text-slate-900">
                {formatINR(draft.totals.tax)}
              </span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-emerald-950 block">Grand Total</span>
                <span className="text-[10px] text-emerald-700">Official sales order value</span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-emerald-700">
                  {formatINR(draft.totals.total)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
            className="text-xs h-9 px-4 text-slate-600 border-slate-300 hover:bg-slate-100"
          >
            Go Back & Edit
          </Button>

          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-6 gap-2 shadow-xs cursor-pointer"
          >
            {isSaving ? (
              <>
                <RotateCcw className="size-3.5 animate-spin" />
                <span>Confirming Order...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5" />
                <span>{isAlreadyConfirmed ? "Yes, Update Order" : "Yes, Confirm & Create Order"}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
