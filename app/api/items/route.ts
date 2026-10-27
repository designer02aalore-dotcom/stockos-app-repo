import { NextRequest, NextResponse } from "@/lib/response";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim().toLowerCase() || "";
    const limit = parseInt(url.searchParams.get("limit") || "500", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    let query = supabase
      .from("items")
      .select("id, name, code, barcode, descriptions, unit, price, weight, is_deleted", {
        count: "exact",
      })
      .eq("is_deleted", false)
      .order("name", { ascending: true });

    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,descriptions.ilike.%${search}%`);
    }

    if (limit > 0) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("[api/items] GET error:", error);
      return NextResponse.json({ error: error.message, items: [], totalCount: 0 }, { status: 500 });
    }

    return NextResponse.json({
      items: data || [],
      totalCount: count ?? (data?.length || 0),
    });
  } catch (error) {
    console.error("[api/items] GET unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch items", items: [], totalCount: 0 },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    const name = (body.name || "").trim();
    const code = body.code ? String(body.code).trim() : null;
    const price = typeof body.price === "number" ? body.price : parseFloat(String(body.price)) || 0;
    const unit = body.unit ? String(body.unit).trim().toUpperCase() : "PCS";
    const descriptions = body.descriptions ? String(body.descriptions).trim() : name;
    const barcode = body.barcode ? String(body.barcode).trim() : null;

    if (!name) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 });
    }

    // Check if item with duplicate code exists
    if (code) {
      const { data: existingCode } = await supabase
        .from("items")
        .select("id, name, code")
        .eq("code", code)
        .eq("is_deleted", false)
        .maybeSingle();

      if (existingCode) {
        return NextResponse.json(
          { error: `Item with code '${code}' already exists (${existingCode.name}).` },
          { status: 409 }
        );
      }
    }

    // Insert new item
    const { data: newItem, error: insertError } = await supabase
      .from("items")
      .insert({
        name,
        code,
        price,
        unit,
        descriptions,
        barcode,
        is_deleted: false,
      })
      .select("id, name, code, barcode, descriptions, unit, price, weight, is_deleted")
      .single();

    if (insertError) {
      console.error("[api/items] POST insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      item: newItem,
      message: `Item "${name}" created successfully.`,
    });
  } catch (error) {
    console.error("[api/items] POST unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create item" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Item ID is required for update" }, { status: 400 });
    }

    const name = (body.name || "").trim();
    const code = body.code !== undefined ? (body.code ? String(body.code).trim() : null) : undefined;
    const price = body.price !== undefined ? (typeof body.price === "number" ? body.price : parseFloat(String(body.price)) || 0) : undefined;
    const unit = body.unit ? String(body.unit).trim().toUpperCase() : undefined;
    const descriptions = body.descriptions !== undefined ? String(body.descriptions).trim() : undefined;
    const barcode = body.barcode !== undefined ? (body.barcode ? String(body.barcode).trim() : null) : undefined;

    if (!name) {
      return NextResponse.json({ error: "Item name cannot be empty" }, { status: 400 });
    }

    // Check code uniqueness if code is updated
    if (code) {
      const { data: existingCode } = await supabase
        .from("items")
        .select("id, name, code")
        .eq("code", code)
        .neq("id", id)
        .eq("is_deleted", false)
        .maybeSingle();

      if (existingCode) {
        return NextResponse.json(
          { error: `Another item with code '${code}' already exists (${existingCode.name}).` },
          { status: 409 }
        );
      }
    }

    const updatePayload: Record<string, any> = {
      name,
    };
    if (code !== undefined) updatePayload.code = code;
    if (price !== undefined) updatePayload.price = price;
    if (unit !== undefined) updatePayload.unit = unit;
    if (descriptions !== undefined) updatePayload.descriptions = descriptions;
    if (barcode !== undefined) updatePayload.barcode = barcode;

    const { data: updatedItem, error: updateError } = await supabase
      .from("items")
      .update(updatePayload)
      .eq("id", id)
      .select("id, name, code, barcode, descriptions, unit, price, weight, is_deleted")
      .single();

    if (updateError) {
      console.error("[api/items] PUT update error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      item: updatedItem,
      message: `Item "${name}" updated successfully.`,
    });
  } catch (error) {
    console.error("[api/items] PUT unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update item" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    let id = "";

    try {
      const body = await request.json();
      id = body?.id || "";
    } catch {
      const url = new URL(request.url);
      id = url.searchParams.get("id") || "";
    }

    if (!id.trim()) {
      return NextResponse.json({ error: "Item ID is required for deletion" }, { status: 400 });
    }

    // Soft delete by setting is_deleted to true
    const { error: deleteError } = await supabase
      .from("items")
      .update({ is_deleted: true })
      .eq("id", id.trim());

    if (deleteError) {
      console.error("[api/items] DELETE error:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id: id.trim(),
      message: "Item removed from catalog successfully.",
    });
  } catch (error) {
    console.error("[api/items] DELETE unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete item" },
      { status: 500 }
    );
  }
}
