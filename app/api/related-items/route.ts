import { NextRequest, NextResponse } from "@/lib/response";
import {
  getRelatedCatalogItems,
  getBatchRelatedCatalogItems,
} from "@/lib/catalog/relatedItems";

/**
 * Related Items / Additional Options API
 * Returns related catalog items, publisher alternatives, and grade variants.
 * Kept completely separate from the primary Match Items API.
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
        { error: "Provide an item name, sku, or itemId.", relatedItems: [], count: 0 },
        { status: 400 }
      );
    }

    const relatedItems = await getRelatedCatalogItems(itemName, sku, itemId);

    return NextResponse.json({
      api: "related items",
      query: itemName,
      relatedItems,
      optionsCount: relatedItems.length,
    });
  } catch (err) {
    console.error("[api/related-items] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch related items", relatedItems: [], optionsCount: 0 },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 1. Batch mode: { items: [{ tempId, name, sku, itemId }] }
    if (Array.isArray(body?.items)) {
      const results = await getBatchRelatedCatalogItems(body.items);
      const totalOptions = results.reduce((acc, it) => acc + it.count, 0);

      return NextResponse.json({
        api: "related items",
        items: results,
        totalOptions,
      });
    }

    // 2. Single item mode
    const itemName = body?.itemName || body?.name || body?.description || "";
    const sku = body?.sku || body?.code || "";
    const itemId = body?.itemId || body?.matchedItemId || "";

    const relatedItems = await getRelatedCatalogItems(itemName, sku, itemId);

    return NextResponse.json({
      api: "related items",
      query: itemName,
      relatedItems,
      optionsCount: relatedItems.length,
    });
  } catch (err) {
    console.error("[api/related-items] POST error:", err);
    return NextResponse.json(
      { error: "Failed to fetch related items", items: [], totalOptions: 0 },
      { status: 500 }
    );
  }
}
