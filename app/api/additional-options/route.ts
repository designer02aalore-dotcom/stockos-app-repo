import { NextRequest, NextResponse } from "@/lib/response";
import {
  getRelatedCatalogItems,
  getBatchRelatedCatalogItems,
} from "@/lib/catalog/relatedItems";

/**
 * Additional Options API (/api/additional-options)
 * Returns alternative variants and related catalog options.
 * Kept completely separate from the Match Items API.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const itemName =
      url.searchParams.get("name") ||
      url.searchParams.get("description") ||
      url.searchParams.get("query") ||
      url.searchParams.get("search") ||
      "";
    const sku =
      url.searchParams.get("sku") || url.searchParams.get("code") || "";
    const itemId =
      url.searchParams.get("itemId") || url.searchParams.get("id") || "";

    if (!itemName.trim() && !sku.trim() && !itemId.trim()) {
      return NextResponse.json(
        { api: "additional options", error: "Provide an item name, sku, or itemId.", relatedItems: [], count: 0 },
        { status: 400 }
      );
    }

    const relatedItems = await getRelatedCatalogItems(itemName, sku, itemId);

    return NextResponse.json({
      api: "additional options",
      query: itemName,
      additionalOptions: relatedItems,
      relatedItems,
      optionsCount: relatedItems.length,
    });
  } catch (err) {
    console.error("[api/additional-options] GET error:", err);
    return NextResponse.json(
      { api: "additional options", error: "Failed to fetch additional options", relatedItems: [], additionalOptions: [], optionsCount: 0 },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Batch mode: { items: [{ tempId, name, sku, itemId }] }
    if (Array.isArray(body?.items)) {
      const results = await getBatchRelatedCatalogItems(body.items);
      const totalOptions = results.reduce((acc, it) => acc + it.count, 0);

      return NextResponse.json({
        api: "additional options",
        items: results,
        totalOptions,
      });
    }

    const itemName = body?.itemName || body?.name || body?.description || "";
    const sku = body?.sku || body?.code || "";
    const itemId = body?.itemId || body?.matchedItemId || "";

    const relatedItems = await getRelatedCatalogItems(itemName, sku, itemId);

    return NextResponse.json({
      api: "additional options",
      query: itemName,
      additionalOptions: relatedItems,
      relatedItems,
      optionsCount: relatedItems.length,
    });
  } catch (err) {
    console.error("[api/additional-options] POST error:", err);
    return NextResponse.json(
      { api: "additional options", error: "Failed to fetch additional options", items: [], totalOptions: 0 },
      { status: 500 }
    );
  }
}
