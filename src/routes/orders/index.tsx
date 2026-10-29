import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Link } from "@/lib/router";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  OrdersDashboard,
  OrderItemViewModel,
} from "@/components/orders/OrdersDashboard";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Sparkles } from "lucide-react";

const getOrdersData = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createAdminClient();

  // 1. Fetch sales_orders
  const { data: salesOrders, error: ordersError } = await supabase
    .from("sales_order")
    .select("*")
    .order("created_at", { ascending: false });

  // 2. Fetch order_imports (to show pending drafts / extractions)
  const { data: imports, error: importsError } = await supabase
    .from("order_imports")
    .select("*")
    .order("created_at", { ascending: false });

  // 3. Fetch customers to resolve customer names
  const { data: customers } = await supabase
    .from("customers")
    .select("customer_id, name, code, contact_person_name");

  // 4. Fetch sales_order_items to get item counts
  const { data: orderItems } = await supabase
    .from("sales_order_items")
    .select("sales_order_id, quantity");

  // Build lookup maps
  const customerMap = new Map((customers || []).map((c) => [c.customer_id, c]));

  const itemsCountMap = new Map<string, { count: number; totalQty: number }>();
  for (const it of orderItems || []) {
    if (!it.sales_order_id) continue;
    const existing = itemsCountMap.get(it.sales_order_id) || { count: 0, totalQty: 0 };
    existing.count += 1;
    existing.totalQty += it.quantity || 0;
    itemsCountMap.set(it.sales_order_id, existing);
  }

  // 1. Convert confirmed/saved sales_orders
  const confirmedOrderList: OrderItemViewModel[] = (salesOrders || []).map((order) => {
    const cust = order.customer_id ? customerMap.get(order.customer_id) : null;
    const itemCountInfo = itemsCountMap.get(order.id) || { count: 0, totalQty: 0 };
    const dateStr = order.order_date || (order.created_at ? new Date(order.created_at).toISOString().split("T")[0] : "—");

    const linkedImport = (imports || []).find((imp) => imp.sales_order_id === order.id);

    return {
      id: linkedImport?.id || order.id,
      orderNumber: order.order_number || `SO-${order.id.slice(0, 6).toUpperCase()}`,
      poNumber: undefined,
      orderDate: dateStr,
      createdAt: order.created_at,
      customerName: cust?.name || "Unlinked Customer",
      isCustomerLinked: !!cust,
      itemCount: itemCountInfo.count || 0,
      totalQuantity: itemCountInfo.totalQty || 0,
      totalAmount: order.total || 0,
      status: (order.status as "confirmed" | "draft") || "confirmed",
      sourceType: (linkedImport?.source_type as "image" | "email") || "manual",
      sourceReference: linkedImport?.source_reference || undefined,
    };
  });

  // Track imports already covered by sales_order_id
  const coveredImportIds = new Set(
    (imports || []).filter((imp) => imp.sales_order_id).map((imp) => imp.id)
  );

  // Set of confirmed order numbers to prevent showing duplicate draft rows
  const confirmedPoNumbers = new Set(
    (salesOrders || [])
      .map((so) => (so.order_number || "").trim().toLowerCase())
      .filter(Boolean)
  );

  // 2. Add pending/draft imports that haven't been finalized to sales_order
  const pendingDraftList: OrderItemViewModel[] = (imports || [])
    .filter((imp) => {
      if (coveredImportIds.has(imp.id) || imp.sales_order_id) return false;
      const poNum = (imp.extracted_data as any)?.po_number?.trim().toLowerCase();
      if (poNum && confirmedPoNumbers.has(poNum)) {
        return false; // Already confirmed as a sales order: omit duplicate draft
      }
      const items = Array.isArray((imp.extracted_data as any)?.items)
        ? (imp.extracted_data as any).items
        : [];
      return items.length > 0;
    })
    .map((imp) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extracted = (imp.extracted_data as any) || {};
      const cust = imp.customer_id ? customerMap.get(imp.customer_id) : null;
      const extractedCustName = cust?.name || extracted.customer?.name || "Unlinked Customer";
      const items = Array.isArray(extracted.items) ? extracted.items : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalUnits = items.reduce((acc: number, it: any) => acc + (Number(it.quantity) || 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const computedTotal = items.reduce((acc: number, it: any) => acc + (Number(it.line_total) || ((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))), 0);
      const dateStr = extracted.order_date || (imp.created_at ? new Date(imp.created_at).toISOString().split("T")[0] : "—");

      const poVal = (extracted.po_number || "").trim();
      const displayOrderNumber = poVal
        ? (poVal.toUpperCase().startsWith("PO-") ? poVal : `PO-${poVal}`)
        : `DRAFT-${imp.id.slice(0, 6).toUpperCase()}`;

      return {
        id: imp.id,
        orderNumber: displayOrderNumber,
        poNumber: poVal || undefined,
        orderDate: dateStr,
        createdAt: imp.created_at,
        customerName: extractedCustName,
        isCustomerLinked: !!cust,
        itemCount: items.length || 0,
        totalQuantity: totalUnits,
        totalAmount: Number(extracted.total_amount) || computedTotal,
        status: "draft" as const,
        sourceType: (imp.source_type as "image" | "email") || "image",
        sourceReference: imp.source_reference || undefined,
      };
    });

  // Combined and sorted by newest first
  const allOrders = [...pendingDraftList, ...confirmedOrderList].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return { allOrders };
});

export const Route = createFileRoute("/orders/")({
  loader: () => getOrdersData(),
  component: OrdersPage,
});

function OrdersPage() {
  const { allOrders } = Route.useLoaderData();

  return (
    <main className="min-h-screen bg-slate-50/50 pb-16">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-30 shadow-2xs">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              title="Back to Dashboard"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer group shrink-0 active:scale-95"
            >
              <ArrowLeft className="size-3.5 text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-100 transition-transform group-hover:-translate-x-0.5" />
              <span>Back</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                  Sales Orders & Drafts
                </h1>
                <Badge
                  variant="outline"
                  className="hidden sm:inline-flex border-blue-300 text-blue-700 bg-blue-50 text-[10px] h-4.5 px-2 font-semibold"
                >
                  StockOS Live
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage confirmed orders, pending OCR extractions, and draft sales orders
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/upload"
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " gap-1.5 h-8 text-xs font-semibold border-slate-400"
              }
            >
              <Sparkles className="size-3.5 text-blue-600" />
              <span>+ OCR Extract</span>
            </Link>
            <Link
              to="/orders/new"
              className={
                buttonVariants({ variant: "default", size: "sm" }) +
                " gap-1.5 h-8 text-xs font-semibold shadow-xs"
              }
            >
              <Plus className="size-3.5" />
              <span>New Order</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <OrdersDashboard initialOrders={allOrders} />
      </div>
    </main>
  );
}
