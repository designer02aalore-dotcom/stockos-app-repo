import { NextResponse } from "@/lib/response";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const [customersRes, itemsRes] = await Promise.all([
      supabase
        .from("customers")
        .select("customer_id, name, code, contact_person_mobile, billing_city")
        .eq("is_deleted", false)
        .order("name", { ascending: true }),
      supabase
        .from("items")
        .select("id, name, code, price, unit")
        .eq("is_deleted", false)
        .order("name", { ascending: true }),
    ]);

    return NextResponse.json({
      customers: customersRes.data || [],
      items: itemsRes.data || [],
    });
  } catch (error) {
    console.error("[api/catalog] Error fetching catalog:", error);
    return NextResponse.json(
      { error: "Failed to fetch catalog data", customers: [], items: [] },
      { status: 500 }
    );
  }
}
