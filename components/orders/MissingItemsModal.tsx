"use client";

import React, { useState } from "react";
import {
  PackagePlus,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";

export interface MissingItemToInsert {
  tempId: string;
  name: string;
  code: string;
  price: number;
  unit: string;
  quantity?: number;
}

interface MissingItemsModalProps {
  isOpen: boolean;
  items: MissingItemToInsert[];
  title?: string;
  actionButtonLabel?: string;
  onConfirm: (insertedItems: Array<{ tempId: string; id: string; name: string; code: string | null; price: number | null; unit: string | null }>) => Promise<void> | void;
  onCancel: () => void;
  onSkip?: () => void;
}

export function MissingItemsModal({
  isOpen,
  items,
  title,
  actionButtonLabel = "Yes, Insert into Items Table",
  onConfirm,
  onCancel,
  onSkip,
}: MissingItemsModalProps) {
  const [editableItems, setEditableItems] = useState<MissingItemToInsert[]>(items);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state only when modal is open
  React.useEffect(() => {
    if (isOpen) {
      setEditableItems(items);
      setError(null);
    }
  }, [isOpen, items]);

  if (!isOpen || items.length === 0) return null;

  const isSingle = editableItems.length === 1;

  const handleFieldChange = (
    tempId: string,
    field: "name" | "code" | "price" | "unit",
    val: string | number
  ) => {
    setEditableItems((prev) =>
      prev.map((it) => (it.tempId === tempId ? { ...it, [field]: val } : it))
    );
  };

  const handleProceed = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      // Call /api/items/create to insert into items table
      const res = await fetch("/api/items/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: editableItems.map((it) => ({
            tempId: it.tempId,
            name: it.name.trim() || it.code.trim() || "Item",
            code: it.code.trim() || null,
            price: Number(it.price) || 0,
            unit: it.unit.trim().toUpperCase() || "PCS",
            descriptions: it.name.trim(),
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to insert items into items table");
      }

      // Pass the returned items (with newly generated Supabase item_ids) back to parent
      await onConfirm(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0 duration-150">
      <div
        className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20 shrink-0">
              <PackagePlus className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground tracking-tight">
                {title || (isSingle ? "Item Not Found in Item Table" : `${editableItems.length} Items Not Found in Item Table`)}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                New master items will be created and linked to this order
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-sm">
          {/* Main Question Alert Banner */}
          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-3">
            <HelpCircle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {isSingle
                  ? "This item does not exist in your item table. Do you want to insert this into the items table?"
                  : "These items do not exist in your item table. Do you want to insert them into the items table?"}
              </h4>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
                If you select <strong>Yes</strong>, we will insert {isSingle ? "this item" : "these items"} into your Supabase{" "}
                <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 font-mono text-[11px]">items</code> table and use the generated{" "}
                <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 font-mono text-[11px]">item_id</code> for this sales order so it will not be null.
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Items Preview Table */}
          <div className="border rounded-lg overflow-hidden bg-card">
            <div className="px-4 py-2 bg-muted/60 border-b flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>Item Details to Insert</span>
              <span>{editableItems.length} {isSingle ? "Item" : "Items"}</span>
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {editableItems.map((item, idx) => (
                <div key={item.tempId || idx} className="p-3.5 space-y-2 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-muted-foreground">
                      #{(idx + 1).toString().padStart(2, "0")}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-5 border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                      Unlinked → New Item
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    {/* Item Name / Description */}
                    <div className="sm:col-span-6 space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Item Name / Description
                      </label>
                      <Input
                        type="text"
                        value={item.name}
                        onChange={(e) =>
                          handleFieldChange(item.tempId, "name", e.target.value)
                        }
                        placeholder="Item name..."
                        className="h-8 text-xs font-medium bg-background"
                      />
                    </div>

                    {/* SKU / Code */}
                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        SKU / Code
                      </label>
                      <Input
                        type="text"
                        value={item.code}
                        onChange={(e) =>
                          handleFieldChange(item.tempId, "code", e.target.value)
                        }
                        placeholder="e.g. ITEM-01"
                        className="h-8 text-xs font-mono uppercase bg-background"
                      />
                    </div>

                    {/* Unit Price */}
                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Price (₹)
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.price}
                        onChange={(e) =>
                          handleFieldChange(
                            item.tempId,
                            "price",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="h-8 text-xs font-semibold text-right bg-background"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t bg-muted/40 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground text-center sm:text-left">
            Items will be available in master catalog for future orders.
          </p>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {onSkip && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSkip}
                disabled={isSubmitting}
                className="text-xs h-9 px-3 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Keep Unmatched
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
              className="text-xs h-9 px-4 cursor-pointer"
            >
              Cancel
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleProceed}
              disabled={isSubmitting}
              className="text-xs h-9 px-4 gap-1.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Inserting into Items...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" />
                  <span>{actionButtonLabel}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
