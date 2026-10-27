import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Link } from "@/lib/router";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDraft } from "@/lib/order/buildDraft";
import { findExistingDuplicateSalesOrder } from "@/lib/order/validateOrder";
import { DraftOrderForm } from "@/components/orders/DraftOrderForm";
import type { ExtractedOrder } from "@/types/order";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft, Upload } from "lucide-react";

const getOrderDraft = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    if (id === "new") {
      throw redirect({ to: "/orders/new" });
    }
    const supabase = createAdminClient();

    // 1. Try finding in order_imports by direct ID
    let importRecord = null;
    const { data: byId } = await supabase
      .from("order_imports")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (byId) {
      importRecord = byId;
    } else {
      // 2. Try finding in order_imports by sales_order_id
      const { data: bySalesOrderId } = await supabase
        .from("order_imports")
        .select("*")
        .eq("sales_order_id", id)
        .maybeSingle();
      if (bySalesOrderId) {
        importRecord = bySalesOrderId;
      }
    }

    if (importRecord) {
      let imageUrl: string | null = null;
      if (importRecord.source_reference) {
        try {
          const { data: signedData } = await supabase.storage
            .from("order-uploads")
            .createSignedUrl(importRecord.source_reference, 60 * 60 * 24);
          if (signedData?.signedUrl) {
            imageUrl = signedData.signedUrl;
          }
        } catch (err) {
          console.warn("Failed to create signed URL:", err);
        }
      }

      const extracted = importRecord.extracted_data as unknown as ExtractedOrder;
      let isAlreadyConfirmed = importRecord.processing_status === "confirmed" && Boolean(importRecord.sales_order_id);
      let existingOrderNumber: string | null = null;

      if (importRecord.sales_order_id && importRecord.processing_status === "confirmed") {
        const { data: so } = await supabase
          .from("sales_order")
          .select("order_number")
          .eq("id", importRecord.sales_order_id)
          .maybeSingle();
        if (so?.order_number) {
          existingOrderNumber = so.order_number;
        } else {
          // If linked sales order no longer exists, reset confirmed status
          isAlreadyConfirmed = false;
        }
      }

      const draft = await buildDraft(
        importRecord.id,
        importRecord.source_type as "image" | "email",
        extracted,
        imageUrl,
        importRecord.source_reference
      );

      // DUPLICATE & CONFIRMATION VERIFICATION:
      // If linked sales order exists, keep confirmed status for Update Order
      if (isAlreadyConfirmed && importRecord.sales_order_id && existingOrderNumber) {
        draft.isAlreadyConfirmed = true;
        draft.existingOrderNumber = existingOrderNumber;
      }

      // Check for content-based duplicate sales orders in database
      if (!draft.isAlreadyConfirmed) {
        const dupMatch = await findExistingDuplicateSalesOrder({
          poNumber: draft.extracted?.po_number,
          orderDate: draft.extracted?.order_date,
          total: draft.totals?.total,
          items: draft.lineItems,
          customerId: draft.extracted?.customer?.id || (importRecord as any)?.customer_id || draft.matchedCustomerId,
          customerName: draft.extracted?.customer?.name,
          excludeSalesOrderId: importRecord.sales_order_id,
        });

        if (dupMatch.isDuplicate && dupMatch.orderId) {
          draft.duplicateWarning = dupMatch.message;
          draft.duplicateOrderId = dupMatch.orderId;
          draft.duplicateOrderNumber = dupMatch.orderNumber;
          draft.isAlreadyConfirmed = true;
          draft.existingOrderNumber = dupMatch.orderNumber;

          // Heal the order_imports record so it links to the existing confirmed sales order
          await supabase
            .from("order_imports")
            .update({
              sales_order_id: dupMatch.orderId,
              processing_status: "confirmed",
            })
            .eq("id", importRecord.id);
        }
      }


      // Keep order_imports extracted_data in sync with live catalog items
      try {
        const syncedItems = draft.lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          line_total: li.line_total,
          matched: li.matched ?? false,
          matchedItemId: li.matchedItemId ?? null,
          matchedItemCode: li.matchedItemCode ?? null,
          matchedItemName: li.matchedItemName ?? null,
          catalogPrice: li.catalogPrice ?? null,
          confidence: li.confidence ?? 0,
          partialMatches: li.partialMatches ?? [],
        }));
        await supabase
          .from("order_imports")
          .update({
            extracted_data: {
              ...extracted,
              items: syncedItems,
            },
          })
          .eq("id", importRecord.id);
      } catch (syncErr) {
        console.warn("Failed to sync order_imports extracted_data with live items:", syncErr);
      }

      return { draft };
    }

    // 3. Fallback: Check if it's a sales_order directly
    const { data: salesOrder } = await supabase
      .from("sales_order")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (salesOrder) {
      const { data: items } = await supabase
        .from("sales_order_items")
        .select("*")
        .eq("sales_order_id", id);

      let imageUrl: string | null = null;
      let sourceRef: string | null = null;
      const { data: linkedImport } = await supabase
        .from("order_imports")
        .select("*")
        .eq("sales_order_id", id)
        .maybeSingle();

      if (linkedImport?.source_reference) {
        sourceRef = linkedImport.source_reference;
        try {
          const { data: signedData } = await supabase.storage
            .from("order-uploads")
            .createSignedUrl(linkedImport.source_reference, 60 * 60 * 24);
          if (signedData?.signedUrl) {
            imageUrl = signedData.signedUrl;
          }
        } catch (err) {
          console.warn("Failed to create signed URL:", err);
        }
      }

      let resolvedItems: ExtractedOrder["items"] = [];
      if (
        linkedImport?.extracted_data &&
        typeof linkedImport.extracted_data === "object" &&
        Array.isArray((linkedImport.extracted_data as any).items) &&
        (linkedImport.extracted_data as any).items.length > 0
      ) {
        resolvedItems = (linkedImport.extracted_data as any).items;
      } else if (items && items.length > 0) {
        const itemIds = items.map((i) => i.item_id).filter(Boolean) as string[];
        let catalogMap = new Map<string, any>();
        if (itemIds.length > 0) {
          const { data: catItems } = await supabase
            .from("items")
            .select("id, name, code, price")
            .in("id", itemIds);
          if (catItems) {
            for (const c of catItems) {
              catalogMap.set(c.id, c);
            }
          }
        }
        resolvedItems = items.map((it) => {
          const cat = it.item_id ? catalogMap.get(it.item_id) : null;
          return {
            sku: cat?.code || undefined,
            description: cat?.name || undefined,
            quantity: it.quantity,
            unit_price: it.unit_price ?? cat?.price ?? 0,
            line_total: it.line_total ?? ((it.quantity || 0) * (it.unit_price || cat?.price || 0)),
          };
        });
      }

      const syntheticExtracted: ExtractedOrder = {
        customer: { name: salesOrder.customer_id || "Customer" },
        po_number: salesOrder.order_number || undefined,
        order_date: salesOrder.order_date || undefined,
        delivery_date: salesOrder.delivery_date || undefined,
        items: resolvedItems,
        terms: salesOrder.notes || undefined,
      };

      const draft = await buildDraft(
        salesOrder.id,
        "image",
        syntheticExtracted,
        imageUrl,
        sourceRef
      );
      return { draft };
    }

    throw notFound();
  });

export const rejectOrderDraft = createServerFn({ method: "POST" })
  .validator((importId: string) => importId)
  .handler(async ({ data: importId }) => {
    const supabase = createAdminClient();
    await supabase
      .from("order_imports")
      .update({ processing_status: "rejected" })
      .eq("id", importId);
    return { success: true };
  });

export const saveOrderAsDraftFn = createServerFn({ method: "POST" })
  .validator((draft: ExtractedOrder | any) => draft)
  .handler(async ({ data: draft }) => {
    const { saveOrder } = await import("@/lib/order/saveOrder");
    const result = await saveOrder({ ...draft, status: "draft" });
    return { success: true, order: result };
  });

export const Route = createFileRoute("/orders/$id")({
  loader: ({ params }) => getOrderDraft({ data: params.id }),
  component: OrderReviewPage,
});

function OrderReviewPage() {
  const { draft } = Route.useLoaderData();

  return <DraftOrderForm initialDraft={draft} />;
}
