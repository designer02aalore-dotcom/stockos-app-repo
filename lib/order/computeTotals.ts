import type { DraftLineItem } from "@/types/order";

interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function computeTotals(
  items: DraftLineItem[],
  taxRate: number = 0,
  globalDiscount: number = 0
): Totals {
  let subtotal = 0;

  for (const item of items) {
    if (item.line_total !== undefined && item.line_total !== null) {
      subtotal += item.line_total;
    } else if (item.quantity && item.unit_price) {
      subtotal += item.quantity * item.unit_price;
    }
  }

  const tax = subtotal * taxRate;
  const total = subtotal + tax - globalDiscount;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    discount: Number(globalDiscount.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}
