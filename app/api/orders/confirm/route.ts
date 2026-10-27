import { NextRequest, NextResponse } from "@/lib/response";
import { saveOrder } from "@/lib/order/saveOrder";
import type { DraftOrder } from "@/types/order";

export async function POST(request: NextRequest) {
  try {
    const draft: DraftOrder = await request.json();

    if (!draft || !draft.importId) {
      return NextResponse.json(
        { error: "Invalid draft order payload" },
        { status: 400 }
      );
    }

    console.log(`[orders/confirm] Saving draft order for import: ${draft.importId}`);

    const result = await saveOrder(draft);

    console.log(`[orders/confirm] ✅ Successfully saved order: ${result.order_number}`);

    return NextResponse.json({ success: true, order: result });
  } catch (error) {
    console.error("[orders/confirm] ❌ Error saving order:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save order" },
      { status: 500 }
    );
  }
}
