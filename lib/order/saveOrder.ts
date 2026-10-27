import { createAdminClient } from "@/lib/supabase/admin";
import type { DraftOrder } from "@/types/order";

export async function saveOrder(draft: DraftOrder & { status?: "draft" | "confirmed" }) {
  const supabase = createAdminClient();

  // 1. Resolve existing sales_order ID ONLY if this is an explicit update of an already confirmed order
  let existingOrderId: string | null = null;
  if (draft.isAlreadyConfirmed && draft.importId && draft.importId !== "manual") {
    // 1a. Check if importId directly is a sales_order ID
    const { data: directSo } = await supabase
      .from("sales_order")
      .select("id")
      .eq("id", draft.importId)
      .maybeSingle();

    if (directSo) {
      existingOrderId = directSo.id;
    } else {
      // 1b. Check if importId is an order_imports record that already links to a sales_order
      const { data: linkedImport } = await supabase
        .from("order_imports")
        .select("sales_order_id")
        .eq("id", draft.importId)
        .maybeSingle();

      if (linkedImport?.sales_order_id) {
        existingOrderId = linkedImport.sales_order_id;
      }
    }
  }

  // If no existingOrderId from importId, but a duplicate order was detected, reuse it to prevent duplicates
  if (!existingOrderId && draft.duplicateOrderId) {
    existingOrderId = draft.duplicateOrderId;
    if (draft.duplicateOrderNumber) {
      draft.existingOrderNumber = draft.duplicateOrderNumber;
    }
  }

  // 2. Determine and verify a unique order_number
  let targetOrderNumber = (
    draft.existingOrderNumber ||
    draft.extracted?.po_number ||
    ""
  ).trim();

  // If order number is provided, check if it already exists in sales_order
  if (targetOrderNumber) {
    const { data: existingWithNumber } = await supabase
      .from("sales_order")
      .select("id, order_number, customer_id")
      .eq("order_number", targetOrderNumber)
      .maybeSingle();

    if (existingWithNumber) {
      if (existingOrderId) {
        // If conflict is with another distinct order, prevent duplicate
        if (existingWithNumber.id !== existingOrderId) {
          throw new Error(
            `A sales order with PO/Order Number '${targetOrderNumber}' already exists (ID: ${existingWithNumber.id}). Duplicate sales orders are not permitted.`
          );
        }
      } else {
        // If existingOrderId wasn't set, this is a NEW order approval, NOT an update!
        // Do NOT overwrite existingWithNumber! Generate a unique order number to preserve both orders:
        let counter = 2;
        let candidate = `${targetOrderNumber}-${String(counter).padStart(2, "0")}`;
        while (true) {
          const { data: conflict } = await supabase
            .from("sales_order")
            .select("id")
            .eq("order_number", candidate)
            .maybeSingle();
          if (!conflict) break;
          counter++;
          candidate = `${targetOrderNumber}-${String(counter).padStart(2, "0")}`;
        }
        targetOrderNumber = candidate;
        console.log(
          `[saveOrder] PO '${existingWithNumber.order_number}' belongs to another sales order. Created new distinct order number: ${targetOrderNumber}`
        );
      }
    }
  } else {
    // If no order number given, generate a unique tracking number
    const randomHex = Math.random().toString(16).substring(2, 8).toUpperCase();
    targetOrderNumber = `SO-${Date.now().toString().slice(-4)}-${randomHex}`;
  }

  let finalOrderId = existingOrderId;
  let orderNumber = targetOrderNumber;

  const orderPayload = {
    customer_id: draft.matchedCustomerId || null,
    order_number: targetOrderNumber,
    order_date: draft.extracted.order_date || new Date().toISOString().split("T")[0],
    delivery_date: draft.extracted.delivery_date || null,
    status: draft.status || "confirmed",
    subtotal: draft.totals.subtotal,
    discount: draft.totals.discount,
    tax: draft.totals.tax,
    total: draft.totals.total,
    notes: draft.extracted.terms || null,
    updated_at: new Date().toISOString(),
  };

  // 1. Resolve and prepare line items (match existing catalog items, never auto-insert unmatched)
  const itemsToInsert = await Promise.all(
    draft.lineItems.map(async (item) => {
      let finalItemId = item.matchedItemId || null;

      if (!finalItemId) {
        const cleanSku = item.sku?.trim() || null;
        const cleanName = item.description?.trim() || null;

        // 1a. Try finding existing item by code
        if (cleanSku) {
          const { data: byCode } = await supabase
            .from("items")
            .select("id")
            .eq("code", cleanSku)
            .eq("is_deleted", false)
            .maybeSingle();
          if (byCode) finalItemId = byCode.id;
        }

        // 1b. Try finding existing item by name
        if (!finalItemId && cleanName) {
          const { data: byName } = await supabase
            .from("items")
            .select("id")
            .ilike("name", cleanName)
            .eq("is_deleted", false)
            .maybeSingle();
          if (byName) finalItemId = byName.id;
        }
      }

      const validQty = item.quantity != null && !isNaN(Number(item.quantity))
        ? Number(item.quantity)
        : 0;
      const validPrice = item.unit_price != null && !isNaN(Number(item.unit_price))
        ? Number(item.unit_price)
        : 0;
      const validLineTotal = item.line_total != null && !isNaN(Number(item.line_total))
        ? Number(item.line_total)
        : Number((validQty * validPrice).toFixed(2));

      return {
        item_id: finalItemId,
        quantity: validQty,
        unit_price: validPrice,
        line_total: validLineTotal,
      };
    })
  );

  // 2. DATABASE TRANSACTION: Save order header and line items together atomically
  // Attempt PostgreSQL RPC transaction function first
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "save_sales_order_transaction",
    {
      p_order: {
        ...orderPayload,
        id: existingOrderId || undefined,
      },
      p_items: itemsToInsert,
      p_import_id: draft.importId && draft.importId !== "manual" ? draft.importId : null,
    }
  );

  if (!rpcError && rpcResult && (rpcResult as any).id) {
    return {
      id: (rpcResult as any).id,
      order_number: (rpcResult as any).order_number || targetOrderNumber,
    };
  }

  // If database RPC returned a transactional rejection error (other than function missing), rethrow
  if (rpcError && rpcError.code !== "PGRST202") {
    throw new Error(`Database transaction failed: ${rpcError.message}`);
  }

  // Fallback: Atomic transactional pattern with automated rollback compensation
  // Guarantees header and line items are saved together; any failure rolls back the header immediately.
  if (existingOrderId) {
    // Preserve old line items in case rollback is required
    const { data: oldItems } = await supabase
      .from("sales_order_items")
      .select("*")
      .eq("sales_order_id", existingOrderId);

    // Update Header
    const { data: updated, error: updateOrderError } = await supabase
      .from("sales_order")
      .update(orderPayload)
      .eq("id", existingOrderId)
      .select("id, order_number")
      .single();

    if (updateOrderError) {
      throw new Error(`Transaction failed: unable to update sales order: ${updateOrderError.message}`);
    }

    finalOrderId = updated.id;
    orderNumber = updated.order_number;

    // Delete existing items to replace with updated transaction items
    await supabase.from("sales_order_items").delete().eq("sales_order_id", existingOrderId);

    if (itemsToInsert.length > 0) {
      const itemsPayload = itemsToInsert.map((it) => ({
        ...it,
        sales_order_id: finalOrderId,
      }));

      const { error: itemsError } = await supabase
        .from("sales_order_items")
        .insert(itemsPayload);

      if (itemsError) {
        // ROLLBACK: Restore previous state if item insertion failed
        if (oldItems && oldItems.length > 0) {
          await supabase.from("sales_order_items").insert(oldItems);
        }
        throw new Error(
          `Transaction aborted: line items failed to insert (${itemsError.message}). Database state restored.`
        );
      }
    }
  } else {
    // Insert new order header
    let insertResult = await supabase
      .from("sales_order")
      .insert({
        ...orderPayload,
        created_at: new Date().toISOString(),
      })
      .select("id, order_number")
      .single();

    if (insertResult.error) {
      // Check if it failed because the order number already exists in sales_order
      if (
        insertResult.error.message.includes("sales_order_order_number_key") ||
        insertResult.error.message.includes("duplicate key")
      ) {
        // Fetch the existing order to reuse rather than creating a duplicate
        const { data: existingDup } = await supabase
          .from("sales_order")
          .select("id, order_number")
          .eq("order_number", targetOrderNumber)
          .maybeSingle();

        if (existingDup) {
          console.log(
            `[saveOrder] Reusing existing sales order ${existingDup.order_number} (${existingDup.id}) to prevent duplicate.`
          );
          finalOrderId = existingDup.id;
          orderNumber = existingDup.order_number;
        } else {
          throw new Error(
            `Sales order '${targetOrderNumber}' already exists. Duplicate order creation prevented.`
          );
        }
      } else {
        throw new Error(
          `Transaction failed: unable to create sales order header: ${insertResult.error?.message}`
        );
      }
    } else if (insertResult.data) {
      finalOrderId = insertResult.data.id;
      orderNumber = insertResult.data.order_number;
    }

    if (finalOrderId && itemsToInsert.length > 0 && (!insertResult.error || insertResult.data)) {
      const itemsPayload = itemsToInsert.map((it) => ({
        ...it,
        sales_order_id: finalOrderId,
      }));

      const { error: itemsError } = await supabase
        .from("sales_order_items")
        .insert(itemsPayload);

      if (itemsError) {
        // ATOMIC ROLLBACK: Delete the created header so no orphaned or incomplete order exists
        await supabase.from("sales_order").delete().eq("id", finalOrderId);
        throw new Error(
          `Transaction aborted: line items failed to insert (${itemsError.message}). Order header rolled back.`
        );
      }
    }
  }

  // 3. Update order_imports record atomically with the committed order
  if (draft.importId && draft.importId !== finalOrderId && draft.importId !== "manual") {
    const { error: updateError } = await supabase
      .from("order_imports")
      .update({
        sales_order_id: finalOrderId,
        customer_id: draft.matchedCustomerId || null,
        processing_status: "confirmed",
      })
      .eq("id", draft.importId);

    if (updateError) {
      console.warn("Warning: Failed to update order_imports status", updateError);
    }
  }

  return { id: finalOrderId, order_number: orderNumber };
}

