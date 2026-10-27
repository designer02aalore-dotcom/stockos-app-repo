import { NextRequest, NextResponse } from "@/lib/response";
import { saveOrder } from "@/lib/order/saveOrder";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchCustomer } from "@/lib/customer/matchCustomer";
import { matchItemInDatabase } from "@/app/api/match/items/route";
import type { DraftOrder } from "@/types/order";

/**
 * GET /api/orders/create
 * Route documentation and health check.
 */
export async function GET(request?: NextRequest) {
  return NextResponse.json({
    endpoint: "/api/orders/create",
    method: "POST",
    description:
      "Creates a sales order with database validation, customer resolution, item catalog matching, and atomic transaction persistence.",
    supportedFields: [
      "customerId (optional, auto-matches if missing)",
      "customerName (optional)",
      "customer (optional object: { name, code, phone, email })",
      "orderNumber / po_number (optional, auto-generates unique SO number)",
      "orderDate (optional, defaults to current date)",
      "deliveryDate (optional)",
      "notes / terms (optional)",
      "status ('confirmed' | 'draft', default: 'confirmed')",
      "items / lineItems (required, array of items with description/sku, qty, price)",
      "totals (optional: { subtotal, discount, tax, total })",
    ],
  });
}

/**
 * POST /api/orders/create
 * Robust sales order creation endpoint supporting manual orders, DraftOrder payloads,
 * and automated catalog matching.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    const {
      customerId: rawCustomerId,
      customer_id,
      matchedCustomerId,
      customerName: rawCustomerName,
      customer: rawCustomer,
      orderNumber: rawOrderNumber,
      order_number,
      po_number,
      orderDate: rawOrderDate,
      order_date,
      deliveryDate: rawDeliveryDate,
      delivery_date,
      notes: rawNotes,
      terms,
      status: rawStatus,
      items: rawItems,
      lineItems: rawLineItems,
      totals,
      importId,
      sourceType,
    } = body;

    const supabase = createAdminClient();

    // 1. Validate line items input
    const inputItems = rawItems || rawLineItems || [];
    if (!Array.isArray(inputItems) || inputItems.length === 0) {
      return NextResponse.json(
        { error: "At least one item is required to create an order" },
        { status: 400 }
      );
    }

    // 2. Resolve Customer (match by name/phone if customer ID is not explicitly provided)
    let finalCustomerId: string | null =
      rawCustomerId || customer_id || matchedCustomerId || null;
    let resolvedCustomerName: string =
      rawCustomerName ||
      (typeof rawCustomer === "string" ? rawCustomer : rawCustomer?.name) ||
      "";

    if (finalCustomerId) {
      const { data: custRecord } = await supabase
        .from("customers")
        .select("id, name")
        .eq("id", finalCustomerId)
        .maybeSingle();

      if (custRecord) {
        resolvedCustomerName = resolvedCustomerName || custRecord.name;
      }
    } else if (resolvedCustomerName || typeof rawCustomer === "object") {
      const customerInput =
        typeof rawCustomer === "object" && rawCustomer !== null
          ? rawCustomer
          : { name: resolvedCustomerName };

      const match = await matchCustomer(customerInput);
      if (match.customerId) {
        finalCustomerId = match.customerId;
      }
    }

    // 3. Resolve Items against database catalog via matching API logic
    const processedLineItems = await Promise.all(
      inputItems.map(async (it: any) => {
        const inputDesc = (it.description || it.name || "").trim();
        const inputSku = (it.sku || it.code || "").trim();
        const inputItemId = it.itemId || it.matchedItemId || it.item_id || null;

        // Strictly check catalog matching using matchItemInDatabase
        const matchResult = await matchItemInDatabase(
          inputDesc,
          inputSku,
          inputItemId
        );

        const catalogPrice = matchResult.catalogItem?.price ?? undefined;
        const catalogCode = matchResult.catalogItem?.code ?? undefined;
        const catalogName = matchResult.catalogItem?.name ?? undefined;

        // Price resolution: explicit doc price > catalog price > 0
        const rawPrice =
          it.unitPrice != null
            ? Number(it.unitPrice)
            : it.unit_price != null
            ? Number(it.unit_price)
            : null;
        const hasPrice = rawPrice != null && !isNaN(rawPrice) && rawPrice > 0;
        const finalUnitPrice = hasPrice
          ? rawPrice!
          : catalogPrice !== undefined && catalogPrice > 0
          ? catalogPrice
          : rawPrice || 0;

        // Quantity sanitization
        const rawQty = it.quantity != null ? Number(it.quantity) : 0;
        const finalQty = isNaN(rawQty) ? 0 : rawQty;

        // Line total calculation
        const rawTotal =
          it.lineTotal != null
            ? Number(it.lineTotal)
            : it.line_total != null
            ? Number(it.line_total)
            : null;
        const finalLineTotal =
          rawTotal != null && !isNaN(rawTotal) && rawTotal > 0
            ? rawTotal
            : Number((finalQty * finalUnitPrice).toFixed(2));

        return {
          tempId: it.id || it.tempId || crypto.randomUUID(),
          matchedItemId: matchResult.matched
            ? matchResult.itemId
            : inputItemId || undefined,
          matchedItemCode: catalogCode,
          matchedItemName: catalogName,
          catalogPrice,
          sku: inputSku || catalogCode || undefined,
          description: inputDesc || catalogName || undefined,
          quantity: finalQty,
          unit_price: finalUnitPrice,
          line_total: finalLineTotal,
          confidence: matchResult.confidence,
        };
      })
    );

    // 4. Calculate or sanitize order totals
    const computedSubtotal = processedLineItems.reduce(
      (acc, it) => acc + (it.line_total || 0),
      0
    );
    const subtotal =
      totals?.subtotal != null && Number(totals.subtotal) > 0
        ? Number(totals.subtotal)
        : computedSubtotal;
    const discount = Number(totals?.discount) || 0;
    const tax = Number(totals?.tax) || 0;
    const total =
      totals?.total != null && Number(totals.total) > 0
        ? Number(totals.total)
        : Math.max(0, Number((subtotal - discount + tax).toFixed(2)));

    const finalTotals = { subtotal, discount, tax, total };

    // 5. Generate or sanitize order number
    const targetOrderNumber = (
      rawOrderNumber ||
      order_number ||
      po_number ||
      ""
    ).trim();

    const finalOrderNumber = targetOrderNumber
      ? targetOrderNumber
      : `SO-${Date.now().toString().slice(-6)}`;

    const finalOrderDate =
      rawOrderDate || order_date || new Date().toISOString().split("T")[0];
    const finalDeliveryDate = rawDeliveryDate || delivery_date || null;
    const finalNotes = rawNotes || terms || null;
    const finalStatus: "draft" | "confirmed" =
      rawStatus === "draft" ? "draft" : "confirmed";

    // 6. Build unified DraftOrder object for saveOrder transaction
    const draft: DraftOrder & { status?: "draft" | "confirmed" } = {
      importId: importId || "manual",
      sourceType: sourceType === "email" ? "email" : "image",
      sourceReference: `Manual Order ${finalOrderNumber}`,
      extracted: {
        customer: { name: resolvedCustomerName || undefined },
        po_number: finalOrderNumber,
        order_date: finalOrderDate,
        delivery_date: finalDeliveryDate || undefined,
        items: processedLineItems.map((it) => ({
          sku: it.sku,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          line_total: it.line_total,
          matchedItemId: it.matchedItemId,
          matchedItemCode: it.matchedItemCode,
          matchedItemName: it.matchedItemName,
          catalogPrice: it.catalogPrice,
          confidence: it.confidence,
          matched: !!it.matchedItemId,
        })),
        subtotal: finalTotals.subtotal,
        discount: finalTotals.discount,
        tax: finalTotals.tax,
        total: finalTotals.total,
        terms: finalNotes || undefined,
      },
      matchedCustomerId: finalCustomerId || undefined,
      customerConfidence: finalCustomerId ? 100 : 0,
      lineItems: processedLineItems,
      totals: finalTotals,
      status: finalStatus,
    };

    // 7. Save order header and line items atomically in database transaction
    const savedOrder = await saveOrder(draft);

    // 8. Create or update audit record in order_imports for unified dashboard tracking
    try {
      await supabase.from("order_imports").insert({
        sales_order_id: savedOrder.id,
        customer_id: finalCustomerId,
        source_type: sourceType || "manual",
        source_reference: `Order ${savedOrder.order_number}`,
        processing_status: finalStatus,
        extracted_data: draft.extracted,
      });
    } catch (impErr) {
      console.warn(
        "[api/orders/create] Import tracking record warning:",
        impErr
      );
    }

    // 9. Return structured success response compatible with both UI and external clients
    return NextResponse.json(
      {
        success: true,
        order: {
          id: savedOrder.id,
          order_number: savedOrder.order_number,
          customer_id: finalCustomerId,
          customer_name: resolvedCustomerName,
          order_date: finalOrderDate,
          delivery_date: finalDeliveryDate,
          status: finalStatus,
          subtotal: finalTotals.subtotal,
          discount: finalTotals.discount,
          tax: finalTotals.tax,
          total: finalTotals.total,
          items_count: processedLineItems.length,
        },
        orderId: savedOrder.id,
        orderNumber: savedOrder.order_number,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[api/orders/create] Fatal error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create order",
      },
      { status: 500 }
    );
  }
}
