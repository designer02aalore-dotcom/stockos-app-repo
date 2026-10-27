/**
 * Stage 3: Validation Engine
 * Validates extracted orders against required fields, numeric constraints,
 * calculation totals, missing values, and database duplicates.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { ExtractedOrder } from "@/types/order";

export class ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";

  constructor(
    field: string,
    message: string,
    severity: "error" | "warning" = "warning"
  ) {
    this.field = field;
    this.message = message;
    this.severity = severity;
  }

  toString(): string {
    return this.field ? `[${this.field}] ${this.message}` : this.message;
  }
}

export interface ValidationResult {
  isValid: boolean;          // True if no fatal errors
  isCompleteEnough: boolean; // True if OCR produced sufficient structured order data
  issues: ValidationIssue[];
  duplicateWarning?: string;
  order: ExtractedOrder;      // Normalized order with verified calculations
}

/**
 * Validates an extracted order synchronously.
 * Strict compliance: Never guess missing quantities or rates; keep them empty.
 */
export function validateExtractedOrder(
  order: ExtractedOrder
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Deep clone to safely sanitize and compute
  const validatedOrder: ExtractedOrder = JSON.parse(JSON.stringify(order || {}));
  validatedOrder.items = Array.isArray(validatedOrder.items) ? validatedOrder.items : [];

  // ----------------------------------------------------
  // 1. Order Document Validity Check
  // ----------------------------------------------------
  const docType = (validatedOrder.document_type || "sales_order").toLowerCase();
  if (docType === "not_an_order" || docType === "other") {
    issues.push(
      new ValidationIssue(
        "document_type",
        "The uploaded file does not appear to be a sales order or purchase order.",
        "warning"
      )
    );
  }

  // ----------------------------------------------------
  // 2. Required Fields Check
  // ----------------------------------------------------
  const customerName = validatedOrder.customer?.name?.trim();
  if (!customerName) {
    issues.push(
      new ValidationIssue(
        "customer.name",
        "Customer name is missing or could not be detected from document.",
        "warning"
      )
    );
  }

  if (validatedOrder.items.length === 0) {
    issues.push(
      new ValidationIssue(
        "items",
        "No order items or products found in document.",
        "error"
      )
    );
  }

  // ----------------------------------------------------
  // 3. Numeric Checks & Calculation Verification
  // ----------------------------------------------------
  let calculatedSubtotal = 0;

  validatedOrder.items.forEach((item, index) => {
    const itemLabel = item.description || item.sku || `Line #${index + 1}`;

    // Item description check
    if (!item.description?.trim() && !item.sku?.trim()) {
      issues.push(
        new ValidationIssue(
          `items[${index}].description`,
          `Item #${index + 1} has no title, description, or SKU.`,
          "warning"
        )
      );
    }

    // STRICT: Missing quantity must NOT be defaulted to 1.
    const qty = item.quantity;
    if (qty == null || isNaN(Number(qty)) || Number(qty) <= 0) {
      item.quantity = null;
      issues.push(
        new ValidationIssue(
          `items[${index}].quantity`,
          `${itemLabel}: Quantity is missing or not clearly stated. Left empty for user review.`,
          "error"
        )
      );
    }

    // Unit Price check
    const price = item.unit_price;
    if (price == null || isNaN(Number(price))) {
      item.unit_price = null;
      issues.push(
        new ValidationIssue(
          `items[${index}].unit_price`,
          `${itemLabel}: Unit price is not stated on document.`,
          "warning"
        )
      );
    } else if (Number(price) < 0) {
      issues.push(
        new ValidationIssue(
          `items[${index}].unit_price`,
          `${itemLabel}: Unit price cannot be negative (${price}).`,
          "error"
        )
      );
    }

    // Line total check and automatic calculation
    const validQty = typeof qty === "number" && qty > 0 ? qty : 0;
    const validPrice = typeof price === "number" && price >= 0 ? price : 0;
    const computedLineTotal = Number((validQty * validPrice).toFixed(2));

    if (item.line_total != null && !isNaN(Number(item.line_total))) {
      const statedTotal = Number(item.line_total);
      if (validQty > 0 && validPrice > 0) {
        const diff = Math.abs(statedTotal - computedLineTotal);
        if (diff > 1.5) {
          issues.push(
            new ValidationIssue(
              `items[${index}].line_total`,
              `${itemLabel}: Line total mismatch. Document stated ₹${statedTotal}, but ${validQty} × ₹${validPrice} = ₹${computedLineTotal}.`,
              "warning"
            )
          );
        }
      }
      calculatedSubtotal += statedTotal;
    } else {
      // Auto-compute line total on server if quantity and price exist
      if (validQty > 0 && validPrice > 0) {
        item.line_total = computedLineTotal;
        calculatedSubtotal += computedLineTotal;
      } else {
        item.line_total = null;
      }
    }
  });

  calculatedSubtotal = Number(calculatedSubtotal.toFixed(2));

  // Verify Subtotal on Server
  if (!validatedOrder.subtotal || validatedOrder.subtotal === 0) {
    validatedOrder.subtotal = calculatedSubtotal;
  }

  // Verify Grand Total on Server
  const discount = Number(validatedOrder.discount || 0);
  const tax = Number(validatedOrder.tax || 0);
  const computedGrandTotal = Number(
    (validatedOrder.subtotal + tax - discount).toFixed(2)
  );

  if (!validatedOrder.total || validatedOrder.total === 0) {
    validatedOrder.total = computedGrandTotal;
  } else {
    const diff = Math.abs((validatedOrder.total || 0) - computedGrandTotal);
    if (diff > 2.0 && calculatedSubtotal > 0) {
      issues.push(
        new ValidationIssue(
          "total",
          `Total discrepancy. Server calculated total is ₹${computedGrandTotal}, but document stated ₹${validatedOrder.total}.`,
          "warning"
        )
      );
    }
  }

  // ----------------------------------------------------
  // 4. Missing PO Number Check
  // ----------------------------------------------------
  if (!validatedOrder.po_number || validatedOrder.po_number.trim() === "") {
    issues.push(
      new ValidationIssue(
        "po_number",
        "PO / Reference number was not found on document.",
        "warning"
      )
    );
  }

  // ----------------------------------------------------
  // 5. Completeness Assessment
  // ----------------------------------------------------
  const hasFatalErrors = issues.some((i) => i.severity === "error");
  const isValid = !hasFatalErrors;

  // An order is complete enough if it has at least 1 valid line item with description and positive quantity
  const hasValidItems =
    validatedOrder.items.length > 0 &&
    validatedOrder.items.some(
      (it) => it.quantity != null && it.quantity > 0 && Boolean(it.description || it.sku)
    );

  const isCompleteEnough = hasValidItems;

  return {
    isValid,
    isCompleteEnough,
    issues,
    order: validatedOrder,
  };
}

