import { NextRequest, NextResponse } from "@/lib/response";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { importId, reason } = body;

    if (!importId) {
      return NextResponse.json(
        { success: false, error: "importId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Update order_imports processing_status to 'rejected'
    const { data: updated, error } = await supabase
      .from("order_imports")
      .update({
        processing_status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", importId)
      .select("id, source_reference, source_type")
      .maybeSingle();

    if (error) {
      console.error("[orders/reject] DB Error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log(`[orders/reject] ✅ Marked order import ${importId} as rejected`);
    return NextResponse.json({ success: true, importId, reason: reason || "non_order" });
  } catch (error: any) {
    console.error("[orders/reject] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reject order" },
      { status: 500 }
    );
  }
}
