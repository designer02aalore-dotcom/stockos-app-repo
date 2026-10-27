import { NextRequest, NextResponse } from "@/lib/response";
import { createAdminClient } from "@/lib/supabase/admin";

interface ItemPayload {
  tempId?: string;
  name: string;
  code?: string | null;
  price?: number | null;
  unit?: string | null;
  descriptions?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    // Support single item or batch array of items
    const rawItems: ItemPayload[] = Array.isArray(body.items)
      ? body.items
      : body.item
      ? [body.item]
      : [];

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "No items provided for insertion" },
        { status: 400 }
      );
    }

    const processedResults = [];

    for (const rawItem of rawItems) {
      const cleanName = (rawItem.name || "").trim();
      const cleanCode = rawItem.code ? rawItem.code.trim() : null;
      const price = typeof rawItem.price === "number" ? rawItem.price : parseFloat(String(rawItem.price)) || 0;
      const unit = rawItem.unit ? rawItem.unit.trim().toUpperCase() : "PCS";
      const descriptions = rawItem.descriptions?.trim() || cleanName;

      if (!cleanName && !cleanCode) {
        continue;
      }

      const itemName = cleanName || cleanCode || "New Item";

      // 1. Check if an item already exists with matching code
      let matchedItem = null;
      if (cleanCode) {
        const { data: byCode } = await supabase
          .from("items")
          .select("id, name, code, price, unit")
          .eq("code", cleanCode)
          .eq("is_deleted", false)
          .maybeSingle();

        if (byCode) {
          matchedItem = { ...byCode, isNew: false };
        }
      }

      // 2. Check if an item exists with matching name
      if (!matchedItem && cleanName) {
        const { data: byName } = await supabase
          .from("items")
          .select("id, name, code, price, unit")
          .ilike("name", cleanName)
          .eq("is_deleted", false)
          .maybeSingle();

        if (byName) {
          matchedItem = { ...byName, isNew: false };
        }
      }

      // 3. If item does not exist, insert it into items table
      if (!matchedItem) {
        const { data: inserted, error: insertError } = await supabase
          .from("items")
          .insert({
            name: itemName,
            code: cleanCode,
            price: price,
            unit: unit,
            descriptions: descriptions,
            is_deleted: false,
          })
          .select("id, name, code, price, unit")
          .single();

        if (insertError) {
          console.error("[api/items/create] Insert error:", insertError);
          throw new Error(`Failed to insert item '${itemName}': ${insertError.message}`);
        }

        matchedItem = { ...inserted, isNew: true };
      }

      processedResults.push({
        tempId: rawItem.tempId,
        id: matchedItem.id,
        name: matchedItem.name,
        code: matchedItem.code,
        price: matchedItem.price,
        unit: matchedItem.unit,
        isNew: matchedItem.isNew,
      });
    }

    return NextResponse.json({
      success: true,
      items: processedResults,
      item: processedResults[0] || null,
    });
  } catch (error) {
    console.error("[api/items/create] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to insert items" },
      { status: 500 }
    );
  }
}
