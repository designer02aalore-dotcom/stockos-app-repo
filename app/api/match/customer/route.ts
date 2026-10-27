import { NextRequest, NextResponse } from "@/lib/response";
import { matchCustomer } from "@/lib/customer/matchCustomer";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request?: NextRequest) {
  try {
    if (!request) return NextResponse.json({ status: "ok" });
    const url = new URL(request.url);
    const name = url.searchParams.get("name") || "";
    const code = url.searchParams.get("code") || "";
    const email = url.searchParams.get("email") || "";
    const phone = url.searchParams.get("phone") || "";

    const result = await matchCustomer({ name, code, email, phone });
    return NextResponse.json({
      matched: !!result.customerId,
      customerId: result.customerId,
      confidence: result.confidence,
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to match customer" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const customer = body.customer || {
      name: body.name,
      code: body.code,
      email: body.email,
      phone: body.phone,
    };

    const result = await matchCustomer(customer);

    if (body.importId && result.customerId) {
      const supabase = createAdminClient();
      await supabase
        .from("order_imports")
        .update({ customer_id: result.customerId })
        .eq("id", body.importId);
    }

    return NextResponse.json({
      matched: !!result.customerId,
      customerId: result.customerId,
      confidence: result.confidence,
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to match customer" }, { status: 500 });
  }
}
