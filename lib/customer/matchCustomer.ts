import { createAdminClient } from "@/lib/supabase/admin";
import type { ExtractedOrder } from "@/types/order";

export interface CustomerMatchResult {
  customerId: string | null;
  confidence: number;
}

export async function matchCustomer(
  extractedCustomer: ExtractedOrder["customer"] | undefined
): Promise<CustomerMatchResult> {
  if (!extractedCustomer) return { customerId: null, confidence: 0 };

  const supabase = createAdminClient();

  // 1. Try exact match by code
  if (extractedCustomer.code) {
    const { data } = await supabase
      .from("customers")
      .select("customer_id")
      .eq("code", extractedCustomer.code)
      .eq("is_deleted", false)
      .maybeSingle();

    if (data) return { customerId: data.customer_id, confidence: 100 };
  }

  // 2. Try exact match by email
  if (extractedCustomer.email) {
    const { data } = await supabase
      .from("customers")
      .select("customer_id")
      .eq("email", extractedCustomer.email)
      .eq("is_deleted", false)
      .maybeSingle();

    if (data) return { customerId: data.customer_id, confidence: 95 };
  }

  // 3. Try match by mobile / phone
  if (extractedCustomer.phone) {
    const digitsOnly = extractedCustomer.phone.replace(/[^0-9]/g, "");
    if (digitsOnly.length >= 8) {
      const searchSuffix = digitsOnly.slice(-10);
      const { data: phoneData } = await supabase
        .from("customers")
        .select("customer_id")
        .ilike("contact_person_mobile", `%${searchSuffix}%`)
        .eq("is_deleted", false)
        .maybeSingle();

      if (phoneData) return { customerId: phoneData.customer_id, confidence: 95 };
    }
  }

  // 4. Try match by name
  if (extractedCustomer.name) {
    const { data: exactNameData } = await supabase
      .from("customers")
      .select("customer_id")
      .ilike("name", extractedCustomer.name)
      .eq("is_deleted", false)
      .maybeSingle();

    if (exactNameData) return { customerId: exactNameData.customer_id, confidence: 90 };

    // Partial name search
    const { data: fuzzyNameData } = await supabase
      .from("customers")
      .select("customer_id")
      .ilike("name", `%${extractedCustomer.name}%`)
      .eq("is_deleted", false)
      .limit(1);

    if (fuzzyNameData && fuzzyNameData.length > 0) {
      return { customerId: fuzzyNameData[0].customer_id, confidence: 75 };
    }
  }

  return { customerId: null, confidence: 0 };
}
