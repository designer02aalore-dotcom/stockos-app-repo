import { matchCustomer } from "../customer/matchCustomer";
import { matchItemInDatabase } from "@/app/api/match/items/route";
import { computeTotals } from "./computeTotals";
import { cleanItemDescriptionAndQuantity, expandSeriesRanges } from "../ai/cleanItem";
import type { ExtractedOrder, DraftOrder, DraftLineItem } from "@/types/order";

export async function buildDraft(
  importId: string,
  sourceType: "image" | "email",
  extracted: ExtractedOrder,
  imageUrl?: string | null,
  sourceReference?: string | null
): Promise<DraftOrder> {
  // 1. Expand series ranges (e.g. "computer 1to8" -> "computer 1" .. "computer 8")
  const expandedItems = expandSeriesRanges(extracted.items || []);

  // 2. Match Customer & Items in parallel
  const [customerMatch, lineItems] = await Promise.all([
    matchCustomer(extracted.customer),
    Promise.all(
      expandedItems.map(async (item): Promise<DraftLineItem> => {
        // Intelligently separate item description from quantity/packaging notes (e.g. "Amigos Nur 2 sets" -> "Amigos Nur", qty: 2)
        const cleaned = cleanItemDescriptionAndQuantity(item.description, item.quantity);
        const effectiveDescription = cleaned.description || item.description || "";
        const itemMatch = await matchItemInDatabase(effectiveDescription, item.sku, item.matchedItemId);
        const isMatched = Boolean(itemMatch.matched && itemMatch.itemId);
        const catalogPrice = isMatched ? (itemMatch.catalogItem?.price ?? undefined) : undefined;
        const catalogCode = isMatched ? (itemMatch.catalogItem?.code ?? undefined) : undefined;
        const catalogName = isMatched ? (itemMatch.catalogItem?.name ?? undefined) : undefined;

        // Check if rate was explicitly provided on the document (> 0)
        const hasDocPrice = typeof item.unit_price === "number" && item.unit_price > 0;

        // If rate is not given on document (or 0 / undefined), use catalog rate from items table!
        const finalUnitPrice = hasDocPrice
          ? item.unit_price!
          : (catalogPrice !== undefined && catalogPrice > 0 ? catalogPrice : (item.unit_price || 0));

        // Use cleaned quantity if extracted from description or existing valid quantity
        // const qty = cleaned.quantity ?? (
        //   item.quantity != null && !isNaN(Number(item.quantity)) && Number(item.quantity) > 0
        //     ? Number(item.quantity)
        //     : null
        // );

        const qty = cleaned.quantity ?? (
          item.quantity != null && !isNaN(Number(item.quantity)) && Number(item.quantity) > 0
            ? Number(item.quantity)
            : 1   // <-- Defaults missing / 0 quantity to 1
        );

        const finalLineTotal = (qty !== null && qty > 0 && finalUnitPrice > 0)
          ? Number((qty * finalUnitPrice).toFixed(2))
          : (item.line_total ?? null);

        const filteredPartials = (itemMatch.partialMatches || []).filter(
          (p) =>
            p.id !== itemMatch.itemId &&
            p.name?.toLowerCase().trim() !== (catalogName || effectiveDescription)?.toLowerCase().trim()
        );

        return {
          ...item,
          tempId: crypto.randomUUID(),
          description: effectiveDescription,
          sku: isMatched ? (catalogCode || item.sku || undefined) : undefined,
          matched: isMatched,
          matchedItemId: isMatched ? (itemMatch.itemId || null) : null,
          matchedItemCode: isMatched ? (catalogCode || null) : null,
          matchedItemName: isMatched ? (catalogName || null) : null,
          catalogPrice: catalogPrice,
          isPriceFromCatalog: isMatched && !hasDocPrice && catalogPrice !== undefined && catalogPrice > 0,
          quantity: qty,
          unit_price: finalUnitPrice,
          line_total: finalLineTotal,
          confidence: isMatched ? itemMatch.confidence : 0,
          partialMatches: filteredPartials,
        };
      })
    ),
  ]);

  // 2. Compute Totals (recalculated with catalog rates)
  const totals = computeTotals(lineItems);

  return {
    importId,
    sourceType,
    sourceReference: sourceReference || null,
    imageUrl: imageUrl || null,
    extracted,
    matchedCustomerId: customerMatch.customerId || undefined,
    customerConfidence: customerMatch.confidence,
    lineItems,
    totals,
  };
}
