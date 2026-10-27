import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Link } from "@/lib/router";
import { createAdminClient } from "@/lib/supabase/admin";
import { MultiChannelCaptureCenter } from "@/components/upload/MultiChannelCaptureCenter";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Plus, Sparkles, Layers } from "lucide-react";

const getRecentCaptureImports = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("order_imports")
      .select("id, source_type, source_reference, customer_id, sales_order_id, extracted_data, processing_status, created_at")
      .order("created_at", { ascending: false })
      .limit(6);

    return { recentImports: data || [] };
  } catch (err) {
    console.warn("Failed to load recent imports for upload screen:", err);
    return { recentImports: [] };
  }
});

export const Route = createFileRoute("/upload")({
  loader: () => getRecentCaptureImports(),
  component: UploadPage,
});

function UploadPage() {
  const { recentImports } = Route.useLoaderData();

  return (
    <main className="min-h-screen bg-slate-50/60 dark:bg-slate-950 pb-16">
      {/* Top Action Bar: Screen 3 Document Capture Center */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-2xs px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left Block */}
          <div className="flex items-center gap-3">
            <Link
              to="/orders"
              title="Back to Orders"
              className={
                buttonVariants({ variant: "ghost", size: "icon-sm" }) +
                " text-muted-foreground hover:text-foreground border border-slate-300 dark:border-slate-700 rounded-lg size-8 shrink-0"
              }
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-foreground tracking-tight flex items-center gap-2">
                  <Layers className="size-4 text-blue-600" />
                  <span>Order Document Capture Center</span>
                </h1>
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] h-4.5 px-1.5 font-semibold"
                >
                  <span className="size-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>
                  Live Ingestion
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Intake purchase orders from Gmail, WhatsApp, PDF invoices, and handwritten slips
              </p>
            </div>
          </div>

          {/* Right Action Links */}
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/inbox"
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " gap-1.5 h-8 text-xs font-semibold border-slate-300 dark:border-slate-700"
              }
            >
              <Mail className="size-3.5 text-red-600" />
              <span>Review Gmail Inbox</span>
            </Link>
            <Link
              to="/orders/new"
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " gap-1.5 h-8 text-xs font-semibold border-slate-300 dark:border-slate-700"
              }
            >
              <Plus className="size-3.5" />
              <span>+ Manual Order</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Studio Canvas */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <MultiChannelCaptureCenter initialRecentImports={recentImports} />
      </div>
    </main>
  );
}
