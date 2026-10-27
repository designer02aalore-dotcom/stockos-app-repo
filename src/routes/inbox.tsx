import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Link } from "@/lib/router";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoredGmailTokens } from "@/lib/email/gmailClient";
import { InboxClient, type EmailImportRecord } from "@/components/inbox/InboxClient";
import { ArrowLeft, Mail, History } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const getInboxData = createServerFn({ method: "GET" }).handler(async () => {
  const [tokens, supabase] = [
    await getStoredGmailTokens(),
    createAdminClient(),
  ];

  const isConnected = !!tokens.refreshToken;
  const userEmail = tokens.userEmail || null;

  // Fetch all email imports
  const { data: rawOrders } = await supabase
    .from("order_imports")
    .select("id, source_type, source_reference, customer_id, sales_order_id, extracted_data, processing_status, created_at")
    .eq("source_type", "email")
    .order("created_at", { ascending: false });

  const orders: EmailImportRecord[] = (rawOrders || [])
    .filter((o: any) => {
      // Ensure needs_review / review records are visible and recoverable even before items are manually entered
      if (
        o.processing_status === "review" ||
        o.processing_status === "needs_review" ||
        o.extracted_data?._classification?.requiresReview
      ) {
        return true;
      }
      const items = Array.isArray(o.extracted_data?.items) ? o.extracted_data.items : [];
      return items.length > 0;
    })
    .map((o: any) => ({
    id: o.id,
    source_type: o.source_type,
    source_reference: o.source_reference,
    customer_id: o.customer_id,
    sales_order_id: o.sales_order_id,
    extracted_data: o.extracted_data,
    processing_status: o.processing_status,
    created_at: o.created_at,
  }));

  return {
    isConnected,
    userEmail,
    orders,
  };
});

export const Route = createFileRoute("/inbox")({
  loader: () => getInboxData(),
  component: InboxPage,
});

function InboxPage() {
  const data = Route.useLoaderData();

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <InboxClient
          initialConnected={data.isConnected}
          initialUserEmail={data.userEmail}
          initialOrders={data.orders}
        />
      </div>
    </main>
  );
}
