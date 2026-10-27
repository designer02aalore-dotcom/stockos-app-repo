import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Link } from "@/lib/router";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/utils";
import {
  Layers,
  Sparkles,
  UploadCloud,
  Mail,
  FileText,
  CheckCircle2,
  ArrowRight,
  Clock,
  Building2,
  ShieldCheck,
  ScanLine,
  Plus,
  TrendingUp,
  Database,
  Inbox,
  Check,
  Package,
  FileImage,
  RefreshCw,
  X,
  Loader2,
  AlertCircle,
  IndianRupee,
} from "lucide-react";

const getHomeData = createServerFn({ method: "GET" }).handler(async () => {
  let customerCount = 0;
  let itemCount = 0;
  let orderCount = 0;
  let recentImports: any[] = [];

  try {
    const supabase = createAdminClient();
    const [cRes, iRes, oRes, importsRes] = await Promise.all([
      supabase.from("customers").select("*", { count: "exact", head: true }),
      supabase.from("items").select("*", { count: "exact", head: true }),
      supabase.from("sales_order").select("*", { count: "exact", head: true }),
      supabase
        .from("order_imports")
        .select("id, source_type, source_reference, customer_id, sales_order_id, extracted_data, processing_status, created_at")
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    customerCount = cRes.count ?? 0;
    itemCount = iRes.count ?? 0;
    orderCount = oRes.count ?? 0;
    recentImports = importsRes.data || [];
  } catch (err) {
    console.warn("[HomeData] Error fetching counts:", err);
  }

  return { customerCount, itemCount, orderCount, recentImports };
});

export const Route = createFileRoute("/")({
  loader: () => getHomeData(),
  component: HomePage,
});

function HomePage() {
  const { customerCount, itemCount, orderCount, recentImports } = Route.useLoaderData();
  const [liveItemCount, setLiveItemCount] = useState(itemCount);

  // Add Item Modal on Dashboard
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formUnit, setFormUnit] = useState("PCS");
  const [formPrice, setFormPrice] = useState("");
  const [formDescriptions, setFormDescriptions] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("Item name is required.");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const priceNum = formPrice.trim() !== "" ? parseFloat(formPrice) : 0;
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError("Please enter a valid price (greater than or equal to 0).");
      setIsSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          code: formCode.trim() || null,
          unit: formUnit.trim().toUpperCase() || "PCS",
          price: priceNum,
          descriptions: formDescriptions.trim() || formName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to create item");
      }

      setLiveItemCount((prev) => prev + 1);
      setAddedNotice(`Product "${data.item.name}" added to catalog successfully!`);
      setIsAddItemModalOpen(false);
      setFormName("");
      setFormCode("");
      setFormPrice("");
      setFormDescriptions("");
      setTimeout(() => setAddedNotice(null), 7000);
    } catch (err: any) {
      setFormError(err.message || "Failed to save item.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50/70 dark:bg-slate-950 flex flex-col">
      {/* ========================================================
          1. TOP ENTERPRISE COMMAND BAR (No generic sidebar/chrome)
      ======================================================== */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-2xs px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Logo & Operational Status */}
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-500 text-white flex items-center justify-center font-black text-base shadow-sm shrink-0">
              <Layers className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base text-foreground tracking-tight">
                  StockOS
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Sales Order Automation
                </span>
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] h-4.5 px-1.5 font-semibold"
                >
                  <span className="size-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                  Live Operational
                </Badge>
              </div>
            </div>
          </div>

          {/* Quick Command Navigation Links */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link
              to="/inbox"
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " gap-1.5 h-8.5 text-xs font-semibold border-slate-300 dark:border-slate-700 hover:bg-slate-50"
              }
            >
              <Mail className="size-3.5 text-red-600" />
              <span>Gmail Inbox</span>
              <Badge className="bg-blue-600 text-white text-[10px] h-4 px-1 ml-0.5 font-mono">
                14
              </Badge>
            </Link>

            <Link
              to="/upload"
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " gap-1.5 h-8.5 text-xs font-semibold border-slate-300 dark:border-slate-700 hover:bg-slate-50"
              }
            >
              <UploadCloud className="size-3.5 text-blue-600" />
              <span>Document Intake</span>
            </Link>

            <Link
              to="/orders"
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " gap-1.5 h-8.5 text-xs font-semibold border-slate-300 dark:border-slate-700 hover:bg-slate-50"
              }
            >
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              <span>Orders Queue</span>
            </Link>

            <Link
              to="/items"
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " gap-1.5 h-8.5 text-xs font-semibold border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-indigo-700 dark:text-indigo-400"
              }
            >
              <Package className="size-3.5 text-indigo-600" />
              <span>Items Catalog</span>
            </Link>

            <Button
              type="button"
              onClick={() => {
                setFormError(null);
                setIsAddItemModalOpen(true);
              }}
              className="gap-1.5 h-8.5 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Add Item</span>
            </Button>

            <Link
              to="/orders/new"
              className={
                buttonVariants({ variant: "default", size: "sm" }) +
                " gap-1.5 h-8.5 px-3.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
              }
            >
              <Plus className="size-3.5" />
              <span>Manual Order</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-7 flex-1">
        {addedNotice && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center justify-between shadow-xs animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              <span>{addedNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setAddedNotice(null)}
              className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 p-1 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* ========================================================
            1. PAGE HEADER & QUICK ACTIONS
        ======================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Sales Orders Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inbound order intake, catalog verification, and order processing
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/upload"
              className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <UploadCloud className="size-3.5" />
              <span>Upload Document</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setIsAddItemModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Add Item</span>
            </button>

            <Link
              to="/orders/new"
              className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Manual Order</span>
            </Link>
          </div>
        </div>

        {/* ========================================================
            2. KEY METRICS (KPIs)
        ======================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1: Orders Confirmed */}
          <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs bg-card p-4">
            <CardContent className="p-0 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Confirmed Orders
                </span>
                <span className="text-2xl font-black text-foreground tracking-tight block mt-1">
                  {orderCount}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5 block">
                  Approved sales orders
                </span>
              </div>
              <div className="size-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900">
                <CheckCircle2 className="size-5" />
              </div>
            </CardContent>
          </Card>

          {/* Metric 2: Catalog Items */}
          <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs bg-card p-4 flex flex-col justify-between">
            <CardContent className="p-0 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Catalog Items
                </span>
                <span className="text-2xl font-black text-foreground tracking-tight block mt-1">
                  {liveItemCount}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5 block">
                  Active products & SKUs
                </span>
              </div>
              <div className="size-10 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900">
                <Package className="size-5" />
              </div>
            </CardContent>

            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <Link
                to="/items"
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Manage Items ({liveItemCount}) →
              </Link>
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setIsAddItemModalOpen(true);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded shadow-2xs cursor-pointer"
              >
                <Plus className="size-3" />
                Add Item
              </button>
            </div>
          </Card>

          {/* Metric 3: Customers */}
          <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs bg-card p-4">
            <CardContent className="p-0 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Customer Accounts
                </span>
                <span className="text-2xl font-black text-foreground tracking-tight block mt-1">
                  {customerCount}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5 block">
                  Registered schools & dealers
                </span>
              </div>
              <div className="size-10 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-100 dark:border-purple-900">
                <Building2 className="size-5" />
              </div>
            </CardContent>
          </Card>

          {/* Metric 4: Inbound Queue */}
          <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs bg-card p-4">
            <CardContent className="p-0 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Inbound Queue
                </span>
                <span className="text-2xl font-black text-foreground tracking-tight block mt-1">
                  14
                </span>
                <Link
                  to="/inbox"
                  className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline mt-0.5 inline-block"
                >
                  Review Inbound Inbox →
                </Link>
              </div>
              <div className="size-10 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-900">
                <Inbox className="size-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ========================================================
            3. WORKFLOW MODULES
        ======================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Document Intake */}
          <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-blue-400 transition-all bg-card p-5 flex flex-col justify-between">
            <div>
              <div className="size-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-900 mb-3">
                <UploadCloud className="size-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1">
                Document Intake
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Upload scanned PDF purchase orders, camera photos, or paste raw requisition text for OCR extraction.
              </p>
            </div>
            <Link
              to="/upload"
              className="inline-flex items-center justify-between h-8.5 px-3.5 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-600 text-xs font-semibold transition"
            >
              <span>Launch Intake</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </Card>

          {/* Card 2: Orders Inbox */}
          <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-emerald-400 transition-all bg-card p-5 flex flex-col justify-between">
            <div>
              <div className="size-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-900 mb-3">
                <Mail className="size-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1">
                Orders Inbox
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Review and triage incoming purchase orders received via connected Gmail and WhatsApp channels.
              </p>
            </div>
            <Link
              to="/inbox"
              className="inline-flex items-center justify-between h-8.5 px-3.5 rounded-lg bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-emerald-600 text-xs font-semibold transition"
            >
              <span>Open Inbox (14)</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </Card>

          {/* Card 3: Review Studio */}
          <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-purple-400 transition-all bg-card p-5 flex flex-col justify-between">
            <div>
              <div className="size-10 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400 flex items-center justify-center border border-purple-200 dark:border-purple-900 mb-3">
                <ScanLine className="size-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1">
                Order Review Studio
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Split-screen verification studio to review extracted line items, match catalog items, and confirm sales orders.
              </p>
            </div>
            <Link
              to="/orders"
              className="inline-flex items-center justify-between h-8.5 px-3.5 rounded-lg bg-slate-100 hover:bg-purple-600 hover:text-white text-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-purple-600 text-xs font-semibold transition"
            >
              <span>Review Orders</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </Card>
        </div>

        {/* ========================================================
            4. RECENT INBOUND ORDERS FEED TABLE
        ======================================================== */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-blue-600" />
              <h3 className="text-sm font-bold text-foreground">
                Recent Inbound Orders
              </h3>
            </div>

            <Link
              to="/orders"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
            >
              <span>View All Orders →</span>
            </Link>
          </div>

          <CardContent className="p-0">
            {recentImports.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentImports.map((imp) => {
                  const extracted = imp.extracted_data || {};
                  const customer = extracted.customer?.name || "Customer";
                  const poRef = extracted.po_number || imp.source_reference || `PO-${imp.id.slice(0, 8).toUpperCase()}`;
                  const itemsCount = extracted.items?.length || 0;
                  const total = extracted.total || 0;
                  const isConfirmed = imp.processing_status === "confirmed" && !!imp.sales_order_id;

                  return (
                    <div
                      key={imp.id}
                      className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="size-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                          {imp.source_type === "email" ? (
                            <Mail className="size-4 text-emerald-600" />
                          ) : (
                            <FileImage className="size-4 text-blue-600" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-foreground truncate max-w-xs">
                              {customer}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-mono border-slate-300">
                              {poRef}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className={`text-[9px] h-4.5 px-1.5 font-semibold ${
                                imp.source_type === "email"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-blue-50 text-blue-700 border border-blue-200"
                              }`}
                            >
                              {imp.source_type === "email" ? "Gmail" : "Document Scan"}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                            <span>{itemsCount} line items</span>
                            <span>•</span>
                            <span>Order Total: <strong className="text-foreground">{formatINR(total)}</strong></span>
                            <span>•</span>
                            <span>{new Date(imp.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        {isConfirmed ? (
                          <Badge className="bg-emerald-600 text-white text-[10px] h-6 px-2 font-semibold">
                            <Check className="size-3 mr-1" />
                            Confirmed SO
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-[10px] h-6 px-2 font-semibold">
                            Pending Review
                          </Badge>
                        )}

                        <Link
                          to={`/orders/${imp.id}`}
                          className="inline-flex items-center gap-1.5 h-7.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
                        >
                          <span>Review in Studio</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <Inbox className="size-8 mx-auto mb-2 text-slate-400" />
                <p className="text-xs font-medium">No order imports yet.</p>
                <Link
                  to="/upload"
                  className="text-xs text-blue-600 font-bold hover:underline mt-1 inline-block"
                >
                  Upload your first purchase order →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ========================================================
          5. PROFESSIONAL ENTERPRISE FOOTER
      ======================================================== */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-4 px-6 text-center text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-600" />
          <span>StockOS • Sales Order Automation System</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          <span>Real-time Enterprise ERP Sync</span>
        </div>
      </footer>
      {/* ========================================================
          ADD ITEM TO CATALOG MODAL (DASHBOARD)
      ======================================================== */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <Package className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Add New Product to Catalog
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Create a new product record for automatic AI sales order matching
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddItemModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg p-1 hover:bg-slate-200/50 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Item Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>Product Title / Name *</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Official textbook name</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Worksheets 7, Nova Kids Nur, WTW GK 2"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>

              {/* SKU Code & Unit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground">
                    SKU / Product Code
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. WS-07, WTW-GK2"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground">
                    Unit of Measurement
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. PCS, SET, PKT, BOX"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value.toUpperCase())}
                    className="h-9 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              {/* Price */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">
                  Standard Rate (₹)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">
                  Description / Series Note (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="Additional details or series information"
                  value={formDescriptions}
                  onChange={(e) => setFormDescriptions(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddItemModalOpen(false)}
                  disabled={isSaving}
                  className="text-xs cursor-pointer"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                  className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer min-w-24"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    "Add Product"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
