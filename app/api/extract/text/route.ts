import { NextRequest, NextResponse } from "@/lib/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractOrderFromOcrText } from "@/lib/ai/geminiText";
import { validateExtractedOrder } from "@/lib/order/validateOrder";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, subject, sender } = body;

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Order text is required" }, { status: 400 });
    }

    console.log(`[extract/text] Parsing raw customer order text (${text.length} chars)...`);
    const extracted = await extractOrderFromOcrText(text);

    if (sender && (!extracted.customer?.name || extracted.customer.name === "Customer")) {
      extracted.customer = { ...extracted.customer, name: sender };
    }

    const validation = validateExtractedOrder(extracted);
    const supabase = createAdminClient();
    const cleanPo = validation.order.po_number?.trim();

    let existingImportId: string | null = null;
    let existingSalesOrderId: string | null = null;

    if (cleanPo) {
      const { data: existingSo } = await supabase
        .from("sales_order")
        .select("id, order_number")
        .eq("order_number", cleanPo)
        .maybeSingle();

      if (existingSo) {
        existingSalesOrderId = existingSo.id;
      }

      const { data: existingByPo } = await supabase
        .from("order_imports")
        .select("id, sales_order_id, processing_status, created_at")
        .filter("extracted_data->>po_number", "eq", cleanPo)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingByPo && existingByPo.length > 0) {
        existingImportId = existingByPo[0].id;
        if (!existingSalesOrderId && existingByPo[0].sales_order_id) {
          existingSalesOrderId = existingByPo[0].sales_order_id;
        }
      }
    }

    const payloadData = {
      ...validation.order,
      _email_source: {
        from: sender || "Direct Text Intake",
        subject: subject || "Direct Customer Requisition",
        bodyText: text,
        date: new Date().toISOString(),
      },
      _classification: {
        category: "order_request",
        confidence: 0.95,
        requiresReview: false,
        intentSummary: "Direct text purchase order ingested via Capture Center",
      },
    };

    let importRecord: any = null;

    if (existingImportId) {
      console.log(`[extract/text] 🔄 Updating existing import record (${existingImportId}) to prevent duplicates...`);
      const { data: updatedRecord, error: updateError } = await supabase
        .from("order_imports")
        .update({
          source_type: "email",
          source_reference: subject || "Text Requisition Ingestion",
          extracted_data: payloadData,
          processing_status: "pending",
          sales_order_id: null,
        })
        .eq("id", existingImportId)
        .select()
        .single();

      if (!updateError && updatedRecord) {
        importRecord = updatedRecord;
      }
    }

    if (!importRecord) {
      const { data: newRecord, error } = await supabase
        .from("order_imports")
        .insert({
          source_type: "email",
          source_reference: subject || "Text Requisition Ingestion",
          extracted_data: payloadData,
          processing_status: "pending",
          sales_order_id: null,
        })
        .select()
        .single();

      if (error || !newRecord) {
        console.error("[extract/text] ❌ Database error:", error);
        throw new Error(error?.message || "Failed to record text import");
      }
      importRecord = newRecord;
    }

    console.log(`[extract/text] ✅ Resolved order import ${importRecord.id}`);
    return NextResponse.json({
      success: true,
      importId: importRecord.id,
      extracted: validation.order,
    });
  } catch (err: any) {
    console.error("[extract/text] ❌ Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to extract order from text" },
      { status: 500 }
    );
  }
}
