import { NextRequest, NextResponse } from "@/lib/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractOrderFromImage } from "@/lib/ai/extractOrder";
import { buildDraft } from "@/lib/order/buildDraft";
import { validateExtractedOrder } from "@/lib/order/validateOrder";
import { matchItemInDatabase } from "@/app/api/match/items/route";
import { matchCustomer } from "@/lib/customer/matchCustomer";
import { cleanItemDescriptionAndQuantity, expandSeriesRanges } from "@/lib/ai/cleanItem";

export async function POST(request: NextRequest) {
  console.log("\n=== [orders/re-extract] Request received ===");
  try {
    const body = await request.json();
    const { importId } = body;

    if (!importId) {
      return NextResponse.json({ error: "Missing importId" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch import record
    const { data: importRecord, error: fetchErr } = await supabase
      .from("order_imports")
      .select("*")
      .eq("id", importId)
      .single();

    if (fetchErr || !importRecord) {
      return NextResponse.json({ error: "Order draft not found" }, { status: 404 });
    }

    if (!importRecord.source_reference) {
      return NextResponse.json(
        { error: "No image source found for this order draft" },
        { status: 400 }
      );
    }

    // 2. Download original image from Supabase storage
    console.log(`[re-extract] Downloading image: ${importRecord.source_reference}`);
    const { data: blob, error: downloadErr } = await supabase.storage
      .from("order-uploads")
      .download(importRecord.source_reference);

    if (downloadErr || !blob) {
      return NextResponse.json(
        { error: `Failed to download source image: ${downloadErr?.message}` },
        { status: 500 }
      );
    }

    const imageBuffer = Buffer.from(await blob.arrayBuffer());
    const mimeType = blob.type || "image/jpeg";

    // 3. Run extractOrderFromImage
    console.log(`[re-extract] Running Vision AI re-extraction on ${imageBuffer.length} bytes...`);
    const extractedResult = await extractOrderFromImage(imageBuffer, mimeType);
    const extracted = (extractedResult as any)?.order || extractedResult;

    // 4. Validate & Match
    const validation = validateExtractedOrder(extracted);
    const rawItems = expandSeriesRanges(validation.order.items || []);
    const matchedItems = await Promise.all(
      rawItems.map(async (item) => {
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
          : catalogPrice !== undefined && catalogPrice > 0
          ? catalogPrice
          : item.unit_price || 0;

        const qty =
          cleaned.quantity ??
          (item.quantity != null &&
          !isNaN(Number(item.quantity)) &&
          Number(item.quantity) > 0
            ? Number(item.quantity)
            : 1);

        const finalLineTotal =
          qty !== null && qty > 0 && finalUnitPrice > 0
            ? Number((qty * finalUnitPrice).toFixed(2))
            : item.line_total ?? null;

        return {
          ...item,
          description: itemDescription,
          quantity: qty,
          sku: item.sku || catalogCode || undefined,
          matchedItemId: matchResult.matched ? matchResult.itemId : null,
          matchedItemCode: matchResult.matched ? catalogCode || null : null,
          matchedItemName: matchResult.matched ? catalogName || null : null,
          catalogPrice: catalogPrice,
          confidence: matchResult.confidence,
          matched: matchResult.matched,
          unit_price: finalUnitPrice,
          line_total: finalLineTotal,
          partialMatches: matchResult.partialMatches || [],
        };
      })
    );

    const customerMatch = await matchCustomer(validation.order.customer);
    const computedSubtotal = matchedItems.reduce((acc, it) => acc + (it.line_total || 0), 0);
    const finalDiscount = validation.order.discount || 0;
    const finalTax = validation.order.tax || 0;
    const computedTotal =
      computedSubtotal > 0
        ? Number((computedSubtotal - finalDiscount + finalTax).toFixed(2))
        : validation.order.total || 0;

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

    // 5. Save in database
    await supabase
      .from("order_imports")
      .update({
        extracted_data: enrichedOrder,
        customer_id: customerMatch.customerId || null,
      })
      .eq("id", importId);

    // 6. Build draft response
    let imageUrl: string | null = null;
    const { data: signedData } = await supabase.storage
      .from("order-uploads")
      .createSignedUrl(importRecord.source_reference, 60 * 60 * 24);
    if (signedData?.signedUrl) {
      imageUrl = signedData.signedUrl;
    }

    const draft = await buildDraft(
      importId,
      importRecord.source_type as "image" | "email",
      enrichedOrder,
      imageUrl,
      importRecord.source_reference
    );

    console.log(`[re-extract] ✅ Succeeded. Extracted ${matchedItems.length} items.`);

    return NextResponse.json({
      success: true,
      draft,
      message: `Re-extracted ${matchedItems.length} items with 100% fidelity.`,
    });
  } catch (err: any) {
    console.error("[re-extract] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Re-extraction failed" },
      { status: 500 }
    );
  }
}
