import { NextRequest, NextResponse } from "@/lib/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateOrderFile } from "@/lib/validation/validateFile";
import { extractOrderFromImage } from "@/lib/ai/extractOrder";
import { validateExtractedOrder, checkOrderDuplicate } from "@/lib/order/validateOrder";
import { matchItemInDatabase } from "@/app/api/match/items/route";
import { matchCustomer } from "@/lib/customer/matchCustomer";
import { cleanItemDescriptionAndQuantity, expandSeriesRanges } from "@/lib/ai/cleanItem";
import { detectAndAutoRotateImage } from "@/lib/image/autoRotate";

export async function POST(request: NextRequest) {
  console.log("\n=== [extract/image] Request received ===");

  try {
    // ---- 1. Parse form data ----
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      console.error("[extract/image] No file provided");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();

    // ---- Stage A: File Validation & Quality Check ----
    const fileValidation = validateOrderFile({
      name: file.name,
      type: file.type,
      size: file.size,
      buffer: arrayBuffer,
    });

    if (!fileValidation.isValid) {
      console.error("[extract/image] File validation failed:", fileValidation.error);
      return NextResponse.json(
        { error: fileValidation.error || "Invalid file" },
        { status: 400 }
      );
    }

    console.log("[extract/image] ✅ File validation passed:", {
      name: file.name,
      type: fileValidation.mimeType,
      size: file.size,
    });

    // ---- Stage A.1: Physically auto-rotate sideways / WhatsApp camera photos ----
    let uploadBuffer: Buffer = Buffer.from(arrayBuffer);
    let uploadMimeType = fileValidation.mimeType;

    if (fileValidation.fileType === "image") {
      try {
        const rotateRes = await detectAndAutoRotateImage(uploadBuffer, fileValidation.mimeType);
        if (rotateRes.rotated) {
          uploadBuffer = rotateRes.buffer;
          uploadMimeType = rotateRes.mimeType;
          console.log(`[extract/image] 🔄 Auto-rotated phone image by ${rotateRes.angle}° CW for 100% OCR reading accuracy.`);
        }
      } catch (rErr) {
        console.warn("[extract/image] Auto-rotation non-blocking error:", rErr);
      }
    }

    // ---- 2. Init Supabase admin client ----
    console.log("[extract/image] Creating Supabase admin client...");
    const supabase = createAdminClient();

    // ---- 3. Upload to Storage ----
    const ext = file.name.split(".").pop() || (fileValidation.fileType === "pdf" ? "pdf" : "png");
    const fileName = `${crypto.randomUUID()}.${ext}`;
    console.log("[extract/image] Uploading to storage as:", fileName);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("order-uploads")
      .upload(fileName, uploadBuffer, {
        contentType: uploadMimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[extract/image] ❌ Storage upload error:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    console.log("[extract/image] ✅ Uploaded:", uploadData?.path);

    // ---- 4. Get signed URL ----
    const { data: signed, error: signError } = await supabase.storage
      .from("order-uploads")
      .createSignedUrl(fileName, 3600);

    if (signError || !signed?.signedUrl) {
      console.warn("[extract/image] Signed URL warning:", signError);
    }

    // ---- Stages B to E: Extraction Pipeline ----
    console.log("[extract/image] Executing order extraction pipeline...");
    let extractedResult;
    try {
      extractedResult = await extractOrderFromImage(uploadBuffer, uploadMimeType);
      console.log("[extract/image] ✅ Extraction successful");
    } catch (aiError) {
      console.error("[extract/image] ❌ AI extraction error:", aiError);
      return NextResponse.json(
        {
          error: `Extraction failed: ${
            aiError instanceof Error ? aiError.message : "Unknown error"
          }`,
        },
        { status: 500 }
      );
    }

    const extracted = (extractedResult as any)?.order || extractedResult;
    const extractionMethod = (extractedResult as any)?.method || "ocr-gemini-text";
    console.log("[extract/image] Extracted items count:", extracted.items?.length ?? 0);

    // ---- Stage D: Run Validation Engine (including duplicate sales order check) ----
    const validation = validateExtractedOrder(extracted);
    const duplicateWarning = await checkOrderDuplicate(extracted.po_number || "");
    if (duplicateWarning) {
      console.warn(`[extract/image] ⚠️ ${duplicateWarning}`);
    }

    // ---- Stage E: Validate & Match Items with Database Items Table through API Logic ----
    console.log("[extract/image] Matching extracted items against items table via matching API...");
    const rawItems = expandSeriesRanges(validation.order.items || []);
    const matchedItems = await Promise.all(
      rawItems.map(async (item) => {
        // Intelligently separate item description from quantity/packaging notes (e.g. "Amigos Nur 2 sets" -> "Amigos Nur", qty: 2)
        const cleaned = cleanItemDescriptionAndQuantity(item.description, item.quantity);
        const itemDescription = (cleaned.description || item.description || "").trim();
        const itemSku = item.sku?.trim() || "";
        const matchResult = await matchItemInDatabase(itemDescription, itemSku);

        const catalogPrice = matchResult.catalogItem?.price ?? undefined;
        const catalogCode = matchResult.catalogItem?.code ?? undefined;
        const catalogName = matchResult.catalogItem?.name ?? undefined;

        const hasDocPrice = typeof item.unit_price === "number" && item.unit_price > 0;
        const finalUnitPrice = hasDocPrice
          ? item.unit_price!
          : (catalogPrice !== undefined && catalogPrice > 0 ? catalogPrice : (item.unit_price || 0));

        const qty = cleaned.quantity ?? (
          item.quantity != null && !isNaN(Number(item.quantity)) && Number(item.quantity) > 0
            ? Number(item.quantity)
            : null
        );

        const finalLineTotal = (qty !== null && qty > 0 && finalUnitPrice > 0)
          ? Number((qty * finalUnitPrice).toFixed(2))
          : (item.line_total ?? null);

        return {
          ...item,
          description: itemDescription,
          quantity: qty,
          sku: item.sku || catalogCode || undefined,
          matchedItemId: matchResult.matched ? matchResult.itemId : null,
          matchedItemCode: matchResult.matched ? (catalogCode || null) : null,
          matchedItemName: matchResult.matched ? (catalogName || null) : null,
          catalogPrice: catalogPrice,
          confidence: matchResult.confidence,
          matched: matchResult.matched,
          unit_price: finalUnitPrice,
          line_total: finalLineTotal,
          partialMatches: matchResult.partialMatches || [],
        };
      })
    );

    // Also match customer record against database customers table
    const customerMatch = await matchCustomer(validation.order.customer);

    // Recompute order totals with matched catalog prices
    const computedSubtotal = matchedItems.reduce((acc, it) => acc + (it.line_total || 0), 0);
    const finalDiscount = validation.order.discount || 0;
    const finalTax = validation.order.tax || 0;
    const computedTotal = computedSubtotal > 0
      ? Number((computedSubtotal - finalDiscount + finalTax).toFixed(2))
      : (validation.order.total || 0);

    const enrichedOrder = {
      ...validation.order,
      customer: {
        ...validation.order.customer,
        id: customerMatch.customerId || null,
      },
      items: matchedItems,
      subtotal: computedSubtotal > 0 ? computedSubtotal : validation.order.subtotal,
      total: computedTotal > 0 ? computedTotal : validation.order.total,
      matchedCustomerId: customerMatch.customerId || null,
      customerConfidence: customerMatch.confidence || 0,
    };

    // ---- Stage F: Save Staging Draft in order_imports for user review (Preventing Duplicates) ----
    const cleanPo = enrichedOrder.po_number?.trim();
    let existingImportId: string | null = null;
    let existingSalesOrderId: string | null = null;
    let isTotalDuplicate = false;

    if (cleanPo) {
      // 1. Check if a sales_order already exists with this PO number
      const { data: existingSo } = await supabase
        .from("sales_order")
        .select("id, order_number")
        .eq("order_number", cleanPo)
        .maybeSingle();

      if (existingSo) {
        // STRICT CHECK: An order is ONLY duplicate if all items exist in catalog,
        // no items are new/unmatched, and every item & quantity exactly matches the confirmed sales order.
        const items = enrichedOrder.items || [];
        const hasUnmatchedOrNew = items.length === 0 || items.some((it: any) => !it.matched || !it.matchedItemId);

        if (!hasUnmatchedOrNew) {
          const { data: soItems } = await supabase
            .from("sales_order_items")
            .select("item_id, quantity")
            .eq("sales_order_id", existingSo.id);

          if (
            soItems &&
            soItems.length === items.length &&
            items.every((it: any) => {
              const match = soItems.find((s: any) => s.item_id === it.matchedItemId);
              return match && Number(match.quantity) === Number(it.quantity);
            })
          ) {
            isTotalDuplicate = true;
            existingSalesOrderId = existingSo.id;
            console.log(`[extract/image] Extracted order is a 100% duplicate of confirmed sales order ${existingSo.id}`);
          }
        }

        // If it's NOT a total duplicate, this is a NEW distinct order!
        // Disambiguate the PO number to prevent collision with the existing sales order.
        if (!isTotalDuplicate) {
          const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
          enrichedOrder.po_number = `${cleanPo}-${randomSuffix}`;
          console.log(`[extract/image] Distinct order sharing PO prefix. Disambiguated to: ${enrichedOrder.po_number}`);
        }
      }

      // 2. Check if an order_imports record already exists for this PO number
      const { data: existingByPo } = await supabase
        .from("order_imports")
        .select("id, sales_order_id, processing_status, created_at")
        .filter("extracted_data->>po_number", "eq", cleanPo)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingByPo && existingByPo.length > 0) {
        existingImportId = existingByPo[0].id;
      }
    }

    // 3. Fallback: Check if the exact same file name was previously uploaded
    if (!existingImportId && fileName) {
      const { data: existingByFile } = await supabase
        .from("order_imports")
        .select("id, sales_order_id, processing_status, created_at")
        .eq("source_reference", fileName)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingByFile && existingByFile.length > 0) {
        existingImportId = existingByFile[0].id;
      }
    }

    // 4. Content-based duplicate check when PO number is missing (e.g. handwritten paper slips)
    if (!existingSalesOrderId && (!cleanPo || !existingImportId)) {
      const { findExistingDuplicateSalesOrder } = await import("@/lib/order/validateOrder");
      const contentDup = await findExistingDuplicateSalesOrder({
        poNumber: cleanPo,
        orderDate: enrichedOrder.order_date,
        total: enrichedOrder.total,
        customerId: customerMatch.customerId || enrichedOrder.customer?.id,
        customerName: enrichedOrder.customer?.name,
        items: enrichedOrder.items,
      });

      if (contentDup.isDuplicate && contentDup.orderId) {
        isTotalDuplicate = true;
        existingSalesOrderId = contentDup.orderId;
        if (contentDup.orderNumber) {
          enrichedOrder.po_number = contentDup.orderNumber;
        }
        console.log(
          `[extract/image] 🔄 Content match found existing confirmed sales order: #${contentDup.orderNumber} (${contentDup.orderId})`
        );

        // Also check if there was a previous import for this sales order
        const { data: impForSo } = await supabase
          .from("order_imports")
          .select("id")
          .eq("sales_order_id", contentDup.orderId)
          .maybeSingle();

        if (impForSo) {
          existingImportId = impForSo.id;
        }
      }
    }

    const resolvedStatus = isTotalDuplicate ? "confirmed" : "pending";
    const resolvedSalesOrderId = isTotalDuplicate ? existingSalesOrderId : null;

    let importRecord: any = null;

    if (existingImportId) {
      console.log(`[extract/image] 🔄 Updating existing import record (${existingImportId}) to prevent duplicates...`);
      const { data: updatedRecord, error: updateError } = await supabase
        .from("order_imports")
        .update({
          source_type: "image",
          source_reference: fileName,
          customer_id: customerMatch.customerId || null,
          extracted_data: enrichedOrder,
          processing_status: resolvedStatus,
          sales_order_id: resolvedSalesOrderId,
        })
        .eq("id", existingImportId)
        .select()
        .single();

      if (!updateError && updatedRecord) {
        importRecord = updatedRecord;
      } else {
        console.warn("[extract/image] Update failed, falling back to insert:", updateError);
      }
    }

    if (!importRecord) {
      console.log("[extract/image] Inserting staging record in order_imports...");
      const { data: newRecord, error: importError } = await supabase
        .from("order_imports")
        .insert({
          source_type: "image",
          source_reference: fileName,
          customer_id: customerMatch.customerId || null,
          extracted_data: enrichedOrder,
          processing_status: resolvedStatus,
          sales_order_id: resolvedSalesOrderId,
        })
        .select()
        .single();

      if (importError || !newRecord) {
        console.error("[extract/image] ❌ Insert error:", importError);
        return NextResponse.json(
          {
            error: `Failed to record import: ${
              importError?.message ?? "Unknown error"
            }`,
          },
          { status: 500 }
        );
      }
      importRecord = newRecord;
    }

    console.log("[extract/image] ✅ Staging record resolved:", importRecord.id);
    console.log("=== [extract/image] Request complete ===\n");

    return NextResponse.json({
      importId: importRecord.id,
      extracted: enrichedOrder,
      matchedItems,
      matchedCount: matchedItems.filter((it) => it.matched).length,
      unmatchedCount: matchedItems.filter((it) => !it.matched).length,
      customerMatch: {
        customerId: customerMatch.customerId,
        confidence: customerMatch.confidence,
      },
      method: extractionMethod,
      validation: {
        isValid: validation.isValid,
        issues: validation.issues,
        duplicateWarning: duplicateWarning || undefined,
      },
    });

  } catch (err) {
    console.error("[extract/image] ❌ Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}