export interface DuplicateOrderMatch {
  isDuplicate: boolean;
  orderId: string | null;
  orderNumber: string | null;
  total: number | null;
  message: string | null;
}

/**
 * Robust Duplicate Checker:
 * 1. Checks by exact PO number if provided.
 * 2. Checks content-based duplicates by customerId, customerName, orderDate, and line items (even when total is 0).
 * 3. Checks previously confirmed order imports linked to confirmed sales orders.
 */
export async function findExistingDuplicateSalesOrder(params: {
  poNumber?: string | null;
  orderDate?: string | null;
  total?: number | null;
  customerId?: string | null;
  customerName?: string | null;
  items?: Array<{ description?: string; quantity?: number | string | null; matchedItemId?: string | null }>;
  excludeSalesOrderId?: string | null;
}): Promise<DuplicateOrderMatch> {
  const { poNumber, orderDate, total, customerId, customerName, items, excludeSalesOrderId } = params;
  try {
    const supabase = createAdminClient();

    // 1. Check if exact PO number matches an existing sales order
    if (poNumber?.trim()) {
      const cleanPo = poNumber.trim();
      let query = supabase
        .from("sales_order")
        .select("id, order_number, status, total, order_date")
        .eq("order_number", cleanPo);
      if (excludeSalesOrderId) {
        query = query.neq("id", excludeSalesOrderId);
      }
      const { data: existing } = await query.maybeSingle();
      if (existing) {
        return {
          isDuplicate: true,
          orderId: existing.id,
          orderNumber: existing.order_number,
          total: existing.total,
          message: `A sales order with PO '${cleanPo}' already exists (#${existing.order_number}).`,
        };
      }
    }

    // 2. Content-based duplicate check against sales_order:
    if (items && items.length > 0) {
      let candidateQuery = supabase
        .from("sales_order")
        .select("id, order_number, status, total, order_date, customer_id, created_at");

      if (excludeSalesOrderId) {
        candidateQuery = candidateQuery.neq("id", excludeSalesOrderId);
      }

      // Collect candidate sales orders
      let candidates: Array<{
        id: string;
        order_number: string;
        status: string;
        total: number | null;
        order_date: string | null;
        customer_id: string | null;
      }> = [];

      // 2a. Priority candidate search: Same customerId and same orderDate
      if (customerId && orderDate) {
        const { data } = await candidateQuery
          .eq("customer_id", customerId)
          .eq("order_date", orderDate);
        if (data && data.length > 0) {
          candidates = data;
        }
      }

      // 2b. Same customerId (within recent orders)
      if (candidates.length === 0 && customerId) {
        let q = supabase
          .from("sales_order")
          .select("id, order_number, status, total, order_date, customer_id, created_at")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(10);
        if (excludeSalesOrderId) q = q.neq("id", excludeSalesOrderId);
        const { data } = await q;
        if (data && data.length > 0) candidates = data;
      }

      // 2c. Same orderDate (when customerId not set or not matched)
      if (candidates.length === 0 && orderDate) {
        let q = supabase
          .from("sales_order")
          .select("id, order_number, status, total, order_date, customer_id, created_at")
          .eq("order_date", orderDate)
          .order("created_at", { ascending: false });

        if (total != null && total > 0) {
          q = q.gte("total", total - 2).lte("total", total + 2);
        }
        if (excludeSalesOrderId) q = q.neq("id", excludeSalesOrderId);
        const { data } = await q.limit(15);
        if (data && data.length > 0) candidates = data;
      }

      // Compare candidate line items
      for (const candidate of candidates) {
        const { data: soItems } = await supabase
          .from("sales_order_items")
          .select("item_id, quantity, unit_price")
          .eq("sales_order_id", candidate.id);

        if (soItems && soItems.length === items.length) {
          const allMatched = items.every((dItem) => {
            const dQty = Number(dItem.quantity) || 0;
            if (dItem.matchedItemId) {
              const found = soItems.find((s) => s.item_id === dItem.matchedItemId);
              return found && Number(found.quantity) === dQty;
            }
            return false;
          });

          if (allMatched) {
            return {
              isDuplicate: true,
              orderId: candidate.id,
              orderNumber: candidate.order_number,
              total: candidate.total,
              message: `Identical confirmed sales order found (#${candidate.order_number}) on ${candidate.order_date || orderDate || "same date"} with matching items.`,
            };
          }
        }
      }

      // 3. Also check previously confirmed order_imports with linked sales_order
      let importQuery = supabase
        .from("order_imports")
        .select("id, sales_order_id, customer_id, processing_status, extracted_data")
        .eq("processing_status", "confirmed")
        .not("sales_order_id", "is", null);

      if (customerId) {
        importQuery = importQuery.eq("customer_id", customerId);
      }

      const { data: confirmedImports } = await importQuery
        .order("created_at", { ascending: false })
        .limit(10);

      if (confirmedImports && confirmedImports.length > 0) {
        for (const cImp of confirmedImports) {
          if (excludeSalesOrderId && cImp.sales_order_id === excludeSalesOrderId) continue;
          const ext = (cImp.extracted_data as any) || {};
          const extItems = Array.isArray(ext.items) ? ext.items : Array.isArray(ext.line_items) ? ext.line_items : [];

          if (extItems.length === items.length) {
            const allMatched = items.every((dItem) => {
              const dQty = Number(dItem.quantity) || 0;
              const found = extItems.find((e: any) =>
                (dItem.matchedItemId && e.matchedItemId === dItem.matchedItemId) ||
                (dItem.description && e.description && e.description.toLowerCase().trim() === dItem.description.toLowerCase().trim())
              );
              return found && Number(found.quantity) === dQty;
            });

            if (allMatched && cImp.sales_order_id) {
              const { data: so } = await supabase
                .from("sales_order")
                .select("id, order_number, total, order_date")
                .eq("id", cImp.sales_order_id)
                .maybeSingle();

              if (so) {
                return {
                  isDuplicate: true,
                  orderId: so.id,
                  orderNumber: so.order_number,
                  total: so.total,
                  message: `Identical sales order found (#${so.order_number}) previously confirmed from document.`,
                };
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("[findExistingDuplicateSalesOrder] Error checking duplicate:", err);
  }

  return {
    isDuplicate: false,
    orderId: null,
    orderNumber: null,
    total: null,
    message: null,
  };
}

/**
 * Backward compatibility helper returning string or null.
 */
export async function checkOrderDuplicate(poNumber: string): Promise<string | null> {
  if (!poNumber?.trim()) return null;
  const res = await findExistingDuplicateSalesOrder({ poNumber });
  return res.message;
}
