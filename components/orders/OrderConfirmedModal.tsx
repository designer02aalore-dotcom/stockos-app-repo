"use client";

import React, { useState } from "react";
import { Link, useRouter } from "@/lib/router";
import {
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Package,
  PlusCircle,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Building2,
  X,
  Inbox,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";

export interface OrderConfirmedModalProps {
  isOpen: boolean;
  orderNumber: string;
  orderId: string;
  status?: string;
  customerName?: string;
  totalAmount: number;
  subtotal?: number;
  discount?: number;
  tax?: number;
  itemCount: number;
  totalUnits?: number;
  isUpdate?: boolean;
  sourceType?: "image" | "email";
  onClose: () => void;
}

export function OrderConfirmedModal({
  isOpen,
  orderNumber,
  orderId,
  status = "Confirmed",
  customerName = "Customer",
  totalAmount,
  subtotal,
  discount = 0,
  tax = 0,
  itemCount,
  totalUnits,
  isUpdate = false,
  sourceType = "image",
  onClose,
}: OrderConfirmedModalProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (orderNumber) {
      navigator.clipboard.writeText(orderNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-0 duration-200">
      <div
        className="w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-dialog-title"
      >
        {/* Header with Green Accent Gradient */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-b from-emerald-500/10 via-emerald-500/5 to-transparent border-b border-border/60">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/50 transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>

          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 ring-4 ring-emerald-500/20">
              <CheckCircle2 className="size-8" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2">
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[11px] font-semibold px-2 py-0.5"
                >
                  <ShieldCheck className="size-3 mr-1" />
                  Save Status: {status}
                </Badge>
              </div>
              <h2
                id="success-dialog-title"
                className="text-xl font-bold tracking-tight text-foreground"
              >
                {isUpdate ? "Order Updated Successfully!" : "Order Confirmed & Saved!"}
              </h2>
              <p className="text-xs text-muted-foreground max-w-sm">
                The sales order and line items have been saved into the database transactionally.
              </p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 text-sm">
          {/* Created Order Number Display Box */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border flex flex-col items-center justify-center relative group">
            <span className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
              Official Sales Order Number
            </span>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="font-mono text-2xl font-black text-primary tracking-wide select-all">
                {orderNumber}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={handleCopy}
                className="h-8 w-8 rounded-lg cursor-pointer border-border hover:bg-muted"
                title="Copy Order Number"
              >
                {copied ? (
                  <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="size-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            {copied && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 animate-in fade-in">
                Copied to clipboard!
              </span>
            )}
          </div>

          {/* Quick Summary Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-border/80 bg-background/60">
              <span className="text-muted-foreground block text-[10px] font-medium uppercase tracking-wider">
                Customer
              </span>
              <span className="font-semibold text-foreground truncate block mt-0.5" title={customerName}>
                {customerName}
              </span>
            </div>

            <div className="p-3 rounded-lg border border-border/80 bg-background/60">
              <span className="text-muted-foreground block text-[10px] font-medium uppercase tracking-wider">
                Line Items
              </span>
              <span className="font-semibold text-foreground block mt-0.5">
                {itemCount} lines {totalUnits ? `(${totalUnits} pcs)` : ""}
              </span>
            </div>
          </div>

          {/* Financial Breakdown Summary */}
          <div className="p-3.5 bg-muted/30 border border-border rounded-xl space-y-1.5 text-xs">
            {subtotal != null && (
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-medium text-foreground">{formatINR(subtotal)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                <span>Discount</span>
                <span className="font-medium">-{formatINR(discount)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Tax / GST</span>
                <span className="font-medium text-foreground">{formatINR(tax)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1.5 border-t border-border font-bold">
              <span className="text-foreground">Grand Total</span>
              <span className="text-sm text-primary font-black">{formatINR(totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-muted/20 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="w-full sm:w-auto text-xs cursor-pointer"
          >
            Review Details Here
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {sourceType === "email" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push("/inbox")}
                className="w-full sm:w-auto text-xs gap-1.5 cursor-pointer bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-medium"
              >
                <Inbox className="size-3.5" />
                Back to Inbox
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push("/upload")}
                className="w-full sm:w-auto text-xs gap-1.5 cursor-pointer"
              >
                <PlusCircle className="size-3.5" />
                Upload Next
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              onClick={() => router.push("/orders")}
              className="w-full sm:w-auto text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs"
            >
              <span>View in Orders List</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
